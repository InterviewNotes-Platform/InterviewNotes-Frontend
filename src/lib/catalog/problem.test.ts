import { describe, expect, it } from "vitest";
import { phasesOf, problemCategoryLabel, problemRelations, problemSectionHeading } from "./problem";
import type { CatalogMeta, CatalogSection } from "./types";

const section = (id: string, type: string, title: string | null = null): CatalogSection => ({
   id,
   type,
   title,
   body: { format: "markdown@1", text: id },
});
const ids = (sections: CatalogSection[]) => sections.map(({ id }) => id);

describe("phasesOf", () => {
   it("orders phases Frame, Requirements, Design, ML Reasoning, Evaluate & Scale, Depth & Trade-offs, however the API ordered the sections", () => {
      const phases = phasesOf([
         section("trade-offs", "trade_offs"),
         section("evaluation", "evaluation"),
         section("model", "model"),
         section("hld", "high_level_design"),
         section("constraints", "constraints"),
         section("prompt", "prompt"),
      ]);
      expect(phases.map(({ label }) => label)).toEqual(["Frame", "Requirements", "Design", "ML Reasoning", "Evaluate & Scale", "Depth & Trade-offs"]);
      expect(phases.map(({ id }) => id)).toEqual(["problem_frame", "problem_requirements", "problem_design", "problem_ml", "problem_evaluate", "problem_depth"]);
   });

   it("maps every type of the task's phase table to its phase", () => {
      const table: Record<string, string[]> = {
         Frame: ["prompt", "scope_clarification"],
         Requirements: ["functional_requirements", "non_functional_requirements", "constraints"],
         Design: ["core_entities", "interfaces", "high_level_design"],
         "ML Reasoning": ["ml_objective", "data", "features", "labels", "model", "training", "inference"],
         "Evaluate & Scale": ["evaluation", "integration", "production_scaling"],
         "Depth & Trade-offs": ["deep_dive", "trade_offs"],
      };
      const all = Object.values(table).flat();
      const phases = phasesOf(all.map((type) => section(type, type)));
      expect(Object.fromEntries(phases.map(({ label, sections }) => [label, ids(sections)]))).toEqual(table);
   });

   it("shows the ML phase only when ML sections are present", () => {
      const plain = phasesOf([section("prompt", "prompt"), section("hld", "high_level_design"), section("eval", "evaluation")]);
      expect(plain.map(({ label }) => label)).toEqual(["Frame", "Design", "Evaluate & Scale"]);
      const ml = phasesOf([section("prompt", "prompt"), section("obj", "ml_objective"), section("eval", "evaluation")]);
      expect(ml.map(({ label }) => label)).toEqual(["Frame", "ML Reasoning", "Evaluate & Scale"]);
   });

   it("shows no empty phase and nothing for no sections", () => {
      expect(phasesOf([])).toEqual([]);
      const only = phasesOf([section("hld", "high_level_design")]);
      expect(only).toHaveLength(1);
      expect(only[0].sections).toHaveLength(1);
   });

   it("numbers the phases that are shown, so a missing phase leaves no gap", () => {
      const phases = phasesOf([section("prompt", "prompt"), section("hld", "high_level_design"), section("eval", "evaluation"), section("x", "mystery")]);
      expect(phases.map(({ label, step }) => [label, step])).toEqual([
         ["Frame", { position: 1, total: 3 }],
         ["Design", { position: 2, total: 3 }],
         ["Evaluate & Scale", { position: 3, total: 3 }],
         ["More", null],
      ]);
   });

   it("keeps repeated deep_dive sections in the API's order, with trade_offs where the API put it", () => {
      const phases = phasesOf([
         section("deep-b", "deep_dive"),
         section("trade-offs", "trade_offs"),
         section("deep-a", "deep_dive"),
         section("deep-c", "deep_dive"),
      ]);
      expect(phases).toHaveLength(1);
      expect(ids(phases[0].sections)).toEqual(["deep-b", "trade-offs", "deep-a", "deep-c"]);
   });

   it("keeps sections of one phase in the API's order, not the table's", () => {
      const [requirements] = phasesOf([section("c", "constraints"), section("f", "functional_requirements"), section("n", "non_functional_requirements")]);
      expect(ids(requirements.sections)).toEqual(["c", "f", "n"]);
   });

   it("puts a type outside the mapping in More, last, in the API's order, and never drops it", () => {
      const phases = phasesOf([
         section("zeta", "zeta_unknown"),
         section("prompt", "prompt"),
         section("alpha", "alpha_unknown"),
         section("ref", "reference_design"),
         section("follow", "follow_ups"),
      ]);
      expect(phases.map(({ label }) => label)).toEqual(["Frame", "More"]);
      expect(ids(phases[1].sections)).toEqual(["zeta", "alpha", "ref", "follow"]);
      expect(phases.flatMap(({ sections }) => ids(sections)).sort()).toEqual(["alpha", "follow", "prompt", "ref", "zeta"]);
   });

   it("uses page ids no section id can take, since a section id never contains an underscore", () => {
      for (const { id } of phasesOf([section("a", "prompt"), section("b", "mystery")])) expect(id).toContain("_");
   });
});

describe("problemSectionHeading", () => {
   it("prefers the section's own title, then its type's name, and invents nothing for an unknown type", () => {
      expect(problemSectionHeading({ type: "prompt", title: "  The ask  " })).toBe("The ask");
      expect(problemSectionHeading({ type: "high_level_design", title: null })).toBe("High-level design");
      expect(problemSectionHeading({ type: "deep_dive", title: "" })).toBe("Deep dive");
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
