"use client";

import { useCallback, useRef, useState } from "react";
import { newIdempotencyKey, type PracticeResult } from "@/lib/practice-workspace/client";
import type { Position, SubmitIn } from "@/lib/practice-workspace/types";
import { usePracticeSession } from "./practiceSession";
import type { AttemptWorkspaceState } from "./useAttemptWorkspace";

export type FinishAction = "submit" | "reveal" | "abandon";

/**
 * Where ending the attempt stands. `working` and `unknown` lock the workspace: no edit may change what a retried request
 * means. `unknown` keeps the same idempotency key and body, so "check again" can never submit twice; `conflict` means
 * another device saved newer work, and the learner chooses to load it.
 */
export type FinishState =
   | { kind: "idle" }
   | { kind: "working"; action: FinishAction }
   | { kind: "blocked"; reason: "unsaved" | "diagram_loading" | "diagram_failed" }
   | { kind: "unknown"; action: FinishAction }
   | { kind: "conflict" }
   | { kind: "failed"; action: FinishAction; signedOut: boolean };

type Pending = { action: FinishAction; body?: SubmitIn; key?: string };

/**
 * Submit, reveal and abandon over the existing workspace (T13 engines, T14 diagram, the attempt-level terminal latch). The backend
 * decides: nothing is shown as ended until it answers, and then `end()` halts every engine and `onEnded` reads the canonical attempt.
 */
export function useFinish(attemptId: string, workspace: Pick<AttemptWorkspaceState, "settle" | "end" | "diagram" | "positions" | "engines">, onEnded: () => void) {
   const { client, signal } = usePracticeSession();
   const [state, setState] = useState<FinishState>({ kind: "idle" });
   const pending = useRef<Pending | null>(null);

   const send = useCallback(
      async (job: Pending) => {
         pending.current = job;
         setState({ kind: "working", action: job.action });
         let result: PracticeResult<unknown>;
         if (job.action === "submit") result = await client.submitAttempt(attemptId, job.body!, job.key!, { signal });
         else if (job.action === "reveal") result = await client.revealAttempt(attemptId, { confirm: true }, { signal });
         else result = await client.abandonAttempt(attemptId, { signal });
         if (signal.aborted || (result.status === "unavailable" && result.cause === "aborted")) return;
         const ended = result.status === "ok" || (result.status === "failed" && result.code === "attempt_not_active");
         if (ended) {
            pending.current = null;
            workspace.end();
            return onEnded();
         }
         if (result.status === "unavailable") return setState({ kind: "unknown", action: job.action });
         pending.current = null;
         if (result.status === "failed" && result.code === "version_conflict") return setState({ kind: "conflict" });
         setState({ kind: "failed", action: job.action, signedOut: result.status === "unauthenticated" });
      },
      [client, signal, attemptId, workspace, onEnded]
   );

   const start = useCallback(
      async (action: FinishAction) => {
         const { diagram, engines, positions } = workspace;
         if (diagram.kind !== "ready") return setState({ kind: "blocked", reason: diagram.kind === "loading" ? "diagram_loading" : "diagram_failed" });
         setState({ kind: "working", action });
         // Every draft must be on the server first; otherwise ending the attempt would drop work the learner sees.
         if (!(await workspace.settle()) || !engines) return setState({ kind: "blocked", reason: "unsaved" });
         if (signal.aborted) return;
         if (action !== "submit") return send({ action });
         const stage_versions: Partial<Record<Position, number>> = {};
         for (const position of positions) stage_versions[position] = engines.get(position)!.getSnapshot().saved.version;
         // The versions the server last acknowledged, never one the client made up (T14 handoff).
         const body: SubmitIn = { diagram_version: diagram.engine.getSnapshot().saved.version, stage_versions };
         return send({ action, body, key: newIdempotencyKey() });
      },
      [workspace, signal, send]
   );

   /** After an unknown outcome: the same request again, same key and body, so the server answers with what really happened. */
   const checkAgain = useCallback(() => {
      if (pending.current) void send(pending.current);
   }, [send]);

   const dismiss = useCallback(() => setState({ kind: "idle" }), []);
   const locked = state.kind === "working" || state.kind === "unknown";
   return { state, start, checkAgain, dismiss, locked };
}
