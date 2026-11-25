"use client";

import { useCallback, useRef, useState } from "react";
import type { PracticeResult } from "@/lib/practice-workspace/client";
import type { AttemptDetailOut, HistoryEventOut, Position } from "@/lib/practice-workspace/types";
import { usePracticeSession } from "./practiceSession";

export interface GuideNotice {
   scope: string;
   message: string;
}

export interface RevealedAnswer {
   title: string;
   answer: string;
}

export const MAX_EVENT_TEXT = 4000;

/**
 * The learner's authored-material actions for one attempt: revealing a clarification answer, asking for the next authored hint,
 * recording an assumption. Every answer comes from the server (nothing is generated or kept here beyond what the server returned),
 * a repeated reveal changes nothing on screen, and an action in flight is not started twice.
 */
export function useStageGuide(initial: AttemptDetailOut, onEnded: () => void) {
   const { client, signal } = usePracticeSession();
   const [revealed, setRevealed] = useState<ReadonlyMap<string, RevealedAnswer>>(() => new Map(initial.revealed_clarifications.map((item) => [item.clarification_id, { title: item.title, answer: item.answer }])));
   const [hints, setHints] = useState<readonly HistoryEventOut[]>(() => initial.history.filter((event) => event.kind === "hint_authored"));
   const [assumptions, setAssumptions] = useState<readonly { id: string; position: Position | null; text: string }[]>(() =>
      initial.history.filter((event) => event.kind === "assumption_declared").map((event) => ({ id: event.event_id, position: event.position, text: event.text }))
   );
   const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
   const [notice, setNotice] = useState<GuideNotice | null>(null);
   const inflight = useRef(new Set<string>());

   const run = useCallback(
      async <T,>(key: string, scope: string, unavailable: string, call: () => Promise<PracticeResult<T>>): Promise<T | null> => {
         if (inflight.current.has(key)) return null;
         inflight.current.add(key);
         setBusy(new Set(inflight.current));
         setNotice(null);
         try {
            const result = await call();
            if (signal.aborted) return null;
            if (result.status === "ok") return result.data;
            if (result.status === "failed" && result.code === "attempt_not_active") {
               setNotice({ scope, message: "This attempt has ended, so nothing more can be added." });
               onEnded();
            } else if (result.status === "unauthenticated") setNotice({ scope, message: "Your session has ended. Sign in again to continue." });
            else if (result.status === "failed" && result.code === "stage_not_available") setNotice({ scope, message: "There is nothing more to show here." });
            else if (!(result.status === "unavailable" && result.cause === "aborted")) setNotice({ scope, message: unavailable });
            return null;
         } finally {
            inflight.current.delete(key);
            if (!signal.aborted) setBusy(new Set(inflight.current));
         }
      },
      [signal, onEnded]
   );

   const reveal = useCallback(
      async (clarificationId: string) => {
         if (revealed.has(clarificationId)) return;
         const data = await run(`clarification:${clarificationId}`, `clarification:${clarificationId}`, "We could not load that answer. Try again.", () => client.revealClarification(initial.id, clarificationId, { signal }));
         // Keyed by clarification: a repeat (the server says `already_revealed`) lands on the same entry, so history never doubles.
         if (data) setRevealed((current) => new Map(current).set(data.clarification_id, { title: data.title, answer: data.answer }));
      },
      [client, initial.id, revealed, run, signal]
   );

   const hint = useCallback(
      async (position: Position) => {
         const data = await run(`hint:${position}`, `hint:${position}`, "We could not load the hint. Try again.", () => client.stageHint(initial.id, position, { signal }));
         if (data) {
            const event: HistoryEventOut = { event_id: data.event_id, seq: Number.MAX_SAFE_INTEGER, position: data.position, kind: "hint_authored", text: data.text, created_at: "" };
            setHints((current) => (current.some((item) => item.event_id === data.event_id) ? current : [...current, event]));
         }
      },
      [client, initial.id, run, signal]
   );

   const declare = useCallback(
      async (position: Position, text: string): Promise<boolean> => {
         const trimmed = text.trim();
         if (!trimmed || trimmed.length > MAX_EVENT_TEXT) return false;
         const data = await run("assumption", "assumption", "We could not record that. Your text is still here; try again.", () => client.addAssumption(initial.id, { position, text: trimmed }, { signal }));
         if (!data) return false;
         setAssumptions((current) => [...current, { id: data.event_id, position, text: trimmed }]);
         return true;
      },
      [client, initial.id, run, signal]
   );

   return { revealed, hints, assumptions, busy, notice, reveal, hint, declare };
}
