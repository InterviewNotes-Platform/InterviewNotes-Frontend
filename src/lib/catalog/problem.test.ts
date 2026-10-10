import { describe, expect, it } from "vitest";
import { problemCategoryLabel, problemRelations, problemSectionHeading } from "./problem";
import type { CatalogMeta } from "./types";

describe("problemSectionHeading", () => {
   it("prefers the section's own title, then its type's name, and invents nothing for an unknown type", () => {
      expect(problemSectionHeading({ type: "prompt", title: "  The ask  " })).toBe("The ask");
      expect(problemSectionHeading({ type: "high_level_design", title: null })).toBe("High-level design");
      expect(problemSectionHeading({ type: "deep_dive", title: "" })).toBe("Deep dive");
      expect(problemSectionHeading({ type: "trade_offs", title: null })).toBe("Trade-offs"); // S-DEC-2
      expect(problemSectionHeading({ type: "follow_ups", title: " " })).toBe("Follow-up"); // S-FUP-1: one follow-up, not the stage
      expect(problemSectionHeading({ type: "mystery", title: null })).toBeNull();
   });
});

describe("problemCategoryLabel", () => {
   it("names a Problem category and nothing else", () => {
      expect(problemCategoryLabel("system_design")).toBe("System design");
      expect(problemCategoryLabel("ml_system_design")).toBe("ML system design");
      for (const other of ["concept", "quick_reference", "", null, undefined]) expect(problemCategoryLabel(other)).toBeNull();
   });
});

const meta = (id: string, over: Partial<CatalogMeta> = {}): CatalogMeta => {
   const [type, slug] = id.split(".");
   return { id, type, slug, title: `Title ${slug}`, summary: "", tags: [], category: null, difficulty: null, level: null, access: "free", ...over } as CatalogMeta;
};
const hrefs = (rows: { href: string }[]) => rows.map(({ href }) => href);

describe("problemRelations", () => {
   const relations = {
      prerequisite: [meta("lesson.basics"), meta("knowledge.embeddings"), meta("lesson.second")],
      applies: [meta("knowledge.attention"), meta("knowledge.embeddings")],
      related: [meta("problem.sibling"), meta("knowledge.attention"), meta("lesson.deep"), meta("knowledge.other"), meta("problem.self")],
      prerequisite_of: [meta("problem.later")],
   };

   it("makes preparation of prerequisites, then applied Knowledge, in the API's order", () => {
      const { preparation } = problemRelations(relations, "problem.self");
      expect(preparation.map(({ label }) => label)).toEqual(["Prerequisites", "Knowledge applied"]);
      expect(hrefs(preparation[0].rows)).toEqual(["/lessons/basics", "/knowledge/embeddings", "/lessons/second"]);
      expect(hrefs(preparation[1].rows)).toEqual(["/knowledge/attention"]);
   });

   it("names a target once: preparation wins, and the rest are grouped by type without the item itself", () => {
      const { knowledge, lessons, problems } = problemRelations(relations, "problem.self");
      expect(hrefs(knowledge)).toEqual(["/knowledge/other"]);
      expect(hrefs(lessons)).toEqual(["/lessons/deep"]);
      expect(hrefs(problems)).toEqual(["/problems/sibling", "/problems/later"]);
   });

   it("has no preparation, and no group, when the API relates nothing to prepare with", () => {
      const result = problemRelations({ related: [meta("knowledge.other")] }, "problem.self");
      expect(result.preparation).toEqual([]);
      expect(problemRelations({}, "problem.self")).toEqual({ preparation: [], knowledge: [], lessons: [], problems: [] });
   });

   it("drops an unlinkable target, an unknown relation and a Problem named as a prerequisite", () => {
      const { preparation, knowledge, problems } = problemRelations(
         {
            prerequisite: [meta("problem.nope"), { ...meta("lesson.bad"), slug: "other" }, meta("lesson.ok")],
            applies: [meta("lesson.not-knowledge")],
            mentioned_in: [meta("knowledge.mention")],
            invented: [meta("knowledge.invented")],
         },
         "problem.self"
      );
      expect(preparation.map(({ rows }) => hrefs(rows))).toEqual([["/lessons/ok"]]);
      expect(knowledge).toEqual([]);
      expect(problems).toEqual([]);
   });
});
