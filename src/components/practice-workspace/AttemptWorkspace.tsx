"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useLeaveGuard } from "@/components/prepare/editor/useLeaveGuard";
import { SaveStatus } from "@/components/ui/save-status";
import type { MlSubsection } from "@/lib/practice-workspace/stages";
import { STAGE_COPY, isKnownPosition } from "@/lib/practice-workspace/stages";
import type { AttemptDetailOut, AttemptStatus, Position, StageStatus } from "@/lib/practice-workspace/types";
import { BriefDialog } from "./BriefDialog";
import { StageEditor } from "./StageEditor";
import { StageGuide } from "./StageGuide";
import { StageNav } from "./StageNav";
import { useAttemptWorkspace } from "./useAttemptWorkspace";
import { useStageGuide } from "./useStageGuide";

interface Props {
   detail: AttemptDetailOut;
   /** The Problem's authored ML sub-sections, when the caller knows them; see `stageFields`. The frozen attempt detail does not carry them. */
   mlSubsections?: readonly MlSubsection[];
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

/**
 * The self-guided writing workspace (Design D, written stages): stage navigation, one stage's fields at a time, a quiet guide, the Problem
 * brief and one honest save status. State is in memory only; the server holds the attempt. The diagram editor is T14's and arrives through
 * the slot in `StageEditor`.
 */
export function AttemptWorkspace({ detail, mlSubsections }: Props) {
   const workspace = useAttemptWorkspace(detail);
   const { engines, snapshots, positions, status, summary, pending, settle, end } = workspace;
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

         <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,44rem)_minmax(16rem,20rem)] lg:justify-center lg:gap-14">
            <main className="min-w-0">
               <StageEditor
                  key={active}
                  ref={heading}
                  attemptId={detail.id}
                  position={active}
                  index={index}
                  total={positions.length}
                  engine={engine}
                  readOnly={status !== "active"}
                  mlSubsections={mlSubsections}
                  previous={index > 0 ? positions[index - 1] : null}
                  next={index < positions.length - 1 ? positions[index + 1] : null}
                  onGo={go}
               />
            </main>
            <div className="min-w-0 lg:border-l lg:border-border lg:pl-8">
               <p className="m-0 mb-4 text-supporting font-semibold tracking-wide text-muted-foreground uppercase">{STAGE_COPY[active].label}</p>
               <StageGuide position={active} challenge={detail.challenge} guide={guide} readOnly={status !== "active"} ownQuestionsSaved={ownQuestions} />
            </div>
         </div>
      </div>
   );
}
