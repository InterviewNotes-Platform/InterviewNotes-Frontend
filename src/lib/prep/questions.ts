import "server-only";

import { getCatalogItem } from "@/lib/catalog/client";
import { plainHeading } from "@/lib/catalog/lesson";
import type { CatalogItem, CatalogResult } from "@/lib/catalog/types";
import type { TargetLevel } from "./types";

/**
 * The catalog questions of the preparation collections (P7-T17, generalised by P7-T58; contract `learning-progress/spec.md`
 * §2.1, §2.1.1, §2.11). A question is identified by `(content_id, question_id)`; `question_id` is an authored heading
 * identifier, never a slug.
 */

/** A Lesson of a collection; `level` is null for a company Lesson, which has no seniority level. */
export type CollectionLesson<L extends TargetLevel | null = TargetLevel | null> = { content_id: string; slug: string; level: L };
export type BehavioralLesson = CollectionLesson<TargetLevel>;

/** The immutable Lesson IDs, in the order the picker lists the levels. */
export const BEHAVIORAL_LESSONS: readonly BehavioralLesson[] = [
   { content_id: "lesson.behavioral-prep-sde-1", slug: "behavioral-prep-sde-1", level: "sde-1" },
   { content_id: "lesson.behavioral-prep-sde-2", slug: "behavioral-prep-sde-2", level: "sde-2" },
   { content_id: "lesson.behavioral-prep-sde-3", slug: "behavioral-prep-sde-3", level: "sde-3" },
   { content_id: "lesson.behavioral-prep-engineering-manager", slug: "behavioral-prep-engineering-manager", level: "engineering-manager" },
];

/** A principle or theme: its nearest preceding `##` heading and the prose under it, before the first question. */
export type QuestionGroup = { title: string; explanation: string };

export type CatalogQuestion<L extends TargetLevel | null = TargetLevel> = {
   content_id: string;
   question_id: string;
   level: L;
   /** The `The question:` line without its quotation marks, or the heading text when `snapshot_fallback`. */
   text: string;
   snapshot_fallback: boolean;
   /** Present only for a grouped (company) collection; null when no `##` heading precedes the question. */
   group?: QuestionGroup | null;
};

const EXCLUDED_TITLE = "What fits at this level";
const EXCLUDED_PREFIX = "Worked example:";

const QUESTION_LINE = /^The question:\s*(.*?)\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_LINE = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*$/;
const TRAILING_ID = /\s+\{#([^{}]*)\}\s*(?:#+\s*)?$/;
const QUOTE_PAIRS: Record<string, string> = { '"': '"', "“": "”" };

function unquote(value: string): string {
   const close = QUOTE_PAIRS[value[0]];
   return close && value.length >= 2 && value.endsWith(close) ? value.slice(1, -1).trim() : value;
}

type Section = { line: string | null; group: number | null };

/**
 * The `The question:` line of each section whose heading (`##`, or `###` when grouped) ends in `{#id}`, keyed by that
 * identifier, with the index of its nearest preceding `##` group when grouped; fences are skipped.
 */
function scanSections(body: string, grouped: boolean) {
   const questionDepth = grouped ? 3 : 2;
   const sections = new Map<string, Section>();
   const groups: { title: string; intro: string[] }[] = [];
   let current: string | null = null;
   let group: number | null = null;
   let intro = false;
   let fence: string | null = null;
   for (const line of body.split(/\r?\n/)) {
      const marker = FENCE.exec(line)?.[1];
      const fenced = fence !== null;
      if (fence) {
         if (marker?.[0] === fence[0] && marker.length >= fence.length) fence = null;
      } else if (marker) {
         fence = marker;
      }
      const code = fenced || marker !== undefined;
      const heading = code ? null : HEADING_LINE.exec(line);
      const depth = heading?.[1].length ?? 0;
      if (heading && depth <= questionDepth) {
         const text = heading[2] ?? "";
         current = null;
         intro = grouped && depth === 2;
         if (intro) group = groups.push({ title: plainHeading(text.replace(TRAILING_ID, "")), intro: [] }) - 1;
         else if (grouped && depth === 1) group = null;
         const id = depth === questionDepth ? TRAILING_ID.exec(text)?.[1] : undefined;
         if (id !== undefined && !sections.has(id)) {
            current = id;
            sections.set(id, { line: null, group });
         }
         continue;
      }
      if (!code && current !== null && sections.get(current)?.line === null) {
         const question = QUESTION_LINE.exec(line)?.[1];
         if (question !== undefined) sections.set(current, { line: unquote(question) || null, group });
      } else if (intro && group !== null) {
         groups[group].intro.push(line);
      }
   }
   return { sections, groups: groups.map(({ title, intro: lines }): QuestionGroup => ({ title, explanation: lines.join("\n").trim() })) };
}

const isExcluded = (title: string) => title === EXCLUDED_TITLE || title.startsWith(EXCLUDED_PREFIX);

/**
 * The questions of one Lesson, in source order. Only a heading at the question depth (`##`; `###` when grouped) that the
 * API marks `authored` is a question, so a slug or a group heading can never stand in for an identity, and the two
 * excluded section kinds are dropped by title.
 */
export function questionsOf<L extends TargetLevel | null>(
   lesson: CollectionLesson<L>,
   item: Pick<CatalogItem, "body" | "headings">,
   grouped = false,
): CatalogQuestion<L>[] {
   const { sections, groups } = scanSections(item.body?.text ?? "", grouped);
   const seen = new Set<string>();
   return item.headings.flatMap(({ id, level, text, authored }) => {
      if (level !== (grouped ? 3 : 2) || authored !== true || isExcluded(text) || seen.has(id)) return [];
      seen.add(id);
      const section = sections.get(id);
      const line = section?.line ?? null;
      return [
         {
            content_id: lesson.content_id,
            question_id: id,
            level: lesson.level,
            text: line ?? plainHeading(text),
            snapshot_fallback: line === null,
            ...(grouped && { group: section?.group == null ? null : groups[section.group] }),
         },
      ];
   });
}

/**
 * The questions of the given Lessons, from one Lesson read each: never one read per question and no Track read. Partial
 * data would mark the missing Lessons' answers `removed`, so any failed read is returned as the result. A Lesson that reads
 * fine but has no authored question, or a grouped question outside any `##` group, is `malformed`, never an empty source.
 */
export async function loadLessonQuestions<L extends TargetLevel | null>(
   lessons: readonly CollectionLesson<L>[],
   grouped = false,
): Promise<CatalogResult<CatalogQuestion<L>[]>> {
   const results = await Promise.all(lessons.map(({ slug }) => getCatalogItem("lesson", slug)));
   const questions: CatalogQuestion<L>[] = [];
   for (const [index, result] of results.entries()) {
      if (result.status !== "ok") return result;
      const lesson = lessons[index];
      if (result.data.id !== lesson.content_id) return { status: "unavailable", cause: "malformed" };
      const found = questionsOf(lesson, result.data, grouped);
      if (found.length === 0 || found.some(({ group }) => group === null)) return { status: "unavailable", cause: "malformed" };
      questions.push(...found);
   }
   return { status: "ok", data: questions };
}

/** The 40 questions of the four Behavioral Lessons: four catalog reads per load. */
export const loadBehavioralQuestions = () => loadLessonQuestions(BEHAVIORAL_LESSONS);

export { relateToCatalog } from "./relation";
export type { QuestionRelation, SavedQuestion } from "./relation";
