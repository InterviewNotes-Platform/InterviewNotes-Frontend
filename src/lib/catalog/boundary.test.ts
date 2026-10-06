import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");

function sources(dir: string): string[] {
   return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
   });
}

const catalogFiles = [...sources(join(SRC, "lib", "catalog")), ...sources(join(SRC, "components", "catalog"))];
const read = (path: string) => readFileSync(path, "utf8");

describe("catalog browser/Git boundary", () => {
   it("finds the catalog sources it is guarding", () => {
      expect(catalogFiles.map((file) => relative(SRC, file)).sort()).toEqual([
         "components/catalog/CatalogBody.tsx",
         "components/catalog/DiscoveryCard.tsx",
         "components/catalog/EntryRow.tsx",
         "components/catalog/ItemNavigation.tsx",
         "components/catalog/KnowledgeBands.tsx",
         "components/catalog/KnowledgeBrowse.tsx",
         "components/catalog/KnowledgeHeader.tsx",
         "components/catalog/LessonHeader.tsx",
         "components/catalog/LessonRelated.tsx",
         "components/catalog/PracticeFilters.tsx",
         "components/catalog/ProblemHeader.tsx",
         "components/catalog/ProblemPhases.tsx",
         "components/catalog/ProblemPreparation.tsx",
         "components/catalog/ProblemResults.tsx",
         "components/catalog/RelatedContent.tsx",
         "components/catalog/TrackCard.tsx",
         "components/catalog/TrackContext.tsx",
         "components/catalog/TrackCurriculum.tsx",
         "components/catalog/TrackOutline.tsx",
         "components/catalog/blocks.ts",
         "lib/catalog/client.ts",
         "lib/catalog/knowledge.ts",
         "lib/catalog/lesson.ts",
         "lib/catalog/navigation.ts",
         "lib/catalog/practice.ts",
         "lib/catalog/preview.ts",
         "lib/catalog/problem.ts",
         "lib/catalog/problems.ts",
         "lib/catalog/routes.ts",
         "lib/catalog/topics.ts",
         "lib/catalog/track.ts",
         "lib/catalog/types.ts",
      ]);
   });

   it("keeps the client server-only", () => {
      expect(read(join(SRC, "lib", "catalog", "client.ts"))).toMatch(/^import "server-only";/);
   });

   it("has no client component among the catalog sources", () => {
      for (const file of catalogFiles) expect(read(file), file).not.toMatch(/["']use client["']/);
   });

   it("never reaches Git, a Git credential, or a public env var", () => {
      for (const file of catalogFiles) {
         expect(read(file), file).not.toMatch(/github|gitlab|\.git\b|GIT_|NEXT_PUBLIC/i);
      }
   });

   it("accepts no branch, commit, ref or release selector", () => {
      for (const file of catalogFiles) {
         expect(read(file), file).not.toMatch(/[?&](branch|commit|sha|rev|release)=|searchParams/i);
      }
   });

   it("keeps the server-only client out of the renderer and out of every client component", () => {
      expect(read(join(SRC, "components", "catalog", "CatalogBody.tsx"))).not.toContain("catalog/client");
      for (const file of sources(SRC)) {
         const text = read(file);
         if (/^\s*["']use client["']/.test(text)) expect(text, file).not.toMatch(/lib\/catalog\/client/);
      }
   });

   it("keeps every presentation component free of the client, fetching and effects", () => {
      for (const file of sources(join(SRC, "components", "catalog"))) {
         expect(read(file), file).not.toMatch(/catalog\/client|\bfetch\(|useEffect|process\.env/);
      }
   });

   it("loads relationships without ever fetching an item body", () => {
      expect(read(join(SRC, "lib", "catalog", "navigation.ts"))).not.toMatch(/getCatalogItem/);
   });
});
