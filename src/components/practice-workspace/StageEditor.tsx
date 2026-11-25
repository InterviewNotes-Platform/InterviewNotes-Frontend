"use client";

import { forwardRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { MAX_FIELD_CHARS, STAGE_COPY, STATUS_LABEL, stageFields, type MlSubsection } from "@/lib/practice-workspace/stages";
import type { StageDraft, StageEngine } from "@/lib/practice-workspace/stageSave";
import type { Position, StageStatus } from "@/lib/practice-workspace/types";
import { SaveTrouble } from "./SaveTrouble";

interface Props {
   attemptId: string;
   position: Position;
   index: number;
   total: number;
   engine: StageEngine;
   /** The attempt accepts no more writes: the text stays visible and selectable but cannot change. */
   readOnly: boolean;
   mlSubsections?: readonly MlSubsection[];
   previous: Position | null;
   next: Position | null;
   onGo: (position: Position) => void;
   /** The Design stage (T14): the canvas is the stage's main work and these fields are its written notes, under a second-level heading. */
   asNotes?: boolean;
}

const nextStatus = (draft: StageDraft, value: string): StageStatus => (draft.status === "not_started" && value.trim() !== "" ? "in_progress" : draft.status);

/**
 * One stage's written work (Design D's focused column): the stage label and intent, a labelled text field per prompt with its
 * character count, the learner's own status control, and Previous and Next. Typing is local and immediate; saving is the
 * engine's. Any field may stay empty and any stage may be left or opened at any time.
 */
export const StageEditor = forwardRef<HTMLHeadingElement, Props>(function StageEditor({ attemptId, position, index, total, engine, readOnly, mlSubsections, previous, next, onGo, asNotes = false }, headingRef) {
   const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
   const { draft } = snapshot;
   const fields = stageFields(position, mlSubsections);
   const copy = STAGE_COPY[position];
   const locked = readOnly || snapshot.phase === "terminal";

   const setField = (key: string, value: string) => engine.edit((current) => ({ status: nextStatus(current, value), fields: { ...current.fields, [key]: value } }));
   const setStatus = (status: StageStatus) => engine.edit((current) => ({ ...current, status }));

   return (
      <div className="grid gap-6">
         <div>
            {asNotes ? (
               <h2 ref={headingRef} tabIndex={-1} className="m-0 font-[family-name:Iowan_Old_Style,Palatino_Linotype,Palatino,Book_Antiqua,Georgia,serif] text-subsection outline-none">
                  Written notes
               </h2>
            ) : (
               <>
                  <p className="m-0 text-supporting font-semibold tracking-wide text-primary uppercase">
                     Stage {index + 1} of {total}
                  </p>
                  <h1 ref={headingRef} tabIndex={-1} className="m-0 mt-1 font-[family-name:Iowan_Old_Style,Palatino_Linotype,Palatino,Book_Antiqua,Georgia,serif] text-title text-balance outline-none">
                     {copy.label}
                  </h1>
                  <p className="m-0 mt-2 text-body text-pretty text-muted-foreground">{copy.intent}</p>
               </>
            )}
            <p className="m-0 mt-3 text-supporting">
               <span className="text-muted-foreground">Status: </span>
               <span data-testid="stage-status" className="font-semibold">
                  {STATUS_LABEL[draft.status]}
               </span>
            </p>
         </div>

         {/* What the learner must do about unsaved text comes first, where it cannot be missed. */}
         <SaveTrouble engine={engine} snapshot={snapshot} fields={fields} attemptId={attemptId} />

         <div className="grid gap-5">
            {fields.map((field) => {
               const value = draft.fields[field.key] ?? "";
               const atLimit = value.length >= MAX_FIELD_CHARS;
               return (
                  <Field
                     key={field.key}
                     label={field.label}
                     description={
                        <>
                           {field.hint ? <span>{field.hint} </span> : null}
                           <span className={cn(atLimit && "font-semibold text-destructive")}>
                              {value.length.toLocaleString("en-US")} of {MAX_FIELD_CHARS.toLocaleString("en-US")} characters{atLimit ? ". Limit reached." : ""}
                           </span>
                        </>
                     }
                     className="[&_label]:font-[family-name:Iowan_Old_Style,Palatino_Linotype,Palatino,Book_Antiqua,Georgia,serif] [&_label]:text-subsection"
                  >
                     <Textarea
                        value={value}
                        maxLength={MAX_FIELD_CHARS}
                        readOnly={locked}
                        onChange={(event) => setField(field.key, event.target.value)}
                        className="min-h-28 text-base leading-relaxed md:text-base"
                     />
                  </Field>
               );
            })}
         </div>

         <div role="group" aria-label="Stage status" className="flex flex-wrap items-center gap-3">
            {draft.status === "done" || draft.status === "skipped" ? (
               <Button type="button" variant="outline" className="min-h-11" disabled={locked} onClick={() => setStatus("in_progress")}>
                  Reopen this stage
               </Button>
            ) : (
               <>
                  <Button type="button" variant="outline" className="min-h-11" disabled={locked} onClick={() => setStatus("done")}>
                     Mark this stage done
                  </Button>
                  <Button type="button" variant="outline" className="min-h-11" disabled={locked} onClick={() => setStatus("skipped")}>
                     Skip this stage
                  </Button>
               </>
            )}
         </div>

         <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            {previous ? (
               <Button type="button" variant="outline" className="min-h-11 gap-1" onClick={() => onGo(previous)}>
                  <ChevronLeft aria-hidden="true" className="size-4" />
                  {STAGE_COPY[previous].label}
               </Button>
            ) : (
               <span />
            )}
            {next ? (
               <Button type="button" className="min-h-11 gap-1" onClick={() => onGo(next)}>
                  Continue to {STAGE_COPY[next].label}
                  <ChevronRight aria-hidden="true" className="size-4" />
               </Button>
            ) : null}
         </div>
      </div>
   );
});
