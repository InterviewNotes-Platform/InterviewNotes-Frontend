"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createDiagramEngine, type DiagramEngine, type Refusal } from "@/lib/practice-graph/diagramSave";
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
   /** The attempt's one diagram (T14): loading, unreadable (with a retry), or its autosave engine and the server's last refusal. */
   diagram: DiagramState;
}

export type DiagramState = { kind: "loading" } | { kind: "failed"; retry: () => void } | { kind: "ready"; engine: DiagramEngine; refusal: Refusal | null };

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

   const [diagramEngine, setDiagramEngine] = useState<DiagramEngine | null>(null);
   const [diagramFailed, setDiagramFailed] = useState(false);
   const [diagramTries, setDiagramTries] = useState(0);
   const [refusal, setRefusal] = useState<Refusal | null>(null);
   // Shared by the stage engines and the diagram engine: whichever learns first that the attempt ended stops them all, once.
   const endAll = useRef<() => void>(() => undefined);
   const diagramRef = useRef<DiagramEngine | null>(null);
   // Attempt-level and never cleared: this hook serves one attempt for one session (a new user remounts the screen), so once
   // the attempt is known to have ended, every engine made later starts halted, whatever the status read returns.
   const terminal = useRef(false);

   useEffect(() => {
      const created = new Map<Position, StageEngine>();
      const ended = () => {
         if (terminal.current) return;
         terminal.current = true;
         for (const engine of created.values()) engine.halt();
         diagramRef.current?.halt();
         void client.getAttempt(first.current.id, { signal }).then((result) => {
            if (result.status === "ok" && !signal.aborted) setStatus(result.data.status);
            // Not read: the engines are stopped regardless, and the status stays what it was until the learner reloads.
         });
      };
      for (const stage of first.current.stage_work) {
         if (isKnownPosition(stage.position)) created.set(stage.position, createStageEngine(client, first.current.id, stage, ended));
      }
      if (terminal.current) for (const engine of created.values()) engine.halt();
      setEngines(created);
      endAll.current = ended;
      return () => {
         for (const engine of created.values()) engine.dispose();
         setEngines(null);
         endAll.current = () => undefined;
      };
   }, [client, signal]);

   // One diagram resource per attempt, read from the server; it lives here, above every stage, so switching stages never drops it.
   useEffect(() => {
      let current = true;
      let engine: DiagramEngine | null = null;
      void client.getDiagram(first.current.id, { signal }).then((result) => {
         if (!current || signal.aborted) return;
         if (result.status !== "ok") return setDiagramFailed(true);
         engine = createDiagramEngine(client, first.current.id, result.data, (r) => current && setRefusal(r), () => endAll.current());
         diagramRef.current = engine;
         // A read that lands after the attempt ended (or a retried one) must not reopen it: the saved graph stays readable, never writable.
         if (terminal.current) engine.halt();
         setDiagramEngine(engine);
      });
      return () => {
         current = false;
         engine?.dispose();
         diagramRef.current = null;
         setDiagramEngine(null);
         setRefusal(null);
      };
   }, [client, signal, diagramTries]);

   const subscribe = useCallback(
      (notify: () => void) => {
         const all: { subscribe: (listener: () => void) => () => void }[] = [...(engines?.values() ?? []), ...(diagramEngine ? [diagramEngine] : [])];
         const offs = all.map((engine) =>
            engine.subscribe(() => {
               tick.current += 1;
               notify();
            })
         );
         return () => offs.forEach((off) => off());
      },
      [engines, diagramEngine]
   );
   useSyncExternalStore(subscribe, () => tick.current, () => 0);

   const snapshots = engines ? new Map([...engines].map(([position, engine]) => [position, engine.getSnapshot()] as const)) : null;
   const diagramSnapshot = diagramEngine?.getSnapshot() ?? null;
   const summary = snapshots ? summarizeSaves(snapshots, diagramSnapshot) : { state: "idle" as const, troubled: [] };
   const pending = (engines ? [...engines.values()].some((engine) => engine.hasPendingWork) : false) || Boolean(diagramEngine?.hasPendingWork);

   const settle = useCallback(async () => {
      const all: { settle: () => Promise<boolean> }[] = [...(engines?.values() ?? []), ...(diagramEngine ? [diagramEngine] : [])];
      return (await Promise.all(all.map((engine) => engine.settle()))).every(Boolean);
   }, [engines, diagramEngine]);

   const end = useCallback(() => {
      // Stops every engine and reads the status once (`ended` above); the latch also holds when no engine exists yet.
      endAll.current();
      terminal.current = true;
   }, []);

   const retryDiagram = useCallback(() => {
      setDiagramFailed(false);
      setDiagramTries((n) => n + 1);
   }, []);
   const diagram: DiagramState = diagramEngine ? { kind: "ready", engine: diagramEngine, refusal } : diagramFailed ? { kind: "failed", retry: retryDiagram } : { kind: "loading" };

   return { positions, engines, snapshots, status, summary, pending, settle, end, diagram };
}
