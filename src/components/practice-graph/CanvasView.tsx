"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
   Background,
   ConnectionMode,
   Controls,
   ReactFlow,
   getBezierPath,
   type Connection,
   type ConnectionLineComponentProps,
   type EdgeTypes,
   type NodeTypes,
   type OnEdgesChange,
   type OnNodesChange,
} from "@xyflow/react";
import { boundaryFrames, framesOf } from "@/lib/practice-graph/layout";
import { addEdge, bendEdge, moveNode, type DEdge, type DNode } from "@/lib/practice-graph/model";
import { Router, routeVia, type Rect, type Route } from "@/lib/practice-graph/routing";
import { BOUNDARY_TYPE_LABEL, EDGE_KIND_LABEL, NODE_TYPE, boundaryName, nodeName, subtypeLabel } from "@/lib/practice-graph/vocabulary";
import { CurvedEdge, RoutingContext, type CurvedFlowEdge } from "./CurvedEdge";
import { BoundaryNode, ShapeNode, type BoundaryFlowNode, type ShapeFlowNode } from "./shapes";
import type { GraphEditor } from "./useGraphEditor";

const nodeTypes: NodeTypes = { shape: ShapeNode, boundary: BoundaryNode };
const edgeTypes: EdgeTypes = { curved: CurvedEdge };
type FlowNode = ShapeFlowNode | BoundaryFlowNode;
const NODE_HELP = "Press Enter or Space to select. Arrow keys move a selected component. Press C to connect it.";

function ConnectionLine({ fromX, fromY, toX, toY, fromPosition, toPosition }: ConnectionLineComponentProps) {
   const [d] = getBezierPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY, sourcePosition: fromPosition, targetPosition: toPosition });
   return <path d={d} fill="none" className="pg-connection-line" />;
}

/** The accessible name of a component: type, subtype, name, connection counts and whether it is explained (no explanation text). */
export function nodeLabel(node: DNode, incoming: number, outgoing: number, boundary: string | null): string {
   const type = `${NODE_TYPE[node.type].label}${node.subtype ? `, ${subtypeLabel(node.subtype)}` : ""}`;
   const counts = `${incoming} incoming, ${outgoing} outgoing connection${incoming + outgoing === 1 ? "" : "s"}`;
   return `${type}: ${nodeName(node.label, node.type)}. ${counts}. ${node.explanation.trim() ? "Explained" : "Not yet explained"}.${boundary ? ` In ${boundary}.` : ""}`;
}

export function edgeLabel(edge: DEdge, from: string, to: string): string {
   const tag = edge.tag.trim();
   return `${EDGE_KIND_LABEL[edge.kind]} from ${from} to ${to}${tag ? `, tag ${tag}` : ""}. ${edge.explanation.trim() ? "Explained" : "Not yet explained"}.`;
}

interface Props {
   editor: GraphEditor;
   /** Phone: view, select and pan only; structure is edited through the Outline. */
   viewOnly: boolean;
}

/**
 * The React Flow canvas: a projection of the editor's one draft. React Flow's own node and edge state is never kept or saved; positions
 * dragged here become layout frames when the drag ends (one undo step), and connections made here are graph operations.
 */
export function CanvasView({ editor, viewOnly }: Props) {
   const { draft, selection, locked, markers } = editor;
   const editable = !locked && !viewOnly;
   const [overlay, setOverlay] = useState<ReadonlyMap<string, { x: number; y: number }>>(new Map());
   const [bend, setBend] = useState<{ id: string; x: number; y: number } | null>(null);
   const dragging = useRef(new Set<string>());
   const dragRun = useRef(0);
   const [router] = useState(() => new Router());
   const [routeTick, setRouteTick] = useState(0);

   const frames = useMemo(() => {
      const base = framesOf(draft);
      for (const [id, position] of overlay) {
         const frame = base.get(id);
         if (frame) base.set(id, { ...frame, x: position.x, y: position.y });
      }
      return base;
   }, [draft, overlay]);

   const names = useMemo(() => new Map(draft.graph.nodes.map((n) => [n.id, nodeName(n.label, n.type)])), [draft.graph.nodes]);
   const counts = useMemo(() => {
      const c = new Map<string, { inc: number; out: number }>();
      for (const e of draft.graph.edges) {
         c.set(e.from, { inc: c.get(e.from)?.inc ?? 0, out: (c.get(e.from)?.out ?? 0) + 1 });
         c.set(e.to, { inc: (c.get(e.to)?.inc ?? 0) + 1, out: c.get(e.to)?.out ?? 0 });
      }
      return c;
   }, [draft.graph.edges]);

   const flowNodes = useMemo<FlowNode[]>(() => {
      const boundaryNames = new Map(draft.graph.boundaries.map((b) => [b.id, boundaryName(b.label, b.type)]));
      const boxes = boundaryFrames(draft, frames);
      const groups: BoundaryFlowNode[] = draft.graph.boundaries
         .filter((b) => boxes.has(b.id))
         .map((b) => {
            const box = boxes.get(b.id)!;
            return {
               id: b.id,
               type: "boundary",
               position: { x: box.x, y: box.y },
               width: box.w,
               height: box.h,
               measured: { width: box.w, height: box.h },
               zIndex: -1,
               draggable: false,
               connectable: false,
               focusable: false,
               selected: selection?.kind === "boundary" && selection.id === b.id,
               ariaLabel: `${BOUNDARY_TYPE_LABEL[b.type]}: ${boundaryNames.get(b.id)}`,
               data: { name: boundaryNames.get(b.id)!, kind: BOUNDARY_TYPE_LABEL[b.type] },
            };
         });
      const shapes: ShapeFlowNode[] = draft.graph.nodes.map((node) => {
         const frame = frames.get(node.id)!;
         const k = counts.get(node.id) ?? { inc: 0, out: 0 };
         return {
            id: node.id,
            type: "shape",
            position: { x: frame.x, y: frame.y },
            width: NODE_TYPE[node.type].w,
            height: NODE_TYPE[node.type].h,
            // Sizes are fixed per type, so the projection states them: a controlled node then counts as measured for dragging.
            measured: { width: NODE_TYPE[node.type].w, height: NODE_TYPE[node.type].h },
            draggable: editable,
            connectable: editable,
            selected: selection?.kind === "node" && selection.id === node.id,
            ariaLabel: nodeLabel(node, k.inc, k.out, node.boundary ? (boundaryNames.get(node.boundary) ?? null) : null),
            data: { node, name: names.get(node.id)!, unnamed: node.label.trim() === "", unexplained: node.explanation.trim() === "", markers, connectable: editable },
         };
      });
      return [...groups, ...shapes];
   }, [draft, frames, counts, names, selection, editable, markers]);

   const flowEdges = useMemo<CurvedFlowEdge[]>(
      () =>
         draft.graph.edges.map((edge) => {
            const isSelected = selection?.kind === "edge" && selection.id === edge.id;
            return {
               id: edge.id,
               type: "curved",
               source: edge.from,
               target: edge.to,
               selected: isSelected,
               markerEnd: isSelected ? "pg-arrow-selected" : "pg-arrow",
               ariaLabel: edgeLabel(edge, names.get(edge.from) ?? "a component", names.get(edge.to) ?? "a component"),
               data: { edge, markers, bendable: editable },
            };
         }),
      [draft.graph.edges, selection, names, markers, editable],
   );

   // Routing: recomputed only when geometry or connectivity changes; a bent connection follows its own waypoint.
   const bent = useMemo(() => {
      const points = new Map(Object.entries(draft.layout.edges).map(([id, p]) => [id, p[0]] as const));
      if (bend) points.set(bend.id, { x: bend.x, y: bend.y });
      return points;
   }, [draft.layout.edges, bend]);
   const geomKey = useMemo(
      () => [...frames].map(([id, f]) => `${id}:${f.x}:${f.y}:${f.w}:${f.h}`).join(";") + "#" + draft.graph.edges.filter((e) => !bent.has(e.id)).map((e) => `${e.id}:${e.from}:${e.to}`).join(";"),
      [frames, draft.graph.edges, bent],
   );
   const routes = useMemo(() => {
      void routeTick;
      const rects = new Map<string, Rect>([...frames].map(([id, f]) => [id, { x: f.x, y: f.y, w: f.w, h: f.h }]));
      const map = new Map<string, Route>(router.update(geomKey, rects, draft.graph.edges.filter((e) => !bent.has(e.id)).map((e) => ({ id: e.id, source: e.from, target: e.to }))));
      for (const edge of draft.graph.edges) {
         const point = bent.get(edge.id);
         const a = rects.get(edge.from);
         const b = rects.get(edge.to);
         if (point && a && b) map.set(edge.id, routeVia(a, b, point));
      }
      return map;
      // geomKey and bent encode everything the router reads; routeTick continues deferred work.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [geomKey, bent, routeTick]);
   useEffect(() => {
      if (router.pendingCount === 0) return;
      const timer = setTimeout(() => setRouteTick((t) => t + 1), 0);
      return () => clearTimeout(timer);
   }, [routes, router]);

   const onBend = useCallback(
      (id: string, point: { x: number; y: number }, final: boolean) => {
         if (!editable) return;
         if (!final) return setBend({ id, ...point });
         setBend(null);
         editor.apply((d) => bendEdge(d, id, point), { key: `bend:${id}:${dragRun.current++}` });
      },
      [editable, editor],
   );
   const routing = useMemo(() => ({ routes, onBend }), [routes, onBend]);

   const onNodesChange: OnNodesChange<FlowNode> = useCallback(
      (changes) => {
         for (const change of changes) {
            if (change.type === "select" && change.selected) editor.select({ kind: change.id.startsWith("b_") ? "boundary" : "node", id: change.id });
            if (change.type !== "position" || !change.position || !editable) continue;
            const { id, position } = change;
            if (change.dragging) {
               dragging.current.add(id);
               setOverlay((current) => new Map(current).set(id, position));
               continue;
            }
            // The end of a drag is one undo step; a run of arrow-key nudges of one component is one step too.
            const key = dragging.current.delete(id) ? `drag:${id}:${dragRun.current++}` : `nudge:${id}`;
            setOverlay((current) => {
               const next = new Map(current);
               next.delete(id);
               return next;
            });
            editor.apply((d) => moveNode(d, id, position), { key });
         }
      },
      [editable, editor],
   );

   const onEdgesChange: OnEdgesChange<CurvedFlowEdge> = useCallback(
      (changes) => {
         for (const change of changes) if (change.type === "select" && change.selected) editor.select({ kind: "edge", id: change.id });
      },
      [editor],
   );

   const onConnect = useCallback(
      (connection: Connection) => {
         if (!editable) return;
         editor.apply((d) => addEdge(d, connection.source, connection.target), {
            select: (r) => ({ kind: "edge", id: r.id }),
            announce: (r) => (r.existing ? `${editor.describe("node", connection.source)} already connects to ${editor.describe("node", connection.target)}.` : `Connected ${editor.describe("node", connection.source)} to ${editor.describe("node", connection.target)}. Request, not yet explained.`),
         });
      },
      [editable, editor],
   );

   return (
      <RoutingContext.Provider value={routing}>
         <svg className="pg-defs" aria-hidden="true" focusable="false" width="0" height="0">
            <defs>
               <marker id="pg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" className="pg-arrowhead" />
               </marker>
               <marker id="pg-arrow-selected" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" className="pg-arrowhead is-selected" />
               </marker>
            </defs>
         </svg>
         <ReactFlow<FlowNode, CurvedFlowEdge>
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onPaneClick={() => editor.select(null)}
            isValidConnection={(c) => c.source !== c.target}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={48}
            connectionLineComponent={ConnectionLine}
            nodesDraggable={editable}
            nodesConnectable={editable}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            snapToGrid
            snapGrid={[8, 8]}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
            minZoom={0.2}
            maxZoom={2}
            ariaLabelConfig={{ "node.a11yDescription.default": NODE_HELP, "node.a11yDescription.keyboardDisabled": NODE_HELP }}
         >
            <Background gap={24} size={1} className="pg-grid" />
            <Controls showInteractive={false} position="bottom-left" aria-label="Zoom controls" />
         </ReactFlow>
      </RoutingContext.Provider>
   );
}
