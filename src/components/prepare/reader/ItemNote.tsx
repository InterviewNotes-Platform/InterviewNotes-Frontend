"use client";

import { useEffect, useRef, useState } from "react";
import { useLeaveGuard } from "@/components/prepare/editor/useLeaveGuard";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field } from "@/components/ui/field";
import { SaveStatus } from "@/components/ui/save-status";
import { Textarea } from "@/components/ui/textarea";
import type { ItemState } from "@/lib/prep/types";
import { cn } from "@/lib/utils";
import { NOTE_MAX, useItemNote } from "./useItemNote";
import type { NoteWrite } from "./useReaderItem";

interface Props {
   kind: "Lesson" | "Problem";
   /** The reader's shared item state: the same object, and the same `version`, the completion and bookmark controls use. */
   state: ItemState;
   writeNote: (note: string | null) => Promise<NoteWrite>;
   readLatest: (before?: (latest: ItemState) => void) => Promise<ItemState | null>;
}

/**
 * The learner's private note on one Lesson or Problem. It saves as they type, like the Story Bank and answer editors,
 * through the reader's single write lane. The note is held in memory and sent to the API only; it is not kept in the
 * browser, the address, or the page.
 */
export function ItemNote({ kind, state, writeNote, readLatest }: Props) {
   const note = useItemNote({ state, writeNote, readLatest });
   const { write, hasPendingWork } = note;
   const { leaving } = useLeaveGuard({ active: hasPendingWork, settle: note.settle });
   const blocked = write.phase !== "idle" && write.phase !== "saving" && write.phase !== "saved";
   const [open, setOpen] = useState(false);
   // A problem the reader must see opens the panel and keeps it open: its message and choices live inside.
   if (blocked && !open) setOpen(true);

   const statusRef = useRef<HTMLDivElement>(null);
   const choiceRef = useRef<HTMLDivElement>(null);
   const chose = useRef(false);

   // The choice buttons unmount when a choice is made. Focus then goes to the status, or back to the choice if it reopens,
   // unless the reader has already moved on to something else.
   useEffect(() => {
      if (!chose.current || (write.phase === "conflict" && write.busy)) return;
      const held = document.activeElement;
      const lost = !held || held === document.body || held === statusRef.current || choiceRef.current?.contains(held);
      if (write.phase !== "saving") chose.current = false;
      if (!lost) return;
      (write.phase === "conflict" ? choiceRef.current : statusRef.current)?.focus();
   }, [write]);
   const choose = (run: () => void) => () => {
      chose.current = true;
      run();
   };

   const message = leaving && note.saveState === "saving" ? "Saving before you leave…" : note.saveMessage;
   const detail = blocked || note.issue ? "Not saved" : note.draft !== "" ? "Has a note" : undefined;

   return (
      <Disclosure compact level="h2" title="Your note" detail={detail} open={open} onOpenChange={setOpen} className="mt-3">
         <div className="space-y-3 pt-1 pb-2">
            <Field
               label={`Your private note on this ${kind}`}
               description={`Only you can see it. It saves as you type. Up to ${NOTE_MAX.toLocaleString("en-US")} characters.`}
               error={note.issue}
            >
               <Textarea rows={6} value={note.draft} onChange={(event) => note.edit(event.target.value)} onBlur={() => void note.persist()} />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
               <SaveStatus ref={statusRef} tabIndex={-1} status={note.saveState} message={message} />
               {write.phase === "unknown" || write.phase === "signin" ? (
                  <Button type="button" variant="outline" onClick={note.retry} className="min-h-11">
                     Try again
                  </Button>
               ) : null}
            </div>
            {write.phase === "conflict" ? (
               <div ref={choiceRef} tabIndex={-1} role="group" aria-label="Choose which version to keep" className="space-y-3">
                  <p className="text-supporting text-foreground">A newer version of this note was saved elsewhere. Nothing has been replaced yet; your text here is unsaved.</p>
                  <div className="flex flex-wrap gap-3">
                     <Button type="button" aria-disabled={write.busy} className={cn("min-h-11", write.busy && "opacity-50")} onClick={choose(note.keepMine)}>
                        Keep mine
                     </Button>
                     <Button type="button" variant="outline" aria-disabled={write.busy} className={cn("min-h-11", write.busy && "opacity-50")} onClick={choose(note.loadServer)}>
                        Load server version
                     </Button>
                  </div>
                  <p className="text-supporting text-muted-foreground">
                     {write.busy ? "Checking the latest version…" : "Keep mine saves what is here over the newer version. Load server version replaces what is here with it."}
                  </p>
               </div>
            ) : null}
         </div>
      </Disclosure>
   );
}
