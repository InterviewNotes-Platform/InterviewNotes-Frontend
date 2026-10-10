import type { ProblemRole } from "./problemSpine";

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

/** The outline's name, and its Show / Hide everything control with the one polite message each press announces (S-RVL-6, S-AX-5). */
export const OUTLINE_LABEL = "Outline";
export const EVERYTHING = {
   show: "Show everything",
   hide: "Hide everything",
   shown: "Everything is shown.",
   hidden: "Everything is hidden.",
} as const;

export const REVIEW_INTRODUCTION = "After the interview: study one strong approach, then review your reasoning.";

/** The closed region after the review surfaces for material with no usable position (S-SPN-13). */
export const NEUTRAL_REGION_LABEL = "More material";

/** The heading of an untitled section of an unknown type inside a known position (S-SPN-13). */
export const ADDITIONAL_MATERIAL_LABEL = "Additional material";

/** The challenge's label (§9.7, S-CHL-3): the one authored content open before any action. */
export const CHALLENGE_LABEL = "The challenge";

/** The one item-level access note, before the Interview group (S-ENT-1). */
export const WITHHELD_NOTE = "Some material for this Problem is included with full access.";

/** An interview stage's access indication (S-ENT-1a): none of its reference released, or only some of it. */
export const STAGE_WITHHELD = {
   all: "The material for this stage is included with full access.",
   some: "Some material in this stage is included with full access.",
} as const;

/** Frame's one line in the coach's voice, shown before its controls: a pause, not a form (S-CLR-2). */
export const YOURS_FIRST = "Before reading on, list the questions you would ask the interviewer and the assumptions you would state.";

/** Part names in their canonical presentation order (§7.3, S-PRT-6): the authored order is not validated. */
export const PART_ORDER: readonly string[] = ["answer", "why_it_matters", "if_different", "evaluates", "strong_evidence", "weak_evidence", "bar"];

/** The closed seniority vocabulary in its presentation order (S-SEN-1): bars are presented in it, whatever their authored order (S-PRT-6). */
export const SENIORITY_ORDER: readonly string[] = ["mid", "senior", "staff", "principal"];

/** The eyebrow of a clarification's parts (§7.3, S-CLR-3, S-AX-8): text, read in order. The other parts' labels are the self-review's. */
export const PART_EYEBROW: Readonly<Record<string, string>> = {
   answer: "Interviewer's answer",
   why_it_matters: "Why it matters",
   if_different: "If the answer were different",
};

/** Visible labels of the role groups that carry one (§9.7). */
export const ROLE_LABEL: Readonly<Partial<Record<ProblemRole, string>>> = {
   expectations: "Expectations by seniority",
   rubric: "Rubric",
   alternatives: "Alternatives",
   mistakes: "Common mistakes",
};

/** Hint sequences (S-HNT-6, S-HNT-8, §9.7): one hint at a time, the next offered inside the previous one. */
export const HINT = {
   explanation: "Hints nudge your thinking without giving the answer. Use as few as you need.",
   next: "Show the next hint",
   cue: (position: number, total: number) => `Hint ${position} of ${total}`,
   /** Read after a hint control's label, so its name says which hint and where (S-RVL-4). */
   context: (position: number, where: string) => `, hint ${position} for ${where}`,
   closing: (where: string, reference: boolean) => `No more hints for ${where}.${reference ? " Open the reference when you're ready." : ""}`,
} as const;

/** Closed controls, each saying what it shows (§9.3, S-RVL-3, S-RVL-4). Never a count. */
export const CONTROL_LABEL = {
   hints: "Show a hint",
   clarifications: "Compare with a strong candidate's questions",
   assumptions: "Compare with the reference's assumptions",
   units: "Compare with the topics the reference goes deep on",
   followUps: "Show the follow-up questions",
   frameReference: "Show how the reference frames the problem",
   stageReference: (stage: string) => `Show reference for ${stage}`,
   referenceSolution: "Show the reference solution",
   alternatives: "Show the alternatives",
   selfReview: "Open self-review",
   mistakes: "Show common mistakes",
   neutral: "Show more material",
   /** A unit's body, after its heading; a clarification's body is the interviewer's answer (S-RVL-4). */
   unit: "Show reference",
   clarification: "Show the interviewer's answer",
} as const;
