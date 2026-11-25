"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { exportFileName, saveExport, type SaveOutcome } from "@/lib/practice-workspace/exportFile";
import { PRACTICE_DELETE_COPY, PRACTICE_EXPORT_COPY } from "@/lib/practice-terms";
import { ConfirmDialog } from "./ConfirmDialog";
import type { PracticeSession } from "./practiceSession";

type ExportState = { kind: "idle" } | { kind: "running" } | { kind: "done"; outcome: SaveOutcome };
type DeleteState = "idle" | "confirming" | "deleting" | "unconfirmed" | "failed";

/** The in-memory export fallback reached its bound (`MAX_BUFFERED_EXPORT_BYTES`): nothing was saved, and per-attempt export is offered. */
export const EXPORT_TOO_LARGE = "This export is too large for this browser to save in one go, so it stopped and nothing was saved. Export one attempt at a time instead.";

function exportMessage(outcome: SaveOutcome): string | null {
   if (outcome.kind === "complete") return PRACTICE_EXPORT_COPY.complete;
   if (outcome.kind === "incomplete" && outcome.reason === "too_large") return EXPORT_TOO_LARGE;
   if (outcome.kind === "cancelled") return null;
   if (outcome.kind === "failed") return outcome.result.status === "unauthenticated" ? "Your session has ended. Sign in again to export." : PRACTICE_EXPORT_COPY.failed;
   return PRACTICE_EXPORT_COPY.incomplete;
}

/** Export with incremental validation; a cut or mismatched stream is reported as incomplete and never saved as whole. */
function useExport(session: PracticeSession, attemptId?: string) {
   const [state, setState] = useState<ExportState>({ kind: "idle" });
   const run = useCallback(async () => {
      setState({ kind: "running" });
      const outcome = await saveExport(() => session.client.openExport(attemptId, { signal: session.signal }), exportFileName(attemptId), session.signal);
      if (!session.signal.aborted) setState({ kind: "done", outcome });
   }, [session, attemptId]);
   return { state, run };
}

/**
 * Delete with an explicit confirmation. "Deleted" is shown only after the server's 204 (or a 404 for a repeat, meaning it is
 * already gone); a lost answer is "not confirmed" with a retry, never a success. The session's signal ends it on sign-out.
 */
function useDelete(remove: () => Promise<{ status: string }>, onDeleted: () => void, signal: AbortSignal) {
   const [state, setState] = useState<DeleteState>("idle");
   const confirm = useCallback(async () => {
      setState("deleting");
      const result = await remove();
      if (signal.aborted) return;
      if (result.status === "ok" || result.status === "notFound") {
         setState("idle");
         onDeleted();
      } else setState(result.status === "unavailable" ? "unconfirmed" : "failed");
   }, [remove, onDeleted, signal]);
   return { state, setState, confirm };
}

function DeleteNotice({ state, onRetry }: { state: DeleteState; onRetry: () => void }) {
   if (state !== "unconfirmed" && state !== "failed") return null;
   return (
      <div role="alert" className="grid gap-2 rounded-lg border border-border bg-surface p-3 text-body">
         <p className="m-0">{state === "unconfirmed" ? "We could not confirm the deletion, so it is not shown as done. Check again to find out." : "Nothing was deleted. Try again."}</p>
         <div>
            <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
               {state === "unconfirmed" ? "Check again" : "Try again"}
            </Button>
         </div>
      </div>
   );
}

function ExportNotice({ state }: { state: ExportState }) {
   const message = state.kind === "done" ? exportMessage(state.outcome) : null;
   return (
      <p role="status" aria-live="polite" className="m-0 min-h-5 text-supporting text-muted-foreground">
         {state.kind === "running" ? "Exporting…" : message}
      </p>
   );
}

/** Export all and delete all practice data. Usable outside the practice gate with any `PracticeSession` (T17's privacy page). */
export function PracticeDataControls({ session, onDeletedAll }: { session: PracticeSession; onDeletedAll?: () => void }) {
   const exporter = useExport(session);
   const [deleted, setDeleted] = useState(false);
   const removeAll = useCallback(() => session.client.deleteAll({ signal: session.signal }), [session]);
   const done = useCallback(() => {
      setDeleted(true);
      onDeletedAll?.();
   }, [onDeletedAll]);
   const deleter = useDelete(removeAll, done, session.signal);
   const copy = PRACTICE_DELETE_COPY.all;
   return (
      <section aria-labelledby="practice-data-controls" className="grid gap-3">
         <h2 id="practice-data-controls" className="m-0 text-subsection">
            Your practice data
         </h2>
         <p className="m-0 text-supporting text-muted-foreground">{PRACTICE_EXPORT_COPY.perAttemptFallback}</p>
         <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" className="min-h-11" disabled={exporter.state.kind === "running"} onClick={() => void exporter.run()}>
               Export all practice data
            </Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={deleter.state === "deleting"} onClick={() => deleter.setState("confirming")}>
               {copy.confirm}
            </Button>
         </div>
         <ExportNotice state={exporter.state} />
         {deleted ? (
            <p role="status" className="m-0 text-body">
               {copy.done}
            </p>
         ) : null}
         <DeleteNotice state={deleter.state} onRetry={() => void deleter.confirm()} />
         <ConfirmDialog
            open={deleter.state === "confirming" || deleter.state === "deleting"}
            onOpenChange={(open) => deleter.setState(open ? "confirming" : "idle")}
            title={copy.title}
            confirm={copy.confirm}
            cancel={copy.cancel}
            busy={deleter.state === "deleting"}
            destructive
            onConfirm={() => void deleter.confirm()}
         >
            <p className="m-0">{copy.body}</p>
         </ConfirmDialog>
      </section>
   );
}

/** Export and delete for one attempt (the review screen and the history list). */
export function AttemptDataControls({ session, attemptId, onDeleted }: { session: PracticeSession; attemptId: string; onDeleted: () => void }) {
   const exporter = useExport(session, attemptId);
   const remove = useCallback(() => session.client.deleteAttempt(attemptId, { signal: session.signal }), [session, attemptId]);
   const deleter = useDelete(remove, onDeleted, session.signal);
   const copy = PRACTICE_DELETE_COPY.attempt;
   return (
      <div className="grid gap-2">
         <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" className="min-h-11" disabled={exporter.state.kind === "running"} onClick={() => void exporter.run()}>
               Export this attempt
            </Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={deleter.state === "deleting"} onClick={() => deleter.setState("confirming")}>
               Delete this attempt
            </Button>
         </div>
         <ExportNotice state={exporter.state} />
         <DeleteNotice state={deleter.state} onRetry={() => void deleter.confirm()} />
         <ConfirmDialog
            open={deleter.state === "confirming" || deleter.state === "deleting"}
            onOpenChange={(open) => deleter.setState(open ? "confirming" : "idle")}
            title={copy.title}
            confirm={copy.confirm}
            cancel={copy.cancel}
            busy={deleter.state === "deleting"}
            destructive
            onConfirm={() => void deleter.confirm()}
         >
            <p className="m-0">{copy.body}</p>
         </ConfirmDialog>
      </div>
   );
}
