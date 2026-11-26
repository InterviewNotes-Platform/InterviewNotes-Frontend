"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDiagramEngine, type DiagramEngine } from "@/lib/practice-graph/diagramSave";
import type { Mark, ReferenceOut, ReferenceRubricOut, SelfReviewOut } from "@/lib/practice-workspace/types";
import { usePracticeSession } from "./practiceSession";

/**
 * What the reference read gave. The reference is read only after the server ended the attempt (submit or reveal), lives in
 * memory only (`no-store`, never storage or a cache) and a failed read never means the submission failed.
 */
export type ReferenceLoad =
   | { kind: "loading" }
   | { kind: "ready"; data: ReferenceOut }
   | { kind: "not_available" }
   | { kind: "withdrawn" }
   | { kind: "entitlement"; retryAfter: number }
   | { kind: "failed"; signedOut: boolean };

export function useReference(attemptId: string, enabled: boolean) {
   const { client, signal } = usePracticeSession();
   const [load, setLoad] = useState<ReferenceLoad>({ kind: "loading" });
   const [tries, setTries] = useState(0);
   useEffect(() => {
      if (!enabled) return;
      let current = true;
      void client.getReference(attemptId, { signal }).then((result) => {
         if (!current || signal.aborted) return;
         if (result.status === "ok") return setLoad({ kind: "ready", data: result.data });
         if (result.status === "failed" && result.code === "reference_not_available") return setLoad({ kind: "not_available" });
         if (result.status === "failed" && result.code === "content_withdrawn") return setLoad({ kind: "withdrawn" });
         if (result.status === "failed" && result.code === "entitlement_unavailable") return setLoad({ kind: "entitlement", retryAfter: result.retryAfterSeconds ?? 5 });
         setLoad({ kind: "failed", signedOut: result.status === "unauthenticated" });
      });
      return () => {
         current = false;
      };
   }, [client, signal, attemptId, enabled, tries]);
   const retry = useCallback(() => {
      setLoad({ kind: "loading" });
      setTries((n) => n + 1);
   }, []);
   return { load, retry };
}

/**
 * The saved diagram, shown read-only. Its engine is halted the moment it exists, so the review can never write (halt is
 * absorbing, T13 v2): an ended attempt's history never restarts autosave.
 */
export function useReadOnlyDiagram(attemptId: string) {
   const { client, signal } = usePracticeSession();
   const [state, setState] = useState<{ kind: "loading" } | { kind: "failed" } | { kind: "ready"; engine: DiagramEngine }>({ kind: "loading" });
   const [tries, setTries] = useState(0);
   useEffect(() => {
      let engine: DiagramEngine | null = null;
      let current = true;
      void client.getDiagram(attemptId, { signal }).then((result) => {
         if (!current || signal.aborted) return;
         if (result.status !== "ok") return setState({ kind: "failed" });
         engine = createDiagramEngine(client, attemptId, result.data, () => undefined);
         engine.halt();
         setState({ kind: "ready", engine });
      });
      return () => {
         current = false;
         engine?.dispose();
      };
   }, [client, signal, attemptId, tries]);
   const retry = useCallback(() => {
      setState({ kind: "loading" });
      setTries((n) => n + 1);
   }, []);
   return { state, retry };
}

export type MarkSave = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "conflict"; currentVersion: number } | { kind: "failed"; reason: "network" | "unavailable" | "signed_out" };

/** What the learner has chosen and typed for one dimension, kept until they save it or explicitly load another version. */
export type SelfReviewDraft = { mark: Mark | null; note: string };
/** One dimension's self-review in this visit: the draft, the last version the server confirmed, and the last save's outcome. */
export type DimensionReview = { draft: SelfReviewDraft; saved: SelfReviewOut | null; save: MarkSave };

/** The note or mark on screen differs from what the server holds. */
export function isUnsaved(review: DimensionReview): boolean {
   return review.draft.note !== (review.saved?.note ?? "") || (review.draft.mark !== null && review.draft.mark !== (review.saved?.mark ?? null));
}

function fromServer(initial: SelfReviewOut | null): DimensionReview {
   return { draft: { mark: initial?.mark ?? null, note: initial?.note ?? "" }, saved: initial, save: { kind: "idle" } };
}

/**
 * Every dimension's self-review for one attempt, held above the guided steps so moving between steps never drops a note: the
 * learner's mark and note, saved with compare-and-set (`version`). Drafts live in memory only (never browser storage) and are
 * scoped to this attempt and this session's user; a different user or attempt starts from nothing.
 *
 * A save's reply is applied even after the learner has moved to another step (so the next save sends the newer version), but it
 * only ever updates what the server holds, never the draft: text typed while a save was pending stays on screen and stays
 * unsaved. A reply to an older request for the same dimension, or one from before an explicit reload, is dropped. A conflict
 * keeps the learner's draft and offers keep-mine (send again over the newer version) or load-theirs; nothing is guessed.
 */
export function useSelfReviews(attemptId: string, reload: () => void) {
   const { client, signal, owner } = usePracticeSession();
   const scope = `${owner ?? ""}:${attemptId}`;
   const [state, setState] = useState<{ scope: string; byDimension: Readonly<Record<string, DimensionReview>> }>({ scope, byDimension: {} });
   const sent = useRef<Record<string, number>>({});
   let byDimension = state.byDimension;
   if (state.scope !== scope) {
      // A different user or attempt: no draft of the previous one survives (session isolation, P9-T13).
      byDimension = {};
      setState({ scope, byDimension });
   }

   const entry = useCallback((dimension: ReferenceRubricOut): DimensionReview => byDimension[dimension.dimension_id] ?? fromServer(dimension.self_review), [byDimension]);

   const update = useCallback(
      (forScope: string, dimension: ReferenceRubricOut, change: (now: DimensionReview) => DimensionReview) =>
         setState((now) => (now.scope !== forScope ? now : { scope: now.scope, byDimension: { ...now.byDimension, [dimension.dimension_id]: change(now.byDimension[dimension.dimension_id] ?? fromServer(dimension.self_review)) } })),
      []
   );

   const edit = useCallback((dimension: ReferenceRubricOut, draft: Partial<SelfReviewDraft>) => update(scope, dimension, (now) => ({ ...now, draft: { ...now.draft, ...draft } })), [update, scope]);

   const put = useCallback(
      async (dimension: ReferenceRubricOut, mark: Mark, note: string, version: number) => {
         const id = dimension.dimension_id;
         const ticket = (sent.current[id] ?? 0) + 1;
         sent.current[id] = ticket;
         const forScope = scope;
         update(forScope, dimension, (now) => ({ ...now, save: { kind: "saving" } }));
         const result = await client.putSelfReview(attemptId, id, { version, mark, note: note.trim() === "" ? null : note }, { signal });
         if (signal.aborted || sent.current[id] !== ticket) return;
         let save: MarkSave;
         if (result.status === "ok") save = { kind: "saved" };
         else if (result.status === "failed" && result.code === "version_conflict") save = { kind: "conflict", currentVersion: result.currentVersion ?? 0 };
         else if (result.status === "unauthenticated") save = { kind: "failed", reason: "signed_out" };
         else save = { kind: "failed", reason: result.status === "unavailable" ? "network" : "unavailable" };
         update(forScope, dimension, (now) => ({ ...now, saved: result.status === "ok" ? result.data : now.saved, save }));
      },
      [client, signal, attemptId, scope, update]
   );

   /** Saves the given mark and note over the version this visit last confirmed. */
   const submit = useCallback(
      (dimension: ReferenceRubricOut, mark: Mark, note: string) => {
         update(scope, dimension, (now) => ({ ...now, draft: { mark, note } }));
         return put(dimension, mark, note, entry(dimension).saved?.version ?? 0);
      },
      [put, update, scope, entry]
   );
   const keepMine = useCallback(
      (dimension: ReferenceRubricOut) => {
         const now = entry(dimension);
         if (now.save.kind !== "conflict" || now.draft.mark === null) return undefined;
         return put(dimension, now.draft.mark, now.draft.note, now.save.currentVersion);
      },
      [put, entry]
   );

   /**
    * Reads the reference again. Explicit: the dimension whose other version was asked for drops its draft and any reply still in
    * flight. Every other dimension keeps an unsaved draft or a pending save (its reply still lands); a clean one is dropped, so the
    * new read shows what the server holds now.
    */
   const loadTheirs = useCallback(
      (dimension: ReferenceRubricOut) => {
         const id = dimension.dimension_id;
         sent.current[id] = (sent.current[id] ?? 0) + 1;
         setState((now) => {
            if (now.scope !== scope) return now;
            const kept: Record<string, DimensionReview> = {};
            for (const [other, review] of Object.entries(now.byDimension)) {
               if (other !== id && (isUnsaved(review) || review.save.kind === "saving")) kept[other] = review;
            }
            return { scope: now.scope, byDimension: kept };
         });
         reload();
      },
      [reload, scope]
   );

   const anyUnsaved = Object.values(byDimension).some((review) => isUnsaved(review) || review.save.kind === "saving");
   return { entry, edit, submit, keepMine, loadTheirs, anyUnsaved };
}
