"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AutosaveSnapshot } from "@/lib/practice-workspace/autosave";
import { createStageEngine, type StageDraft, type StageEngine } from "@/lib/practice-workspace/stageSave";
import { isKnownPosition } from "@/lib/practice-workspace/stages";
import type { AttemptDetailOut, AttemptStatus, Position, StageWorkOut } from "@/lib/practice-workspace/types";
import { usePracticeSession } from "./practiceSession";
import { summarizeSaves, type SaveSummary } from "./saveSummary";

export interface AttemptWorkspaceState {
   /** The stage positions this attempt presents, in the order the backend gave (`AttemptOut.spine`); never added to, renamed or reordered. */
   positions: Position[];
   /** Null for one render, until the engines exist (they are created in an effect, which a session change disposes). */
   engines: ReadonlyMap<Position, StageEngine> | null;
   snapshots: ReadonlyMap<Position, AutosaveSnapshot<StageDraft, StageWorkOut>> | null;
   /** The attempt status the server last reported. */
   status: AttemptStatus;
   summary: SaveSummary;
   /** Something would be lost by leaving: unsaved text, a write in the air, or text a refusal keeps only here. */
   pending: boolean;
   settle: () => Promise<boolean>;
   /** Some other action found the attempt no longer active: stop every write and read the canonical status. */
   end: () => void;
}

/**
 * The workspace's save state: one autosave engine per presented stage, created for this session and disposed with it. Engines
 * live here, above the stage being shown, so moving between stages never drops pending work. When any write learns the
 * attempt is no longer active, every engine stops and the attempt is read again for its canonical status.
 */
export function useAttemptWorkspace(initial: AttemptDetailOut): AttemptWorkspaceState {
   const { client, signal } = usePracticeSession();
   const [engines, setEngines] = useState<ReadonlyMap<Position, StageEngine> | null>(null);
   const [status, setStatus] = useState<AttemptStatus>(initial.status);
   const tick = useRef(0);
   // The engines belong to the attempt as first read; a parent that re-renders with a new object must not throw unsaved text away.
   const first = useRef(initial);

   const positions = initial.spine.filter(isKnownPosition).filter((position) => initial.stage_work.some((stage) => stage.position === position));

   useEffect(() => {
      const created = new Map<Position, StageEngine>();
      let ending = false;
      const ended = () => {
         if (ending) return;
         ending = true;
         for (const engine of created.values()) engine.halt();
         void client.getAttempt(first.current.id, { signal }).then((result) => {
            if (result.status === "ok" && !signal.aborted) setStatus(result.data.status);
            // Not read: the engines are stopped regardless, and the status stays what it was until the learner reloads.
         });
      };
      for (const stage of first.current.stage_work) {
         if (isKnownPosition(stage.position)) created.set(stage.position, createStageEngine(client, first.current.id, stage, ended));
      }
      setEngines(created);
      return () => {
         for (const engine of created.values()) engine.dispose();
         setEngines(null);
      };
   }, [client, signal]);

   const subscribe = useCallback(
      (notify: () => void) => {
         if (!engines) return () => undefined;
         const offs = [...engines.values()].map((engine) =>
            engine.subscribe(() => {
               tick.current += 1;
               notify();
            })
         );
         return () => offs.forEach((off) => off());
      },
      [engines]
   );
   useSyncExternalStore(subscribe, () => tick.current, () => 0);

   const snapshots = engines ? new Map([...engines].map(([position, engine]) => [position, engine.getSnapshot()] as const)) : null;
   const summary = snapshots ? summarizeSaves(snapshots) : { state: "idle" as const, troubled: [] };
   const pending = engines ? [...engines.values()].some((engine) => engine.hasPendingWork) : false;

   const settle = useCallback(async () => {
      if (!engines) return true;
      return (await Promise.all([...engines.values()].map((engine) => engine.settle()))).every(Boolean);
   }, [engines]);

   const end = useCallback(() => {
      // Any engine's halt reports once for all of them (`ended` above); an attempt with no engine has nothing to stop.
      [...(engines?.values() ?? [])][0]?.halt();
   }, [engines]);

   return { positions, engines, snapshots, status, summary, pending, settle, end };
}
