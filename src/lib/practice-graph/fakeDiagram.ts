/**
 * Test-only: `GET` and `PUT .../diagram` on the in-memory practice service (`fakeAttempts.ts`), answering as T10's diagram service
 * does in the cases the editor depends on: compare-and-set versions, tombstone groups (a node with its incident edges), restoration of
 * tombstoned IDs, the 100-element tombstone cap and retired IDs, `restore_dangling`, `retired_id`, `attempt_not_active` and owner-scoped
 * 404s. It is not T10: the real rules are T10's and are tested there. Production code never imports this file.
 */

import { failure, type FakePracticeApi, type FakeReply, type FakeRequest } from "@/lib/practice-workspace/fakeApi";
import type { FakeAttempts } from "@/lib/practice-workspace/fakeAttempts";
import type { ArchGraph, ArchLayout, DiagramOut, TombstoneOut } from "@/lib/practice-workspace/types";
import { canonicalJson, topologyJson, wireGraph } from "./canonical";
import { draftFromServer } from "./model";
import { validateDraft } from "./validate";

interface Stored {
   version: number;
   graph: ArchGraph;
   layout: ArchLayout | null;
   tombstones: TombstoneOut[];
   retired: string[];
   groups: number;
}

const EMPTY: ArchGraph = { schema: "in.arch-graph/1", nodes: [], edges: [], boundaries: [] };
const userOf = (request: FakeRequest) => request.token?.replace(/^fake-token-/, "") ?? "";

/** A deterministic stand-in for SHA-256 (two 32-bit FNV-1a lanes): equal canonical graphs give equal values. Labelled fake. */
function fakeHash(text: string): string {
   let a = 0x811c9dc5;
   let b = 0x01000193;
   for (const byte of new TextEncoder().encode(text)) {
      a = Math.imul(a ^ byte, 0x01000193) >>> 0;
      b = Math.imul(b ^ byte, 0x811c9dc5) >>> 0;
   }
   return `fake-${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

export function installFakeDiagram(api: FakePracticeApi, attempts: FakeAttempts) {
   const diagrams = new Map<string, Stored>();
   const ofAttempt = (id: string): Stored => {
      let stored = diagrams.get(id);
      if (!stored) {
         stored = { version: 1, graph: EMPTY, layout: null, tombstones: [], retired: [], groups: 0 };
         diagrams.set(id, stored);
      }
      return stored;
   };
   const out = (stored: Stored): DiagramOut => ({
      version: stored.version,
      graph: stored.graph,
      layout: stored.layout,
      graph_hash: fakeHash(canonicalJson(stored.graph)),
      topology_hash: fakeHash(topologyJson(stored.graph)),
      structure_findings: [],
      tombstones: stored.tombstones,
   });
   const record = (request: FakeRequest) => {
      const id = request.path.split("/")[4] ?? "";
      const found = attempts.records.get(id);
      return found && found.owner === userOf(request) ? { id, found } : null;
   };

   function apply(stored: Stored, next: ArchGraph): FakeReply | null {
      const ids = (graph: ArchGraph) => new Set([...graph.nodes, ...graph.edges, ...graph.boundaries].map((e) => e.id));
      const nextIds = ids(next);
      const retired = [...nextIds].filter((id) => stored.retired.includes(id));
      if (retired.length > 0) return failure("graph_invalid", 422, { reasons: retired.map((id) => ({ rule: "retired_id", element_id: id })) });
      const nodeIds = new Set(next.nodes.map((n) => n.id));
      const tombstoned = new Set(stored.tombstones.map((t) => t.id));
      const dangling = next.edges.filter((e) => !nodeIds.has(e.from) || !nodeIds.has(e.to));
      if (dangling.length > 0) return failure("graph_invalid", 422, { reasons: dangling.map((e) => ({ rule: tombstoned.has(e.id) ? "restore_dangling" : "dangling_edge", element_id: e.id })) });
      const issues = validateDraft(draftFromServer(next, null));
      if (issues.length > 0) return failure("graph_invalid", 422, { reasons: issues.map((i) => (i.elementId ? { rule: i.rule, element_id: i.elementId } : { rule: i.rule })) });

      const before = stored.graph;
      stored.tombstones = stored.tombstones.filter((t) => !nextIds.has(t.id));
      const deletedNodes = before.nodes.filter((n) => !nodeIds.has(n.id));
      const grouped = new Set<string>();
      const groups: TombstoneOut[][] = [];
      for (const node of deletedNodes) {
         const edges = before.edges.filter((e) => (e.from === node.id || e.to === node.id) && !nextIds.has(e.id) && !grouped.has(e.id));
         edges.forEach((e) => grouped.add(e.id));
         groups.push([node, ...edges].map((element) => ({ id: element.id, kind: element.id.startsWith("n_") ? "node" : "edge", group: "", deleted_at_version: stored.version, element: { ...element } })));
      }
      for (const element of [...before.edges, ...before.boundaries]) {
         if (!nextIds.has(element.id) && !grouped.has(element.id)) groups.push([{ id: element.id, kind: element.id.startsWith("e_") ? "edge" : "boundary", group: "", deleted_at_version: stored.version, element: { ...element } }]);
      }
      for (const group of groups) {
         const name = `g${++stored.groups}`;
         const members = group.map((t) => ({ ...t, group: name }));
         if (members.length > 100) stored.retired.push(...members.map((t) => t.id));
         else stored.tombstones.push(...members);
      }
      while (stored.tombstones.length > 100) {
         const oldest = stored.tombstones[0].group;
         stored.retired.push(...stored.tombstones.filter((t) => t.group === oldest).map((t) => t.id));
         stored.tombstones = stored.tombstones.filter((t) => t.group !== oldest);
      }
      stored.retired = stored.retired.slice(-500);
      return null;
   }

   api.script("get_diagram", (request) => {
      const found = record(request);
      return found ? { status: 200, body: out(ofAttempt(found.id)) } : failure("not_found", 404);
   });

   api.script("put_diagram", (request) => {
      const found = record(request);
      if (!found) return failure("not_found", 404);
      if (found.found.attempt.status !== "active") return failure("attempt_not_active", 409, { status: found.found.attempt.status });
      const body = request.body as { version?: unknown; graph?: ArchGraph; layout?: ArchLayout | null };
      const stored = ofAttempt(found.id);
      if (typeof body.version !== "number" || !body.graph) return failure("validation_error", 422, { fields: [{ field: "version", reason: "required" }] });
      if (body.version !== stored.version) return failure("version_conflict", 409, { current_version: stored.version });
      const graph = wireGraph(draftFromServer(body.graph, null).graph);
      const refused = apply(stored, graph);
      if (refused) return refused;
      stored.graph = graph;
      if (body.layout) stored.layout = body.layout;
      stored.version += 1;
      found.found.attempt.diagram_version = stored.version;
      return { status: 200, body: out(stored) };
   });

   return {
      diagram: (attemptId: string) => out(ofAttempt(attemptId)),
      /** Another device saves this diagram: the canonical version moves on. */
      writeElsewhere(attemptId: string, update: (graph: ArchGraph) => ArchGraph, layout?: ArchLayout): FakeReply | null {
         const stored = ofAttempt(attemptId);
         const graph = wireGraph(draftFromServer(update(stored.graph), null).graph);
         const refused = apply(stored, graph);
         if (refused) return refused;
         stored.graph = graph;
         if (layout) stored.layout = layout;
         stored.version += 1;
         return null;
      },
      /** Marks IDs as retired, as an eviction or a submit would. */
      retire(attemptId: string, ids: string[]) {
         const stored = ofAttempt(attemptId);
         stored.tombstones = stored.tombstones.filter((t) => !ids.includes(t.id));
         stored.retired.push(...ids);
      },
      calls: () => api.requests.filter((r) => r.route === "put_diagram" || r.route === "get_diagram"),
   };
}

export type FakeDiagram = ReturnType<typeof installFakeDiagram>;
