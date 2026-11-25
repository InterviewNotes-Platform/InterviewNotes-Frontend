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
   ...walk(join(SRC, "lib/practice-graph")),
   ...walk(join(SRC, "components/practice-graph")),
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
            "components/practice-graph/CanvasView.tsx",
            "components/practice-graph/ConnectPicker.tsx",
            "components/practice-graph/CurvedEdge.tsx",
            "components/practice-graph/DiagramEditor.tsx",
            "components/practice-graph/DiagramEditorLoader.tsx",
            "components/practice-graph/DiagramTrouble.tsx",
            "components/practice-graph/ElementFields.tsx",
            "components/practice-graph/Inspector.tsx",
            "components/practice-graph/Outline.tsx",
            "components/practice-graph/shapes.tsx",
            "components/practice-graph/useGraphEditor.ts",
            "lib/practice-graph/canonical.ts",
            "lib/practice-graph/diagramSave.ts",
            "lib/practice-graph/fakeDiagram.ts",
            "lib/practice-graph/history.ts",
            "lib/practice-graph/ids.ts",
            "lib/practice-graph/layout.ts",
            "lib/practice-graph/model.ts",
            "lib/practice-graph/review.ts",
            "lib/practice-graph/routing.ts",
            "lib/practice-graph/text.ts",
            "lib/practice-graph/validate.ts",
            "lib/practice-graph/vocabulary.ts",
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

   const FAKES = /fake(Api|Attempts|Diagram)\.ts$/;
   it("keeps the fake API and the fake attempt and diagram services out of production code", () => {
      for (const path of production.filter((candidate) => !FAKES.test(candidate))) {
         expect(text(path), name(path)).not.toMatch(/fakeApi|fakeAttempts|fakeDiagram|createFakePracticeApi|installFakeAttempts|installFakeDiagram/);
      }
   });

   it("reaches the fakes from tests only: no non-test file under src imports them", () => {
      const offenders = walk(SRC)
         .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path) && !FAKES.test(path))
         .filter((path) => /from "[^"]*fake(Api|Attempts|Diagram)"/.test(text(path)));
      expect(offenders.map(name)).toEqual([]);
   });

   // T14 (P9-AC-10.2, the owner's T03 decision): one exact React Flow version, imported only by the editor, reached only by a dynamic import.
   it("pins React Flow exactly and imports it only inside the editor, which is reached only by a dynamic import", () => {
      const manifest = JSON.parse(text(join(ROOT, "package.json"))) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const deps = { ...manifest.dependencies, ...manifest.devDependencies };
      expect(Object.keys(deps).filter((dependency) => /reactflow|xyflow/i.test(dependency))).toEqual(["@xyflow/react"]);
      expect(deps["@xyflow/react"]).toBe("13.0.3");
      const importers = walk(SRC)
         .filter((path) => /\.(ts|tsx)$/.test(path))
         .filter((path) => /from "@xyflow\/|import\("@xyflow\/|@xyflow\/react\/dist/.test(text(path)))
         .map(name)
         .sort();
      expect(importers).toEqual(["components/practice-graph/CanvasView.tsx", "components/practice-graph/CurvedEdge.tsx", "components/practice-graph/DiagramEditor.tsx", "components/practice-graph/shapes.tsx"]);
      const editorModules = /from "@\/components\/practice-graph\/(DiagramEditor|CanvasView|CurvedEdge|shapes|Inspector|Outline|ElementFields|ConnectPicker|DiagramTrouble|useGraphEditor)"/;
      const outside = walk(SRC).filter((path) => /\.(ts|tsx)$/.test(path) && !path.includes("/practice-graph/") && !/\.test\.(ts|tsx)$/.test(path) && editorModules.test(text(path)));
      expect(outside.map(name)).toEqual([]);
      const loader = text(join(SRC, "components/practice-graph/DiagramEditorLoader.tsx"));
      expect(loader).toContain('dynamic(() => import("./DiagramEditor")');
      expect(loader).not.toMatch(/^import (?!type)[^;]*"\.\/DiagramEditor"/m);
   });

   it("adds no Mermaid editing, freehand, image, upload or URL input to the editor", () => {
      const editor = production.filter((path) => path.includes("practice-graph")).map((path) => text(path)).join("\n");
      expect(editor).not.toMatch(/mermaid|type="file"|type="url"|<img\b|<canvas\b|freehand|FileReader|createObjectURL/i);
   });

   it("reads no environment inside the client (the caller supplies the origin)", () => {
      for (const file of ["client.ts", "contract.ts", "availability.ts", "fakeApi.ts", "fakeAttempts.ts", "guards.ts", "autosave.ts", "stageSave.ts", "stages.ts"]) {
         expect(text(join(SRC, "lib/practice-workspace", file))).not.toContain("process.env");
      }
   });
});
