"use client";

import { Bookmark, CheckCircle2, Circle } from "lucide-react";
import type { StoryApiProps } from "@/components/prepare/stories/useStoryClient";
import { Button } from "@/components/ui/button";
import { SaveStatus } from "@/components/ui/save-status";
import { cn } from "@/lib/utils";
import { ItemNote } from "./ItemNote";
import { useReaderItem, type ReaderField } from "./useReaderItem";

interface Props extends StoryApiProps {
   /** The item's `type.slug` ID, `lesson.…` or `problem.…`. */
   contentId: string;
}

/**
 * "Mark complete", "Bookmark" and a private note for a signed-in learner on a Lesson or Problem, with the last visit recorded on open.
 * The controls and the note share one item state and its version (`useReaderItem`).
 * It renders nothing (the same markup as before M2) until the browser has a session and the server says item state is on;
 * once shown, the buttons keep their size while the state loads, so nothing moves when it arrives.
 */
export function ReaderControls({ contentId, ...api }: Props) {
   const { view, save, pending, toggle, retry, writeNote, readLatest } = useReaderItem(contentId, api);
   if (view.kind === "hidden") return null;

   const state = view.kind === "ready" ? view.state : null;
   const busy = view.kind !== "ready" || pending !== null;
   const kind = contentId.startsWith("problem.") ? "Problem" : "Lesson";
   const marks: { field: ReaderField; label: string; on: boolean; Icon: typeof Circle }[] = [
      { field: "completed", label: "Mark complete", on: Boolean(state?.completed_at), Icon: state?.completed_at ? CheckCircle2 : Circle },
      { field: "bookmarked", label: "Bookmark", on: Boolean(state?.bookmarked_at), Icon: Bookmark },
   ];

   return (
      <>
         <div role="group" aria-label={`${kind} actions`} data-reader-controls="" className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
            {marks.map(({ field, label, on, Icon }) => (
               <Button
                  key={field}
                  type="button"
                  variant="outline"
                  aria-pressed={on}
                  aria-disabled={busy}
                  aria-busy={view.kind === "loading" || pending === field}
                  disabled={view.kind !== "ready"}
                  onClick={() => void toggle(field)}
                  className={cn("min-h-11 px-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", on && "border-primary bg-accent font-semibold")}
               >
                  <Icon aria-hidden="true" className={cn(on && field === "bookmarked" && "fill-current")} />
                  {label}
               </Button>
            ))}
            <SaveStatus status={view.kind === "failed" ? "error" : save.status} message={view.kind === "failed" ? "Couldn't load your saved state." : save.message} />
            {view.kind === "failed" ? (
               <Button type="button" variant="ghost" onClick={retry} className="min-h-11">
                  Try again
               </Button>
            ) : null}
         </div>
         {state ? <ItemNote kind={kind} state={state} writeNote={writeNote} readLatest={readLatest} /> : null}
      </>
   );
}
