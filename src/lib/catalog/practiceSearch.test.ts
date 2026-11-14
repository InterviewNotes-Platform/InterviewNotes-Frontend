import { describe, expect, it } from "vitest";
import { matchProblems } from "./practiceSearch";
import type { CatalogMeta } from "./types";

const meta = (slug: string, over: Partial<CatalogMeta> = {}): { meta: CatalogMeta; href: string } => ({
   meta: { id: `problem.${slug}`, type: "problem", slug, title: slug, summary: "", tags: [], category: null, difficulty: null, level: null, access: "free", ...over },
   href: `/problems/${slug}`,
});
const INDEX = [meta("feed-ranking", { title: "Design a Feed Ranker", tags: ["ranking"] }), meta("ads", { summary: "Click-through prediction", tags: ["ads-serving"] })];

describe("matchProblems", () => {
   it("needs every word, in any field, ignoring case and hyphens, in list order", () => {
      expect(matchProblems(INDEX, "feed RANK").map(({ href }) => href)).toEqual(["/problems/feed-ranking"]);
      expect(matchProblems(INDEX, "ads serving").map(({ href }) => href)).toEqual(["/problems/ads"]);
      expect(matchProblems(INDEX, "click-through").map(({ href }) => href)).toEqual(["/problems/ads"]);
      expect(matchProblems(INDEX, "feed ads")).toEqual([]);
   });

   it("returns the whole list for a blank term", () => {
      expect(matchProblems(INDEX, "   ")).toEqual(INDEX);
   });
});
