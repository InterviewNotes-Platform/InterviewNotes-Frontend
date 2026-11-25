"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Network, X } from "lucide-react";
import { DiagramEditorLoader } from "@/components/practice-graph/DiagramEditorLoader";
import { Button } from "@/components/ui/button";
import { useLeaveGuard } from "@/components/prepare/editor/useLeaveGuard";
import { SaveStatus } from "@/components/ui/save-status";
import type { MlSubsection } from "@/lib/practice-workspace/stages";
import { STAGE_COPY, isKnownPosition } from "@/lib/practice-workspace/stages";
import type { AttemptDetailOut, AttemptStatus, Position, StageStatus } from "@/lib/practice-workspace/types";
import { BriefDialog } from "./BriefDialog";
import { FinishDialog } from "./FinishDialog";
import { StageEditor } from "./StageEditor";
import { StageGuide } from "./StageGuide";
import { StageNav } from "./StageNav";
import { useAttemptWorkspace, type DiagramState } from "./useAttemptWorkspace";
import { useFinish } from "./useFinish";
import { useStageGuide } from "./useStageGuide";

interface Props {
   detail: AttemptDetailOut;
   /** The Problem's authored ML sub-sections, when the caller knows them; see `stageFields`. The frozen attempt detail does not carry them. */
   mlSubsections?: readonly MlSubsection[];
   /** The attempt ended here (submit, reveal, abandon): read it again and show its canonical state. */
   onEnded?: () => void;
   /** Read the attempt again from the server (after a submit conflict, the learner's choice). */
   onReload?: () => void;
}

const ENDED: Partial<Record<AttemptStatus, string>> = {
   submitted: "This attempt was submitted. Your work is shown here as you left it and can no longer be changed.",
   evaluating: "This attempt was submitted. Your work is shown here as you left it and can no longer be changed.",
   evaluated: "This attempt was submitted. Your work is shown here as you left it and can no longer be changed.",
   evaluation_failed: "This attempt was submitted. Your work is shown here as you left it and can no longer be changed.",
   ended_by_reveal: "You revealed the reference, so this attempt has ended. Your work is shown here as you left it and can no longer be changed.",
   abandoned: "This attempt was abandoned. Your work is shown here as you left it and can no longer be changed.",
};

/** The Problem's own reader page, from its content ID (`problem.<slug>`); null for anything else, so no link is invented. */
const readerHref = (contentId: string) => (/^problem\.[a-z0-9][a-z0-9._-]*$/.test(contentId) ? `/problems/${contentId.slice("problem.".length)}` : null);

/** The stage to open when the learner returns: the first one not done or skipped, else the last. Read from the saved state the server returned. */
function resumeStage(positions: readonly Position[], statuses: ReadonlyMap<Position, StageStatus>): Position {
   return positions.find((position) => {
      const status = statuses.get(position);
      return status !== "done" && status !== "skipped";
   }) ?? positions[positions.length - 1];
}

/** The one diagram of the attempt, wherever it is shown: loading, a retry when it could not be read, or the editor. */
function DiagramArea({ diagram, readOnly, variant }: { diagram: DiagramState; readOnly: boolean; variant: "design" | "split" }) {
   if (diagram.kind === "loading") {
      return (
         <p role="status" className="py-12 text-center text-body text-muted-foreground">
            Loading your diagram…
         </p>
      );
   }
   if (diagram.kind === "failed") {
      return (
         <div role="alert" className="grid justify-items-center gap-3 rounded-lg bg-surface px-6 py-10 text-center">
            <p className="m-0 text-body text-muted-foreground">We could not load your diagram. Your written work is not affected.</p>
            <Button type="button" className="min-h-11" onClick={diagram.retry}>
               Try again
            </Button>
         </div>
      );
   }
   return <DiagramEditorLoader engine={diagram.engine} refusal={diagram.refusal} readOnly={readOnly} variant={variant} />;
}

/**
 * The self-guided writing workspace (Design D, written stages): stage navigation, one stage's fields at a time, a quiet guide, the Problem
 * brief and one honest save status. State is in memory only; the server holds the attempt. The diagram editor is T14's and arrives through
 * the slot in `StageEditor`.
 */
const NOOP = () => undefined;

export function AttemptWorkspace({ detail, mlSubsections: given, onEnded = NOOP, onReload = NOOP }: Props) {
   // A-02: the attempt detail names the authored ML sub-sections; a caller's list (tests) still wins.
   const mlSubsections = given ?? detail.challenge?.stages.find((stage) => stage.position === "ml_reasoning")?.subsections;
   const workspace = useAttemptWorkspace(detail);
   const { engines, snapshots, positions, status, summary, pending, settle, end, diagram } = workspace;
   const finish = useFinish(detail.id, workspace, onEnded);
   // While an ending is in flight or its outcome is unknown, nothing may change what a retry would mean.
   const readOnly = status !== "active" || finish.locked;
   // Later stages may open the same diagram beside their written work (Design D); the choice lasts for this visit only.
   const [split, setSplit] = useState(false);
   const guide = useStageGuide(detail, end);
   // Where the learner resumes is decided once, from the saved state they returned to; marking a stage done must not move them off it.
   const [current, setCurrent] = useState<Position | null>(() => {
      const known = detail.spine.filter(isKnownPosition).filter((position) => detail.stage_work.some((stage) => stage.position === position));
      return known.length > 0 ? resumeStage(known, new Map(detail.stage_work.map((stage) => [stage.position, stage.status] as const))) : null;
   });
   const heading = useRef<HTMLHeadingElement>(null);
   const moved = useRef(false);

   // Warn before the tab closes with work the server does not hold. No request is made on unload: nothing there can be relied on.
   useEffect(() => {
      if (!pending) return;
      const warn = (event: BeforeUnloadEvent) => event.preventDefault();
      window.addEventListener("beforeunload", warn);
      return () => window.removeEventListener("beforeunload", warn);
   }, [pending]);
   const { leaving } = useLeaveGuard({ active: pending, settle });

   const statuses = new Map<Position, StageStatus>();
   if (snapshots) for (const [position, snap] of snapshots) statuses.set(position, snap.draft.status);
   const active = current;

   const go = useCallback((position: Position) => {
      moved.current = true;
      setCurrent(position);
   }, []);
   useEffect(() => {
      if (moved.current) heading.current?.focus();
   }, [current]);

   if (detail.mode !== "self") {
      return <p role="status" className="py-12 text-center text-body text-muted-foreground">This attempt is not a self-guided attempt, so it does not open here.</p>;
   }
   if (!engines || !snapshots || active === null) {
      return (
         <p role="status" className="py-12 text-center text-body text-muted-foreground">
            Loading your attempt…
         </p>
      );
   }

   const index = positions.indexOf(active);
   // The same graph is reachable from every stage after Design, never from the stages before it.
   const designAt = positions.indexOf("design");
   const afterDesign = designAt >= 0 && index > designAt;
   const engine = engines.get(active)!;
   const ended = ENDED[status] ?? null;
   const frame = snapshots.get("frame");
   const ownQuestions = (frame?.saved.fields.clarifying_questions ?? "").trim() !== "";
   const back = readerHref(detail.content_id);

   return (
      <div data-practice-workspace="" className="mx-auto w-full max-w-page px-4 pb-24 md:px-6 lg:px-8">
         <header className="sticky top-0 z-30 -mx-4 grid grid-cols-[minmax(0,1fr)] gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
               <div className="flex min-w-0 items-center gap-3">
                  {back ? (
                     <Link href={back} prefetch={false} className="inline-flex min-h-11 items-center gap-1 text-supporting text-muted-foreground transition-micro hover:text-foreground">
                        <ArrowLeft aria-hidden="true" className="size-4" />
                        <span>The Problem</span>
                     </Link>
                  ) : null}
                  <p className="m-0 truncate font-[family-name:Iowan_Old_Style,Palatino_Linotype,Palatino,Book_Antiqua,Georgia,serif] text-body font-semibold" title={detail.challenge?.title}>
                     {detail.challenge?.title ?? "Practice attempt"}
                  </p>
               </div>
               <div className="flex items-center gap-3">
                  <SaveStatus status={summary.state} message={summary.message} />
                  <BriefDialog challenge={detail.challenge} />
                  {status === "active" ? <FinishDialog positions={positions} statuses={statuses} diagram={diagram} finish={finish} onReload={onReload} /> : null}
               </div>
            </div>
            <StageNav positions={positions} current={active} statuses={statuses} troubled={summary.troubled} onSelect={go} />
         </header>

         {leaving ? (
            <p role="status" className="m-0 mt-3 text-supporting text-muted-foreground">
               Saving before you leave…
            </p>
         ) : null}

         {ended ? (
            <p role="note" className="mt-6 mb-0 rounded-lg border border-border bg-surface p-4 text-body">
               {ended}
            </p>
         ) : null}

         {active === "design" ? (
            <main className="mt-6 grid min-w-0 gap-8">
               <div>
                  <p className="m-0 text-supporting font-semibold tracking-wide text-primary uppercase">
                     Stage {index + 1} of {positions.length}
                  </p>
                  <h1 ref={heading} tabIndex={-1} className="m-0 mt-1 font-[family-name:Iowan_Old_Style,Palatino_Linotype,Palatino,Book_Antiqua,Georgia,serif] text-title outline-none">
                     {STAGE_COPY.design.label}
                  </h1>
                  <p className="m-0 mt-2 text-body text-pretty text-muted-foreground">
                     {STAGE_COPY.design.intent} Draw it on the canvas, or build it in the Outline; <a href="#practice-design-notes" className="underline">written notes</a> are below.
                  </p>
               </div>
               <DiagramArea diagram={diagram} readOnly={readOnly} variant="design" />
               <div id="practice-design-notes" className="grid gap-10 lg:grid-cols-[minmax(0,44rem)_minmax(16rem,20rem)] lg:justify-center lg:gap-14">
                  <StageEditor
                     key={active}
                     asNotes
                     attemptId={detail.id}
                     position={active}
                     index={index}
                     total={positions.length}
                     engine={engine}
                     readOnly={readOnly}
                     mlSubsections={mlSubsections}
                     previous={index > 0 ? positions[index - 1] : null}
                     next={index < positions.length - 1 ? positions[index + 1] : null}
                     onGo={go}
                  />
                  <div className="min-w-0 lg:border-l lg:border-border lg:pl-8">
                     <p className="m-0 mb-4 text-supporting font-semibold tracking-wide text-muted-foreground uppercase">{STAGE_COPY[active].label}</p>
                     <StageGuide position={active} challenge={detail.challenge} guide={guide} readOnly={readOnly} ownQuestionsSaved={ownQuestions} />
                  </div>
               </div>
            </main>
         ) : (
            <div className={split && afterDesign ? "mt-8 grid gap-8 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]" : "mt-8 grid gap-10 lg:grid-cols-[minmax(0,44rem)_minmax(16rem,20rem)] lg:justify-center lg:gap-14"}>
               <main className="min-w-0">
                  {afterDesign ? (
                     <div className="mb-6">
                        <Button type="button" variant="outline" className="min-h-11" aria-expanded={split} onClick={() => setSplit((open) => !open)}>
                           {split ? <X aria-hidden="true" /> : <Network aria-hidden="true" />}
                           {split ? "Done with the diagram" : "Your design"}
                        </Button>
                     </div>
                  ) : null}
                  <StageEditor
                     key={active}
                     ref={heading}
                     attemptId={detail.id}
                     position={active}
                     index={index}
                     total={positions.length}
                     engine={engine}
                     readOnly={readOnly}
                     mlSubsections={mlSubsections}
                     previous={index > 0 ? positions[index - 1] : null}
                     next={index < positions.length - 1 ? positions[index + 1] : null}
                     onGo={go}
                  />
               </main>
               {split && afterDesign ? (
                  <section aria-label="Your design" className="min-w-0">
                     <DiagramArea diagram={diagram} readOnly={readOnly} variant="split" />
                  </section>
               ) : (
                  <div className="min-w-0 lg:border-l lg:border-border lg:pl-8">
                     <p className="m-0 mb-4 text-supporting font-semibold tracking-wide text-muted-foreground uppercase">{STAGE_COPY[active].label}</p>
                     <StageGuide position={active} challenge={detail.challenge} guide={guide} readOnly={readOnly} ownQuestionsSaved={ownQuestions} />
                  </div>
               )}
            </div>
         )}
      </div>
   );
}
