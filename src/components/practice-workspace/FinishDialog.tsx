"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAGE_COPY } from "@/lib/practice-workspace/stages";
import type { Position, StageStatus } from "@/lib/practice-workspace/types";
import type { DiagramState } from "./useAttemptWorkspace";
import type { FinishAction, FinishState } from "./useFinish";

const STATUS_WORDS: Readonly<Record<StageStatus, string>> = { not_started: "not started", in_progress: "in progress", done: "done", skipped: "skipped" };
const WORKING: Readonly<Record<FinishAction, string>> = { submit: "Saving and submitting…", reveal: "Saving and revealing…", abandon: "Saving and abandoning…" };

interface Props {
   positions: readonly Position[];
   statuses: ReadonlyMap<Position, StageStatus>;
   diagram: DiagramState;
   finish: { state: FinishState; start: (action: FinishAction) => void; checkAgain: () => void; dismiss: () => void };
   onReload: () => void;
}

function Message({ state, diagram, onReload, checkAgain }: { state: FinishState; diagram: DiagramState; onReload: () => void; checkAgain: () => void }) {
   if (state.kind === "working") return <p className="m-0">{WORKING[state.action]}</p>;
   if (state.kind === "blocked") {
      if (state.reason === "diagram_loading") return <p className="m-0">Your diagram is still loading. Wait a moment, then try again.</p>;
      if (state.reason === "diagram_failed")
         return (
            <div className="grid gap-2">
               <p className="m-0">Your diagram could not be read, so nothing was sent. Load it first.</p>
               {diagram.kind === "failed" ? (
                  <div>
                     <Button type="button" variant="outline" className="min-h-11" onClick={diagram.retry}>
                        Load the diagram
                     </Button>
                  </div>
               ) : null}
            </div>
         );
      return <p className="m-0">Some work is not saved yet, so nothing was sent. The save status shows what needs attention; try again once it says Saved.</p>;
   }
   if (state.kind === "unknown")
      return (
         <div className="grid gap-2">
            <p className="m-0">We could not confirm the result, so nothing is shown as ended yet. Your work stays locked until we know.</p>
            <div>
               <Button type="button" className="min-h-11" onClick={checkAgain}>
                  Check again
               </Button>
            </div>
         </div>
      );
   if (state.kind === "conflict")
      return (
         <div className="grid gap-2">
            <p className="m-0">Your work was changed in another tab or device after you last saved here. Nothing was submitted. Load the latest saved work, review it, then submit.</p>
            <div>
               <Button type="button" className="min-h-11" onClick={onReload}>
                  Load the latest saved work
               </Button>
            </div>
         </div>
      );
   if (state.kind === "failed") return <p className="m-0">{state.signedOut ? "Your session has ended. Sign in again; your saved work is kept." : "Nothing was changed. Try again."}</p>;
   return null;
}

/**
 * Ending an attempt: a review of what will be submitted, then submit, or one of the other two endings (reveal, abandon), each with
 * its own explicit confirmation. Placed in the sticky header, so the phone's Canvas/Outline switch never covers it.
 */
export function FinishDialog({ positions, statuses, diagram, finish, onReload }: Props) {
   const [open, setOpen] = useState(false);
   const [view, setView] = useState<FinishAction>("submit");
   const busy = finish.state.kind === "working";
   const unresolved = finish.state.kind === "unknown";
   const graph = diagram.kind === "ready" ? diagram.engine.getSnapshot().saved.graph : null;
   const close = (next: boolean) => {
      if (busy || unresolved) return;
      setOpen(next);
      if (!next) {
         setView("submit");
         finish.dismiss();
      }
   };
   const title = view === "submit" ? "Submit this attempt?" : view === "reveal" ? "Reveal the reference without submitting?" : "Abandon this attempt?";
   return (
      <Dialog.Root open={open || busy || unresolved} onOpenChange={close}>
         <Dialog.Trigger asChild>
            <Button type="button" className="min-h-11 gap-2">
               <Flag aria-hidden="true" className="size-4" />
               Finish
            </Button>
         </Dialog.Trigger>
         <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content
               onPointerDownOutside={(event) => event.preventDefault()}
               className="bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-lg border p-6 shadow-lg"
            >
               <Dialog.Title className="m-0 font-[family-name:Iowan_Old_Style,Palatino_Linotype,Palatino,Book_Antiqua,Georgia,serif] text-subsection text-foreground">{title}</Dialog.Title>
               <Dialog.Description asChild>
                  <div className="grid gap-3 text-body text-muted-foreground">
                     {view === "submit" ? (
                        <>
                           <p className="m-0">Your saved work is frozen as it is now and becomes read-only. You can then compare it with the reference and mark your own self-review. Stages that are not done are submitted as they are.</p>
                           <ul className="m-0 grid list-none gap-1 p-0 text-foreground">
                              {positions.map((position) => (
                                 <li key={position}>
                                    {STAGE_COPY[position].label}: {STATUS_WORDS[statuses.get(position) ?? "not_started"]}
                                 </li>
                              ))}
                              <li>{graph ? `Diagram: ${graph.nodes.length} components, ${graph.edges.length} connections` : "Diagram: not loaded"}</li>
                           </ul>
                        </>
                     ) : view === "reveal" ? (
                        <p className="m-0">The attempt ends without a submission and becomes read-only. The reveal is recorded in its history. You can still mark your self-review.</p>
                     ) : (
                        <p className="m-0">The attempt ends and becomes read-only. Abandoning deletes nothing: your work stays in your attempts and in your export.</p>
                     )}
                  </div>
               </Dialog.Description>
               <div role="status" aria-live="polite" className="text-body text-foreground empty:hidden">
                  <Message state={finish.state} diagram={diagram} onReload={onReload} checkAgain={finish.checkAgain} />
               </div>
               <div className="flex flex-wrap justify-end gap-3">
                  <Button type="button" variant="outline" className="min-h-11" disabled={busy || unresolved} onClick={() => (view === "submit" ? close(false) : setView("submit"))}>
                     {view === "submit" ? "Keep working" : "Back"}
                  </Button>
                  <Button type="button" variant={view === "abandon" ? "destructive" : "default"} className="min-h-11" disabled={busy || unresolved} aria-busy={busy || undefined} onClick={() => finish.start(view)}>
                     {view === "submit" ? "Submit attempt" : view === "reveal" ? "Reveal the reference" : "Abandon attempt"}
                  </Button>
               </div>
               {view === "submit" ? (
                  <div className="grid gap-2 border-t border-border pt-4">
                     <p className="m-0 text-supporting text-muted-foreground">Other ways to end</p>
                     <div className="flex flex-wrap gap-3">
                        <Button type="button" variant="ghost" className="min-h-11" disabled={busy || unresolved} onClick={() => setView("reveal")}>
                           Reveal the reference instead
                        </Button>
                        <Button type="button" variant="ghost" className="min-h-11" disabled={busy || unresolved} onClick={() => setView("abandon")}>
                           Abandon this attempt
                        </Button>
                     </div>
                  </div>
               ) : null}
            </Dialog.Content>
         </Dialog.Portal>
      </Dialog.Root>
   );
}
