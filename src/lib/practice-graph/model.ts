/**
 * The one canonical graph of an attempt as the editor holds it (`in.arch-graph/1` plus `in.arch-layout/1`), and every semantic
 * and layout operation on it as a pure function. The canvas, the Inspector and the Outline all call these; React Flow's nodes
 * and edges are only a projection of this draft (`projection.ts`). An operation that would break a rule is refused with a reason
 * and returns nothing, so no known-invalid graph is ever produced by an action.
 */

import type { ArchGraph, ArchLayout, BoundaryType, DiagramOut, EdgeKind, Frame, NodeType, Point, TombstoneOut } from "@/lib/practice-workspace/types";
import { isElementId, newId } from "./ids";
import { BOUNDARY_TYPES, EDGE_KINDS, LIMITS, NODE_TYPE, SUBTYPES, isLegalSubtype } from "./vocabulary";

export interface DNode {
   id: string;
   type: NodeType;
   subtype: string | null;
   label: string;
   explanation: string;
   boundary: string | null;
}

export interface DEdge {
   id: string;
   from: string;
   to: string;
   kind: EdgeKind;
   tag: string;
   explanation: string;
}

export interface DBoundary {
   id: string;
   type: BoundaryType;
   label: string;
}

export interface DGraph {
   schema: "in.arch-graph/1";
   nodes: DNode[];
   edges: DEdge[];
   boundaries: DBoundary[];
}

/** Positions only: node frames and at most one bend waypoint per edge. No text, no viewport, no selection. */
export interface DLayout {
   nodes: Record<string, Frame>;
   edges: Record<string, Point[]>;
}

export interface DiagramDraft {
   graph: DGraph;
   layout: DLayout;
}

export type Op<T = object> = ({ ok: true; draft: DiagramDraft } & T) | { ok: false; reason: string };

const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

export const EMPTY_DRAFT: DiagramDraft = { graph: { schema: "in.arch-graph/1", nodes: [], edges: [], boundaries: [] }, layout: { nodes: {}, edges: {} } };

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const isNodeType = (value: unknown): value is NodeType => typeof value === "string" && Object.hasOwn(NODE_TYPE, value);
const isKind = (value: unknown): value is EdgeKind => typeof value === "string" && (EDGE_KINDS as readonly string[]).includes(value);
const isBoundaryType = (value: unknown): value is BoundaryType => typeof value === "string" && (BOUNDARY_TYPES as readonly string[]).includes(value);
const isRec = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function nodeFrom(raw: unknown): DNode | null {
   if (!isRec(raw) || !isElementId(raw.id, "n") || !isNodeType(raw.type)) return null;
   const subtype = typeof raw.subtype === "string" && isLegalSubtype(raw.type, raw.subtype) ? raw.subtype : null;
   return { id: raw.id, type: raw.type, subtype, label: str(raw.label), explanation: str(raw.explanation), boundary: isElementId(raw.boundary, "b") ? raw.boundary : null };
}

export function edgeFrom(raw: unknown): DEdge | null {
   if (!isRec(raw) || !isElementId(raw.id, "e") || !isElementId(raw.from, "n") || !isElementId(raw.to, "n")) return null;
   return { id: raw.id, from: raw.from, to: raw.to, kind: isKind(raw.kind) ? raw.kind : "request", tag: str(raw.tag), explanation: str(raw.explanation) };
}

export function boundaryFrom(raw: unknown): DBoundary | null {
   if (!isRec(raw) || !isElementId(raw.id, "b") || !isBoundaryType(raw.type)) return null;
   return { id: raw.id, type: raw.type, label: str(raw.label) };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** The editor's draft from what the server returned: every key present, unreadable elements and positions left out. */
export function draftFromServer(graph: ArchGraph, layout: ArchLayout | null): DiagramDraft {
   const nodes = (graph.nodes ?? []).map(nodeFrom).filter((n): n is DNode => n !== null);
   const edges = (graph.edges ?? []).map(edgeFrom).filter((e): e is DEdge => e !== null);
   const boundaries = (graph.boundaries ?? []).map(boundaryFrom).filter((b): b is DBoundary => b !== null);
   const frames: Record<string, Frame> = {};
   for (const [id, frame] of Object.entries(layout?.nodes ?? {})) {
      if (isRec(frame) && finite(frame.x) && finite(frame.y) && finite(frame.w) && finite(frame.h)) frames[id] = { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
   }
   const routes: Record<string, Point[]> = {};
   for (const [id, points] of Object.entries(layout?.edges ?? {})) {
      if (Array.isArray(points) && points.length > 0 && points.every((p) => isRec(p) && finite(p.x) && finite(p.y))) routes[id] = points.slice(0, 1).map((p) => ({ x: p.x, y: p.y }));
   }
   return { graph: { schema: "in.arch-graph/1", nodes, edges, boundaries }, layout: { nodes: frames, edges: routes } };
}

export const draftOfDiagram = (saved: DiagramOut): DiagramDraft => draftFromServer(saved.graph, saved.layout);

// --- reading ---

export const findNode = (draft: DiagramDraft, id: string) => draft.graph.nodes.find((n) => n.id === id);
export const findEdge = (draft: DiagramDraft, id: string) => draft.graph.edges.find((e) => e.id === id);
export const findBoundary = (draft: DiagramDraft, id: string) => draft.graph.boundaries.find((b) => b.id === id);
export const incidentEdges = (draft: DiagramDraft, nodeId: string) => draft.graph.edges.filter((e) => e.from === nodeId || e.to === nodeId);

/** How many elements one deletion of this node tombstones together: the node and every incident edge. */
export const deletionGroupSize = (draft: DiagramDraft, nodeId: string): number => 1 + incidentEdges(draft, nodeId).length;

function withGraph(draft: DiagramDraft, graph: Partial<DGraph>, layout?: Partial<DLayout>): DiagramDraft {
   return { graph: { ...draft.graph, ...graph }, layout: layout ? { ...draft.layout, ...layout } : draft.layout };
}

const omit = <T>(record: Record<string, T>, ids: ReadonlySet<string>): Record<string, T> => Object.fromEntries(Object.entries(record).filter(([id]) => !ids.has(id)));

// --- nodes ---

export function addNode(draft: DiagramDraft, type: NodeType, options: { label?: string; at?: Point; boundary?: string | null } = {}): Op<{ id: string }> {
   if (draft.graph.nodes.length >= LIMITS.max_nodes) return refuse(`A diagram holds at most ${LIMITS.max_nodes} components.`);
   const boundary = options.boundary && findBoundary(draft, options.boundary) ? options.boundary : null;
   const id = newId("n");
   const node: DNode = { id, type, subtype: null, label: options.label ?? "", explanation: "", boundary };
   const nodes = options.at ? { ...draft.layout.nodes, [id]: { x: Math.round(options.at.x), y: Math.round(options.at.y), w: NODE_TYPE[type].w, h: NODE_TYPE[type].h } } : draft.layout.nodes;
   return { ok: true, id, draft: withGraph(draft, { nodes: [...draft.graph.nodes, node] }, { nodes }) };
}

export type NodePatch = Partial<Pick<DNode, "label" | "explanation" | "subtype" | "boundary">>;

export function updateNode(draft: DiagramDraft, id: string, patch: NodePatch): Op {
   const node = findNode(draft, id);
   if (!node) return refuse("That component no longer exists.");
   if (patch.subtype !== undefined && !isLegalSubtype(node.type, patch.subtype)) return refuse("That subtype does not belong to this type.");
   if (patch.boundary != null && !findBoundary(draft, patch.boundary)) return refuse("That boundary no longer exists.");
   const next = { ...node, ...patch };
   return { ok: true, draft: withGraph(draft, { nodes: draft.graph.nodes.map((n) => (n.id === id ? next : n)) }) };
}

/** Retype keeps the ID, the name, the explanation and the boundary; a subtype that is not legal for the new type is cleared. */
export function retypeNode(draft: DiagramDraft, id: string, type: NodeType): Op {
   const node = findNode(draft, id);
   if (!node) return refuse("That component no longer exists.");
   if (node.type === type) return { ok: true, draft };
   const next: DNode = { ...node, type, subtype: node.subtype && SUBTYPES[type].includes(node.subtype) ? node.subtype : null };
   const frame = draft.layout.nodes[id];
   const nodes = frame ? { ...draft.layout.nodes, [id]: { ...frame, w: NODE_TYPE[type].w, h: NODE_TYPE[type].h } } : draft.layout.nodes;
   return { ok: true, draft: withGraph(draft, { nodes: draft.graph.nodes.map((n) => (n.id === id ? next : n)) }, { nodes }) };
}

export function duplicateNode(draft: DiagramDraft, id: string): Op<{ id: string }> {
   const node = findNode(draft, id);
   if (!node) return refuse("That component no longer exists.");
   if (draft.graph.nodes.length >= LIMITS.max_nodes) return refuse(`A diagram holds at most ${LIMITS.max_nodes} components.`);
   const copy: DNode = { ...node, id: newId("n") };
   const frame = draft.layout.nodes[id];
   const nodes = frame ? { ...draft.layout.nodes, [copy.id]: { ...frame, x: frame.x + 32, y: frame.y + 32 } } : draft.layout.nodes;
   return { ok: true, id: copy.id, draft: withGraph(draft, { nodes: [...draft.graph.nodes, copy] }, { nodes }) };
}

/** Deleting a node deletes its connections in the same step (one tombstone group on the server). */
export function deleteNode(draft: DiagramDraft, id: string): Op<{ edges: string[] }> {
   if (!findNode(draft, id)) return refuse("That component no longer exists.");
   const gone = new Set(incidentEdges(draft, id).map((e) => e.id));
   return {
      ok: true,
      edges: [...gone],
      draft: withGraph(
         draft,
         { nodes: draft.graph.nodes.filter((n) => n.id !== id), edges: draft.graph.edges.filter((e) => !gone.has(e.id)) },
         { nodes: omit(draft.layout.nodes, new Set([id])), edges: omit(draft.layout.edges, gone) },
      ),
   };
}

/** Layout only: a node's position. Never changes the graph or its hashes. */
export function moveNode(draft: DiagramDraft, id: string, to: Point): Op {
   const node = findNode(draft, id);
   if (!node) return refuse("That component no longer exists.");
   const size = NODE_TYPE[node.type];
   const frame = { x: Math.round(to.x), y: Math.round(to.y), w: size.w, h: size.h };
   const old = draft.layout.nodes[id];
   if (old && old.x === frame.x && old.y === frame.y && old.w === frame.w && old.h === frame.h) return { ok: true, draft };
   return { ok: true, draft: withGraph(draft, {}, { nodes: { ...draft.layout.nodes, [id]: frame } }) };
}

// --- edges ---

export function addEdge(draft: DiagramDraft, from: string, to: string, kind: EdgeKind = "request"): Op<{ id: string; existing?: boolean }> {
   if (from === to) return refuse("A component cannot connect to itself.");
   if (!findNode(draft, from) || !findNode(draft, to)) return refuse("Both ends of a connection must be components on this diagram.");
   const same = draft.graph.edges.find((e) => e.from === from && e.to === to && e.kind === kind);
   if (same) return { ok: true, id: same.id, existing: true, draft };
   if (draft.graph.edges.length >= LIMITS.max_edges) return refuse(`A diagram holds at most ${LIMITS.max_edges} connections.`);
   const edge: DEdge = { id: newId("e"), from, to, kind, tag: "", explanation: "" };
   return { ok: true, id: edge.id, draft: withGraph(draft, { edges: [...draft.graph.edges, edge] }) };
}

export type EdgePatch = Partial<Pick<DEdge, "kind" | "tag" | "explanation">>;

export function updateEdge(draft: DiagramDraft, id: string, patch: EdgePatch): Op {
   if (!findEdge(draft, id)) return refuse("That connection no longer exists.");
   return { ok: true, draft: withGraph(draft, { edges: draft.graph.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }) };
}

/** The same connection, pointing the other way: the ID, kind, tag and explanation are kept. */
export function swapEdge(draft: DiagramDraft, id: string): Op {
   const edge = findEdge(draft, id);
   if (!edge) return refuse("That connection no longer exists.");
   return { ok: true, draft: withGraph(draft, { edges: draft.graph.edges.map((e) => (e.id === id ? { ...e, from: e.to, to: e.from } : e)) }) };
}

export function deleteEdge(draft: DiagramDraft, id: string): Op {
   if (!findEdge(draft, id)) return refuse("That connection no longer exists.");
   const gone = new Set([id]);
   return { ok: true, draft: withGraph(draft, { edges: draft.graph.edges.filter((e) => e.id !== id) }, { edges: omit(draft.layout.edges, gone) }) };
}

/** Layout only: the one bend point of a curved connection, or none. */
export function bendEdge(draft: DiagramDraft, id: string, point: Point | null): Op {
   if (!findEdge(draft, id)) return refuse("That connection no longer exists.");
   const edges = point ? { ...draft.layout.edges, [id]: [{ x: Math.round(point.x), y: Math.round(point.y) }] } : omit(draft.layout.edges, new Set([id]));
   return { ok: true, draft: withGraph(draft, {}, { edges }) };
}

// --- boundaries ---

export function addBoundary(draft: DiagramDraft, type: BoundaryType, label = ""): Op<{ id: string }> {
   if (draft.graph.boundaries.length >= LIMITS.max_boundaries) return refuse(`A diagram holds at most ${LIMITS.max_boundaries} boundaries.`);
   const boundary: DBoundary = { id: newId("b"), type, label };
   return { ok: true, id: boundary.id, draft: withGraph(draft, { boundaries: [...draft.graph.boundaries, boundary] }) };
}

export function updateBoundary(draft: DiagramDraft, id: string, patch: Partial<Pick<DBoundary, "type" | "label">>): Op {
   if (!findBoundary(draft, id)) return refuse("That boundary no longer exists.");
   return { ok: true, draft: withGraph(draft, { boundaries: draft.graph.boundaries.map((b) => (b.id === id ? { ...b, ...patch } : b)) }) };
}

/** Removes the boundary and every membership in it, in one step; the components stay. */
export function deleteBoundary(draft: DiagramDraft, id: string): Op {
   if (!findBoundary(draft, id)) return refuse("That boundary no longer exists.");
   return {
      ok: true,
      draft: withGraph(draft, {
         boundaries: draft.graph.boundaries.filter((b) => b.id !== id),
         nodes: draft.graph.nodes.map((n) => (n.boundary === id ? { ...n, boundary: null } : n)),
      }),
   };
}

// --- restoration ---

export interface RestoreResult {
   restored: string[];
   /** Connections left out because an end is not on the diagram: restoring them would leave them dangling. */
   skipped: string[];
}

/**
 * Re-inserts a server tombstone group with the same IDs and payloads (`P9-C-GRF-03b`): boundaries and components first, then the
 * connections whose two ends are on the diagram afterwards. Elements already live are left alone; a membership in a boundary that is
 * not on the diagram is dropped so the result stays valid.
 */
export function restoreElements(draft: DiagramDraft, elements: readonly { kind: TombstoneOut["kind"]; element: unknown }[]): Op<RestoreResult> {
   const live = new Set([...draft.graph.nodes, ...draft.graph.edges, ...draft.graph.boundaries].map((e) => e.id));
   const boundaries = elements.filter((t) => t.kind === "boundary").map((t) => boundaryFrom(t.element)).filter((b): b is DBoundary => b !== null && !live.has(b.id));
   const allBoundaries = [...draft.graph.boundaries, ...boundaries];
   const boundaryIds = new Set(allBoundaries.map((b) => b.id));
   const nodes = elements
      .filter((t) => t.kind === "node")
      .map((t) => nodeFrom(t.element))
      .filter((n): n is DNode => n !== null && !live.has(n.id))
      .map((n) => (n.boundary && !boundaryIds.has(n.boundary) ? { ...n, boundary: null } : n));
   const allNodes = [...draft.graph.nodes, ...nodes];
   const nodeIds = new Set(allNodes.map((n) => n.id));
   const candidates = elements.filter((t) => t.kind === "edge").map((t) => edgeFrom(t.element)).filter((e): e is DEdge => e !== null && !live.has(e.id));
   const edges = candidates.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to);
   const skipped = candidates.filter((e) => !edges.includes(e)).map((e) => e.id);
   if (allNodes.length > LIMITS.max_nodes || draft.graph.edges.length + edges.length > LIMITS.max_edges || allBoundaries.length > LIMITS.max_boundaries) {
      return refuse("Restoring this would pass the diagram's limits. Remove something first.");
   }
   return {
      ok: true,
      restored: [...boundaries, ...nodes, ...edges].map((e) => e.id),
      skipped,
      draft: withGraph(draft, { nodes: allNodes, edges: [...draft.graph.edges, ...edges], boundaries: allBoundaries }),
   };
}

/** The server can no longer restore these IDs (`retired_id`): the same elements are re-added as new ones, with new IDs and the same text. */
export function recreateAsNew(draft: DiagramDraft, retired: readonly string[]): Op<{ mapping: Record<string, string> }> {
   const mapping: Record<string, string> = {};
   for (const id of retired) {
      if (isElementId(id)) mapping[id] = newId(id[0] as "n" | "e" | "b");
   }
   const map = (id: string) => mapping[id] ?? id;
   const mapNullable = (id: string | null) => (id === null ? null : map(id));
   const rekey = <T>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).map(([id, v]) => [map(id), v]));
   return {
      ok: true,
      mapping,
      draft: {
         graph: {
            schema: "in.arch-graph/1",
            nodes: draft.graph.nodes.map((n) => ({ ...n, id: map(n.id), boundary: mapNullable(n.boundary) })),
            edges: draft.graph.edges.map((e) => ({ ...e, id: map(e.id), from: map(e.from), to: map(e.to) })),
            boundaries: draft.graph.boundaries.map((b) => ({ ...b, id: map(b.id) })),
         },
         layout: { nodes: rekey(draft.layout.nodes), edges: rekey(draft.layout.edges) },
      },
   };
}
