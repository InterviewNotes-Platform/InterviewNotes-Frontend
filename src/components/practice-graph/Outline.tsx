"use client";

import { useId, useState, type FormEvent, type RefObject } from "react";
import { Plus, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { addBoundary, addEdge, addNode, restoreElements, type DEdge } from "@/lib/practice-graph/model";
import { sanitizeInput } from "@/lib/practice-graph/text";
import { BOUNDARY_TYPES, BOUNDARY_TYPE_LABEL, EDGE_KINDS, EDGE_KIND_LABEL, LIMITS, NODE_TYPE, NODE_TYPE_ORDER } from "@/lib/practice-graph/vocabulary";
import type { BoundaryType, EdgeKind, NodeType, TombstoneOut } from "@/lib/practice-workspace/types";
import { BoundaryFields, EdgeFields, NodeFields } from "./ElementFields";
import type { GraphEditor } from "./useGraphEditor";

const SELECT = "h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";

interface Props {
   editor: GraphEditor;
   searchRef: RefObject<HTMLInputElement | null>;
   confirmLargeDelete: (count: number) => boolean;
}

/** Server tombstones grouped as deleted together, leaving out groups this draft has already brought back. */
function recentlyDeleted(editor: GraphEditor): { group: string; items: TombstoneOut[] }[] {
   const live = new Set([...editor.draft.graph.nodes, ...editor.draft.graph.edges, ...editor.draft.graph.boundaries].map((e) => e.id));
   const groups = new Map<string, TombstoneOut[]>();
   for (const t of editor.snapshot.saved.tombstones) {
      if (live.has(t.id)) continue;
      groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
   }
   return [...groups].map(([group, items]) => ({ group, items })).reverse();
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function describeGroup(items: TombstoneOut[]): string {
   const node = items.find((t) => t.kind === "node");
   const boundary = items.find((t) => t.kind === "boundary");
   const edges = items.filter((t) => t.kind === "edge").length;
   if (node) {
      const type = NODE_TYPE[node.element.type as NodeType]?.label.toLowerCase() ?? "component";
      const name = text(node.element.label) || `Unnamed ${type}`;
      return `${name} (${type})${edges ? ` and ${edges} connection${edges === 1 ? "" : "s"}` : ""}`;
   }
   if (boundary) return `${text(boundary.element.label) || "Unnamed boundary"} (boundary)`;
   const tag = text(items[0]?.element.tag);
   return `A ${EDGE_KIND_LABEL[items[0]?.element.kind as EdgeKind]?.toLowerCase() ?? "request"} connection${tag ? ` tagged ${tag}` : ""}`;
}

/**
 * The Outline: the complete non-canvas way to build and edit the same graph (contract §5.4). Every semantic action has a control here
 * (add, connect with From, To and Kind, rename, retype, subtype, boundary, explanations, swap, delete, restore, undo and redo), with
 * no drag gesture and no position. It edits the editor's one draft, so it cannot diverge from the canvas, and shares its selection.
 */
export function Outline({ editor, searchRef, confirmLargeDelete }: Props) {
   const ids = useId();
   const { draft, selection, locked } = editor;
   const [query, setQuery] = useState("");
   const [newType, setNewType] = useState<NodeType>("service");
   const [newName, setNewName] = useState("");
   const [from, setFrom] = useState("");
   const [to, setTo] = useState("");
   const [kind, setKind] = useState<EdgeKind>("request");
   const [boundaryType, setBoundaryType] = useState<BoundaryType>("group");
   const [boundaryLabel, setBoundaryLabel] = useState("");
   const q = query.trim().toLowerCase();
   const matches = (...parts: string[]) => q === "" || parts.join(" ").toLowerCase().includes(q);

   const fromId = from && draft.graph.nodes.some((n) => n.id === from) ? from : selection?.kind === "node" ? selection.id : "";
   const toId = to && draft.graph.nodes.some((n) => n.id === to) ? to : "";

   const addComponent = (event: FormEvent) => {
      event.preventDefault();
      const label = newName;
      editor.apply((d) => addNode(d, newType, { label }), {
         select: (r) => ({ kind: "node", id: r.id }),
         announce: `Added ${label.trim() || `an unnamed ${NODE_TYPE[newType].label.toLowerCase()}`}.`,
      });
      setNewName("");
   };
   const connect = (event: FormEvent) => {
      event.preventDefault();
      if (!fromId || !toId) return editor.announce("Choose both ends of the connection.");
      editor.apply((d) => addEdge(d, fromId, toId, kind), {
         select: (r) => ({ kind: "edge", id: r.id }),
         announce: (r) => (r.existing ? `${editor.describe("node", fromId)} already connects to ${editor.describe("node", toId)} that way.` : `Connected ${editor.describe("node", fromId)} to ${editor.describe("node", toId)}. ${EDGE_KIND_LABEL[kind]}, not yet explained.`),
      });
   };
   const newBoundary = (event: FormEvent) => {
      event.preventDefault();
      const label = boundaryLabel;
      editor.apply((d) => addBoundary(d, boundaryType, label), { select: (r) => ({ kind: "boundary", id: r.id }), announce: `Added the boundary ${label.trim() || "(unnamed)"}.` });
      setBoundaryLabel("");
   };
   const restore = (items: TombstoneOut[]) =>
      editor.apply((d) => restoreElements(d, items), {
         announce: (r) => `Restored ${r.restored.length} element${r.restored.length === 1 ? "" : "s"}${r.skipped.length ? `; ${r.skipped.length} connection${r.skipped.length === 1 ? " was" : "s were"} left out because an end is not on the diagram` : ""}. It saves shortly.`,
      });

   const edgeText = (e: DEdge) => `${editor.describe("node", e.from)} → ${editor.describe("node", e.to)}`;
   const deleted = recentlyDeleted(editor);

   return (
      <section className="pg-outline" aria-labelledby={`${ids}-h`}>
         <div className="pg-panel-head">
            <h2 id={`${ids}-h`} className="pg-eyebrow m-0">
               Outline
            </h2>
            <div className="flex gap-1">
               <button type="button" className="pg-icon-button" onClick={editor.undo} disabled={!editor.canUndo} aria-label="Undo" aria-keyshortcuts="Control+Z Meta+Z">
                  <Undo2 aria-hidden="true" className="size-4" />
               </button>
               <button type="button" className="pg-icon-button" onClick={editor.redo} disabled={!editor.canRedo} aria-label="Redo" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">
                  <Redo2 aria-hidden="true" className="size-4" />
               </button>
            </div>
         </div>

         <Field label="Find in the outline" className="mt-2">
            <Input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} className="h-11" />
         </Field>

         <form className="pg-form" onSubmit={addComponent} aria-labelledby={`${ids}-add`}>
            <h3 id={`${ids}-add`} className="pg-subhead">
               Add a component
            </h3>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
               <Field label="Type">
                  <select className={SELECT} value={newType} disabled={locked} onChange={(e) => setNewType(e.target.value as NodeType)}>
                     {NODE_TYPE_ORDER.map((type) => (
                        <option key={type} value={type}>
                           {NODE_TYPE[type].label}
                        </option>
                     ))}
                  </select>
               </Field>
               <Field label="Name">
                  <Input value={newName} disabled={locked} autoComplete="off" onChange={(e) => setNewName(sanitizeInput(e.target.value, { limit: LIMITS.max_label, newline: false }).value)} className="h-11" />
               </Field>
            </div>
            <Button type="submit" className="min-h-11 justify-self-start" disabled={locked}>
               <Plus aria-hidden="true" />
               Add component
            </Button>
         </form>

         <h3 className="pg-subhead" id={`${ids}-c`}>
            Components ({draft.graph.nodes.length})
         </h3>
         <ul className="pg-list" aria-labelledby={`${ids}-c`}>
            {draft.graph.nodes
               .filter((n) => matches(n.label, NODE_TYPE[n.type].label))
               .map((n) => {
                  const open = selection?.kind === "node" && selection.id === n.id;
                  const inc = draft.graph.edges.filter((e) => e.to === n.id).length;
                  const out = draft.graph.edges.filter((e) => e.from === n.id).length;
                  return (
                     <li key={n.id} className={open ? "is-open" : undefined}>
                        <button type="button" className="pg-row" aria-expanded={open} onClick={() => editor.select(open ? null : { kind: "node", id: n.id })}>
                           <span className="font-semibold">{editor.describe("node", n.id)}</span>
                           <span className="text-sm text-muted-foreground">
                              {NODE_TYPE[n.type].label} · {inc} in · {out} out{n.explanation.trim() ? "" : " · not yet explained"}
                           </span>
                        </button>
                        {open ? (
                           <div className="pg-inline">
                              <NodeFields editor={editor} id={n.id} confirmLargeDelete={confirmLargeDelete} />
                           </div>
                        ) : null}
                     </li>
                  );
               })}
         </ul>

         <form className="pg-form" onSubmit={connect} aria-labelledby={`${ids}-connect`}>
            <h3 id={`${ids}-connect`} className="pg-subhead">
               Connect two components
            </h3>
            <Field label="From">
               <select className={SELECT} value={fromId} disabled={locked} onChange={(e) => setFrom(e.target.value)}>
                  <option value="">Choose a component</option>
                  {draft.graph.nodes.map((n) => (
                     <option key={n.id} value={n.id}>
                        {editor.describe("node", n.id)}
                     </option>
                  ))}
               </select>
            </Field>
            <Field label="To">
               <select className={SELECT} value={toId} disabled={locked} onChange={(e) => setTo(e.target.value)}>
                  <option value="">Choose a component</option>
                  {draft.graph.nodes
                     .filter((n) => n.id !== fromId)
                     .map((n) => (
                        <option key={n.id} value={n.id}>
                           {editor.describe("node", n.id)}
                        </option>
                     ))}
               </select>
            </Field>
            <Field label="Kind">
               <select className={SELECT} value={kind} disabled={locked} onChange={(e) => setKind(e.target.value as EdgeKind)}>
                  {EDGE_KINDS.map((k) => (
                     <option key={k} value={k}>
                        {EDGE_KIND_LABEL[k]}
                     </option>
                  ))}
               </select>
            </Field>
            <Button type="submit" className="min-h-11 justify-self-start" disabled={locked || draft.graph.nodes.length < 2}>
               Connect
            </Button>
         </form>

         <h3 className="pg-subhead" id={`${ids}-e`}>
            Connections ({draft.graph.edges.length})
         </h3>
         <ul className="pg-list" aria-labelledby={`${ids}-e`}>
            {draft.graph.edges
               .filter((e) => matches(edgeText(e), e.tag, EDGE_KIND_LABEL[e.kind]))
               .map((e) => {
                  const open = selection?.kind === "edge" && selection.id === e.id;
                  return (
                     <li key={e.id} className={open ? "is-open" : undefined}>
                        <button type="button" className="pg-row" aria-expanded={open} onClick={() => editor.select(open ? null : { kind: "edge", id: e.id })}>
                           <span className="font-semibold">{edgeText(e)}</span>
                           <span className="text-sm text-muted-foreground">
                              {EDGE_KIND_LABEL[e.kind]}
                              {e.tag.trim() ? ` · ${e.tag.trim()}` : ""}
                              {e.explanation.trim() ? "" : " · not yet explained"}
                           </span>
                        </button>
                        {open ? (
                           <div className="pg-inline">
                              <EdgeFields editor={editor} id={e.id} confirmLargeDelete={confirmLargeDelete} />
                           </div>
                        ) : null}
                     </li>
                  );
               })}
         </ul>

         <h3 className="pg-subhead" id={`${ids}-b`}>
            Boundaries ({draft.graph.boundaries.length})
         </h3>
         <ul className="pg-list" aria-labelledby={`${ids}-b`}>
            {draft.graph.boundaries.map((b) => {
               const open = selection?.kind === "boundary" && selection.id === b.id;
               return (
                  <li key={b.id} className={open ? "is-open" : undefined}>
                     <button type="button" className="pg-row" aria-expanded={open} onClick={() => editor.select(open ? null : { kind: "boundary", id: b.id })}>
                        <span className="font-semibold">{editor.describe("boundary", b.id)}</span>
                        <span className="text-sm text-muted-foreground">
                           {BOUNDARY_TYPE_LABEL[b.type]} · {draft.graph.nodes.filter((n) => n.boundary === b.id).length} members
                        </span>
                     </button>
                     {open ? (
                        <div className="pg-inline">
                           <BoundaryFields editor={editor} id={b.id} confirmLargeDelete={confirmLargeDelete} />
                        </div>
                     ) : null}
                  </li>
               );
            })}
         </ul>
         <form className="pg-form" onSubmit={newBoundary} aria-labelledby={`${ids}-nb`}>
            <h3 id={`${ids}-nb`} className="sr-only">
               Add a boundary
            </h3>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
               <Field label="Boundary type">
                  <select className={SELECT} value={boundaryType} disabled={locked} onChange={(e) => setBoundaryType(e.target.value as BoundaryType)}>
                     {BOUNDARY_TYPES.map((t) => (
                        <option key={t} value={t}>
                           {BOUNDARY_TYPE_LABEL[t]}
                        </option>
                     ))}
                  </select>
               </Field>
               <Field label="Boundary name">
                  <Input value={boundaryLabel} disabled={locked} autoComplete="off" onChange={(e) => setBoundaryLabel(sanitizeInput(e.target.value, { limit: LIMITS.max_label, newline: false }).value)} className="h-11" />
               </Field>
            </div>
            <Button type="submit" variant="outline" className="min-h-11 justify-self-start" disabled={locked}>
               <Plus aria-hidden="true" />
               Add boundary
            </Button>
         </form>

         <h3 className="pg-subhead" id={`${ids}-d`}>
            Recently deleted
         </h3>
         {deleted.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Nothing yet. A deletion appears here once it is saved; before that, Undo brings it back.</p>
         ) : (
            <ul className="pg-list" aria-labelledby={`${ids}-d`} data-recently-deleted="">
               {deleted.map(({ group, items }) => (
                  <li key={group} className="pg-deleted">
                     <span>{describeGroup(items)}</span>
                     <Button type="button" variant="outline" className="min-h-11" disabled={locked} onClick={() => restore(items)}>
                        <RotateCcw aria-hidden="true" />
                        Restore<span className="sr-only"> {describeGroup(items)}</span>
                     </Button>
                  </li>
               ))}
            </ul>
         )}
      </section>
   );
}
