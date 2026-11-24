"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { MAX_EVENT_TEXT, type useStageGuide } from "./useStageGuide";
import type { ChallengeOut, Position } from "@/lib/practice-workspace/types";

type Guide = ReturnType<typeof useStageGuide>;

interface Props {
   position: Position;
   challenge: ChallengeOut | null;
   guide: Guide;
   readOnly: boolean;
   /** The learner has saved at least one question of their own in this stage, or chose to skip: the strong candidate's questions open after that (S9-LIF-13). */
   ownQuestionsSaved: boolean;
}

function Notice({ guide, scope }: { guide: Guide; scope: string }) {
   return guide.notice?.scope === scope ? (
      <p role="alert" className="m-0 mt-2 text-supporting text-foreground">
         {guide.notice.message}
      </p>
   ) : null;
}

/**
 * The quiet stage guide (Design D's margin): authored hints in their authored order, and in Frame the authored clarifications. An answer
 * or a hint appears only when the learner asks for it and the server returns it; nothing is shown ahead of the request and nothing
 * is written here. No interviewer or model appears in self-guided practice.
 */
export function StageGuide({ position, challenge, guide, readOnly, ownQuestionsSaved }: Props) {
   const [skipped, setSkipped] = useState(false);
   const [open, setOpen] = useState(false);
   const [assumption, setAssumption] = useState("");

   const stage = challenge?.stages.find((entry) => entry.position === position);
   const shown = guide.hints.filter((hint) => hint.position === position);
   const available = stage?.hints_available ?? 0;
   const canAsk = !readOnly && shown.length < available;
   const hintBusy = guide.busy.has(`hint:${position}`);

   const clarifications = position === "frame" ? (challenge?.clarifications ?? []) : [];
   const comparable = ownQuestionsSaved || skipped;
   const mine = guide.assumptions.filter((entry) => entry.position === position);

   if (available === 0 && shown.length === 0 && clarifications.length === 0) return null;

   return (
      <aside aria-label="Stage guide" className="grid gap-6 text-body">
         {available > 0 || shown.length > 0 ? (
            <section aria-labelledby={`hints-${position}`}>
               <h2 id={`hints-${position}`} className="m-0 text-supporting font-semibold tracking-wide text-muted-foreground uppercase">
                  Hints
               </h2>
               {shown.length > 0 ? (
                  <ol className="m-0 mt-2 list-decimal space-y-2 pl-5">
                     {shown.map((hint) => (
                        <li key={hint.event_id}>{hint.text}</li>
                     ))}
                  </ol>
               ) : (
                  <p className="m-0 mt-2 text-muted-foreground">Try the stage first. A hint nudges; it does not give the answer.</p>
               )}
               <p className="m-0 mt-2 text-supporting text-muted-foreground">
                  {shown.length} of {available} shown
               </p>
               <div className="mt-2">
                  <Button type="button" variant="outline" className="min-h-11" disabled={!canAsk} aria-busy={hintBusy || undefined} onClick={() => void guide.hint(position)}>
                     {canAsk ? (shown.length === 0 ? "Show a hint" : "Show the next hint") : "No more hints"}
                  </Button>
               </div>
               <Notice guide={guide} scope={`hint:${position}`} />
            </section>
         ) : null}

         {clarifications.length > 0 ? (
            <section aria-labelledby="clarifications-title">
               <h2 id="clarifications-title" className="m-0 text-supporting font-semibold tracking-wide text-muted-foreground uppercase">
                  Questions to compare with
               </h2>
               {!comparable ? (
                  <>
                     <p className="m-0 mt-2 text-muted-foreground">Write your own questions first. Once you have saved some, you can compare them with a strong candidate&apos;s.</p>
                     <div className="mt-2">
                        <Button type="button" variant="ghost" className="min-h-11" onClick={() => setSkipped(true)}>
                           Skip my questions
                        </Button>
                     </div>
                  </>
               ) : !open ? (
                  <div className="mt-2">
                     <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
                        Compare with a strong candidate&apos;s questions
                     </Button>
                  </div>
               ) : (
                  <ul className="m-0 mt-2 list-none space-y-4 p-0">
                     {clarifications.map((entry) => {
                        const revealed = guide.revealed.get(entry.clarification_id);
                        const busy = guide.busy.has(`clarification:${entry.clarification_id}`);
                        return (
                           <li key={entry.clarification_id} className="m-0">
                              <p className="m-0 font-semibold">{entry.title}</p>
                              {revealed ? (
                                 <p className="m-0 mt-1 text-pretty whitespace-pre-wrap">{revealed.answer}</p>
                              ) : (
                                 <Button
                                    type="button"
                                    variant="outline"
                                    className="mt-2 min-h-11"
                                    disabled={readOnly}
                                    aria-busy={busy || undefined}
                                    aria-label={`Reveal the answer: ${entry.title}`}
                                    onClick={() => void guide.reveal(entry.clarification_id)}
                                 >
                                    Reveal the answer
                                 </Button>
                              )}
                              <Notice guide={guide} scope={`clarification:${entry.clarification_id}`} />
                           </li>
                        );
                     })}
                  </ul>
               )}
               {comparable ? (
                  <div className="mt-4 grid gap-2">
                     <Field label="Proceed with an assumption" description={`When you would rather not ask, record what you will assume. ${assumption.length.toLocaleString("en-US")} of ${MAX_EVENT_TEXT.toLocaleString("en-US")} characters.`}>
                        <Textarea value={assumption} maxLength={MAX_EVENT_TEXT} readOnly={readOnly} onChange={(event) => setAssumption(event.target.value)} className="min-h-20" />
                     </Field>
                     <div>
                        <Button
                           type="button"
                           variant="outline"
                           className="min-h-11"
                           disabled={readOnly || assumption.trim() === ""}
                           aria-busy={guide.busy.has("assumption") || undefined}
                           onClick={async () => {
                              if (await guide.declare(position, assumption)) setAssumption("");
                           }}
                        >
                           Record this assumption
                        </Button>
                     </div>
                     <Notice guide={guide} scope="assumption" />
                     {mine.length > 0 ? (
                        <ul className="m-0 list-disc space-y-1 pl-5 text-muted-foreground">
                           {mine.map((entry) => (
                              <li key={entry.id}>{entry.text}</li>
                           ))}
                        </ul>
                     ) : null}
                  </div>
               ) : null}
            </section>
         ) : null}
      </aside>
   );
}
