import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { PROTECTED_CANARIES } from "./canaries";

export type Artifact = "tree" | "public" | "next-build" | "html" | "rsc";

export interface Finding {
   artifact: Artifact;
   /** A file relative to the scanned root, or the route a response came from. */
   location: string;
   canary: string;
   channel?: "raw" | "inlined-rsc";
}

export interface ScanResult {
   findings: Finding[];
   /** Files read, by class, so a scan that read nothing cannot pass. */
   scanned: Record<string, number>;
   /** Canaries found in allowlisted fixtures: the occurrences that are expected. */
   expected: Record<string, string[]>;
}

/** The only files that may hold a canary, each with why. Exact paths, never directories or patterns. */
export const FIXTURE_ALLOWLIST: Readonly<Record<string, string>> = {
   "tests/e2e/catalog/fixture.json": "synthetic API content, served only by the e2e fake API and never imported by the app",
   "tests/leak/canaries.ts": "defines the canary strings and is imported only by tests",
};

export const CATALOG_ROUTES = ["/lessons/[slug]", "/problems/[slug]", "/knowledge/[slug]", "/tracks/[slug]"];
const ITEM_ROUTES = CATALOG_ROUTES.slice(0, 3);

/** Every file under `dir` (symlinks followed) as `/`-separated paths relative to it. Nothing is excluded. */
export function walk(dir: string, seen = new Set<string>()): string[] {
   const real = realpathSync(dir);
   if (seen.has(real)) return [];
   seen.add(real);
   return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path, seen).map((file) => `${name}/${file}`) : [name];
   });
}

/** Files git would commit or has committed: tracked, plus untracked and not ignored. */
export function trackedFiles(root: string): string[] {
   const args = ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"];
   const listed = execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
   return [...new Set(listed.split("\0").filter(Boolean))];
}

const canariesIn = (text: string | Buffer) => PROTECTED_CANARIES.filter((canary) => text.includes(canary));

function inspect(
   artifact: Artifact,
   root: string,
   files: string[],
   classify: (file: string) => string,
   allowlist: Readonly<Record<string, string>> = {}
): ScanResult {
   const result: ScanResult = { findings: [], scanned: {}, expected: {} };
   for (const file of files) {
      let bytes: Buffer;
      try {
         bytes = readFileSync(join(root, file));
      } catch {
         continue; // tracked but deleted from the working tree
      }
      const kind = classify(file);
      result.scanned[kind] = (result.scanned[kind] ?? 0) + 1;
      const found = canariesIn(bytes);
      if (found.length === 0) continue;
      if (Object.hasOwn(allowlist, file)) result.expected[file] = found;
      else result.findings.push(...found.map((canary) => ({ artifact, location: file, canary })));
   }
   return result;
}

const topLevel = (file: string) => (file.includes("/") ? file.split("/")[0] : "root");

/** The production frontend source: every committable file, with no canary outside the fixture allowlist. */
export function scanFrontendTree(root: string, allowlist = FIXTURE_ALLOWLIST): ScanResult {
   return inspect("tree", root, trackedFiles(root), topLevel, allowlist);
}

/** Everything in `public/`, ignored by git or not, because all of it is served. */
export function scanPublic(root: string): ScanResult {
   const dir = join(root, "public");
   return inspect("public", dir, existsSync(dir) ? walk(dir) : [], () => "public");
}

function buildClass(file: string): string {
   if (file.startsWith("static/")) return "static";
   if (file.startsWith("server/app/")) return "server-app";
   if (file.startsWith("server/chunks/")) return "server-chunks";
   if (file.startsWith("server/")) return "server-other";
   if (file.startsWith("cache/")) return "cache";
   return file.includes("/") ? "other" : "root";
}

/** Every file of a `next build` output, including its caches and manifests. */
export function scanNextBuild(dist: string): ScanResult {
   if (!existsSync(dist)) throw new Error(`no build output at ${dist}`);
   return inspect("next-build", dist, walk(dist), buildClass);
}

/** The payload Next inlines into HTML as `self.__next_f.push([1, text])` or `[3, base64]` scripts. */
export function inlinedRsc(html: string): string {
   return [...html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)]
      .map(([, chunk]) => {
         const [kind, data = ""] = JSON.parse(chunk) as [number, string?];
         if (kind === 1) return data;
         if (kind === 3) return Buffer.from(data, "base64").toString("utf8");
         return "";
      })
      .join("");
}

/** A canary in a response body, and in a document's decoded inlined RSC, which a raw search can miss. */
export function scanResponse(artifact: "html" | "rsc", route: string, body: string): Finding[] {
   const inlined = artifact === "html" ? inlinedRsc(body) : "";
   return [
      ...canariesIn(body).map((canary) => ({ artifact, location: route, canary, channel: "raw" as const })),
      ...canariesIn(inlined).map((canary) => ({
         artifact: "rsc" as const,
         location: route,
         canary,
         channel: "inlined-rsc" as const,
      })),
   ];
}

/** One line per finding, capped: where a canary was, never the content around it. */
export function format(findings: Finding[]): string[] {
   const lines = findings.map(
      ({ artifact, location, canary, channel }) => `[${artifact}] ${location}${channel ? ` (${channel})` : ""}: ${canary}`
   );
   return lines.length > 20 ? [...lines.slice(0, 20), `...and ${lines.length - 20} more`] : lines;
}

const readJson = (dist: string, file: string) => JSON.parse(readFileSync(join(dist, file), "utf8"));
const PRERENDERED_FILE = /\.(html|rsc|meta|body)$/;

/** What a build prerenders, and so what a CDN could serve without asking the API. */
export function prerendered(dist: string): { routes: string[]; files: string[] } {
   const manifest = readJson(dist, "prerender-manifest.json");
   const app = join(dist, "server", "app");
   return {
      routes: [...Object.keys(manifest.routes), ...Object.keys(manifest.dynamicRoutes)],
      files: existsSync(app) ? walk(app).filter((file) => PRERENDERED_FILE.test(file)) : [],
   };
}

/** Reasons a catalog route is missing, static or prerendered in this build; empty when all four are dynamic. */
export function findMaterializedRoutes(dist: string): string[] {
   const built: string[] = Object.values(readJson(dist, "app-path-routes-manifest.json"));
   const dynamic: string[] = readJson(dist, "routes-manifest.json").dynamicRoutes.map((route: { page: string }) => route.page);
   const { routes, files } = prerendered(dist);
   return CATALOG_ROUTES.flatMap((route) => {
      const root = route.split("/")[1];
      const under = (path: string) => path === `/${root}` || path.startsWith(`/${root}/`);
      return [
         ...(built.includes(route) ? [] : [`${route}: not in the build`]),
         ...(dynamic.includes(route) ? [] : [`${route}: not a dynamic route`]),
         ...routes.filter(under).map((path) => `${route}: prerender manifest lists ${path}`),
         ...files.filter((file) => file.startsWith(`${root}/`)).map((file) => `${route}: prerendered file server/app/${file}`),
      ];
   });
}

const comments = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;
const STATIC_OPT_IN = /generateStaticParams|export const (revalidate|fetchCache|dynamicParams)\b/;

/** Catalog pages that opt into static generation or caching, and item pages that do not force dynamic rendering. */
export function findRouteConfigViolations(root: string): string[] {
   return CATALOG_ROUTES.flatMap((route) => {
      const file = `src/app${route}/page.tsx`;
      const source = readFileSync(join(root, file), "utf8").replace(comments, "");
      const dynamic = /export const dynamic\s*=\s*["']([\w-]+)["']/.exec(source)?.[1];
      return [
         ...(STATIC_OPT_IN.test(source) ? [`${file}: opts into static generation or caching`] : []),
         ...(dynamic !== undefined && dynamic !== "force-dynamic" ? [`${file}: dynamic is "${dynamic}"`] : []),
         ...(dynamic === undefined && ITEM_ROUTES.includes(route) ? [`${file}: item route without force-dynamic`] : []),
      ];
   });
}
