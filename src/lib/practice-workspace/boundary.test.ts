import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * P9-T06 reader and privacy invariants (P9-AC-22.1, spec §9 Privacy): practice foundations write nothing in the browser,
 * touch no reader, link nothing that prefetches, and add no editor library. Source scans, because the code that would
 * break them does not exist yet to be run: they are what keeps T13 to T15 inside the same lines until they say otherwise.
 */

const SRC = join(__dirname, "../..");
const ROOT = join(SRC, "..");

function walk(dir: string): string[] {
   return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
   });
}

const production = [
   ...walk(join(SRC, "lib/practice-workspace")),
   ...walk(join(SRC, "components/practice-workspace")),
   ...walk(join(SRC, "app/practice/attempts")),
   join(SRC, "lib/practice-flag.ts"),
].filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path));

const text = (path: string) => readFileSync(path, "utf8");
const name = (path: string) => relative(SRC, path);

describe("practice foundations", () => {
   it("has code to scan", () => {
      expect(production.map(name).sort()).toEqual(
         [
            "app/practice/attempts/[id]/page.tsx",
            "app/practice/attempts/layout.tsx",
            "components/practice-workspace/PracticeGate.tsx",
            "components/practice-workspace/PracticeUnavailable.tsx",
            "lib/practice-flag.ts",
            "lib/practice-workspace/availability.ts",
            "lib/practice-workspace/client.ts",
            "lib/practice-workspace/contract.ts",
            "lib/practice-workspace/fakeApi.ts",
            "lib/practice-workspace/types.ts",
         ].sort()
      );
   });

   it.each(production)("%s keeps no learner state in the browser and no markup from text", (path) => {
      const source = text(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // comments may name what is forbidden
      for (const forbidden of ["localStorage", "sessionStorage", "document.cookie", "indexedDB", "cookies(", "useSearchParams", "window.location", "history.pushState", "history.replaceState", "dangerouslySetInnerHTML", "innerHTML"]) {
         expect(source, `${name(path)} uses ${forbidden}`).not.toContain(forbidden);
      }
      expect(source, `${name(path)} reads page searchParams`).not.toMatch(/[{,]\s*searchParams\b|searchParams\s*:\s*Promise/);
   });

   it.each(production)("%s imports no reader, catalog or P7 module", (path) => {
      const imports = [...text(path).matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
      for (const from of imports) {
         expect(from, `${name(path)} imports ${from}`).not.toMatch(/^@\/(app\/_catalog|components\/(catalog|lesson|problem|reader|knowledge|prepare|practice)\/|lib\/(catalog|prep)\/)/);
      }
   });

   it.each(production.filter((path) => path.endsWith(".tsx")))("%s never prefetches a link", (path) => {
      const links = [...text(path).matchAll(/<Link\b[^>]*>/g)].map((match) => match[0]);
      for (const link of links) expect(link).toContain("prefetch={false}");
   });

   it("keeps the fake API out of production code", () => {
      for (const path of production.filter((candidate) => !candidate.endsWith("fakeApi.ts"))) {
         expect(text(path), name(path)).not.toMatch(/fakeApi|createFakePracticeApi/);
      }
   });

   it("adds no editor library: React Flow is not installed", () => {
      const manifest = JSON.parse(text(join(ROOT, "package.json"))) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
      expect(names.filter((dependency) => /reactflow|xyflow/i.test(dependency))).toEqual([]);
      expect(production.map((path) => text(path)).join("\n")).not.toMatch(/xyflow|reactflow/i);
   });

   it("reads no environment inside the client (the caller supplies the origin)", () => {
      for (const file of ["client.ts", "contract.ts", "availability.ts", "fakeApi.ts"]) {
         expect(text(join(SRC, "lib/practice-workspace", file))).not.toContain("process.env");
      }
   });
});
