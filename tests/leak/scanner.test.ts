// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_CANARY, CATALOG_CANARY, DEEP_DIVE_CANARY, PROTECTED_CANARIES, SOLUTION_CANARY } from "./canaries";
import {
   CATALOG_ROUTES,
   FIXTURE_ALLOWLIST,
   findMaterializedRoutes,
   findRouteConfigViolations,
   prerendered,
   scanFrontendTree,
   scanNextBuild,
   scanPublic,
   scanResponse,
   type Finding,
} from "./scanner";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function temp(files: Record<string, string | Buffer> = {}): string {
   const root = mkdtempSync(join(tmpdir(), "leak-scan-"));
   dirs.push(root);
   for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), content);
   }
   return root;
}

/** A git repository like the frontend: build output and one public folder are ignored. */
function repo(files: Record<string, string | Buffer>): string {
   const root = temp({ ".gitignore": ".next/\npublic/ignored/\n", ...files });
   execFileSync("git", ["init", "-q"], { cwd: root });
   return root;
}

const pairs = (findings: Finding[]) => findings.map(({ location, canary }) => `${location}: ${canary}`).sort();
const planted = (...entries: [string, string][]) => entries.map(([file, canary]) => `${file}: ${canary}`).sort();

describe("frontend tree scan", () => {
   it("reports a canary planted in source, config, a script, a public asset and an unlisted test file", () => {
      const root = repo({
         "src/lib/data.ts": `export const x = "${BODY_CANARY}";`,
         "next.config.ts": `// ${SOLUTION_CANARY}`,
         "scripts/seed.ts": CATALOG_CANARY,
         "public/premium.json": `{"x":"${DEEP_DIVE_CANARY}"}`,
         "tests/e2e/other.spec.ts": BODY_CANARY,
      });
      expect(pairs(scanFrontendTree(root).findings)).toEqual(
         planted(
            ["src/lib/data.ts", BODY_CANARY],
            ["next.config.ts", SOLUTION_CANARY],
            ["scripts/seed.ts", CATALOG_CANARY],
            ["public/premium.json", DEEP_DIVE_CANARY],
            ["tests/e2e/other.spec.ts", BODY_CANARY]
         )
      );
   });

   it("excuses only the exact allowlisted paths, not look-alikes, copies or a whole tests/ folder", () => {
      const [fixture, registry] = Object.keys(FIXTURE_ALLOWLIST);
      const root = repo({
         [fixture]: BODY_CANARY,
         [registry]: SOLUTION_CANARY,
         [`${fixture}.bak`]: BODY_CANARY,
         [`src/${fixture}`]: BODY_CANARY,
         "tests/leak/other.ts": DEEP_DIVE_CANARY,
      });
      const { findings, expected } = scanFrontendTree(root);
      expect(pairs(findings)).toEqual(
         planted([`${fixture}.bak`, BODY_CANARY], [`src/${fixture}`, BODY_CANARY], ["tests/leak/other.ts", DEEP_DIVE_CANARY])
      );
      expect(expected).toEqual({ [fixture]: [BODY_CANARY], [registry]: [SOLUTION_CANARY] });
   });

   it("reads untracked files, skips ignored build output and survives a file deleted after being added", () => {
      const root = repo({ "src/new.ts": BODY_CANARY, ".next/chunk.js": BODY_CANARY, "src/gone.ts": "x" });
      execFileSync("git", ["add", "-A"], { cwd: root });
      rmSync(join(root, "src/gone.ts"));
      writeFileSync(join(root, "src/untracked.ts"), SOLUTION_CANARY);
      expect(pairs(scanFrontendTree(root).findings)).toEqual(
         planted(["src/new.ts", BODY_CANARY], ["src/untracked.ts", SOLUTION_CANARY])
      );
   });
});

describe("public scan", () => {
   const binary = Buffer.concat([Buffer.from([0, 255, 1, 2]), Buffer.from(BODY_CANARY), Buffer.from([0, 254])]);

   it("finds a canary in any file type, at any depth, in binary data, and in ignored files", () => {
      const root = repo({
         "public/a.svg": `<svg>${BODY_CANARY}</svg>`,
         "public/deep/er/b.json": BODY_CANARY,
         "public/c.js.map": BODY_CANARY,
         "public/noextension": BODY_CANARY,
         "public/d.md": BODY_CANARY,
         "public/e.bin": binary,
         "public/ignored/f.txt": BODY_CANARY,
      });
      const { findings, scanned } = scanPublic(root);
      expect(findings.map(({ location }) => location).sort()).toEqual(
         ["a.svg", "c.js.map", "d.md", "deep/er/b.json", "e.bin", "ignored/f.txt", "noextension"]
      );
      expect(scanned.public).toBe(7);
   });

   it("passes a clean or absent public folder after reading every file", () => {
      expect(scanPublic(repo({ "public/a.svg": "<svg/>", "public/b.txt": "x" }))).toMatchObject({ findings: [], scanned: { public: 2 } });
      expect(scanPublic(repo({}))).toMatchObject({ findings: [], scanned: {} });
   });
});

describe("build output scan", () => {
   // One file in every class of artifact a build holds.
   const BUILD = [
      "static/chunks/a.js",
      "static/media/b.woff2",
      "server/app/page.html",
      "server/app/page.rsc",
      "server/app/lessons/[slug]/page.js.map",
      "server/chunks/c.js",
      "server/app-paths-manifest.json",
      "cache/fetch-cache/key",
      "prerender-manifest.json",
      "diagnostics/build.json",
   ];
   const build = (text: (file: string, index: number) => string) =>
      temp(Object.fromEntries(BUILD.map((file, index) => [file, text(file, index)])));

   it("reads every class of artifact and passes a clean build", () => {
      const { findings, scanned } = scanNextBuild(build(() => "clean"));
      expect(findings).toEqual([]);
      expect(scanned).toEqual({
         static: 2,
         "server-app": 3,
         "server-chunks": 1,
         "server-other": 1,
         cache: 1,
         root: 1,
         other: 1,
      });
   });

   it("finds a canary embedded in any one of them", () => {
      for (const [index, file] of BUILD.entries()) {
         const canary = PROTECTED_CANARIES[index % PROTECTED_CANARIES.length];
         const root = build((name) => (name === file ? `clean ${canary} clean` : "clean"));
         expect(pairs(scanNextBuild(root).findings), file).toEqual(planted([file, canary]));
      }
   });

   it("fails loudly when there is no build to scan", () => {
      expect(() => scanNextBuild(join(temp(), ".next"))).toThrow(/no build output/);
   });
});

describe("response scan", () => {
   const push = (chunk: unknown[]) => `<html><script>self.__next_f.push(${JSON.stringify(chunk)})</script></html>`;
   const channels = (findings: Finding[]) => findings.map(({ artifact, canary, channel }) => `${artifact}/${channel}/${canary}`);

   it("passes a document and an RSC payload that hold no canary", () => {
      expect(scanResponse("html", "/lessons/x", push([1, "0:[]"]))).toEqual([]);
      expect(scanResponse("rsc", "/lessons/x", '1:"$Sreact.fragment"\n')).toEqual([]);
   });

   it("finds a canary in raw HTML, in a fetched RSC payload and in an inlined RSC chunk", () => {
      expect(channels(scanResponse("html", "/r", `<p>${BODY_CANARY}</p>`))).toEqual([`html/raw/${BODY_CANARY}`]);
      expect(channels(scanResponse("rsc", "/r", `3:["${SOLUTION_CANARY}"]`))).toEqual([`rsc/raw/${SOLUTION_CANARY}`]);
      expect(channels(scanResponse("html", "/r", push([1, `0:["${DEEP_DIVE_CANARY}"]`])))).toEqual([
         `html/raw/${DEEP_DIVE_CANARY}`,
         `rsc/inlined-rsc/${DEEP_DIVE_CANARY}`,
      ]);
   });

   it("decodes base64 inlined chunks, which a raw search of the document misses", () => {
      const html = push([3, Buffer.from(`0:["${CATALOG_CANARY}"]`).toString("base64")]);
      expect(html).not.toContain(CATALOG_CANARY);
      expect(channels(scanResponse("html", "/r", html))).toEqual([`rsc/inlined-rsc/${CATALOG_CANARY}`]);
   });

   it("fails against a server that serves premium content to a caller with no credentials", async () => {
      const leaking = createServer((_req, res) => res.end(push([1, `0:["${BODY_CANARY}"]`])));
      await new Promise<void>((resolve) => leaking.listen(0, "127.0.0.1", resolve));
      try {
         const { port } = leaking.address() as { port: number };
         const body = await (await fetch(`http://127.0.0.1:${port}/lessons/premium`)).text();
         expect(scanResponse("html", "/lessons/premium", body).length).toBeGreaterThan(0);
      } finally {
         leaking.close();
      }
   });
});

describe("catalog route output", () => {
   interface Facts {
      routes?: string[];
      dynamicRoutes?: string[];
      built?: string[];
      dynamic?: string[];
      files?: string[];
   }
   /** A minimal build: manifests as Next writes them, plus empty files under server/app. */
   function build({ routes = [], dynamicRoutes = [], built = CATALOG_ROUTES, dynamic = CATALOG_ROUTES, files = [] }: Facts = {}) {
      const entries = (paths: string[]) => Object.fromEntries(paths.map((path) => [path, {}]));
      return temp({
         "prerender-manifest.json": JSON.stringify({
            version: 4,
            routes: entries(["/login", "/learn", ...routes]),
            dynamicRoutes: entries(dynamicRoutes),
         }),
         "app-path-routes-manifest.json": JSON.stringify(Object.fromEntries([...built, "/login"].map((path) => [`${path}/page`, path]))),
         "routes-manifest.json": JSON.stringify({ dynamicRoutes: dynamic.map((page) => ({ page })) }),
         ...Object.fromEntries(["login.html", "learn.rsc", ...files].map((file) => [`server/app/${file}`, ""])),
      });
   }

   it("passes when every catalog route is built dynamic and only other pages are prerendered", () => {
      const dist = build();
      expect(findMaterializedRoutes(dist)).toEqual([]);
      expect(prerendered(dist).routes).toEqual(expect.arrayContaining(["/login", "/learn"]));
      expect(prerendered(dist).files).toEqual(expect.arrayContaining(["login.html", "learn.rsc"]));
   });

   it.each(CATALOG_ROUTES)("catches %s prerendered as a page, a dynamic prerender or a static file", (route) => {
      const root = route.split("/")[1];
      for (const facts of [
         { routes: [`/${root}/catalog-e2e-free`] },
         { dynamicRoutes: [route] },
         { files: [`${root}/catalog-e2e-free.html`] },
         { files: [`${root}/[slug].rsc`] },
         { files: [`${root}/x.segments/_head.segment.rsc`] },
      ]) {
         const found = findMaterializedRoutes(build(facts));
         expect(found, JSON.stringify(facts)).toHaveLength(1);
         expect(found[0]).toContain(route);
      }
   });

   it("catches a catalog route that is missing from the build or not dynamic, so the guard cannot pass vacuously", () => {
      expect(findMaterializedRoutes(build({ built: CATALOG_ROUTES.slice(1) }))).toEqual([`${CATALOG_ROUTES[0]}: not in the build`]);
      expect(findMaterializedRoutes(build({ dynamic: CATALOG_ROUTES.slice(0, 3) }))).toEqual([`${CATALOG_ROUTES[3]}: not a dynamic route`]);
   });
});

describe("catalog route source guard", () => {
   const FORCED = 'export const dynamic = "force-dynamic";\nexport default function Page() { return null; }\n';
   const PLAIN = "export default function Page() { return null; }\n";
   const pages = (over: Record<string, string> = {}) =>
      temp({
         "src/app/lessons/[slug]/page.tsx": FORCED,
         "src/app/problems/[slug]/page.tsx": FORCED,
         "src/app/knowledge/[slug]/page.tsx": FORCED,
         "src/app/tracks/[slug]/page.tsx": PLAIN,
         ...over,
      });

   it("passes forced-dynamic item pages and a Track page with no dynamic export", () => {
      expect(findRouteConfigViolations(pages())).toEqual([]);
      expect(findRouteConfigViolations(pages({ "src/app/tracks/[slug]/page.tsx": FORCED }))).toEqual([]);
   });

   it.each(["lessons", "problems", "knowledge", "tracks"])("catches %s opting into static generation or caching", (segment) => {
      const file = `src/app/${segment}/[slug]/page.tsx`;
      for (const line of [
         "export function generateStaticParams() { return []; }",
         "export const generateStaticParams = async () => [];",
         "export const revalidate = 60;",
         "export const fetchCache = 'force-cache';",
         "export const dynamicParams = false;",
         'export const dynamic = "force-static";',
      ]) {
         const prefix = segment === "tracks" || line.includes("dynamic =") ? "" : FORCED;
         expect(findRouteConfigViolations(pages({ [file]: `${prefix}${line}\n` })), line).not.toEqual([]);
      }
   });

   it("catches an item page that lost force-dynamic, including one whose export survives only in a comment", () => {
      for (const body of [PLAIN, `// ${FORCED}`, `/* ${FORCED} */\n${PLAIN}`]) {
         expect(findRouteConfigViolations(pages({ "src/app/lessons/[slug]/page.tsx": body }))).toEqual([
            "src/app/lessons/[slug]/page.tsx: item route without force-dynamic",
         ]);
      }
   });

   it("ignores a comment that merely mentions static generation, and fails loudly on a missing page", () => {
      expect(findRouteConfigViolations(pages({ "src/app/tracks/[slug]/page.tsx": `// no generateStaticParams here\n${PLAIN}` }))).toEqual([]);
      expect(() => findRouteConfigViolations(temp())).toThrow(/ENOENT/);
   });
});
