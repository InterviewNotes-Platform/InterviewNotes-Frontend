import { plainHeading } from "@/lib/catalog/lesson";
import { levelLabel } from "@/lib/prep/levels";
import type { QuestionRef } from "@/lib/prep/links";
import type { CatalogQuestion } from "@/lib/prep/questions";
import type { TargetLevel } from "@/lib/prep/types";

export type PickerQuestion = CatalogQuestion<TargetLevel | null>;

/** One principle or theme of a company collection: its title, its explanation as paragraphs, and its questions in source order. */
export type Section = { key: string; title: string; paragraphs: string[]; questions: PickerQuestion[] };

export const keyOf = (ref: QuestionRef) => JSON.stringify([ref.content_id, ref.question_id]);

/**
 * The questions in source order, collected under the group they came with (company collections only). A question with no
 * group is not listed; the page already treats that as a malformed collection and shows none.
 */
export function sectionsOf(questions: readonly PickerQuestion[]): Section[] {
   const sections: Section[] = [];
   for (const question of questions) {
      if (!question.group) continue;
      const last = sections.at(-1);
      if (last && last.title === question.group.title) last.questions.push(question);
      else
         sections.push({
            key: `group-${sections.length}`,
            title: question.group.title,
            paragraphs: question.group.explanation.split(/\n{2,}/).map(plainHeading).filter(Boolean),
            questions: [question],
         });
   }
   return sections;
}

/**
 * The general collection listed level by level: each run of questions of one level becomes a section titled with the level.
 * They have no guidance of their own. Only used while every level is listed; a chosen level is one plain list.
 */
export function levelSectionsOf(questions: readonly PickerQuestion[]): Section[] {
   const sections: (Section & { level: string })[] = [];
   for (const question of questions) {
      if (!question.level) continue;
      const last = sections.at(-1);
      if (last && last.level === question.level) last.questions.push(question);
      else sections.push({ key: `level-${question.level}`, level: question.level, title: levelLabel(question.level), paragraphs: [], questions: [question] });
   }
   return sections;
}

/** "principle" becomes "Principle". */
export const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
