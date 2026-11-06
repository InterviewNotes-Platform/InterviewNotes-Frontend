import { STAR_KEYS, hasStarText, starText, type AnswerDraft, type StarKey } from "@/lib/prep/answerDraft";
import type { FrameworkInput, PrepFields } from "@/lib/prep/types";
import type { DraftRequest, DraftResult, ReviewRequest } from "./aiClient";

/** The two formats the AI contract accepts; any later additive framework gets no AI action. */
function frameworkOf(draft: AnswerDraft): FrameworkInput | null {
   return draft.framework === "star" || draft.framework === "free_form" ? draft.framework : null;
}

const filled = (fields: Record<StarKey, string>): PrepFields => Object.fromEntries(STAR_KEYS.filter((key) => fields[key] !== "").map((key) => [key, fields[key]]));

/** What is on screen is what is sent: the reader's notes are the text typed so far, saved or not. Null when there is nothing to send. */
export function draftRequest(draft: AnswerDraft): DraftRequest | null {
   const framework = frameworkOf(draft);
   const notes = [starText(draft.fields), draft.body].filter((part) => part !== "").join("\n\n");
   if (!framework || notes === "" || draft.question_snapshot.trim() === "") return null;
   return { question: draft.question_snapshot, guidance: null, framework, notes, stories: [] };
}

export function reviewRequest(draft: AnswerDraft): ReviewRequest | null {
   const framework = frameworkOf(draft);
   if (!framework || (!hasStarText(draft.fields) && draft.body === "") || draft.question_snapshot.trim() === "") return null;
   return {
      question: draft.question_snapshot,
      guidance: null,
      framework,
      answer: { body: draft.body === "" ? null : draft.body, fields: filled(draft.fields) },
      stories: [],
   };
}

/** The text a draft supplies: the STAR fields it filled, or the body of a free-form draft. */
export function generatedText(result: DraftResult): Partial<Pick<AnswerDraft, "fields" | "body">> & { empty: boolean } {
   if (result.framework === "star") {
      const fields = Object.fromEntries(STAR_KEYS.map((key) => [key, result.fields[key] ?? ""])) as Record<StarKey, string>;
      return { fields, empty: !hasStarText(fields) };
   }
   const body = result.body ?? "";
   return { body, empty: body === "" };
}

/** Apply: the generated text replaces the text in the fields it supplies. A field the draft left empty keeps the reader's text. */
export function applyDraft(result: DraftResult, current: AnswerDraft): Partial<AnswerDraft> {
   const { fields, body } = generatedText(result);
   if (fields) return { fields: Object.fromEntries(STAR_KEYS.map((key) => [key, fields[key] || current.fields[key]])) as Record<StarKey, string> };
   return body ? { body } : {};
}

/** Insert: the generated text goes after the reader's text, so nothing they wrote is removed. */
export function insertDraft(result: DraftResult, current: AnswerDraft): Partial<AnswerDraft> {
   const after = (existing: string, added: string) => (added === "" ? existing : existing === "" ? added : `${existing}\n\n${added}`);
   const { fields, body } = generatedText(result);
   if (fields) return { fields: Object.fromEntries(STAR_KEYS.map((key) => [key, after(current.fields[key], fields[key])])) as Record<StarKey, string> };
   return body ? { body: after(current.body, body) } : {};
}
