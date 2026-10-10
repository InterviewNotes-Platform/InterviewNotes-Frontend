// @vitest-environment node
import { describe, expect, it } from "vitest";
import fixture from "../e2e/catalog/fixture.json";

// Test-only transcription of spec §4.1, §4.2, §5.1 and §6.3 (S-SPN-16). The runtime holds no copy of it.
const POSITION_KIND: Record<string, "interview_stage" | "review_surface"> = {
   frame: "interview_stage",
   requirements: "interview_stage",
   design: "interview_stage",
   ml_reasoning: "interview_stage",
   evaluate_and_scale: "interview_stage",
   depth_and_trade_offs: "interview_stage",
   follow_ups: "interview_stage",
   reference_solution: "review_surface",
   self_review: "review_surface",
};

const SPINES: Record<string, string[]> = {
   system_design: ["frame", "requirements", "design", "evaluate_and_scale", "depth_and_trade_offs", "follow_ups", "reference_solution", "self_review"],
   ml_system_design: ["frame", "requirements", "design", "ml_reasoning", "evaluate_and_scale", "depth_and_trade_offs", "follow_ups", "reference_solution", "self_review"],
};

const ML_ONLY = ["ml_objective", "data", "features", "labels", "model", "training", "inference"];
// Every type except `hint`, which takes its target's position.
const TYPE_POSITION: Record<string, string> = {
   prompt: "frame",
   scope_clarification: "frame",
   clarification: "frame",
   assumption: "frame",
   functional_requirements: "requirements",
   non_functional_requirements: "requirements",
   constraints: "requirements",
   core_entities: "design",
   interfaces: "design",
   high_level_design: "design",
   ml_objective: "ml_reasoning",
   data: "ml_reasoning",
   features: "ml_reasoning",
   labels: "ml_reasoning",
   model: "ml_reasoning",
   training: "ml_reasoning",
   inference: "ml_reasoning",
   evaluation: "evaluate_and_scale",
   integration: "evaluate_and_scale",
   production_scaling: "evaluate_and_scale",
   deep_dive: "depth_and_trade_offs",
   trade_offs: "depth_and_trade_offs",
   follow_ups: "follow_ups",
   reference_design: "reference_solution",
   alternative: "reference_solution",
   level_expectations: "self_review",
   rubric_dimension: "self_review",
   common_mistakes: "self_review",
};
const DIMENSIONS = [
   "problem_framing",
   "estimation_and_scale",
   "architecture",
   "data_and_storage",
   "ml_formulation",
   "evaluation_and_metrics",
   "reliability_and_operations",
   "trade_off_reasoning",
   "communication_and_structure",
];

/** Targets a link may name, by source type (§6.3). "stage" is any non-hint type positioned in an interview stage. */
const LINK_TARGETS: Record<string, string[] | "stage"> = {
   hint: "stage",
   follow_ups: ["stage-not-clarification", "follow_ups"],
   assumption: ["trade_offs", "deep_dive"],
   alternative: ["trade_offs", "reference_design"],
   rubric_dimension: "stage",
};

// Values the transcription cannot derive, stated here so each unknown in the fixture is deliberate.
const UNKNOWN_POSITIONS: Record<string, Record<string, string | null>> = {
   "problem.p4-unknown-values": {
      "future-unit": "design",
      "future-zone": "p4_future_zone",
      "hint-future": "p4_future_zone",
      "future-untitled": "design",
      "no-position": null,
      "future-secret": "p4_future_stage",
   },
};
const UNKNOWN_SPINE_ENTRIES: Record<string, { position: string; kind: string }[]> = {
   "problem.p4-unknown-values": [
      { position: "p4_future_zone", kind: "interview_stage" },
      { position: "p4_future_stage", kind: "interview_stage" },
   ],
};

interface Section {
   id: string;
   type: string;
   title: string | null;
   access: string;
   text: string;
   spine_position?: string | null;
   link?: string;
   dimension?: string;
}
interface Item {
   id: string;
   type: string;
   category: string | null;
   spine?: { position: string; kind: string }[];
   sections?: Section[];
}
const items: Item[] = fixture.items as unknown as Item[];
const p4 = items.filter((item) => item.id.startsWith("problem.p4-"));
const allowedIn = (category: string) => Object.keys(TYPE_POSITION).filter((type) => category === "ml_system_design" || !ML_ONLY.includes(type));

describe("P4 fixtures are present and complete", () => {
   it("carry a spine and use the p4- prefix, and no other Problem carries a P4 field", () => {
      expect(p4.length).toBeGreaterThanOrEqual(11);
      for (const item of p4) expect(Array.isArray(item.spine), item.id).toBe(true);
      const others = items.filter((item) => !item.id.startsWith("problem.p4-"));
      for (const item of others) {
         expect(item.spine, item.id).toBeUndefined();
         for (const section of item.sections ?? []) {
            expect(Object.keys(section).filter((key) => ["spine_position", "link", "dimension"].includes(key)), `${item.id}/${section.id}`).toEqual([]);
         }
      }
   });

   it.each([
      ["problem.p4-sd-complete", "system_design"],
      ["problem.p4-ml-complete", "ml_system_design"],
   ])("%s carries every unit its category allows, and a hint", (id, category) => {
      const item = items.find((candidate) => candidate.id === id);
      expect(item?.category).toBe(category);
      const types = new Set(item?.sections?.map((section) => section.type));
      expect([...types].sort()).toEqual([...allowedIn(category), "hint"].sort());
   });

   it("holds the shapes the cases need: structured and legacy expectations, a branch, a withheld parent, authored disorder, unknowns", () => {
      const sections = (id: string) => items.find((item) => item.id === id)?.sections ?? [];
      const levels = (id: string) => sections(id).find((section) => section.type === "level_expectations");
      expect(levels("problem.p4-sd-complete")?.text).toContain("::: part name=bar seniority=senior");
      expect(levels("problem.p4-ml-complete")?.text).not.toContain(":::");

      const followUps = sections("problem.p4-premium-followups");
      const parent = followUps.find((section) => section.access === "premium" && section.type === "follow_ups");
      expect(followUps.find((section) => section.link === parent?.id && section.type === "follow_ups")?.access).toBe("free");
      expect(followUps.some((section) => section.type === "follow_ups" && section.access === "free" && section.link === "follow-up-free")).toBe(true);

      const order = sections("problem.p4-out-of-order").map((section) => section.spine_position);
      const spine = SPINES.system_design;
      expect(order.map((position) => spine.indexOf(position as string))).not.toEqual([...order.map((position) => spine.indexOf(position as string))].sort((a, b) => a - b));
      expect(Object.keys(UNKNOWN_POSITIONS)).toEqual(["problem.p4-unknown-values"]);
   });
});

describe.each(p4.map((item) => [item.id, item] as const))("%s fixture values match the spec tables", (_id, item) => {
   const sections = item.sections ?? [];
   const byId = new Map(sections.map((section) => [section.id, section]));
   const unknown = UNKNOWN_POSITIONS[item.id] ?? {};
   const category = item.category as string;

   const expectedPosition = (section: Section): string | null => {
      if (Object.hasOwn(unknown, section.id)) return unknown[section.id];
      if (section.type === "hint") return expectedPosition(byId.get(section.link as string) as Section);
      return TYPE_POSITION[section.type];
   };

   it("positions every section by its type, and a hint by its target", () => {
      for (const section of sections) {
         expect(section.spine_position, `${section.id} (${section.type})`).toBe(expectedPosition(section));
      }
   });

   it("lists every position the document holds, in its category's order, with the right kinds", () => {
      const held = new Set(sections.map((section) => section.spine_position));
      const known = SPINES[category].filter((position) => held.has(position)).map((position) => ({ position, kind: POSITION_KIND[position] }));
      expect(item.spine).toEqual([...known, ...(UNKNOWN_SPINE_ENTRIES[item.id] ?? [])]);
   });

   it("uses only types the category allows, except the deliberate unknowns", () => {
      for (const section of sections) {
         if (Object.hasOwn(unknown, section.id) && !(section.type in TYPE_POSITION) && section.type !== "hint") continue;
         expect(section.type === "hint" || allowedIn(category).includes(section.type), `${section.id} (${section.type})`).toBe(true);
      }
   });

   it("keeps every link one of the allowed pairs, to a section of this document, and branches to two levels", () => {
      const stageType = (type: string) => POSITION_KIND[TYPE_POSITION[type]] === "interview_stage";
      for (const section of sections.filter((candidate) => candidate.link !== undefined)) {
         const rule = LINK_TARGETS[section.type];
         const target = byId.get(section.link as string);
         expect(rule, `${section.id}: a ${section.type} takes no link`).toBeDefined();
         expect(target, `${section.id} links to a section not in the document`).toBeDefined();
         if (rule === "stage") expect(stageType(target!.type), section.id).toBe(true);
         else expect(rule!.includes(target!.type) || (rule!.includes("stage-not-clarification") && stageType(target!.type) && target!.type !== "clarification"), section.id).toBe(true);
         if (section.type === "follow_ups" && target!.type === "follow_ups") {
            expect(byId.get(target!.link as string)?.type ?? "none", `${section.id} branches a branch`).not.toBe("follow_ups");
         }
      }
      for (const section of sections.filter((candidate) => candidate.type === "hint")) expect(section.link, section.id).toBeDefined();
   });

   it("gives a dimension only to follow-ups and rubric dimensions, from the shared vocabulary", () => {
      for (const section of sections.filter((candidate) => candidate.dimension !== undefined)) {
         expect(["follow_ups", "rubric_dimension", "p4_future_unit"], section.id).toContain(section.type);
         if (section.dimension !== "p4_future_dimension") expect(DIMENSIONS, section.id).toContain(section.dimension);
      }
   });

   it("keeps section ids unique", () => {
      expect(new Set(sections.map((section) => section.id)).size).toBe(sections.length);
   });
});
