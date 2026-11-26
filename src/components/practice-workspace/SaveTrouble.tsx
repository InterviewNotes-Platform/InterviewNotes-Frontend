"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { AutosaveSnapshot } from "@/lib/practice-workspace/autosave";
import { diffStage, type StageDraft, type StageEngine } from "@/lib/practice-workspace/stageSave";
import type { StageField } from "@/lib/practice-workspace/stages";
import type { StageWorkOut } from "@/lib/practice-workspace/types";

interface Props {
   engine: StageEngine;
   snapshot: AutosaveSnapshot<StageDraft, StageWorkOut>;
   fields: readonly StageField[];
   attemptId: string;
}

const labelOf = (fields: readonly StageField[], key: string) => fields.find((field) => field.key === key)?.label ?? key.replace(/_/g, " ");

function Text({ title, text }: { title: string; text: string }) {
   return (
      <div className="min-w-0">
         <p className="m-0 text-supporting font-semibold text-muted-foreground">{title}</p>
         <p className="m-0 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-background p-3 text-body whitespace-pre-wrap [overflow-wrap:anywhere]">{text || "(empty)"}</p>
      </div>
   );
}

/**
 * What the learner can do about a stage whose text the server does not hold, and what is still only here. The save line announces the
 * state; this panel carries the choice or the next step. A conflict offers Keep mine, Take theirs and Combine, and never picks one itself.
 */
export function SaveTrouble({ engine, snapshot, fields, attemptId }: Props) {
   const { phase, draft, saved, theirs, resolving, note } = snapshot;
   if (phase === "offline" || phase === "invalid") {
      return (
         <div role="group" aria-label="Save problem" className="rounded-lg border border-border bg-surface p-4">
            <p className="m-0 text-body">{note}</p>
            <div className="mt-3">
               <Button type="button" variant="outline" className="min-h-11" onClick={() => void engine.retry()}>
                  Retry saving
               </Button>
            </div>
         </div>
      );
   }
   if (phase === "signin") {
      return (
         <div role="group" aria-label="Save problem" className="rounded-lg border border-border bg-surface p-4">
            <p className="m-0 text-body">{note}</p>
            <p className="m-0 mt-2 text-supporting text-muted-foreground">Copy anything you want to keep before you leave this page.</p>
            <div className="mt-3">
               <Button asChild variant="outline" className="min-h-11">
                  <Link href={`/login?redirect=${encodeURIComponent(`/practice/attempts/${attemptId}`)}`} prefetch={false}>
                     Sign in again
                  </Link>
               </Button>
            </div>
         </div>
      );
   }
   if (phase === "gone") {
      return (
         <div role="group" aria-label="Save problem" className="rounded-lg border border-border bg-surface p-4">
            <p className="m-0 text-body">{note}</p>
         </div>
      );
   }
   if (phase === "terminal") {
      const unsaved = diffStage(draft, saved)?.set_fields ?? {};
      const keys = Object.keys(unsaved);
      if (keys.length === 0 && !note) return null;
      return (
         <div role="group" aria-label="Not saved" className="rounded-lg border border-border bg-surface p-4">
            <p className="m-0 text-body">{note ?? "This attempt has ended."}</p>
            {keys.length > 0 ? (
               <div className="mt-3 grid gap-3">
                  {keys.map((key) => (
                     <Text key={key} title={`${labelOf(fields, key)} (not saved)`} text={unsaved[key]} />
                  ))}
               </div>
            ) : null}
         </div>
      );
   }
   if (phase === "conflict") {
      const differing = theirs
         ? [...new Set([...Object.keys(draft.fields), ...Object.keys(theirs.fields)])].filter((key) => (draft.fields[key] ?? "") !== (theirs.fields[key] ?? "") && (draft.fields[key] ?? "") !== (saved.fields[key] ?? ""))
         : [];
      return (
         <div role="group" aria-labelledby="conflict-title" className="rounded-lg border border-border bg-surface p-4">
            <h3 id="conflict-title" className="m-0 text-body font-semibold">
               This stage was changed somewhere else
            </h3>
            <p className="m-0 mt-1 text-body text-muted-foreground">{note}</p>
            {theirs ? (
               <>
                  <div className="mt-3 grid gap-4">
                     {differing.map((key) => (
                        <div key={key} className="grid gap-2 md:grid-cols-2">
                           <Text title={`${labelOf(fields, key)}: your version`} text={draft.fields[key] ?? ""} />
                           <Text title={`${labelOf(fields, key)}: the other version`} text={theirs.fields[key] ?? ""} />
                        </div>
                     ))}
                     {differing.length === 0 ? <p className="m-0 text-supporting text-muted-foreground">Only this stage&apos;s status differs.</p> : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                     <Button type="button" className="min-h-11" aria-disabled={resolving || undefined} onClick={() => !resolving && void engine.keepMine()}>
                        Keep mine
                     </Button>
                     <Button type="button" variant="outline" className="min-h-11" aria-disabled={resolving || undefined} onClick={() => !resolving && void engine.takeTheirs()}>
                        Take theirs
                     </Button>
                     <Button type="button" variant="outline" className="min-h-11" aria-disabled={resolving || undefined} onClick={() => !resolving && void engine.combine()}>
                        Combine
                     </Button>
                  </div>
                  <p className="m-0 mt-2 text-supporting text-muted-foreground">Keep mine saves your text over the other version. Take theirs replaces your text. Combine keeps both, yours first.</p>
               </>
            ) : (
               <div className="mt-3">
                  <Button type="button" variant="outline" className="min-h-11" onClick={() => void engine.reloadConflict()}>
                     Load the other version
                  </Button>
               </div>
            )}
         </div>
      );
   }
   return note && phase === "idle" ? (
      <p role="note" className="m-0 text-supporting text-muted-foreground">
         {note}
      </p>
   ) : null;
}
