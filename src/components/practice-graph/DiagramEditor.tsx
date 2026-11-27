"use client";

import "@xyflow/react/dist/style.css";
import "./editor.css";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { Link2, Redo2, Undo2 } from "lucide-react";
import type { DiagramEngine, Refusal } from "@/lib/practice-graph/diagramSave";
import { framesOf, freeSpot } from "@/lib/practice-graph/layout";
import { addEdge, addNode, deleteEdge, deleteNode, deleteBoundary, deletionGroupSize, duplicateNode } from "@/lib/practice-graph/model";
import { LIMITS, NODE_TYPE, NODE_TYPE_ORDER, addLabel, withArticle } from "@/lib/practice-graph/vocabulary";
import type { NodeType } from "@/lib/practice-workspace/types";
import { cn } from "@/lib/utils";
import { CanvasView } from "./CanvasView";
import { Silhouette } from "./shapes";
import { ConnectPicker } from "./ConnectPicker";
import { DiagramTrouble } from "./DiagramTrouble";
import { Inspector } from "./Inspector";
import { Outline } from "./Outline";
import { useGraphEditor } from "./useGraphEditor";

export interface DiagramEditorProps {
   engine: DiagramEngine;
   /** The attempt accepts no more writes: the graph stays visible and selectable. */
   readOnly: boolean;
   refusal: Refusal | null;
   /** "design": the canvas-first Design stage. "split": beside a later stage's written work. */
   variant: "design" | "split";
}

const PHONE = "(max-width: 767px)";
function useNarrow(): boolean {
   return useSyncExternalStore(
      (notify) => {
         const query = window.matchMedia(PHONE);
         query.addEventListener("change", notify);
         return () => query.removeEventListener("change", notify);
      },
      () => window.matchMedia(PHONE).matches,
      () => false,
   );
}

const isTyping = (el: Element | null) => !!el && (el.matches("input, textarea, select, [contenteditable=''], [contenteditable='true']") || !!el.closest("[contenteditable='true'], [data-pg-no-shortcuts]"));

type Focus = { kind: "node" | "edge"; id: string } | { kind: "field"; name: "label" | "explanation" } | { kind: "canvas" } | null;

function Editor({ engine, readOnly, refusal, variant }: DiagramEditorProps) {
   const ids = useId();
   const editor = useGraphEditor(engine, readOnly);
   const flow = useReactFlow();
   const narrow = useNarrow();
   const [panel, setPanel] = useState<"inspector" | "outline">("inspector");
   const [phoneView, setPhoneView] = useState<"canvas" | "outline">("canvas");
   const [picker, setPicker] = useState<string | null>(null);
   const [focus, setFocus] = useState<Focus>(null);
   const canvasRef = useRef<HTMLElement>(null);
   const sideRef = useRef<HTMLDivElement>(null);
   const searchRef = useRef<HTMLInputElement>(null);
   const { selection, locked } = editor;
   const editable = !locked && !narrow;

   // Moves focus once the element exists (React Flow renders a new node a frame later).
   useEffect(() => {
      if (!focus) return;
      let tries = 0;
      let raf = 0;
      const attempt = () => {
         let el: HTMLElement | null = null;
         if (focus.kind === "canvas") el = canvasRef.current;
         else if (focus.kind === "field") el = sideRef.current?.querySelector<HTMLElement>(`[data-fields] [name="${focus.name}"]`) ?? null;
         else el = canvasRef.current?.querySelector<HTMLElement>(`.react-flow__${focus.kind}[data-id="${CSS.escape(focus.id)}"]`) ?? null;
         if (el) {
            el.focus();
            setFocus(null);
         } else if (tries++ < 30) raf = requestAnimationFrame(attempt);
         else setFocus(null);
      };
      raf = requestAnimationFrame(attempt);
      return () => cancelAnimationFrame(raf);
   }, [focus]);

   const confirmLargeDelete = useCallback(
      (count: number) => window.confirm(`Deleting this component also deletes ${count - 1} connections. That is more than the ${LIMITS.max_tombstoned_elements} elements the server can keep for restoring, so once it is saved it cannot be undone. Delete it?`),
      [],
   );

   const addAtCenter = useCallback(
      (type: NodeType) => {
         const rect = canvasRef.current?.getBoundingClientRect();
         const center = rect ? flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 0, y: 0 };
         const at = freeSpot(framesOf(editor.draft).values(), center, NODE_TYPE[type]);
         const result = editor.apply((d) => addNode(d, type, { at }), { select: (r) => ({ kind: "node", id: r.id }), announce: `Added ${withArticle(type)}. Name it in the Inspector.` });
         if (result.ok) {
            setPanel("inspector");
            setFocus({ kind: "field", name: "label" });
         }
      },
      [editor, flow],
   );

   const removeSelection = useCallback(() => {
      if (!selection) return;
      // Focus leaves the element before it goes, so Cmd or Ctrl+Z right after still reaches the canvas.
      canvasRef.current?.focus();
      const name = editor.describe(selection.kind, selection.id);
      if (selection.kind === "node") {
         const size = deletionGroupSize(editor.draft, selection.id);
         if (size > LIMITS.max_tombstoned_elements && !confirmLargeDelete(size)) return;
         editor.apply((d) => deleteNode(d, selection.id), { select: () => null, announce: (r) => `Deleted ${name}${r.edges.length ? ` and ${r.edges.length} connection${r.edges.length === 1 ? "" : "s"}` : ""}. Undo brings it back.` });
      } else if (selection.kind === "edge") editor.apply((d) => deleteEdge(d, selection.id), { select: () => null, announce: `Deleted the connection ${name}. Undo brings it back.` });
      else editor.apply((d) => deleteBoundary(d, selection.id), { select: () => null, announce: `Deleted the boundary ${name}. Undo brings it back.` });
   }, [confirmLargeDelete, editor, selection]);

   const pick = (target: string) => {
      const source = picker!;
      setPicker(null);
      const result = editor.apply((d) => addEdge(d, source, target), {
         select: (r) => ({ kind: "edge", id: r.id }),
         announce: (r) => (r.existing ? `${editor.describe("node", source)} already connects to ${editor.describe("node", target)}.` : `Connected ${editor.describe("node", source)} to ${editor.describe("node", target)}. Request, not yet explained.`),
      });
      if (result.ok) setFocus({ kind: "edge", id: result.id });
   };

   // Canvas shortcuts (contract §10): only while focus is inside the canvas, never while typing; single keys can be turned off.
   const onCanvasKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      const target = event.target as Element;
      if (isTyping(target) || picker) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "z") {
         event.preventDefault();
         return event.shiftKey ? editor.redo() : editor.undo();
      }
      if (mod && key === "y") {
         event.preventDefault();
         return editor.redo();
      }
      if (mod && key === "d") {
         event.preventDefault();
         if (selection?.kind === "node" && !locked) editor.apply((d) => duplicateNode(d, selection.id), { select: (r) => ({ kind: "node", id: r.id }), announce: `Duplicated ${editor.describe("node", selection.id)}.` });
         return;
      }
      if (mod || event.altKey) return;
      if (event.key === "Escape") {
         if (selection) {
            event.preventDefault();
            editor.select(null);
            setFocus({ kind: "canvas" });
         }
         return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
         if (selection && !locked) {
            event.preventDefault();
            removeSelection();
         }
         return;
      }
      if (!editor.shortcuts) return;
      if (key === "c") {
         event.preventDefault();
         if (locked || narrow) return;
         if (selection?.kind === "node") setPicker(selection.id);
         else editor.announce("Select a component, then press C to connect it.");
         return;
      }
      if (event.key === "/") {
         event.preventDefault();
         if (narrow) setPhoneView("outline");
         else setPanel("outline");
         requestAnimationFrame(() => searchRef.current?.focus());
         return;
      }
      const type = NODE_TYPE_ORDER.find((t) => NODE_TYPE[t].key === event.key);
      if (type && editable) {
         event.preventDefault();
         addAtCenter(type);
      }
   };

   const backToCanvas = () => setFocus(selection && selection.kind !== "boundary" ? { kind: selection.kind, id: selection.id } : { kind: "canvas" });
   const showOutline = narrow ? phoneView === "outline" : panel === "outline";
   const sheet = narrow && phoneView === "canvas" && selection !== null;

   return (
      <div className={cn("pg-editor", `pg-${variant}`, narrow && "is-narrow")} data-diagram-editor="" data-phone-view={narrow ? phoneView : undefined}>
         <div className="pg-toolbar" role="toolbar" aria-label="Design tools" data-pg-no-shortcuts="">
            {editable ? (
               <div className="pg-palette" role="group" aria-label="Add a component">
                  {NODE_TYPE_ORDER.map((type) => (
                     <button
                        key={type}
                        type="button"
                        className="pg-tool"
                        title={`${NODE_TYPE[type].label} (${NODE_TYPE[type].key})`}
                        aria-label={addLabel(type)}
                        onClick={() => addAtCenter(type)}
                        aria-keyshortcuts={editor.shortcuts ? NODE_TYPE[type].key : undefined}
                     >
                        <svg className="pg-mini" viewBox={`-2 -2 ${NODE_TYPE[type].w + 4} ${NODE_TYPE[type].h + 4}`} aria-hidden="true" focusable="false">
                           <Silhouette type={type} w={NODE_TYPE[type].w} h={NODE_TYPE[type].h} />
                        </svg>
                        <span className="pg-key" aria-hidden="true">
                           {NODE_TYPE[type].key}
                        </span>
                     </button>
                  ))}
                  <button
                     type="button"
                     className="pg-tool"
                     disabled={selection?.kind !== "node"}
                     onClick={() => selection?.kind === "node" && setPicker(selection.id)}
                     aria-keyshortcuts={editor.shortcuts ? "C" : undefined}
                  >
                     <Link2 aria-hidden="true" className="size-4" />
                     Connect
                  </button>
               </div>
            ) : null}
            <div className="pg-toolbar-end">
               <button type="button" className="pg-icon-button" onClick={editor.undo} disabled={!editor.canUndo} aria-label="Undo" aria-keyshortcuts="Control+Z Meta+Z">
                  <Undo2 aria-hidden="true" className="size-4" />
               </button>
               <button type="button" className="pg-icon-button" onClick={editor.redo} disabled={!editor.canRedo} aria-label="Redo" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">
                  <Redo2 aria-hidden="true" className="size-4" />
               </button>
               <details className="pg-settings">
                  <summary>View settings</summary>
                  <div className="pg-settings-panel">
                     <label className="pg-toggle">
                        <input type="checkbox" checked={editor.shortcuts} onChange={(e) => editor.setShortcuts(e.target.checked)} />
                        Single-key shortcuts on the canvas
                     </label>
                     <label className="pg-toggle">
                        <input type="checkbox" checked={editor.markers} onChange={(e) => editor.setMarkers(e.target.checked)} />
                        Mark what is not yet explained
                     </label>
                  </div>
               </details>
               {!narrow ? (
                  <div className="pg-tabs" role="group" aria-label="Side panel">
                     <button type="button" aria-pressed={panel === "inspector"} onClick={() => setPanel("inspector")}>
                        Inspector
                     </button>
                     <button type="button" aria-pressed={panel === "outline"} onClick={() => setPanel("outline")}>
                        Outline
                     </button>
                  </div>
               ) : null}
            </div>
         </div>

         {narrow && phoneView === "canvas" ? (
            <p className="pg-mobile-help">On a phone, use the Outline below to add, connect and explain. The Canvas is for viewing and selecting.</p>
         ) : null}

         <DiagramTrouble editor={editor} refusal={refusal} />

         <div className="pg-body">
            <section
               ref={canvasRef}
               className="pg-canvas"
               aria-label="Design canvas"
               aria-describedby={`${ids}-help`}
               tabIndex={0}
               onKeyDown={onCanvasKeyDown}
               hidden={narrow && phoneView === "outline"}
            >
               <p id={`${ids}-help`} className="sr-only">
                  {narrow
                     ? "View the diagram and tap to select. Build and edit it in the Outline."
                     : "Tab moves through components and connections. Enter selects. Arrow keys move a selected component. C connects, slash opens the Outline search, Delete removes, Command or Control Z undoes."}
               </p>
               <CanvasView editor={editor} viewOnly={narrow} />
               {picker ? <ConnectPicker editor={editor} source={picker} onPick={pick} onClose={() => (setPicker(null), setFocus({ kind: "node", id: picker }))} /> : null}
            </section>
            <div ref={sideRef} className={cn("pg-side", sheet && "is-sheet")} hidden={narrow && !showOutline && !sheet}>
               {showOutline ? (
                  <Outline editor={editor} searchRef={searchRef} confirmLargeDelete={confirmLargeDelete} />
               ) : (
                  <Inspector editor={editor} onEscape={backToCanvas} confirmLargeDelete={confirmLargeDelete} headingId={`${ids}-inspector`} onClose={narrow ? () => editor.select(null) : undefined} />
               )}
            </div>
         </div>

         {narrow ? (
            <div className="pg-switch" role="group" aria-label="Diagram view">
               <button type="button" aria-pressed={phoneView === "canvas"} onClick={() => setPhoneView("canvas")}>
                  Canvas
               </button>
               <button type="button" aria-pressed={phoneView === "outline"} onClick={() => setPhoneView("outline")}>
                  Outline
               </button>
            </div>
         ) : null}

         <p className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-pg-announcer="">
            {editor.announcement}
         </p>
      </div>
   );
}

/** The diagram editor (`P9-T14`). Loaded only through `DiagramEditorLoader`, so React Flow ships only with the attempt route. */
export default function DiagramEditor(props: DiagramEditorProps) {
   return (
      <ReactFlowProvider>
         <Editor {...props} />
      </ReactFlowProvider>
   );
}
