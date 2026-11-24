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
   ...walk(join(SRC, "app/practice/history")),
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
            "app/practice/history/layout.tsx",
            "app/practice/history/page.tsx",
            "components/practice-workspace/AttemptRoute.tsx",
            "components/practice-workspace/AttemptWorkspace.tsx",
            "components/practice-workspace/BriefDialog.tsx",
            "components/practice-workspace/HistoryRoute.tsx",
            "components/practice-workspace/PracticeEntry.tsx",
            "components/practice-workspace/PracticeGate.tsx",
            "components/practice-workspace/PracticeUnavailable.tsx",
            "components/practice-workspace/PromptBlocks.tsx",
            "components/practice-workspace/SaveTrouble.tsx",
            "components/practice-workspace/StageEditor.tsx",
            "components/practice-workspace/StageGuide.tsx",
            "components/practice-workspace/StageNav.tsx",
            "components/practice-workspace/StartPracticeDialog.tsx",
            "components/practice-workspace/practiceSession.ts",
            "components/practice-workspace/saveSummary.ts",
            "components/practice-workspace/useAttemptWorkspace.ts",
            "components/practice-workspace/useStageGuide.ts",
            "lib/practice-flag.ts",
            "lib/practice-workspace/autosave.ts",
            "lib/practice-workspace/availability.ts",
            "lib/practice-workspace/client.ts",
            "lib/practice-workspace/contract.ts",
            "lib/practice-workspace/fakeApi.ts",
            "lib/practice-workspace/fakeAttempts.ts",
            "lib/practice-workspace/guards.ts",
            "lib/practice-workspace/stageSave.ts",
            "lib/practice-workspace/stages.ts",
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

   // T13 reuses the one leave guard of the prepare editor, as its task requires; nothing else of the reader, catalog or P7 is imported.
   const REUSED = new Set(["@/components/prepare/editor/useLeaveGuard"]);
   it.each(production)("%s imports no reader, catalog or P7 module", (path) => {
      const imports = [...text(path).matchAll(/from "([^"]+)"/g)].map((match) => match[1]).filter((from) => !REUSED.has(from));
      for (const from of imports) {
         expect(from, `${name(path)} imports ${from}`).not.toMatch(/^@\/(app\/_catalog|components\/(catalog|lesson|problem|reader|knowledge|prepare|practice)\/|lib\/(catalog|prep)\/)/);
      }
   });

   it.each(production.filter((path) => path.endsWith(".tsx")))("%s never prefetches a link", (path) => {
      const links = [...text(path).matchAll(/<Link\b[^>]*>/g)].map((match) => match[0]);
      for (const link of links) expect(link).toContain("prefetch={false}");
   });

   it("keeps the fake API and the fake attempt service out of production code", () => {
      for (const path of production.filter((candidate) => !/fake(Api|Attempts)\.ts$/.test(candidate))) {
         expect(text(path), name(path)).not.toMatch(/fakeApi|fakeAttempts|createFakePracticeApi|installFakeAttempts/);
      }
   });

   it("reaches the fakes from tests only: no non-test file under src imports them", () => {
      const offenders = walk(SRC)
         .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path) && !/fake(Api|Attempts)\.ts$/.test(path))
         .filter((path) => /from "[^"]*fake(Api|Attempts)"/.test(text(path)));
      expect(offenders.map(name)).toEqual([]);
   });

   it("adds no editor library: React Flow is not installed", () => {
      const manifest = JSON.parse(text(join(ROOT, "package.json"))) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
      expect(names.filter((dependency) => /reactflow|xyflow/i.test(dependency))).toEqual([]);
      expect(production.map((path) => text(path)).join("\n")).not.toMatch(/xyflow|reactflow/i);
   });

   it("reads no environment inside the client (the caller supplies the origin)", () => {
      for (const file of ["client.ts", "contract.ts", "availability.ts", "fakeApi.ts", "fakeAttempts.ts", "guards.ts", "autosave.ts", "stageSave.ts", "stages.ts"]) {
         expect(text(join(SRC, "lib/practice-workspace", file))).not.toContain("process.env");
      }
   });
});
