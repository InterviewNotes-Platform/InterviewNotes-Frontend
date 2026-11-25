/**
 * Undo and redo over the graph model (graph-editor-contract §8): whole drafts, never DOM or React Flow state, at most 100 steps,
 * in memory only. One learner action is one step; a run of typing in one field, or of arrow nudges of one component, is one step.
 * After an autosave, undo still just restores the earlier draft: the next save carries the tombstoned IDs back (a restoration).
 */

import type { DiagramDraft } from "./model";

export const HISTORY_LIMIT = 100;

export class GraphHistory {
   private past: DiagramDraft[] = [];
   private future: DiagramDraft[] = [];
   private lastKey = "";

   get canUndo(): boolean {
      return this.past.length > 0;
   }

   get canRedo(): boolean {
      return this.future.length > 0;
   }

   /** Records `before` as an undo step, unless `key` continues the previous step (same field, same nudge run). */
   record(before: DiagramDraft, key = ""): void {
      if (key !== "" && key === this.lastKey) return;
      this.past.push(before);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future = [];
      this.lastKey = key;
   }

   undo(current: DiagramDraft): DiagramDraft | null {
      const previous = this.past.pop();
      if (!previous) return null;
      this.future.push(current);
      this.lastKey = "";
      return previous;
   }

   redo(current: DiagramDraft): DiagramDraft | null {
      const next = this.future.pop();
      if (!next) return null;
      this.past.push(current);
      this.lastKey = "";
      return next;
   }

   /** Ends a typing or nudge run, so the next edit of the same field is its own step. */
   seal(): void {
      this.lastKey = "";
   }

   clear(): void {
      this.past = [];
      this.future = [];
      this.lastKey = "";
   }
}
