export interface PositionCopy {
   label: string;
   /** An interview stage's intent line, or a review surface's framing line: written once per position, never per Problem. */
   intent: string;
}

/**
 * Presentation copy keyed by spine position id (spec §9.3, §9.7). A position without an entry here is unknown to the
 * frontend. The keys are bound to the contract's position ids by a parity test; this module holds no order and no logic.
 */
export const POSITION_COPY: ReadonlyMap<string, PositionCopy> = new Map([
   [
      "frame",
      {
         label: "Frame",
         intent: "Understand the situation before you solve it: clarify what is asked, find out what you need to know, state what you assume.",
      },
   ],
   ["requirements", { label: "Requirements", intent: "Say what the system must do and how well, and name the constraints that will shape the design." }],
   ["design", { label: "Design", intent: "Sketch the core: the entities, the interfaces and a high-level design that meets the requirements." }],
   [
      "ml_reasoning",
      { label: "ML Reasoning", intent: "Frame the learning problem: objective, data and labels, features, model, and how it trains and serves." },
   ],
   [
      "evaluate_and_scale",
      { label: "Evaluate & Scale", intent: "Show how you would know it works and how it grows: evaluation, integration and production scale." },
   ],
   [
      "depth_and_trade_offs",
      {
         label: "Depth & Trade-offs",
         intent: "Go deep where it matters and defend your choices: what each buys, what it costs, when you would choose differently.",
      },
   ],
   [
      "follow_ups",
      { label: "Follow-ups", intent: "Expect to be pushed on your decisions, your blind spots and the depth of your understanding." },
   ],
   [
      "reference_solution",
      {
         label: "Reference Solution",
         intent: "One strong approach, consolidated. Other designs can be just as strong; the self-review judges reasoning, not this architecture.",
      },
   ],
   ["self_review", { label: "Self-review", intent: "Compare your reasoning with what interviewers look for, at the bar you are preparing for." }],
]);

export const GROUP_LABEL = { interview: "Interview", review: "Review" } as const;

export const REVIEW_INTRODUCTION = "After the interview: study one strong approach, then review your reasoning.";

/** The closed region after the review surfaces for material with no usable position (S-SPN-13). */
export const NEUTRAL_REGION_LABEL = "More material";

/** The heading of an untitled section of an unknown type inside a known position (S-SPN-13). */
export const ADDITIONAL_MATERIAL_LABEL = "Additional material";
