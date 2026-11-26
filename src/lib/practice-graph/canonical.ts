/**
 * The explicit boundary between the editor's draft and the API (`graph-editor-contract.md` §4 and §6.4). The graph is sent in its
 * canonical form: stored strings (NFC, trimmed), every key present, keys in the backend's fixed order, arrays sorted by ID. Its
 * compact JSON is byte-identical to the backend's `canonical_json` (checked against T10's hash vectors). The server's hashes stay
 * authoritative; the client compares canonical JSON only to know whether anything is unsaved.
 */

import type { ArchGraph, ArchLayout, DiagramOut } from "@/lib/practice-workspace/types";
import { LAYOUT_BOUNDS } from "./vocabulary";
import { draftFromServer, type DGraph, type DiagramDraft } from "./model";
import { storedText } from "./text";

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The graph as the server stores it. Keys are written in the backend's order (`canonical.py`), so `JSON.stringify` matches it. */
export function wireGraph(graph: DGraph): ArchGraph {
   return {
      schema: "in.arch-graph/1",
      nodes: [...graph.nodes].sort(byId).map((n) => ({ id: n.id, type: n.type, subtype: n.subtype, label: storedText(n.label), explanation: storedText(n.explanation), boundary: n.boundary })),
      edges: [...graph.edges].sort(byId).map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind, tag: storedText(e.tag), explanation: storedText(e.explanation) })),
      boundaries: [...graph.boundaries].sort(byId).map((b) => ({ id: b.id, type: b.type, label: storedText(b.label) })),
   };
}

export const canonicalJson = (graph: ArchGraph): string => JSON.stringify(graph);

/** The structure-and-typing projection behind `topology_hash`: no learner-authored string. */
export function topologyJson(graph: ArchGraph): string {
   return JSON.stringify({
      schema: graph.schema,
      nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, subtype: n.subtype ?? null, boundary: n.boundary ?? null })),
      edges: graph.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind ?? "request" })),
      boundaries: graph.boundaries.map((b) => ({ id: b.id, type: b.type })),
   });
}

const clampCoord = (v: number) => Math.min(LAYOUT_BOUNDS.coordinateMax, Math.max(LAYOUT_BOUNDS.coordinateMin, Math.round(v)));
const clampSize = (v: number) => Math.min(LAYOUT_BOUNDS.sizeMax, Math.max(1, Math.round(v)));
const sortedEntries = <T>(record: Record<string, T>, live: ReadonlySet<string>) => Object.entries(record).filter(([id]) => live.has(id)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * Positions for the live elements only, rounded and inside the G-07 bounds. No viewport: panning and zooming never cause a save.
 * Boundary frames are drawn from their members, so none is stored.
 */
export function wireLayout(draft: DiagramDraft): ArchLayout {
   const liveNodes = new Set(draft.graph.nodes.map((n) => n.id));
   const liveEdges = new Set(draft.graph.edges.map((e) => e.id));
   return {
      schema: "in.arch-layout/1",
      nodes: Object.fromEntries(sortedEntries(draft.layout.nodes, liveNodes).map(([id, f]) => [id, { x: clampCoord(f.x), y: clampCoord(f.y), w: clampSize(f.w), h: clampSize(f.h) }])),
      edges: Object.fromEntries(sortedEntries(draft.layout.edges, liveEdges).map(([id, points]) => [id, points.map((p) => ({ x: clampCoord(p.x), y: clampCoord(p.y) }))])),
      boundaries: {},
   };
}

export const layoutBytes = (layout: ArchLayout): number => new TextEncoder().encode(JSON.stringify(layout)).length;

/** The saved state in the same canonical shapes, for comparison with a draft. */
export function wireOfSaved(saved: DiagramOut): { graph: string; layout: string } {
   const draft = draftFromServer(saved.graph, saved.layout);
   return { graph: canonicalJson(wireGraph(draft.graph)), layout: JSON.stringify(wireLayout(draft)) };
}
