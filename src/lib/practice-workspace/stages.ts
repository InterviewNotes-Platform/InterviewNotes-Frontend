/**
 * The stage vocabulary of the self-guided workspace (P9-T13; spec §3, `P9-R-PRC-02`): the P4 labels and one intent line per
 * position, and the written fields a position asks for. Nothing here adds, renames or reorders a position: the order is
 * `AttemptOut.spine`, as the backend derived it for this Problem's category, and a position this table does not know is
 * dropped from navigation rather than guessed at. The field keys are the stage-work keys of the frozen contract
 * (`^[a-z][a-z_]{0,31}$`, at most 12 per stage, 6,000 characters each); the labels and prompts hold for any Problem.
 */

import type { Position, StageStatus } from "./types";

export const MAX_FIELD_CHARS = 6000;
export const MAX_FIELDS_PER_STAGE = 12;
export const FIELD_KEY_PATTERN = /^[a-z][a-z_]{0,31}$/;

export interface StageCopy {
   /** The P4 working label; `src/lib/catalog/positionCopy.ts` holds the same words (a test keeps them equal). */
   label: string;
   intent: string;
}

export const STAGE_COPY: Readonly<Record<Position, StageCopy>> = {
   frame: { label: "Frame", intent: "Restate the task, record the questions you would ask and state your assumptions." },
   requirements: { label: "Requirements", intent: "Functional and non-functional requirements, constraints and estimates." },
   design: { label: "Design", intent: "Core entities, interfaces and the high-level design." },
   ml_reasoning: { label: "ML Reasoning", intent: "Frame the learning problem: objective, data, labels, model, training and inference." },
   evaluate_and_scale: { label: "Evaluate & Scale", intent: "Evaluation, integration and scaling." },
   depth_and_trade_offs: { label: "Depth & Trade-offs", intent: "Deep dives, and the decisions you made with their costs." },
   follow_ups: { label: "Follow-ups", intent: "Answer the probes you expect, and revise earlier stages." },
};

export const isKnownPosition = (value: string): value is Position => Object.hasOwn(STAGE_COPY, value);

export interface StageField {
   key: string;
   label: string;
   hint?: string;
}

/**
 * What each position asks the learner to write. Position-generic by design: nothing is specific to one Problem.
 * `ml_reasoning` has no fixed list: its sub-prompts are the Problem's authored ML sub-sections (spec §3 note 6), which the
 * frozen attempt detail does not name, so without them it is the one generic field (see `stageFields`).
 */
const FIELDS: Readonly<Record<Exclude<Position, "ml_reasoning">, readonly StageField[]>> = {
   frame: [
      { key: "restate_task", label: "Restate the task" },
      { key: "clarifying_questions", label: "Clarifying questions", hint: "What would you ask the interviewer? One per line works well." },
      { key: "assumptions", label: "Assumptions", hint: "What do you take as given where the prompt is silent?" },
   ],
   requirements: [
      { key: "functional", label: "Functional" },
      { key: "non_functional", label: "Non-functional" },
      { key: "constraints", label: "Constraints" },
      { key: "estimates", label: "Estimates" },
   ],
   design: [
      { key: "core_entities", label: "Core entities" },
      { key: "interfaces", label: "Interfaces" },
   ],
   evaluate_and_scale: [
      { key: "evaluation", label: "Evaluation" },
      { key: "integration", label: "Integration" },
      { key: "scaling", label: "Scaling" },
   ],
   depth_and_trade_offs: [
      { key: "deep_dives", label: "Deep dives" },
      { key: "decisions_and_costs", label: "Decisions and their costs" },
   ],
   follow_ups: [{ key: "follow_up_answers", label: "Your answers to the follow-ups", hint: "For each probe you expect: the question, your answer, and what it changes in your design or assumptions." }],
};

/** One authored ML sub-section the workspace may be told about: `key` is the stage-work key, `title` the learner's label. */
export interface MlSubsection {
   key: string;
   title: string;
}

const ML_GENERIC: readonly StageField[] = [{ key: "ml_reasoning", label: "Your ML reasoning" }];

/** The fields of a position. For `ml_reasoning`, one sub-prompt per authored sub-section when the Problem's are known, else one generic field. */
export function stageFields(position: Position, mlSubsections: readonly MlSubsection[] = []): readonly StageField[] {
   if (position !== "ml_reasoning") return FIELDS[position];
   const usable = mlSubsections.filter(({ key, title }) => FIELD_KEY_PATTERN.test(key) && title.trim() !== "");
   return usable.length > 0 ? usable.slice(0, MAX_FIELDS_PER_STAGE).map(({ key, title }) => ({ key, label: title })) : ML_GENERIC;
}

/** The neutral label for saved text whose sub-prompt is no longer shown (it may be withheld now): the learner's work stays visible, the section is not named. */
export const OTHER_NOTES_LABEL = "Other saved notes";

/** `fields`, plus one field for each saved key with text that `fields` does not present, under the neutral label (no sub-prompt is named). */
export function withSavedFields(fields: readonly StageField[], saved: Readonly<Record<string, string>>): readonly StageField[] {
   const shown = new Set(fields.map((field) => field.key));
   const extra = Object.keys(saved)
      .filter((key) => !shown.has(key) && saved[key].trim() !== "")
      .sort()
      .map((key, index, all) => ({ key, label: all.length > 1 ? `${OTHER_NOTES_LABEL} ${index + 1}` : OTHER_NOTES_LABEL }));
   return extra.length > 0 ? [...fields, ...extra] : fields;
}

export const STATUS_LABEL: Readonly<Record<StageStatus, string>> = {
   not_started: "Not started",
   in_progress: "In progress",
   done: "Done",
   skipped: "Skipped",
};
