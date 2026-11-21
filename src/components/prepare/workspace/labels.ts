import type { Answer } from "@/lib/prep/types";

/** A company Lesson's collection title and the group of each of its questions, from the registry (P7-T58, P7-T59). */
export type CollectionLabels = Readonly<Record<string, { collection: string; groups: Readonly<Record<string, string>> }>>;

/** "Amazon Leadership Principles · Ownership" for a company answer; null for any other answer or one the registry no longer lists. */
export function whereOf({ content_id, question_id }: Pick<Answer, "content_id" | "question_id">, labels: CollectionLabels): string | null {
    if (!content_id || !labels[content_id]) return null;
    return [labels[content_id].collection, question_id && labels[content_id].groups[question_id]].filter(Boolean).join(" · ");
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const WITH_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "Nov 19", or "Nov 19, 2025" when it is not this year; null when the timestamp cannot be read. */
export function updatedOn(iso: string, now: Date = new Date()): string | null {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return (date.getFullYear() === now.getFullYear() ? SHORT : WITH_YEAR).format(date);
}

/** What the status of an answer is called. A draft has not been written in yet; in progress has; ready was marked so by the reader. */
export function statusLabel(status: Answer["status"]): string {
    return status === "draft" ? "Draft" : status === "in_progress" ? "In progress" : "Ready";
}

export const CUSTOM_SHELF = "Your own questions";

/**
 * The shelf an answer sits on in the answers list: the title of its company collection, else the General Behavioral
 * collection for any other Lesson question, else the reader's own questions. The company titles come from the registry labels;
 * a question that has a content id but no label can only come from the one collection that has no groups.
 */
export function shelfOf({ content_id }: Pick<Answer, "content_id">, labels: CollectionLabels, general: string): string {
    if (!content_id) return CUSTOM_SHELF;
    return labels[content_id]?.collection ?? general;
}

/** Only the group of a company answer ("Ownership"), for a row that already sits under its collection's heading. */
export function groupOf({ content_id, question_id }: Pick<Answer, "content_id" | "question_id">, labels: CollectionLabels): string | null {
    if (!content_id || !question_id) return null;
    return labels[content_id]?.groups[question_id] ?? null;
}
