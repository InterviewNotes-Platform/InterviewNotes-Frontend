import "server-only";

import { getCatalogItem } from "@/lib/catalog/client";
import { plainHeading } from "@/lib/catalog/lesson";
import type { CatalogItem, CatalogResult } from "@/lib/catalog/types";
import type { TargetLevel } from "./types";

/**
 * The 40 catalog questions of the four Behavioral Lessons (P7-T17; contract `learning-progress/spec.md` §2.1, §2.1.1).
 * A question is identified by `(content_id, question_id)`; `question_id` is an authored heading identifier, never a slug.
 */

export type BehavioralLesson = { content_id: string; slug: string; level: TargetLevel };

/** The immutable Lesson IDs, in the order the picker lists the levels. */
export const BEHAVIORAL_LESSONS: readonly BehavioralLesson[] = [
   { content_id: "lesson.behavioral-prep-sde-1", slug: "behavioral-prep-sde-1", level: "sde-1" },
   { content_id: "lesson.behavioral-prep-sde-2", slug: "behavioral-prep-sde-2", level: "sde-2" },
   { content_id: "lesson.behavioral-prep-sde-3", slug: "behavioral-prep-sde-3", level: "sde-3" },
   { content_id: "lesson.behavioral-prep-engineering-manager", slug: "behavioral-prep-engineering-manager", level: "engineering-manager" },
];

export type CatalogQuestion = {
   content_id: string;
   question_id: string;
   level: TargetLevel;
   /** The `The question:` line without its quotation marks, or the heading text when `snapshot_fallback`. */
   text: string;
   snapshot_fallback: boolean;
};

const EXCLUDED_TITLE = "What fits at this level";
const EXCLUDED_PREFIX = "Worked example:";

const QUESTION_LINE = /^The question:\s*(.*?)\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_LINE = /^ {0,3}(#{1,2})(?:\s+(.*?))?\s*$/;
const TRAILING_ID = /\s+\{#([^{}]*)\}\s*(?:#+\s*)?$/;
const QUOTE_PAIRS: Record<string, string> = { '"': '"', "“": "”" };

function unquote(value: string): string {
   const close = QUOTE_PAIRS[value[0]];
   return close && value.length >= 2 && value.endsWith(close) ? value.slice(1, -1).trim() : value;
}

/** The `The question:` line of each level-2 section that ends in `{#id}`, keyed by that identifier; fences are skipped. */
function questionLines(body: string): Map<string, string | null> {
   const lines = new Map<string, string | null>();
   let current: string | null = null;
   let fence: string | null = null;
   for (const line of body.split(/\r?\n/)) {
      const opened = FENCE.exec(line)?.[1];
      if (fence) {
         if (opened?.[0] === fence[0] && opened.length >= fence.length) fence = null;
         continue;
      }
      if (opened) {
         fence = opened;
         continue;
      }
      const heading = HEADING_LINE.exec(line);
      if (heading) {
         const id = heading[1] === "##" ? TRAILING_ID.exec(heading[2] ?? "")?.[1] : undefined;
         current = id !== undefined && !lines.has(id) ? id : null;
         if (current !== null) lines.set(current, null);
         continue;
      }
      if (current !== null && lines.get(current) === null) {
         const question = QUESTION_LINE.exec(line)?.[1];
         if (question !== undefined) lines.set(current, unquote(question) || null);
      }
   }
   return lines;
}

const isExcluded = (title: string) => title === EXCLUDED_TITLE || title.startsWith(EXCLUDED_PREFIX);

/**
 * The questions of one Lesson, in source order. Only a level-2 heading the API marks `authored` is a question, so a
 * slug can never stand in for an identity, and the two excluded section kinds are dropped by title.
 */
export function questionsOf(lesson: BehavioralLesson, item: Pick<CatalogItem, "body" | "headings">): CatalogQuestion[] {
   const lines = questionLines(item.body?.text ?? "");
   const seen = new Set<string>();
   return item.headings.flatMap(({ id, level, text, authored }) => {
      if (level !== 2 || authored !== true || isExcluded(text) || seen.has(id)) return [];
      seen.add(id);
      const line = lines.get(id) ?? null;
      return [
         {
            content_id: lesson.content_id,
            question_id: id,
            level: lesson.level,
            text: line ?? plainHeading(text),
            snapshot_fallback: line === null,
         },
      ];
   });
}

/**
 * Every catalog question, from one Lesson read each: four catalog reads per load, never one per question and no Track read.
 * Partial data would mark the missing Lessons' answers `removed`, so any failed read is returned as the result. A Lesson
 * that reads fine but has no authored question (content not published yet) is `malformed`, never an empty source.
 */
export async function loadBehavioralQuestions(): Promise<CatalogResult<CatalogQuestion[]>> {
   const results = await Promise.all(BEHAVIORAL_LESSONS.map(({ slug }) => getCatalogItem("lesson", slug)));
   const questions: CatalogQuestion[] = [];
   for (const [index, result] of results.entries()) {
      if (result.status !== "ok") return result;
      const lesson = BEHAVIORAL_LESSONS[index];
      if (result.data.id !== lesson.content_id) return { status: "unavailable", cause: "malformed" };
      const found = questionsOf(lesson, result.data);
      if (found.length === 0) return { status: "unavailable", cause: "malformed" };
      questions.push(...found);
   }
   return { status: "ok", data: questions };
}

export { relateToCatalog } from "./relation";
export type { QuestionRelation, SavedQuestion } from "./relation";
