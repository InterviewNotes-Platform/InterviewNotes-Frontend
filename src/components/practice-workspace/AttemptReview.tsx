"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DiagramEditorLoader } from "@/components/practice-graph/DiagramEditorLoader";
import { Button } from "@/components/ui/button";
import { STAGE_COPY, isKnownPosition, stageFields, withSavedFields } from "@/lib/practice-workspace/stages";
import type { AttemptDetailOut, AttemptStatus, Position, PromptCalloutBlock, PromptMarkdownBlock, ReferenceRubricOut } from "@/lib/practice-workspace/types";
import { SENIORITY_NAME } from "./HistoryRoute";
import { AttemptDataControls } from "./PracticeDataControls";
import { PromptBlocks } from "./PromptBlocks";
import { usePracticeSession } from "./practiceSession";
import { isUnsaved, useReadOnlyDiagram, useReference, useSelfReviews, type ReferenceLoad } from "./reviewState";
import { MARK_NAME, SelfReviewStep } from "./SelfReviewStep";

const SERIF = "font-[family-name:Iowan_Old_Style,Palatino_Linotype,Palatino,Book_Antiqua,Georgia,serif]";
const ENDING: Readonly<Partial<Record<AttemptStatus, string>>> = {
   submitted: "Submitted",
   evaluating: "Submitted",
   evaluated: "Submitted",
   evaluation_failed: "Submitted",
   ended_by_reveal: "Ended by revealing the reference",
   abandoned: "Abandoned",
};
const REVIEWABLE: readonly AttemptStatus[] = ["submitted", "evaluated", "evaluation_failed", "ended_by_reveal"];

/** The Problem's reader page from its content ID; null for anything else (no link is invented). Practising again starts there, as a NEW attempt. */
export const readerHref = (contentId: string) => (/^problem\.[a-z0-9][a-z0-9._-]*$/.test(contentId) ? `/problems/${contentId.slice("problem.".length)}` : null);

function Blocks({ blocks }: { blocks: (PromptMarkdownBlock | PromptCalloutBlock)[] }) {
   return <PromptBlocks blocks={blocks as unknown as Record<string, unknown>[]} />;
}

/** One stage's saved text, read-only; a field whose sub-prompt is no longer listed keeps a neutral label. */
function StageText({ detail, position }: { detail: AttemptDetailOut; position: Position }) {
   const stage = detail.stage_work.find((s) => s.position === position);
   const subsections = detail.challenge?.stages.find((s) => s.position === "ml_reasoning")?.subsections;
   const fields = withSavedFields(stageFields(position, subsections), stage?.fields ?? {}).filter((field) => (stage?.fields[field.key] ?? "").trim() !== "");
   if (fields.length === 0) return <p className="m-0 text-body text-muted-foreground">Nothing written in this stage.</p>;
   return (
      <dl className="m-0 grid gap-3">
         {fields.map((field) => (
            <div key={field.key}>
               <dt className="text-supporting font-semibold text-muted-foreground">{field.label}</dt>
               <dd className="m-0 text-body whitespace-pre-wrap">{stage!.fields[field.key]}</dd>
            </div>
         ))}
      </dl>
   );
}

function ReadOnlyDiagram({ attemptId }: { attemptId: string }) {
   const { state, retry } = useReadOnlyDiagram(attemptId);
   if (state.kind === "loading") return <p role="status" className="m-0 text-body text-muted-foreground">Loading your diagram…</p>;
   if (state.kind === "failed")
      return (
         <div role="alert" className="grid gap-2">
            <p className="m-0 text-body text-muted-foreground">We could not load your diagram. Your written work is not affected.</p>
            <div>
               <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
                  Try again
               </Button>
            </div>
         </div>
      );
   return <DiagramEditorLoader engine={state.engine} refusal={null} readOnly variant="split" />;
}

function ReferencePanel({ load, retry }: { load: ReferenceLoad; retry: () => void }) {
   if (load.kind === "loading") return <p role="status" className="m-0 text-body text-muted-foreground">Loading the reference…</p>;
   const problem: Record<Exclude<ReferenceLoad["kind"], "loading" | "ready">, string> = {
      not_available: "The reference is not available for this attempt.",
      withdrawn: "This Problem has been withdrawn, so its reference is no longer shown. Your own work is kept.",
      entitlement: "We could not check your plan just now, so the reference is not shown. Your submission is safe.",
      failed: "We could not load the reference. Your submission is safe.",
   };
   if (load.kind !== "ready")
      return (
         <div role="alert" className="grid gap-2">
            <p className="m-0 text-body text-muted-foreground">{load.kind === "failed" && load.signedOut ? "Your session has ended. Sign in again to see the reference." : problem[load.kind]}</p>
            {load.kind === "entitlement" || (load.kind === "failed" && !load.signedOut) ? (
               <div>
                  <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
                     Try again
                  </Button>
               </div>
            ) : null}
         </div>
      );
   if (load.data.sections.length === 0) return <p className="m-0 text-body text-muted-foreground">There is no reference to compare with on your plan for this Problem.</p>;
   return (
      <div className="grid gap-6">
         {load.data.sections.map((section, index) => (
            <section key={index} aria-label={section.title}>
               <h3 className={`m-0 mb-2 ${SERIF} text-body font-semibold`}>{section.title}</h3>
               <PromptBlocks blocks={section.body} />
            </section>
         ))}
      </div>
   );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
   return (
      <section aria-label={title} className="min-w-0 rounded-lg border border-border bg-background p-4">
         <h2 className="m-0 mb-3 text-supporting font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
         {children}
      </section>
   );
}

function History({ detail }: { detail: AttemptDetailOut }) {
   const events = detail.history.filter((e) => e.kind === "hint_authored" || e.kind === "clarification_reveal");
   const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
   return (
      <div className="grid gap-2 text-body">
         {detail.status === "ended_by_reveal" ? <p className="m-0">You revealed the reference before submitting.</p> : null}
         {events.length === 0 ? (
            <p className="m-0 text-muted-foreground">No hints or clarification answers were opened.</p>
         ) : (
            <ul className="m-0 grid gap-1 pl-5">
               {events.map((e) => (
                  <li key={e.event_id}>
                     {e.kind === "hint_authored" ? "Hint" : "Clarification answer"}
                     {e.position && isKnownPosition(e.position) ? ` in ${STAGE_COPY[e.position].label}` : ""}, <time dateTime={e.created_at}>{when(e.created_at)}</time>
                  </li>
               ))}
            </ul>
         )}
         {detail.history_total > detail.history.length ? <p className="m-0 text-supporting text-muted-foreground">Showing the latest {detail.history.length} of {detail.history_total} events. Your export holds all of them.</p> : null}
      </div>
   );
}

/**
 * The read-only review of an ended attempt (Design B, guided): compare your work with the reference, then each rubric dimension
 * one at a time with your own mark, then a summary. Nothing here can edit the attempt's work; only self-review is saved.
 */
export function AttemptReview({ detail }: { detail: AttemptDetailOut }) {
   const session = usePracticeSession();
   const router = useRouter();
   const reviewable = REVIEWABLE.includes(detail.status);
   const { load, retry } = useReference(detail.id, reviewable);
   // Every dimension's mark and note for this visit, held above the steps: moving between steps keeps an unsaved note and a pending
   // save, never sends an old version (compare-and-set), and keeps the summary current.
   const reviews = useSelfReviews(detail.id, retry);
   const rubric: ReferenceRubricOut[] = load.kind === "ready" ? load.data.rubric : [];
   const steps = reviewable ? ["compare", ...rubric.map((d) => d.dimension_id), "summary"] : ["compare", "summary"];
   const [at, setAt] = useState(0);
   const step = steps[Math.min(at, steps.length - 1)];
   const heading = useRef<HTMLHeadingElement>(null);
   const moved = useRef(false);
   const positions = detail.spine.filter(isKnownPosition);
   const back = readerHref(detail.content_id);
   const markOf = (d: ReferenceRubricOut) => reviews.entry(d).saved;
   const unsavedOf = (d: ReferenceRubricOut) => isUnsaved(reviews.entry(d));
   // Warn before the tab closes with a note or mark the server does not hold; nothing is sent on unload.
   const { anyUnsaved } = reviews;
   useEffect(() => {
      if (!anyUnsaved) return;
      const warn = (event: BeforeUnloadEvent) => event.preventDefault();
      window.addEventListener("beforeunload", warn);
      return () => window.removeEventListener("beforeunload", warn);
   }, [anyUnsaved]);
   useEffect(() => {
      if (moved.current) heading.current?.focus();
   }, [at]);
   const go = (index: number) => {
      moved.current = true;
      setAt(Math.max(0, Math.min(steps.length - 1, index)));
   };
   const dimension = rubric.find((d) => d.dimension_id === step);
   const seniority = SENIORITY_NAME[detail.target_seniority];

   return (
      <div data-practice-review="" className="mx-auto w-full max-w-page px-4 pt-6 pb-24 md:px-6 lg:px-8">
         <header className="grid gap-2 border-b border-border pb-4">
            <p className={`m-0 ${SERIF} text-title`}>{detail.challenge?.title ?? "Practice attempt"}</p>
            <p className="m-0 flex flex-wrap gap-2 text-supporting text-muted-foreground">
               <span className="rounded-full border border-border px-2.5 py-0.5">{ENDING[detail.status] ?? detail.status}</span>
               <span className="rounded-full border border-border px-2.5 py-0.5">{seniority} bar</span>
            </p>
         </header>

         <nav aria-label="Review steps" className="mt-4 overflow-x-auto">
            <ol className="m-0 flex list-none gap-2 p-0">
               {steps.map((id, index) => {
                  const d = rubric.find((r) => r.dimension_id === id);
                  const label = id === "compare" ? "Your work and the reference" : id === "summary" ? "Summary" : `Dimension ${index}`;
                  return (
                     <li key={id}>
                        <button type="button" aria-current={index === at ? "step" : undefined} onClick={() => go(index)} className="min-h-11 rounded-full border border-border px-3 text-supporting whitespace-nowrap aria-[current=step]:border-primary aria-[current=step]:bg-primary/10 aria-[current=step]:font-semibold">
                           {label}
                           {d && markOf(d) ? <span className="sr-only">, marked {MARK_NAME[markOf(d)!.mark]}</span> : null}
                           {d && unsavedOf(d) ? <span className="sr-only">, not saved yet</span> : null}
                        </button>
                     </li>
                  );
               })}
            </ol>
         </nav>

         <main className="mt-6 grid gap-6">
            {step === "compare" ? (
               <>
                  <h1 ref={heading} tabIndex={-1} className={`m-0 ${SERIF} text-title outline-none`}>
                     Your work and the reference
                  </h1>
                  <div className="grid gap-6 lg:grid-cols-2">
                     <Card title="Your submitted work">
                        <div className="grid gap-6">
                           <ReadOnlyDiagram attemptId={detail.id} />
                           {positions.map((position) => (
                              <section key={position} aria-label={STAGE_COPY[position].label}>
                                 <h3 className={`m-0 mb-2 ${SERIF} text-body font-semibold`}>{STAGE_COPY[position].label}</h3>
                                 <StageText detail={detail} position={position} />
                              </section>
                           ))}
                        </div>
                     </Card>
                     <Card title="Reference">{reviewable ? <ReferencePanel load={load} retry={retry} /> : <p className="m-0 text-body text-muted-foreground">An abandoned attempt has no reference comparison. Practise again to submit a new attempt.</p>}</Card>
                  </div>
               </>
            ) : null}

            {dimension ? (
               <>
                  <div>
                     <p className="m-0 text-supporting text-muted-foreground">
                        Dimension {at} of {rubric.length}
                     </p>
                     <h1 ref={heading} tabIndex={-1} className={`m-0 mt-1 ${SERIF} text-title outline-none`}>
                        {dimension.title}
                     </h1>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-4">
                     <p className="m-0 mb-1 text-body font-semibold">{seniority} bar</p>
                     {dimension.bar ? <Blocks blocks={dimension.bar} /> : <p className="m-0 text-body text-muted-foreground">This Problem has no separate bar for this level.</p>}
                  </div>
                  <details className="text-body">
                     <summary className="min-h-11 cursor-pointer content-center text-primary">Strong and weak evidence</summary>
                     <div className="grid gap-3 pt-2 md:grid-cols-2">
                        <div>
                           <p className="m-0 mb-1 font-semibold">Strong evidence</p>
                           <Blocks blocks={dimension.strong_evidence} />
                        </div>
                        <div>
                           <p className="m-0 mb-1 font-semibold">Weak evidence</p>
                           <Blocks blocks={dimension.weak_evidence} />
                        </div>
                     </div>
                  </details>
                  <Card title={dimension.stage && isKnownPosition(dimension.stage) ? `Your work · ${STAGE_COPY[dimension.stage].label}` : "Your work"}>
                     {dimension.stage && isKnownPosition(dimension.stage) ? <StageText detail={detail} position={dimension.stage} /> : <p className="m-0 text-body text-muted-foreground">This dimension draws on your whole answer.</p>}
                     <p className="m-0 mt-3">
                        <button type="button" className="min-h-11 text-supporting text-primary underline" onClick={() => go(0)}>
                           Compare your diagram and the reference
                        </button>
                     </p>
                  </Card>
                  <SelfReviewStep
                     key={dimension.dimension_id}
                     dimension={dimension}
                     review={reviews.entry(dimension)}
                     onEdit={(draft) => reviews.edit(dimension, draft)}
                     onSubmit={(mark, note) => void reviews.submit(dimension, mark, note)}
                     onKeepMine={() => void reviews.keepMine(dimension)}
                     onLoadTheirs={() => reviews.loadTheirs(dimension)}
                  />
               </>
            ) : null}

            {step === "summary" ? (
               <>
                  <h1 ref={heading} tabIndex={-1} className={`m-0 ${SERIF} text-title outline-none`}>
                     Summary
                  </h1>
                  {rubric.length > 0 ? (
                     <Card title="Your self-review">
                        <p className="m-0 mb-3 text-supporting text-muted-foreground">Your own marks. No score is calculated.</p>
                        <ul className="m-0 grid gap-2 p-0">
                           {rubric.map((d) => (
                              <li key={d.dimension_id} className="list-none">
                                 <span className="font-semibold">{markOf(d) ? MARK_NAME[markOf(d)!.mark] : "Not marked yet"}</span> · {d.title}
                                 {unsavedOf(d) ? <span className="text-supporting text-muted-foreground"> · Not saved yet</span> : null}
                              </li>
                           ))}
                        </ul>
                     </Card>
                  ) : null}
                  <Card title="Hints and reveals">
                     <History detail={detail} />
                  </Card>
                  <Card title="This attempt">
                     <div className="grid gap-4">
                        <p className="m-0 text-body">Target: {seniority} bar. Practising again starts a new attempt; this one stays as it is.</p>
                        <div className="flex flex-wrap gap-3">
                           {back ? (
                              <Button asChild className="min-h-11">
                                 <Link href={back} prefetch={false}>
                                    Practise again
                                 </Link>
                              </Button>
                           ) : null}
                           <Button asChild variant="outline" className="min-h-11">
                              <Link href="/practice/history" prefetch={false}>
                                 Your attempts
                              </Link>
                           </Button>
                        </div>
                        <AttemptDataControls session={session} attemptId={detail.id} onDeleted={() => router.replace("/practice/history")} />
                     </div>
                  </Card>
               </>
            ) : null}

            <div className="flex flex-wrap justify-between gap-3">
               <Button type="button" variant="outline" className="min-h-11" disabled={at === 0} onClick={() => go(at - 1)}>
                  Back
               </Button>
               {at < steps.length - 1 ? (
                  <Button type="button" className="min-h-11" onClick={() => go(at + 1)}>
                     {steps[at + 1] === "summary" ? "See the summary" : "Next"}
                  </Button>
               ) : null}
            </div>
         </main>
      </div>
   );
}
