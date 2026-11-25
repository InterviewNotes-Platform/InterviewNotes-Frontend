"use client";

import { useState, type KeyboardEvent } from "react";
import { ArrowLeftRight, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
   bendEdge,
   deleteBoundary,
   deleteEdge,
   deleteNode,
   deletionGroupSize,
   duplicateNode,
   findBoundary,
   findEdge,
   findNode,
   incidentEdges,
   retypeNode,
   swapEdge,
   updateBoundary,
   updateEdge,
   updateNode,
} from "@/lib/practice-graph/model";
import { codePoints, sanitizeInput } from "@/lib/practice-graph/text";
import { issueMessage, validateDraft, type IssueField } from "@/lib/practice-graph/validate";
import {
   BOUNDARY_TYPES,
   BOUNDARY_TYPE_LABEL,
   EDGE_KINDS,
   EDGE_KIND_LABEL,
   EDGE_PROMPTS,
   LIMITS,
   NODE_PROMPTS,
   NODE_TYPE,
   NODE_TYPE_ORDER,
   SUBTYPES,
   subtypeLabel,
} from "@/lib/practice-graph/vocabulary";
import type { BoundaryType, EdgeKind, NodeType } from "@/lib/practice-workspace/types";
import type { GraphEditor } from "./useGraphEditor";

const SELECT = "h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";

interface TextProps {
   label: string;
   value: string;
   limit: number;
   multiline?: boolean;
   readOnly: boolean;
   error?: string;
   prompts?: readonly string[];
   onChange: (value: string) => void;
   onEscape?: () => void;
   name: string;
}

/** A learner text field: unsavable characters are dropped as typed (and the field says so), the count is in characters as the server counts them. */
function TextField({ label, value, limit, multiline, readOnly, error, prompts, onChange, onEscape, name }: TextProps) {
   const [cleaned, setCleaned] = useState(false);
   const count = codePoints(value);
   const change = (raw: string) => {
      const { value: next, changed } = sanitizeInput(raw, { limit, newline: Boolean(multiline) });
      setCleaned(changed);
      onChange(next);
   };
   const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onEscape) {
         event.preventDefault();
         onEscape();
      }
   };
   const description = (
      <>
         {cleaned ? <span>Some characters cannot be saved and were left out. </span> : null}
         <span className={cn(count >= limit && "font-semibold")}>
            {count} of {limit} characters
         </span>
      </>
   );
   return (
      <div className="grid gap-2">
         {prompts ? (
            <ul className="pg-prompts" aria-label="Questions to think about">
               {prompts.map((prompt) => (
                  <li key={prompt}>{prompt}</li>
               ))}
            </ul>
         ) : null}
         <Field label={label} description={description} error={error}>
            {multiline ? (
               <Textarea name={name} value={value} readOnly={readOnly} rows={5} onChange={(e) => change(e.target.value)} onKeyDown={onKeyDown} className="min-h-28 text-base md:text-sm" />
            ) : (
               <Input name={name} value={value} readOnly={readOnly} autoComplete="off" onChange={(e) => change(e.target.value)} onKeyDown={onKeyDown} className="h-11" />
            )}
         </Field>
      </div>
   );
}

function fieldError(editor: GraphEditor, id: string, field: IssueField, name: string): string | undefined {
   const issue = validateDraft(editor.draft).find((i) => i.elementId === id && i.field === field);
   return issue ? issueMessage(issue, name) : undefined;
}

interface FieldsProps {
   editor: GraphEditor;
   id: string;
   /** Where Escape in a field returns (the canvas element), when there is one. */
   onEscape?: () => void;
   /** Before deleting a component whose group passes the tombstone cap: true to go ahead. */
   confirmLargeDelete: (count: number) => boolean;
}

export function NodeFields({ editor, id, onEscape, confirmLargeDelete }: FieldsProps) {
   const node = findNode(editor.draft, id);
   if (!node) return null;
   const ro = editor.locked;
   const name = editor.describe("node", id);
   const connections = incidentEdges(editor.draft, id);
   const remove = () => {
      const size = deletionGroupSize(editor.draft, id);
      if (size > LIMITS.max_tombstoned_elements && !confirmLargeDelete(size)) return;
      editor.apply((d) => deleteNode(d, id), {
         select: () => null,
         announce: (r) => `Deleted ${name}${r.edges.length ? ` and ${r.edges.length} connection${r.edges.length === 1 ? "" : "s"}` : ""}. Undo or Recently deleted brings ${r.edges.length ? "them" : "it"} back.`,
      });
   };
   return (
      <div className="grid gap-4" data-fields="node">
         <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
               <select className={SELECT} value={node.type} disabled={ro} onChange={(e) => editor.apply((d) => retypeNode(d, id, e.target.value as NodeType), { announce: `Changed to ${NODE_TYPE[e.target.value as NodeType].label.toLowerCase()}.` })}>
                  {NODE_TYPE_ORDER.map((type) => (
                     <option key={type} value={type}>
                        {NODE_TYPE[type].label}
                     </option>
                  ))}
               </select>
            </Field>
            <Field label="Subtype">
               <select className={SELECT} value={node.subtype ?? ""} disabled={ro} onChange={(e) => editor.apply((d) => updateNode(d, id, { subtype: e.target.value || null }))}>
                  <option value="">None</option>
                  {SUBTYPES[node.type].map((subtype) => (
                     <option key={subtype} value={subtype}>
                        {subtypeLabel(subtype)}
                     </option>
                  ))}
               </select>
            </Field>
         </div>
         <TextField name="label" label="Name" value={node.label} limit={LIMITS.max_label} readOnly={ro} onEscape={onEscape} error={fieldError(editor, id, "label", "this component")} onChange={(label) => editor.apply((d) => updateNode(d, id, { label }), { key: `text:${id}:label` })} />
         <Field label="Boundary">
            <select className={SELECT} value={node.boundary ?? ""} disabled={ro} onChange={(e) => editor.apply((d) => updateNode(d, id, { boundary: e.target.value || null }))}>
               <option value="">None</option>
               {editor.draft.graph.boundaries.map((b) => (
                  <option key={b.id} value={b.id}>
                     {editor.describe("boundary", b.id)}
                  </option>
               ))}
            </select>
         </Field>
         <TextField
            name="explanation"
            label="Explanation"
            multiline
            prompts={NODE_PROMPTS}
            value={node.explanation}
            limit={LIMITS.max_explanation}
            readOnly={ro}
            onEscape={onEscape}
            error={fieldError(editor, id, "explanation", "this component")}
            onChange={(explanation) => editor.apply((d) => updateNode(d, id, { explanation }), { key: `text:${id}:explanation` })}
         />
         {connections.length > 0 ? (
            <div>
               <p className="m-0 mb-2 text-sm font-semibold">Connections</p>
               <ul className="m-0 grid list-none gap-1 p-0">
                  {connections.map((edge) => (
                     <li key={edge.id}>
                        <button type="button" className="pg-row" onClick={() => editor.select({ kind: "edge", id: edge.id })}>
                           <span>{edge.from === id ? `To ${editor.describe("node", edge.to)}` : `From ${editor.describe("node", edge.from)}`}</span>
                           <span className="text-muted-foreground text-sm">
                              {EDGE_KIND_LABEL[edge.kind]} · {edge.explanation.trim() ? "explained" : "not yet explained"}
                           </span>
                        </button>
                     </li>
                  ))}
               </ul>
            </div>
         ) : null}
         <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={ro} onClick={() => editor.apply((d) => duplicateNode(d, id), { select: (r) => ({ kind: "node", id: r.id }), announce: `Duplicated ${name}.` })}>
               <Copy aria-hidden="true" />
               Duplicate
            </Button>
            <Button type="button" variant="outline" className="min-h-11 text-destructive" disabled={ro} onClick={remove}>
               <Trash2 aria-hidden="true" />
               Delete component
            </Button>
         </div>
      </div>
   );
}

export function EdgeFields({ editor, id, onEscape }: FieldsProps) {
   const edge = findEdge(editor.draft, id);
   if (!edge) return null;
   const ro = editor.locked;
   const bent = Boolean(editor.draft.layout.edges[id]);
   return (
      <div className="grid gap-4" data-fields="edge">
         <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="pg-link" onClick={() => editor.select({ kind: "node", id: edge.from })}>
               From {editor.describe("node", edge.from)}
            </button>
            <span aria-hidden="true">→</span>
            <button type="button" className="pg-link" onClick={() => editor.select({ kind: "node", id: edge.to })}>
               To {editor.describe("node", edge.to)}
            </button>
         </div>
         <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={ro} onClick={() => editor.apply((d) => swapEdge(d, id), { announce: `Direction swapped: now from ${editor.describe("node", edge.to)} to ${editor.describe("node", edge.from)}.` })}>
            <ArrowLeftRight aria-hidden="true" />
            Swap direction
         </Button>
         <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
               <select className={SELECT} value={edge.kind} disabled={ro} onChange={(e) => editor.apply((d) => updateEdge(d, id, { kind: e.target.value as EdgeKind }))}>
                  {EDGE_KINDS.map((kind) => (
                     <option key={kind} value={kind}>
                        {EDGE_KIND_LABEL[kind]}
                     </option>
                  ))}
               </select>
            </Field>
            <TextField name="tag" label="Tag (optional)" value={edge.tag} limit={LIMITS.max_tag} readOnly={ro} onEscape={onEscape} error={fieldError(editor, id, "tag", "this connection")} onChange={(tag) => editor.apply((d) => updateEdge(d, id, { tag }), { key: `text:${id}:tag` })} />
         </div>
         <TextField
            name="explanation"
            label="Explanation"
            multiline
            prompts={EDGE_PROMPTS}
            value={edge.explanation}
            limit={LIMITS.max_explanation}
            readOnly={ro}
            onEscape={onEscape}
            error={fieldError(editor, id, "explanation", "this connection")}
            onChange={(explanation) => editor.apply((d) => updateEdge(d, id, { explanation }), { key: `text:${id}:explanation` })}
         />
         <div className="flex flex-wrap gap-2">
            {bent ? (
               <Button type="button" variant="outline" className="min-h-11" disabled={ro} onClick={() => editor.apply((d) => bendEdge(d, id, null), { announce: "The connection follows its automatic curve again." })}>
                  Straighten
               </Button>
            ) : null}
            <Button type="button" variant="outline" className="min-h-11 text-destructive" disabled={ro} onClick={() => editor.apply((d) => deleteEdge(d, id), { select: () => null, announce: `Deleted the connection. Undo or Recently deleted brings it back.` })}>
               <Trash2 aria-hidden="true" />
               Delete connection
            </Button>
         </div>
      </div>
   );
}

export function BoundaryFields({ editor, id, onEscape }: FieldsProps) {
   const boundary = findBoundary(editor.draft, id);
   if (!boundary) return null;
   const ro = editor.locked;
   return (
      <div className="grid gap-4" data-fields="boundary">
         <Field label="Type">
            <select className={SELECT} value={boundary.type} disabled={ro} onChange={(e) => editor.apply((d) => updateBoundary(d, id, { type: e.target.value as BoundaryType }))}>
               {BOUNDARY_TYPES.map((type) => (
                  <option key={type} value={type}>
                     {BOUNDARY_TYPE_LABEL[type]}
                  </option>
               ))}
            </select>
         </Field>
         <TextField name="label" label="Name" value={boundary.label} limit={LIMITS.max_label} readOnly={ro} onEscape={onEscape} error={fieldError(editor, id, "label", "this boundary")} onChange={(label) => editor.apply((d) => updateBoundary(d, id, { label }), { key: `text:${id}:label` })} />
         <fieldset className="m-0 grid gap-1 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">Members</legend>
            {editor.draft.graph.nodes.length === 0 ? <p className="m-0 text-sm text-muted-foreground">Add components first.</p> : null}
            {editor.draft.graph.nodes.map((node) => (
               <label key={node.id} className="pg-check">
                  <input type="checkbox" checked={node.boundary === id} disabled={ro} onChange={(e) => editor.apply((d) => updateNode(d, node.id, { boundary: e.target.checked ? id : null }))} />
                  <span>{editor.describe("node", node.id)}</span>
                  {node.boundary && node.boundary !== id ? <span className="text-muted-foreground text-sm">(now in {editor.describe("boundary", node.boundary)})</span> : null}
               </label>
            ))}
         </fieldset>
         <Button type="button" variant="outline" className="min-h-11 justify-self-start text-destructive" disabled={ro} onClick={() => editor.apply((d) => deleteBoundary(d, id), { select: () => null, announce: "Deleted the boundary; its components stay." })}>
            <Trash2 aria-hidden="true" />
            Delete boundary
         </Button>
      </div>
   );
}
