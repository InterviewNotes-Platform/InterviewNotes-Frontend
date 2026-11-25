import type { SaveState } from "@/components/ui/save-status";
import type { AutosaveSnapshot, Phase } from "@/lib/practice-workspace/autosave";
import { STAGE_COPY } from "@/lib/practice-workspace/stages";
import type { Position } from "@/lib/practice-workspace/types";

export interface SaveSummary {
   state: SaveState;
   message?: string;
   /** Stages whose text is not on the server and cannot be saved without the learner (a conflict, a refusal, an ended attempt, offline). */
   troubled: Position[];
}

const TROUBLE: ReadonlySet<Phase> = new Set(["offline", "conflict", "terminal", "signin", "gone", "invalid"]);

/** Short wording for the one status line; the stage's own panel carries the long text. Offline is its own word, not a generic failure. */
const SHORT: Partial<Record<Phase, string>> = {
   offline: "You appear to be offline. Your text is kept here and we will try again.",
   conflict: "This stage was changed somewhere else. Choose which version to keep.",
   terminal: "This attempt has ended, so changes can no longer be saved.",
   signin: "Your session has ended.",
   gone: "This attempt no longer exists.",
   invalid: "Some of this text was not accepted.",
};

/** The diagram's own words where the stage wording would be wrong. */
const DIAGRAM_SHORT: Partial<Record<Phase, string>> = {
   conflict: "Your diagram was changed somewhere else. Choose which version to keep.",
   invalid: "Something in the diagram cannot be saved yet.",
};

/**
 * One status for the whole attempt, from every stage's engine. "Saved" appears only when no stage has unsaved text, no write is in
 * the air and at least one write was acknowledged; "Saving" and "Unsaved" never claim a save the server has not made.
 */
export function summarizeSaves(snapshots: ReadonlyMap<Position, AutosaveSnapshot<unknown, unknown>>, diagram?: AutosaveSnapshot<unknown, unknown> | null): SaveSummary {
   const troubled: Position[] = [];
   let worst: { label: string; phase: Phase } | null = null;
   let saving = false;
   let dirty = false;
   let saved = false;
   let savedNote: string | undefined;
   // The diagram is one resource for the whole attempt (T14), counted with the stages but not marked on any one stage.
   const entries: [Position | null, AutosaveSnapshot<unknown, unknown>][] = [...snapshots, ...(diagram ? [[null, diagram] as [null, AutosaveSnapshot<unknown, unknown>]] : [])];
   for (const [position, snap] of entries) {
      if (TROUBLE.has(snap.phase) && (snap.dirty || snap.phase === "conflict")) {
         if (position) troubled.push(position);
         worst ??= { label: position ? STAGE_COPY[position].label : "Diagram", phase: snap.phase };
      } else if (snap.phase === "saving") saving = true;
      else if (snap.dirty) dirty = true;
      else if (snap.phase === "saved") {
         saved = true;
         savedNote ??= snap.note;
      }
   }
   if (worst) {
      const words = (worst.label === "Diagram" ? DIAGRAM_SHORT[worst.phase] : undefined) ?? SHORT[worst.phase];
      return { state: "error", message: `Not saved (${worst.label}). ${words}`, troubled };
   }
   if (saving) return { state: "saving", troubled };
   if (dirty) return { state: "unsaved", troubled };
   return { state: saved ? "saved" : "idle", message: saved ? savedNote : undefined, troubled };
}
