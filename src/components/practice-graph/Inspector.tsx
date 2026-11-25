"use client";

import { X } from "lucide-react";
import { BOUNDARY_TYPE_LABEL, EDGE_KIND_LABEL, NODE_TYPE, subtypeLabel } from "@/lib/practice-graph/vocabulary";
import { findBoundary, findEdge, findNode } from "@/lib/practice-graph/model";
import { BoundaryFields, EdgeFields, NodeFields } from "./ElementFields";
import type { GraphEditor } from "./useGraphEditor";

interface Props {
   editor: GraphEditor;
   onEscape: () => void;
   confirmLargeDelete: (count: number) => boolean;
   onClose?: () => void;
   headingId: string;
}

/** A deterministic summary when nothing is selected (contract §5.3): counts only, no AI, no advice. */
function Summary({ editor }: { editor: GraphEditor }) {
   const { nodes, edges } = editor.draft.graph;
   const unexplained = nodes.filter((n) => !n.explanation.trim()).length + edges.filter((e) => !e.explanation.trim()).length;
   return (
      <div className="grid gap-2">
         <p className="m-0">
            {nodes.length} component{nodes.length === 1 ? "" : "s"}, {edges.length} connection{edges.length === 1 ? "" : "s"}, {unexplained} not yet explained.
         </p>
         <p className="m-0 text-sm text-muted-foreground">Select a component or a connection to name it and explain it. Explanations are yours to write; leaving one empty is fine.</p>
      </div>
   );
}

/** The selection-driven Inspector: where names, kinds and explanations are written. Long text never appears on the canvas. */
export function Inspector({ editor, onEscape, confirmLargeDelete, onClose, headingId }: Props) {
   const { selection, draft } = editor;
   let eyebrow = "Diagram";
   let title = "Your design";
   if (selection?.kind === "node") {
      const node = findNode(draft, selection.id)!;
      eyebrow = `Component · ${NODE_TYPE[node.type].label}${node.subtype ? ` · ${subtypeLabel(node.subtype)}` : ""}`;
      title = editor.describe("node", node.id);
   } else if (selection?.kind === "edge") {
      const edge = findEdge(draft, selection.id)!;
      eyebrow = `Connection · ${EDGE_KIND_LABEL[edge.kind]}`;
      title = `${editor.describe("node", edge.from)} to ${editor.describe("node", edge.to)}`;
   } else if (selection?.kind === "boundary") {
      const boundary = findBoundary(draft, selection.id)!;
      eyebrow = `Boundary · ${BOUNDARY_TYPE_LABEL[boundary.type]}`;
      title = editor.describe("boundary", boundary.id);
   }
   return (
      <section className="pg-inspector" aria-labelledby={headingId}>
         <div className="pg-panel-head">
            <p className="pg-eyebrow m-0">Inspector</p>
            {onClose ? (
               <button type="button" className="pg-icon-button" onClick={onClose} aria-label="Close the Inspector">
                  <X aria-hidden="true" className="size-4" />
               </button>
            ) : null}
         </div>
         <p className="pg-kind m-0">{eyebrow}</p>
         <h2 id={headingId} className="pg-title m-0" data-pg-inspector-title="">
            {title}
         </h2>
         <div className="mt-4">
            {selection?.kind === "node" ? <NodeFields key={selection.id} editor={editor} id={selection.id} onEscape={onEscape} confirmLargeDelete={confirmLargeDelete} /> : null}
            {selection?.kind === "edge" ? <EdgeFields key={selection.id} editor={editor} id={selection.id} onEscape={onEscape} confirmLargeDelete={confirmLargeDelete} /> : null}
            {selection?.kind === "boundary" ? <BoundaryFields key={selection.id} editor={editor} id={selection.id} onEscape={onEscape} confirmLargeDelete={confirmLargeDelete} /> : null}
            {selection === null ? <Summary editor={editor} /> : null}
         </div>
      </section>
   );
}
