import { describe, expect, it } from "vitest";
import {
   ADDITIONAL_MATERIAL_LABEL,
   BRANCHES_LABEL,
   CHALLENGE_LABEL,
   CONTROL_LABEL,
   DIMENSION_LABEL,
   GROUP_LABEL,
   NEUTRAL_REGION_LABEL,
   PART_EYEBROW,
   PART_ORDER,
   SENIORITY_ORDER,
   POSITION_COPY,
   REVIEW_INTRODUCTION,
   ROLE_LABEL,
   STAGE_WITHHELD,
   WITHHELD_NOTE,
   YOURS_FIRST,
} from "./positionCopy";

// Transcribed from spec §4.1 (contract position ids) and §9.3 / §9.7 (working copy).
const POSITION_IDS = ["frame", "requirements", "design", "ml_reasoning", "evaluate_and_scale", "depth_and_trade_offs", "follow_ups", "reference_solution", "self_review"];
const LABELS: Record<string, string> = {
   frame: "Frame",
   requirements: "Requirements",
   design: "Design",
   ml_reasoning: "ML Reasoning",
   evaluate_and_scale: "Evaluate & Scale",
   depth_and_trade_offs: "Depth & Trade-offs",
   follow_ups: "Follow-ups",
   reference_solution: "Reference Solution",
   self_review: "Self-review",
};

describe("position copy", () => {
   it("has copy for exactly the contract's position ids", () => {
      expect([...POSITION_COPY.keys()].sort()).toEqual([...POSITION_IDS].sort());
   });

   it("uses the §4.1 labels and gives every position a distinct, non-empty intent or framing line", () => {
      expect(Object.fromEntries([...POSITION_COPY].map(([id, { label }]) => [id, label]))).toEqual(LABELS);
      const lines = [...POSITION_COPY.values()].map(({ intent }) => intent);
      expect(lines.every((line) => line.trim().length > 0)).toBe(true);
      expect(new Set(lines).size).toBe(lines.length);
   });

   it("carries the group labels and the neutral labels of §9.3, §9.7 and S-SPN-13", () => {
      expect(GROUP_LABEL).toEqual({ interview: "Interview", review: "Review" });
      expect(REVIEW_INTRODUCTION).toBe("After the interview: study one strong approach, then review your reasoning.");
      expect(NEUTRAL_REGION_LABEL).toBe("More material");
   });

   it("carries the reader copy of §9.3, §9.7 and §16.2: the challenge, the access lines and the group labels", () => {
      expect(CHALLENGE_LABEL).toBe("The challenge");
      expect(ADDITIONAL_MATERIAL_LABEL).toBe("Additional material");
      expect(WITHHELD_NOTE).toBe("Some material for this Problem is included with full access.");
      expect(STAGE_WITHHELD).toEqual({
         all: "The material for this stage is included with full access.",
         some: "Some material in this stage is included with full access.",
      });
      expect(ROLE_LABEL).toEqual({ expectations: "Expectations by seniority", rubric: "Rubric", alternatives: "Alternatives", mistakes: "Common mistakes" });
   });

   it("carries Frame's coach line and the parts' canonical order and clarification eyebrows (S-CLR-2, §7.3, S-CLR-3)", () => {
      expect(YOURS_FIRST).toBe("Before reading on, list the questions you would ask the interviewer and the assumptions you would state.");
      // §7.3 in table order: a clarification's parts, then the rubric dimension's; `bar` serves both tables.
      expect(PART_ORDER).toEqual(["answer", "why_it_matters", "if_different", "evaluates", "strong_evidence", "weak_evidence", "bar"]);
      expect(PART_EYEBROW).toEqual({ answer: "Interviewer's answer", why_it_matters: "Why it matters", if_different: "If the answer were different" });
      expect(SENIORITY_ORDER).toEqual(["mid", "senior", "staff", "principal"]); // S-SEN-1
      expect(Object.keys(PART_EYEBROW).every((name) => PART_ORDER.includes(name))).toBe(true);
   });

   it("labels the nine shared dimensions of spec §8.1 in their order, and the branches of an open follow-up (S-FUP-5)", () => {
      expect([...DIMENSION_LABEL]).toEqual([
         ["problem_framing", "Problem framing"],
         ["estimation_and_scale", "Estimation and scale"],
         ["architecture", "Architecture"],
         ["data_and_storage", "Data and storage"],
         ["ml_formulation", "ML formulation"],
         ["evaluation_and_metrics", "Evaluation and metrics"],
         ["reliability_and_operations", "Reliability and operations"],
         ["trade_off_reasoning", "Trade-off reasoning"],
         ["communication_and_structure", "Communication and structure"],
      ]);
      expect(BRANCHES_LABEL).toBe("Then, depending on the answer");
   });

   it("labels every control with the §9.3 wording, and never with a count (S-RVL-3)", () => {
      expect(CONTROL_LABEL.stageReference("Design")).toBe("Show reference for Design");
      const fixed = Object.values(CONTROL_LABEL).filter((label) => typeof label === "string") as string[];
      expect(fixed).toEqual(
         expect.arrayContaining([
            "Show a hint",
            "Compare with a strong candidate's questions",
            "Compare with the reference's assumptions",
            "Compare with the topics the reference goes deep on",
            "Show the follow-up questions",
            "Show how the reference frames the problem",
            "Show the reference solution",
            "Show the alternatives",
            "Open self-review",
            "Show common mistakes",
            "Show the interviewer's answer",
         ])
      );
      for (const label of fixed) expect(label).not.toMatch(/\d|\(/);
   });
});
