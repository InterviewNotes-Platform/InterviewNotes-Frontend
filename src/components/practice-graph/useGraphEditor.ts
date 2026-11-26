"use client";

import { useCallback, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import type { DiagramEngine } from "@/lib/practice-graph/diagramSave";
import { GraphHistory } from "@/lib/practice-graph/history";
import type { DiagramDraft, Op } from "@/lib/practice-graph/model";
import { boundaryName, EDGE_KIND_LABEL, nodeName } from "@/lib/practice-graph/vocabulary";

export type Selection = { kind: "node" | "edge" | "boundary"; id: string } | null;

export interface ApplyOptions<T> {
   /** Continues one undo step while it stays the same (one typing run in one field, one nudge run of one component). */
   key?: string;
   announce?: string | ((result: { draft: DiagramDraft } & T) => string);
   select?: (result: { draft: DiagramDraft } & T) => Selection;
}

/**
 * The editor's single source of truth: the draft is the autosave engine's, so the canvas, the Inspector and the Outline can never hold
 * diverging copies. Selection is shared UI state (never saved). History is per engine, so a new session or attempt starts with none.
 */
export function useGraphEditor(engine: DiagramEngine, readOnly: boolean) {
   const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
   // eslint-disable-next-line react-hooks/exhaustive-deps -- one history per engine: a new engine (session, attempt) starts empty
   const history = useMemo(() => new GraphHistory(), [engine]);
   const [, rerender] = useReducer((n: number) => n + 1, 0);
   const [rawSelection, setSelection] = useState<Selection>(null);
   const [announcement, setAnnouncement] = useState("");
   const [shortcuts, setShortcuts] = useState(true);
   const [markers, setMarkers] = useState(true);
   const draft = snapshot.draft;
   const locked = readOnly || snapshot.phase === "terminal";

   const exists = (selection: Selection) =>
      selection !== null &&
      (selection.kind === "node" ? draft.graph.nodes : selection.kind === "edge" ? draft.graph.edges : draft.graph.boundaries).some((e) => e.id === selection.id);
   const selection = exists(rawSelection) ? rawSelection : null;

   const announce = useCallback((message: string) => setAnnouncement((previous) => (previous === message ? `${message} ` : message)), []);

   const apply = useCallback(
      <T extends object>(operation: (draft: DiagramDraft) => Op<T>, options: ApplyOptions<T> = {}): Op<T> => {
         if (locked) {
            announce("This attempt has ended, so the diagram can no longer change.");
            return { ok: false, reason: "locked" };
         }
         // The engine's draft is the one truth; it updates synchronously, so consecutive actions build on each other.
         const before = engine.getSnapshot().draft;
         const result = operation(before);
         if (!result.ok) {
            announce(result.reason);
            return result;
         }
         if (result.draft !== before) {
            history.record(before, options.key);
            engine.edit(() => result.draft);
         }
         if (options.select) setSelection(options.select(result));
         if (options.announce) announce(typeof options.announce === "string" ? options.announce : options.announce(result));
         rerender();
         return result;
      },
      [announce, engine, history, locked],
   );

   const step = useCallback(
      (direction: "undo" | "redo") => {
         if (locked) return;
         const current = engine.getSnapshot().draft;
         const target = direction === "undo" ? history.undo(current) : history.redo(current);
         if (!target) return announce(direction === "undo" ? "Nothing to undo." : "Nothing to redo.");
         engine.edit(() => target);
         announce(direction === "undo" ? "Undone." : "Redone.");
         rerender();
      },
      [announce, engine, history, locked],
   );

   /** The other version replaced this one (Take theirs, Review): earlier steps no longer describe it, so they are dropped. */
   const forgetHistory = useCallback(() => {
      history.clear();
      rerender();
   }, [history]);

   const describe = useCallback(
      (kind: "node" | "edge" | "boundary", id: string): string => {
         const current = engine.getSnapshot().draft;
         const nodeCalled = (nodeId: string) => {
            const node = current.graph.nodes.find((n) => n.id === nodeId);
            return node ? nodeName(node.label, node.type) : "a component";
         };
         if (kind === "node") return nodeCalled(id);
         if (kind === "boundary") {
            const boundary = current.graph.boundaries.find((b) => b.id === id);
            return boundary ? boundaryName(boundary.label, boundary.type) : "a boundary";
         }
         const edge = current.graph.edges.find((e) => e.id === id);
         return edge ? `${EDGE_KIND_LABEL[edge.kind]} from ${nodeCalled(edge.from)} to ${nodeCalled(edge.to)}` : "a connection";
      },
      [engine],
   );

   return {
      engine,
      snapshot,
      draft,
      locked,
      selection,
      select: setSelection,
      apply,
      undo: () => step("undo"),
      redo: () => step("redo"),
      canUndo: !locked && history.canUndo,
      canRedo: !locked && history.canRedo,
      sealHistory: () => history.seal(),
      forgetHistory,
      announcement,
      announce,
      describe,
      shortcuts,
      setShortcuts,
      markers,
      setMarkers,
   };
}

export type GraphEditor = ReturnType<typeof useGraphEditor>;
