import { describe, expect, it } from "vitest";
import { GROUP_LABEL, NEUTRAL_REGION_LABEL, POSITION_COPY, REVIEW_INTRODUCTION } from "./positionCopy";

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
});
