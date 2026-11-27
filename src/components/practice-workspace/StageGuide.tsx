"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { MAX_EVENT_TEXT, type useStageGuide } from "./useStageGuide";
import { STAGE_COPY, isKnownPosition } from "@/lib/practice-workspace/stages";
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

const HEADING = "m-0 text-supporting font-semibold tracking-wide text-muted-foreground uppercase";

/**
 * The quiet stage guide (Design D's margin): authored hints in their authored order, and in Frame the authored clarifications. Every
 * stage says what it offers, so a stage with no authored hint says so and names the stages that have some (counts only, never text). An answer
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
   // A-03: the server's count is authoritative (the history is bounded); hints shown in this visit can only add to it.
   const used = Math.max(stage?.hints_used ?? 0, shown.length);
   const canAsk = !readOnly && used < available;
   const hintBusy = guide.busy.has(`hint:${position}`);

   const clarifications = position === "frame" ? (challenge?.clarifications ?? []) : [];
   const comparable = ownQuestionsSaved || skipped;
   const mine = guide.assumptions.filter((entry) => entry.position === position);

   const hintedElsewhere = (challenge?.stages ?? []).filter((entry) => entry.position !== position && entry.hints_available > 0 && isKnownPosition(entry.position)).map((entry) => STAGE_COPY[entry.position].label);
   const clarificationsElsewhere = position !== "frame" && (challenge?.clarifications.length ?? 0) > 0 && challenge?.stages.some((entry) => entry.position === "frame");

   if (challenge === null) return null;

   return (
      <aside aria-label="Stage guide" className="grid gap-6 text-body">
         {position === "follow_ups" ? (
            <section aria-labelledby="follow-ups-guide-title">
               <h2 id="follow-ups-guide-title" className={HEADING}>
                  Practising follow-ups
               </h2>
               <p className="m-0 mt-2">Self-guided practice does not show the interviewer&apos;s follow-up questions. Write the probes you expect for your design and answer each one:</p>
               <ol className="m-0 mt-2 list-decimal space-y-1 pl-5">
                  <li>The question, as an interviewer would ask it.</li>
                  <li>Your answer.</li>
                  <li>What it changes in your design or assumptions, or why nothing changes.</li>
               </ol>
               <p className="m-0 mt-2 text-muted-foreground">Good probes push on your central decisions or change a constraint: more load, a failure, a tighter budget. If an answer changes an earlier stage, go back and revise it there. Your work saves as you type.</p>
            </section>
         ) : null}

         {available === 0 && shown.length === 0 ? (
            <section aria-labelledby={`hints-${position}`}>
               <h2 id={`hints-${position}`} className={HEADING}>
                  Hints
               </h2>
               <p className="m-0 mt-2 text-muted-foreground">
                  No hints are written for this stage.{hintedElsewhere.length > 0 ? ` This Problem has hints in: ${hintedElsewhere.join(", ")}.` : " This Problem has no hints."}
               </p>
            </section>
         ) : (
            <section aria-labelledby={`hints-${position}`}>
               <h2 id={`hints-${position}`} className={HEADING}>
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
                  {used} of {available} shown
               </p>
               <div className="mt-2">
                  <Button type="button" variant="outline" className="min-h-11" disabled={!canAsk} aria-busy={hintBusy || undefined} onClick={() => void guide.hint(position)}>
                     {canAsk ? (used === 0 ? "Show a hint" : "Show the next hint") : "No more hints"}
                  </Button>
               </div>
               <Notice guide={guide} scope={`hint:${position}`} />
            </section>
         )}

         {clarificationsElsewhere ? (
            <section aria-labelledby={`clarifications-elsewhere-${position}`}>
               <h2 id={`clarifications-elsewhere-${position}`} className={HEADING}>
                  Questions to compare with
               </h2>
               <p className="m-0 mt-2 text-muted-foreground">A strong candidate&apos;s clarifying questions, with their answers, are in {STAGE_COPY.frame.label}.</p>
            </section>
         ) : null}

         {clarifications.length > 0 ? (
            <section aria-labelledby="clarifications-title">
               <h2 id="clarifications-title" className={HEADING}>
                  Questions to compare with
               </h2>
               {!comparable ? (
                  <>
                     <p className="m-0 mt-2 text-muted-foreground">
                        {clarifications.length === 1 ? "1 question" : `${clarifications.length} questions`} from a strong candidate, with their answers, are ready. Write your own clarifying questions first; once one is saved, you can compare.
                     </p>
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
