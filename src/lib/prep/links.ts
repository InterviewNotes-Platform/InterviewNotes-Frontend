import { PREPARE_ANSWERS_HREF, PREPARE_NEW_HREF } from "@/lib/primary-navigation";

/** The pair that identifies a catalog question (contract §4.3). Neither part is a heading, a slug or a position. */
export type QuestionRef = { content_id: string; question_id: string };

/** The longest values the contract allows; a longer one cannot name a question. */
const MAX_CONTENT_ID = 80;
const MAX_QUESTION_ID = 48;

const QUESTION_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONTENT_ID = /^[a-z0-9]+\.[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * `/prepare/new`, naming the question and, when starting from a story, the story's id. All are identifiers; nothing the reader
 * wrote is in the URL, and a story id selects nothing until the signed-in reader's own API call finds it.
 */
export function newAnswerHref(ref?: QuestionRef | null, storyId?: string | null): string {
   const params = new URLSearchParams();
   if (ref) {
      params.set("content", ref.content_id);
      params.set("question", ref.question_id);
   }
   if (storyId) params.set("story", storyId);
   return params.size > 0 ? `${PREPARE_NEW_HREF}?${params}` : PREPARE_NEW_HREF;
}

/** An answer's id is a server-generated UUID (contract §2.2); anything else cannot name an answer. */
export const ANSWER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `/prepare/answers/<id>`, the editor for one answer. The id is opaque and carries nothing about the reader's text. */
export const answerHref = (id: string) => `${PREPARE_ANSWERS_HREF}/${id}`;

function single(value: string | string[] | undefined): string | null {
   return typeof value === "string" ? value : null;
}

/**
 * The question a link names, or null. This only checks the shape: the picker offers it only when the same pair is in the
 * catalog it loaded, so a crafted link can select nothing and carries no authority.
 */
export function questionRefFromParams(params: Record<string, string | string[] | undefined>): QuestionRef | null {
   const content = single(params.content);
   const question = single(params.question);
   if (!content || !question) return null;
   if (content.length > MAX_CONTENT_ID || question.length > MAX_QUESTION_ID) return null;
   return CONTENT_ID.test(content) && QUESTION_ID.test(question) ? { content_id: content, question_id: question } : null;
}

export const sameQuestion = (a: QuestionRef, b: QuestionRef) => a.content_id === b.content_id && a.question_id === b.question_id;
