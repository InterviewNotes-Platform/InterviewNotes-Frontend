"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { SaveStatus } from "@/components/ui/save-status";
import type { Mark, ReferenceRubricOut } from "@/lib/practice-workspace/types";
import { isUnsaved, type DimensionReview, type MarkSave, type SelfReviewDraft } from "./reviewState";

export const MARK_NAME: Readonly<Record<Mark, string>> = { met: "Met", partly: "Partly", not_yet: "Not yet" };
const MARKS: readonly Mark[] = ["met", "partly", "not_yet"];

function statusOf(save: MarkSave, review: DimensionReview): { status: "idle" | "saving" | "saved" | "unsaved" | "error"; message?: string } {
   if (save.kind === "saving") return { status: "saving" };
   if (save.kind === "failed") return { status: "error", message: save.reason === "signed_out" ? "Couldn't save. Sign in again." : save.reason === "network" ? "Couldn't save. Check your connection and try again." : "Couldn't save. Self-review is not available for this attempt now." };
   if (save.kind === "conflict") return { status: "error", message: "Not saved: this mark was changed in another tab or device." };
   if (review.draft.note !== (review.saved?.note ?? "")) return { status: "unsaved", message: "Note not saved yet" };
   if (isUnsaved(review)) return { status: "unsaved", message: "Mark not saved yet" };
   return save.kind === "saved" ? { status: "saved" } : { status: "idle" };
}

/**
 * The learner's own mark and optional note for one dimension. No score is computed or shown; the learner decides. The draft and
 * the save live in the attempt's review state (`useSelfReviews`), so leaving this step and coming back keeps both.
 */
export function SelfReviewStep({ dimension, review, onEdit, onSubmit, onKeepMine, onLoadTheirs }: { dimension: ReferenceRubricOut; review: DimensionReview; onEdit: (draft: Partial<SelfReviewDraft>) => void; onSubmit: (mark: Mark, note: string) => void; onKeepMine: () => void; onLoadTheirs: () => void }) {
   const noteId = useId();
   const { mark, note } = review.draft;
   const busy = review.save.kind === "saving";
   const dirty = isUnsaved(review);
   const state = statusOf(review.save, review);

   const choose = (value: Mark) => onSubmit(value, note);

   return (
      <div className="grid gap-4">
         <fieldset className="m-0 border-0 p-0" disabled={busy}>
            <legend className="mb-2 text-body font-semibold">Your mark for this dimension</legend>
            <div className="grid grid-cols-3 gap-2">
               {MARKS.map((value) => (
                  <label key={value} className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-2 text-body has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                     <input type="radio" name={`mark-${dimension.dimension_id}`} value={value} checked={mark === value} onChange={() => choose(value)} className="accent-primary" />
                     {MARK_NAME[value]}
                  </label>
               ))}
            </div>
         </fieldset>
         <div className="grid gap-2">
            <label htmlFor={noteId} className="text-body font-semibold">
               Your note <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea id={noteId} value={note} maxLength={2000} onChange={(event) => onEdit({ note: event.target.value })} rows={3} className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-body" />
            <div className="flex flex-wrap items-center gap-3">
               <Button type="button" variant="outline" className="min-h-11" disabled={busy || mark === null || !dirty} onClick={() => mark && onSubmit(mark, note)}>
                  Save note
               </Button>
               {mark === null ? <span className="text-supporting text-muted-foreground">Choose a mark first; the note is saved with it.</span> : null}
            </div>
         </div>
         <SaveStatus status={state.status} message={state.message} />
         {review.save.kind === "conflict" && mark ? (
            <div className="flex flex-wrap gap-3">
               <Button type="button" className="min-h-11" onClick={onKeepMine}>
                  Keep my mark and note
               </Button>
               <Button type="button" variant="outline" className="min-h-11" onClick={onLoadTheirs}>
                  Load the other version
               </Button>
            </div>
         ) : null}
         {review.save.kind === "failed" && review.save.reason === "network" && mark ? (
            <div>
               <Button type="button" variant="outline" className="min-h-11" onClick={() => onSubmit(mark, note)}>
                  Try again
               </Button>
            </div>
         ) : null}
      </div>
   );
}
