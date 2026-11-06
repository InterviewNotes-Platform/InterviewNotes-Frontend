import type { Answer, AnswerUpdate, FrameworkInput, PrepFields } from "./types";

/** The STAR keys, in the order they are written. `fields` accepts these under any framework (contract §4.2). */
export const STAR_KEYS = ["situation", "task", "action", "result"] as const;
export type StarKey = (typeof STAR_KEYS)[number];

/**
 * What the editor holds while the reader types. STAR and free-form are two views of one answer: the framework only
 * chooses which is editable, and both `fields` and `body` are always kept and always saved (contract §4.2, spec §2.6).
 * `framework` is the stored value as read, so a later additive framework is not rewritten unless the reader switches.
 */
export type AnswerDraft = {
   question_snapshot: string;
   framework: string;
   fields: Record<StarKey, string>;
   body: string;
   status: Answer["status"];
   tags: string[];
};

export function draftOf(answer: Answer): AnswerDraft {
   return {
      question_snapshot: answer.question_snapshot,
      framework: answer.framework,
      fields: Object.fromEntries(STAR_KEYS.map((key) => [key, answer.fields[key] ?? ""])) as Record<StarKey, string>,
      body: answer.body ?? "",
      status: answer.status,
      tags: answer.tags,
   };
}

/** `fields` is replaced as a whole, so only the non-empty keys are sent; clearing a field removes it. */
const fieldsOf = (fields: Record<StarKey, string>): PrepFields =>
   Object.fromEntries(STAR_KEYS.filter((key) => fields[key] !== "").map((key) => [key, fields[key]]));

/**
 * What differs between the draft and the saved answer, as a PATCH body without `version`; null when nothing differs.
 * A custom answer's question is the only identity-side text that may change, a catalog answer's never does (contract §4.3).
 */
export function changesOf(draft: AnswerDraft, saved: Answer): Omit<AnswerUpdate, "version"> | null {
   const was = draftOf(saved);
   const changes: Omit<AnswerUpdate, "version"> = {};
   if (saved.source === "custom" && draft.question_snapshot !== was.question_snapshot) changes.question_snapshot = draft.question_snapshot;
   if (draft.framework !== was.framework) changes.framework = draft.framework as FrameworkInput;
   if (STAR_KEYS.some((key) => draft.fields[key] !== was.fields[key])) changes.fields = fieldsOf(draft.fields);
   if (draft.body !== was.body) changes.body = draft.body === "" ? null : draft.body;
   if (draft.status !== was.status) changes.status = draft.status;
   if (draft.tags.join("\n") !== was.tags.join("\n")) changes.tags = draft.tags;
   return Object.keys(changes).length > 0 ? changes : null;
}

/** The STAR text as one block for the free-form view's read-only copy; empty fields are left out. */
export function starText(fields: Record<StarKey, string>): string {
   return STAR_KEYS.filter((key) => fields[key] !== "")
      .map((key) => `${key[0].toUpperCase()}${key.slice(1)}\n${fields[key]}`)
      .join("\n\n");
}

export const hasStarText = (fields: Record<StarKey, string>) => STAR_KEYS.some((key) => fields[key] !== "");
