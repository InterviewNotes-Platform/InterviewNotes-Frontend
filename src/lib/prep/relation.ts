import type { CatalogQuestion } from "./questions";

/** What a saved catalog answer carries of its question (contract §2.1, "The snapshot"). */
export type SavedQuestion = {
   content_id: string;
   question_id: string;
   question_snapshot: string;
   snapshot_fallback: boolean;
};

export type QuestionRelation =
   | { state: "current"; snapshot: string; snapshot_fallback: boolean; question: CatalogQuestion }
   | { state: "changed"; snapshot: string; snapshot_fallback: boolean; question: CatalogQuestion }
   | { state: "removed"; snapshot: string; snapshot_fallback: boolean; question: null };

/** Computed on read; the saved snapshot is returned untouched in every state, and nothing here writes it. */
export function relateToCatalog(saved: SavedQuestion, catalog: readonly CatalogQuestion[]): QuestionRelation {
   const { question_snapshot: snapshot, snapshot_fallback } = saved;
   const question = catalog.find((q) => q.content_id === saved.content_id && q.question_id === saved.question_id);
   if (!question) return { state: "removed", snapshot, snapshot_fallback, question: null };
   return { state: question.text === snapshot ? "current" : "changed", snapshot, snapshot_fallback, question };
}
