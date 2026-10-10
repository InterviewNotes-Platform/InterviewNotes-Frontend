import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHALLENGE_FACING, ROLE_GROUPS, composeProblem, type ProblemStage } from "./problemSpine";
import { POSITION_COPY } from "./positionCopy";
import type { CatalogSection, CatalogSpineEntry } from "./types";

// Transcribed from spec §4.1, §4.5 and §4.6 (S-SPN-16). This is the only place a position list lives besides the backend.
const POSITION_IDS = ["frame", "requirements", "design", "ml_reasoning", "evaluate_and_scale", "depth_and_trade_offs", "follow_ups", "reference_solution", "self_review"];
const ROLE_TABLE: Record<string, string[]> = {
   frame: ["challenge", "hints", "clarifications", "assumptions", "stageReference"],
   requirements: ["hints", "stageReference"],
   design: ["hints", "stageReference"],
   ml_reasoning: ["hints", "stageReference"],
   evaluate_and_scale: ["hints", "stageReference"],
   depth_and_trade_offs: ["hints", "units"],
   follow_ups: ["hints", "followUps"],
   reference_solution: ["reference", "alternatives"],
   self_review: ["expectations", "rubric", "mistakes"],
};
const SECTION_TYPES = [
   "prompt", "scope_clarification", "clarification", "assumption", "functional_requirements", "non_functional_requirements", "constraints",
   "core_entities", "interfaces", "high_level_design", "ml_objective", "data", "features", "labels", "model", "training", "inference",
   "evaluation", "integration", "production_scaling", "deep_dive", "trade_offs", "hint", "follow_ups", "reference_design", "alternative",
   "level_expectations", "rubric_dimension", "common_mistakes",
];

const STAGES = ["frame", "requirements", "design", "ml_reasoning", "evaluate_and_scale", "depth_and_trade_offs", "follow_ups"];
const entry = (position: string, withheld: boolean | null = false): CatalogSpineEntry => ({
   position,
   kind: position === "reference_solution" || position === "self_review" ? "review_surface" : "interview_stage",
   withheld: position === "reference_solution" || position === "self_review" ? null : withheld,
});
const spineOf = (...positions: string[]) => positions.map((position) => entry(position));
const section = (id: string, type: string, spine_position?: string | null): CatalogSection => ({
   id,
   type,
   title: null,
   body: { format: "markdown@1", text: id },
   ...(spine_position === undefined ? {} : { spine_position }),
});
const ids = (stage: ProblemStage | null | undefined) => stage?.groups.flatMap(({ sections }) => sections.map(({ id }) => id));
const roles = (stage: ProblemStage) => stage.groups.map(({ role }) => role);
const labels = (stages: ProblemStage[]) => stages.map(({ label }) => label);

describe("composeProblem: spine and categories", () => {
   it("renders the spine in the order given, grouping Interview and Review by kind, whatever the authored order", () => {
      const result = composeProblem({
         spine: spineOf("frame", "design", "evaluate_and_scale", "follow_ups", "reference_solution", "self_review"),
         sections: [
            section("rubric", "rubric_dimension", "self_review"),
            section("follow", "follow_ups", "follow_ups"),
            section("ref", "reference_design", "reference_solution"),
            section("eval", "evaluation", "evaluate_and_scale"),
            section("hld", "high_level_design", "design"),
            section("prompt", "prompt", "frame"),
         ],
      });
      expect(labels(result.interview)).toEqual(["Frame", "Design", "Evaluate & Scale", "Follow-ups"]);
      expect(labels(result.review)).toEqual(["Reference Solution", "Self-review"]);
      expect(result.interview.map(({ id }) => id)).toEqual(["problem_frame", "problem_design", "problem_evaluate_and_scale", "problem_follow_ups"]);
      expect(result.neutral).toBeNull();
   });

   it("composes both categories: the ML Problem keeps ML Reasoning in the position the backend gave it", () => {
      const ml = composeProblem({ spine: spineOf(...STAGES, "reference_solution", "self_review"), sections: [section("obj", "ml_objective", "ml_reasoning")] });
      expect(labels(ml.interview)).toEqual(["Frame", "Requirements", "Design", "ML Reasoning", "Evaluate & Scale", "Depth & Trade-offs", "Follow-ups"]);
      const system = composeProblem({ spine: spineOf(...STAGES.filter((id) => id !== "ml_reasoning")), sections: [] });
      expect(labels(system.interview)).not.toContain("ML Reasoning");
      expect(system.interview.map(({ step }) => step?.position)).toEqual([1, 2, 3, 4, 5, 6]);
   });

   it("attaches each section by its spine_position and ignores its type for placement", () => {
      const result = composeProblem({
         spine: spineOf("design", "requirements"),
         sections: [section("a", "prompt", "design"), section("b", "evaluation", "requirements"), section("c", "deep_dive", "design")],
      });
      expect(result.interview.map(({ position }) => position)).toEqual(["design", "requirements"]);
      expect(ids(result.interview[0])).toEqual(["a", "c"]);
      expect(ids(result.interview[1])).toEqual(["b"]);
   });
});

describe("composeProblem: role groups and authored order", () => {
   it("orders role groups by the table and keeps authored order inside each group", () => {
      const [frame] = composeProblem({
         spine: spineOf("frame"),
         sections: [
            section("scope", "scope_clarification", "frame"),
            section("assume-b", "assumption", "frame"),
            section("hint-1", "hint", "frame"),
            section("clar-a", "clarification", "frame"),
            section("assume-a", "assumption", "frame"),
            section("prompt", "prompt", "frame"),
            section("hint-2", "hint", "frame"),
            section("clar-b", "clarification", "frame"),
         ],
      }).interview;
      expect(roles(frame)).toEqual(["challenge", "hints", "clarifications", "assumptions", "stageReference"]);
      expect(ids(frame)).toEqual(["prompt", "hint-1", "hint-2", "clar-a", "clar-b", "assume-b", "assume-a", "scope"]);
   });

   it("puts a stage's hints before its stage reference, and interleaves deep dives and trade-offs in authored order", () => {
      const result = composeProblem({
         spine: spineOf("requirements", "depth_and_trade_offs"),
         sections: [
            section("constraints", "constraints", "requirements"),
            section("hint-r", "hint", "requirements"),
            section("deep-b", "deep_dive", "depth_and_trade_offs"),
            section("decision", "trade_offs", "depth_and_trade_offs"),
            section("hint-d", "hint", "depth_and_trade_offs"),
            section("deep-a", "deep_dive", "depth_and_trade_offs"),
         ],
      });
      expect(ids(result.interview[0])).toEqual(["hint-r", "constraints"]);
      expect(roles(result.interview[1])).toEqual(["hints", "units"]);
      expect(ids(result.interview[1])).toEqual(["hint-d", "deep-b", "decision", "deep-a"]);
   });

   it("groups the review surfaces: reference before alternatives, expectations then rubric then common mistakes", () => {
      const { review } = composeProblem({
         spine: spineOf("reference_solution", "self_review"),
         sections: [
            section("alt-b", "alternative", "reference_solution"),
            section("mistakes", "common_mistakes", "self_review"),
            section("dim-a", "rubric_dimension", "self_review"),
            section("ref", "reference_design", "reference_solution"),
            section("levels", "level_expectations", "self_review"),
            section("alt-a", "alternative", "reference_solution"),
            section("dim-b", "rubric_dimension", "self_review"),
         ],
      });
      expect(ids(review[0])).toEqual(["ref", "alt-b", "alt-a"]);
      expect(ids(review[1])).toEqual(["levels", "dim-a", "dim-b", "mistakes"]);
   });

   it("reads the role table for every position", () => {
      const sectionsFor = (position: string) =>
         [...SECTION_TYPES].reverse().map((type) => section(`${position}-${type}`, type, position));
      const result = composeProblem({ spine: spineOf(...POSITION_IDS), sections: POSITION_IDS.flatMap(sectionsFor) });
      for (const stage of [...result.interview, ...result.review]) {
         const table = ROLE_TABLE[stage.position!];
         // Roles come in table order; stageReference closes a position whose table lists it only when it has such a section.
         expect(roles(stage).filter((role) => role !== "stageReference")).toEqual(table.filter((role) => role !== "stageReference"));
         expect(roles(stage).at(-1)).toBe("stageReference");
      }
   });

   it("keeps challenge-facing rendering to a prompt in Frame, and never in a review surface or a stage that is not Frame", () => {
      const result = composeProblem({
         spine: spineOf("frame", "design", "self_review"),
         sections: [section("p-frame", "prompt", "frame"), section("p-design", "prompt", "design"), section("p-review", "prompt", "self_review")],
      });
      expect(roles(result.interview[0])).toEqual(["challenge"]);
      expect(roles(result.interview[1])).toEqual(["stageReference"]);
      expect(roles(result.review[0])).toEqual(["stageReference"]);
   });
});

describe("composeProblem: step cue", () => {
   it("counts every shown interview stage, withheld ones included, and never a review surface", () => {
      const spine: CatalogSpineEntry[] = [entry("frame"), entry("requirements", true), entry("design"), entry("follow_ups", true), entry("reference_solution"), entry("self_review")];
      const result = composeProblem({ spine, sections: [section("prompt", "prompt", "frame"), section("ref", "reference_design", "reference_solution")] });
      expect(result.interview.map(({ step }) => step)).toEqual([
         { position: 1, total: 4 },
         { position: 2, total: 4 },
         { position: 3, total: 4 },
         { position: 4, total: 4 },
      ]);
      expect(result.review.map(({ step }) => step)).toEqual([null]);
   });
});

describe("composeProblem: withheld stages and surfaces", () => {
   it("keeps a fully withheld interview stage with its metadata and no sections", () => {
      const result = composeProblem({ spine: [entry("frame"), entry("design", true)], sections: [section("prompt", "prompt", "frame")] });
      const [, design] = result.interview;
      expect(design).toMatchObject({ position: "design", label: "Design", withheld: true, step: { position: 2, total: 2 }, groups: [] });
      expect(design.intent).toBe(POSITION_COPY.get("design")!.intent);
   });

   it("shows a partly withheld stage's released sections and flags it withheld; an unflagged stage is not", () => {
      const result = composeProblem({ spine: [entry("frame"), entry("design", true)], sections: [section("ifc", "interfaces", "design")] });
      expect(ids(result.interview[1])).toEqual(["ifc"]);
      expect(result.interview.map(({ withheld }) => withheld)).toEqual([false, true]);
   });

   it("shows a withheld stage's released hint (X-1)", () => {
      const [design] = composeProblem({ spine: [entry("design", true)], sections: [section("hint", "hint", "design")] }).interview;
      expect(design.withheld).toBe(true);
      expect(roles(design)).toEqual(["hints"]);
   });

   it("does not show a review surface that holds no released section", () => {
      const result = composeProblem({ spine: spineOf("frame", "reference_solution", "self_review"), sections: [section("levels", "level_expectations", "self_review")] });
      expect(labels(result.review)).toEqual(["Self-review"]);
      expect(composeProblem({ spine: spineOf("frame", "self_review"), sections: [] }).review).toEqual([]);
   });

   it("shows a partly withheld review surface without any withheld indication", () => {
      const [self] = composeProblem({ spine: spineOf("self_review"), sections: [section("levels", "level_expectations", "self_review")] }).review;
      expect(self.withheld).toBe(false);
      expect(self.step).toBeNull();
      // Even a (contract-violating) true flag cannot mark a review surface.
      const flagged = composeProblem({ spine: [{ position: "self_review", kind: "review_surface", withheld: true }], sections: [section("l", "level_expectations", "self_review")] });
      expect(flagged.review[0].withheld).toBe(false);
   });
});

describe("composeProblem: hints", () => {
   it("shows a stage that holds only hints, as a counted step", () => {
      const result = composeProblem({ spine: spineOf("frame", "design"), sections: [section("prompt", "prompt", "frame"), section("hint-1", "hint", "design"), section("hint-2", "hint", "design")] });
      expect(roles(result.interview[1])).toEqual(["hints"]);
      expect(ids(result.interview[1])).toEqual(["hint-1", "hint-2"]);
      expect(result.interview[1].step).toEqual({ position: 2, total: 2 });
   });

   it("does not render a hint that cannot be placed: null, absent, unknown or unlisted position, or a review surface", () => {
      const result = composeProblem({
         spine: spineOf("frame", "self_review", "mystery_stage"),
         sections: [
            section("prompt", "prompt", "frame"),
            section("h-null", "hint", null),
            section("h-absent", "hint"),
            section("h-unknown", "hint", "mystery_stage"),
            section("h-unlisted", "hint", "design"),
            section("h-review", "hint", "self_review"),
            section("h-ok", "hint", "frame"),
         ],
      });
      const everything = [...result.interview, ...result.review, ...(result.neutral ? [result.neutral] : [])].flatMap((stage) => ids(stage)!);
      expect(everything.filter((id) => id.startsWith("h-"))).toEqual(["h-ok"]);
   });
});

describe("composeProblem: absent, unknown and legacy input", () => {
   it("places a no-position section in the neutral region, closed after the review surfaces, in authored order", () => {
      const result = composeProblem({ spine: spineOf("frame"), sections: [section("z", "model"), section("prompt", "prompt", "frame"), section("a", "constraints", null)] });
      expect(result.neutral).toMatchObject({ id: "problem_more", kind: "neutral", label: "More material", step: null, position: null, intent: null });
      expect(ids(result.neutral)).toEqual(["z", "a"]);
      expect(roles(result.neutral!)).toEqual(["stageReference"]);
   });

   it("puts released material of an older backend (no spine, no positions) in the neutral region and invents no stage", () => {
      for (const spine of [undefined, null]) {
         const result = composeProblem({ spine, sections: [section("prompt", "prompt"), section("hld", "high_level_design"), section("hint", "hint")] });
         expect(result.interview).toEqual([]);
         expect(result.review).toEqual([]);
         expect(ids(result.neutral)).toEqual(["prompt", "hld"]);
      }
   });

   it("lands every known type with no position in the neutral region, never classifying it by type", () => {
      const result = composeProblem({ spine: spineOf(...POSITION_IDS), sections: SECTION_TYPES.map((type) => section(type, type, null)) });
      expect(result.interview.flatMap((stage) => ids(stage)!)).toEqual([]);
      expect(result.review).toEqual([]);
      expect(ids(result.neutral)).toEqual(SECTION_TYPES.filter((type) => type !== "hint"));
   });

   it("renders an unknown type in its known position as stage reference, after the position's groups", () => {
      const [depth] = composeProblem({ spine: spineOf("depth_and_trade_offs"), sections: [section("mystery", "mystery_type", "depth_and_trade_offs"), section("deep", "deep_dive", "depth_and_trade_offs")] }).interview;
      expect(roles(depth)).toEqual(["units", "stageReference"]);
      expect(ids(depth)).toEqual(["deep", "mystery"]);
   });

   it("drops an unknown spine entry without counting it, and sends its sections to the neutral region", () => {
      const result = composeProblem({
         spine: [entry("frame"), { position: "future_stage", kind: "interview_stage", withheld: false }, entry("design")],
         sections: [section("prompt", "prompt", "frame"), section("odd", "interfaces", "future_stage"), section("ifc", "interfaces", "design")],
      });
      expect(result.interview.map(({ position, step }) => [position, step?.total])).toEqual([["frame", 2], ["design", 2]]);
      expect(ids(result.neutral)).toEqual(["odd"]);
      expect(composeProblem({ spine: [{ position: "future_stage", kind: "interview_stage", withheld: true }], sections: [] })).toEqual({ interview: [], review: [], neutral: null });
   });

   it("sends a section whose position is unknown, or named by no spine entry, to the neutral region", () => {
      const result = composeProblem({ spine: spineOf("frame"), sections: [section("a", "interfaces", "future_stage"), section("b", "interfaces", "design"), section("c", "interfaces", "constructor")] });
      expect(ids(result.neutral)).toEqual(["a", "b", "c"]);
      expect(result.interview.flatMap((stage) => ids(stage)!)).toEqual([]);
   });

   it("uses the first entry when the backend repeats a position", () => {
      const result = composeProblem({ spine: [entry("frame", true), entry("frame", false)], sections: [] });
      expect(result.interview).toHaveLength(1);
      expect(result.interview[0].withheld).toBe(true);
   });
});

describe("the position model is bound to the spec tables", () => {
   it("keeps the role table and the challenge-facing set equal to spec §4.5 and §4.6", () => {
      expect(ROLE_GROUPS).toEqual(ROLE_TABLE);
      expect([...CHALLENGE_FACING]).toEqual(["prompt"]);
   });

   it("has role groups for exactly the contract's positions", () => {
      expect(Object.keys(ROLE_GROUPS).sort()).toEqual([...POSITION_IDS].sort());
   });

   it("holds no type → position map and no position order in the runtime modules", () => {
      const source = ["problemSpine.ts", "positionCopy.ts"].map((file) => readFileSync(join(__dirname, file), "utf8")).join("\n");
      const types = SECTION_TYPES.join("|");
      const positions = POSITION_IDS.join("|");
      expect(source).not.toMatch(new RegExp(`["'\\[]\\s*(${types})\\s*["']?\\s*[:,]\\s*["'](${positions})["']`));
      expect(source).not.toMatch(/\bPHASES\b|PHASE_OF_TYPE|phasesOf|POSITION_ORDER|SPINE_ORDER/);
      // Nothing sorts or ranks by position: the spine's order is the only order.
      expect(source).not.toMatch(/\.sort\(|\.toSorted\(/);
   });
});
