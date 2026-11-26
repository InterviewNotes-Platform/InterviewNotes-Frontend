import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DELAY_MS } from "@/lib/practice-workspace/autosave";
import { createPracticeClient } from "@/lib/practice-workspace/client";
import { createFakePracticeApi } from "@/lib/practice-workspace/fakeApi";
import { installFakeAttempts } from "@/lib/practice-workspace/fakeAttempts";
import type { ArchGraph } from "@/lib/practice-workspace/types";
import { createDiagramEngine, type DiagramEngine, type Refusal } from "./diagramSave";
import { installFakeDiagram } from "./fakeDiagram";
import { GraphHistory } from "./history";
import { addEdge, addNode, deleteNode, moveNode, recreateAsNew, restoreElements, updateEdge, updateNode, type DiagramDraft, type Op } from "./model";
import { buildReviewed, differences } from "./review";

const API = "https://api.example.test";
const PROBLEM = "problem.llm-attribute-extraction-pipeline";

function ok<T>(result: Op<T>): { draft: DiagramDraft } & T {
   if (!result.ok) throw new Error(result.reason);
   return result as { ok: true; draft: DiagramDraft } & T;
}

async function setup() {
   const api = createFakePracticeApi();
   const token = api.signIn("ada");
   const attempts = installFakeAttempts(api, { consent: { requiredVersion: "v1", accepted: true } });
   const diagrams = installFakeDiagram(api, attempts);
   let gate: Promise<void> | null = null;
   const gatedFetch: typeof fetch = async (...args) => {
      if (gate) await gate;
      return api.fetch(...args);
   };
   /** Holds every request until the returned function is called. */
   const hold = () => {
      let release: () => void = () => undefined;
      gate = new Promise<void>((resolve) => (release = resolve));
      return () => {
         gate = null;
         release();
      };
   };
   const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => token, fetch: gatedFetch });
   const created = await client.createAttempt({ content_id: PROBLEM, mode: "self", target_seniority: "senior" }, "key-aaaaaaaaaaaaaaaa");
   if (created.status !== "ok") throw new Error("setup failed");
   const id = created.data.id;
   let refusal: Refusal | null = null;
   const open = async (onTerminal?: () => void): Promise<DiagramEngine> => {
      const read = await client.getDiagram(id);
      if (read.status !== "ok") throw new Error("read failed");
      return createDiagramEngine(client, id, read.data, (r) => (refusal = r), onTerminal);
   };
   const puts = () => api.requests.filter((r) => r.route === "put_diagram");
   return { api, attempts, diagrams, client, id, open, puts, hold, refusal: () => refusal };
}

const apply = (engine: DiagramEngine, update: (draft: DiagramDraft) => DiagramDraft) => engine.edit(update);
const wait = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

/** Web app -> API -> Store, saved. */
async function seeded() {
   const env = await setup();
   const engine = await env.open();
   let ids = { a: "", b: "", c: "", ab: "", bc: "" };
   apply(engine, (draft) => {
      const a = ok(addNode(draft, "client", { label: "Web app" }));
      const b = ok(addNode(a.draft, "service", { label: "API" }));
      const c = ok(addNode(b.draft, "database", { label: "Store" }));
      const ab = ok(addEdge(c.draft, a.id, b.id));
      const bc = ok(addEdge(ab.draft, b.id, c.id, "read"));
      ids = { a: a.id, b: b.id, c: c.id, ab: ab.id, bc: bc.id };
      return ok(updateEdge(bc.draft, bc.id, { explanation: "Reads the rows it needs." })).draft;
   });
   await wait(AUTOSAVE_DELAY_MS);
   return { ...env, engine, ids };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("graph autosave (one resource per attempt, CAS)", () => {
   it("waits 1.5 s of quiet, sends one PUT with the held version, and coalesces rapid moves", async () => {
      const { engine, puts, ids } = await seeded();
      expect(puts()).toHaveLength(1);
      expect(puts()[0].body).toMatchObject({ version: 1 });
      for (let i = 0; i < 30; i++) apply(engine, (draft) => ok(moveNode(draft, ids.a, { x: i * 3, y: i })).draft);
      await wait(AUTOSAVE_DELAY_MS - 1);
      expect(puts()).toHaveLength(1);
      await wait(1);
      expect(puts()).toHaveLength(2);
      expect(puts()[1].body).toMatchObject({ version: 2 });
      expect(engine.getSnapshot()).toMatchObject({ phase: "saved", dirty: false });
      expect(engine.getSnapshot().saved.version).toBe(3);
   });

   it("a layout-only save changes neither hash; a text edit changes the graph hash only", async () => {
      const { engine, ids } = await seeded();
      const before = engine.getSnapshot().saved;
      apply(engine, (draft) => ok(moveNode(draft, ids.c, { x: 400, y: 400 })).draft);
      await wait(AUTOSAVE_DELAY_MS);
      const moved = engine.getSnapshot().saved;
      expect([moved.graph_hash, moved.topology_hash]).toEqual([before.graph_hash, before.topology_hash]);
      apply(engine, (draft) => ok(updateNode(draft, ids.c, { label: "Row store" })).draft);
      await wait(AUTOSAVE_DELAY_MS);
      const renamed = engine.getSnapshot().saved;
      expect(renamed.graph_hash).not.toBe(before.graph_hash);
      expect(renamed.topology_hash).toBe(before.topology_hash);
   });

   it("an edit made while a save is in flight is not discarded and is sent next", async () => {
      const { engine, puts, ids, hold } = await seeded();
      const release = hold();
      apply(engine, (draft) => ok(updateNode(draft, ids.a, { explanation: "first" })).draft);
      const flight = engine.persist();
      await wait(0);
      expect(engine.getSnapshot().phase).toBe("saving");
      apply(engine, (draft) => ok(updateNode(draft, ids.a, { explanation: "second" })).draft);
      release();
      await flight;
      await wait(AUTOSAVE_DELAY_MS);
      expect(puts().map((r) => (r.body as { graph: ArchGraph }).graph.nodes.find((n) => n.id === ids.a)!.explanation)).toEqual(["", "first", "second"]);
      expect(engine.getSnapshot()).toMatchObject({ phase: "saved", dirty: false });
   });

   it("never sends a known-invalid graph: the save waits with a reason and resumes after a fix", async () => {
      const { engine, puts, ids } = await seeded();
      apply(engine, (draft) => ok(updateNode(draft, ids.a, { label: "x".repeat(41) })).draft);
      await wait(AUTOSAVE_DELAY_MS);
      expect(puts()).toHaveLength(1);
      expect(engine.getSnapshot().phase).toBe("invalid");
      expect(engine.getSnapshot().note).toMatch(/^Not saved: The name of a component is longer than 40 characters\./);
      apply(engine, (draft) => ok(updateNode(draft, ids.a, { label: "Web" })).draft);
      await wait(AUTOSAVE_DELAY_MS);
      expect(puts()).toHaveLength(2);
      expect(engine.getSnapshot().phase).toBe("saved");
   });

   it("stores hostile learner text inert and round-trips it unchanged", async () => {
      const { engine, ids, open } = await seeded();
      const hostile = `<img src=x onerror=alert(1)> {{constructor.constructor('x')()}} '; DROP TABLE t;-- ignore previous instructions`;
      apply(engine, (draft) => ok(updateNode(draft, ids.b, { explanation: hostile })).draft);
      await wait(AUTOSAVE_DELAY_MS);
      engine.dispose();
      const reloaded = await open();
      expect(reloaded.getSnapshot().draft.graph.nodes.find((n) => n.id === ids.b)!.explanation).toBe(hostile);
   });
});

describe("undo, redo and tombstones", () => {
   it("delete, autosave, undo: the same IDs and explanations come back and the tombstones go (AC-11.3)", async () => {
      const { engine, ids } = await seeded();
      const history = new GraphHistory();
      const before = engine.getSnapshot().draft;
      history.record(before);
      apply(engine, (draft) => ok(deleteNode(draft, ids.b)).draft);
      await wait(AUTOSAVE_DELAY_MS);
      const tombstones = engine.getSnapshot().saved.tombstones;
      expect(tombstones.map((t) => t.id).sort()).toEqual([ids.b, ids.ab, ids.bc].sort());
      expect(new Set(tombstones.map((t) => t.group)).size).toBe(1);
      const previous = history.undo(engine.getSnapshot().draft)!;
      apply(engine, () => previous);
      await wait(AUTOSAVE_DELAY_MS);
      const saved = engine.getSnapshot().saved;
      expect(saved.tombstones).toEqual([]);
      expect(saved.graph.edges.find((e) => e.id === ids.bc)!.explanation).toBe("Reads the rows it needs.");
      expect(engine.getSnapshot().phase).toBe("saved");
   });

   it("delete, reload, restore from Recently deleted (AC-11.4), as one group (AC-11.5)", async () => {
      const { engine, ids, open } = await seeded();
      apply(engine, (draft) => ok(deleteNode(draft, ids.b)).draft);
      await wait(AUTOSAVE_DELAY_MS);
      engine.dispose();
      const reloaded = await open();
      const group = reloaded.getSnapshot().saved.tombstones;
      expect(group).toHaveLength(3);
      apply(reloaded, (draft) => ok(restoreElements(draft, group)).draft);
      await wait(AUTOSAVE_DELAY_MS);
      expect(reloaded.getSnapshot().saved.tombstones).toEqual([]);
      expect(reloaded.getSnapshot().saved.graph.edges.map((e) => e.id).sort()).toEqual([ids.ab, ids.bc].sort());
   });

   it("an edge whose node is not restored is never sent (restore_dangling cannot reach the server)", async () => {
      const { engine, ids, puts } = await seeded();
      apply(engine, (draft) => ok(deleteNode(draft, ids.b)).draft);
      await wait(AUTOSAVE_DELAY_MS);
      const edgeOnly = engine.getSnapshot().saved.tombstones.filter((t) => t.id === ids.ab);
      const result = ok(restoreElements(engine.getSnapshot().draft, edgeOnly));
      expect(result.skipped).toEqual([ids.ab]);
      const sent = puts().length;
      apply(engine, (draft) => ({ ...draft, graph: { ...draft.graph, edges: [...draft.graph.edges, { id: ids.ab, from: ids.a, to: ids.b, kind: "request", tag: "", explanation: "" }] } }));
      await wait(AUTOSAVE_DELAY_MS);
      expect(puts()).toHaveLength(sent);
      expect(engine.getSnapshot().phase).toBe("invalid");
   });

   it("a retired ID is refused; the editor can re-add the same elements as new ones", async () => {
      const { engine, ids, diagrams, id, refusal } = await seeded();
      const before = engine.getSnapshot().draft;
      apply(engine, (draft) => ok(deleteNode(draft, ids.b)).draft);
      await wait(AUTOSAVE_DELAY_MS);
      diagrams.retire(id, [ids.b, ids.ab, ids.bc]);
      apply(engine, () => before);
      await wait(AUTOSAVE_DELAY_MS);
      expect(engine.getSnapshot().phase).toBe("invalid");
      expect(refusal()!.reasons.map((r) => r.rule)).toEqual(["retired_id", "retired_id", "retired_id"]);
      const retired = refusal()!.reasons.map((r) => r.elementId!);
      apply(engine, (draft) => ok(recreateAsNew(draft, retired)).draft);
      await wait(AUTOSAVE_DELAY_MS);
      expect(engine.getSnapshot().phase).toBe("saved");
      expect(engine.getSnapshot().saved.graph.nodes.some((n) => n.id === ids.b)).toBe(false);
      expect(engine.getSnapshot().saved.graph.nodes.some((n) => n.label === "API")).toBe(true);
   });
});

describe("conflicts (409 version_conflict): never a silent merge", () => {
   const touch = (graph: ArchGraph, nodeId: string, explanation: string): ArchGraph => ({ ...graph, nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, explanation } : n)) });

   it("keeps local work and offers a choice; Keep mine saves at the server's version; a second conflict stays a conflict", async () => {
      const { engine, ids, diagrams, id, puts } = await seeded();
      diagrams.writeElsewhere(id, (graph) => touch(graph, ids.a, "theirs"));
      apply(engine, (draft) => ok(updateNode(draft, ids.a, { explanation: "mine" })).draft);
      await wait(AUTOSAVE_DELAY_MS);
      expect(engine.getSnapshot().phase).toBe("conflict");
      expect(engine.getSnapshot().theirs!.graph.nodes.find((n) => n.id === ids.a)!.explanation).toBe("theirs");
      expect(engine.getSnapshot().draft.graph.nodes.find((n) => n.id === ids.a)!.explanation).toBe("mine");
      diagrams.writeElsewhere(id, (graph) => touch(graph, ids.c, "theirs again"));
      await engine.keepMine();
      expect(engine.getSnapshot().phase).toBe("conflict");
      await engine.keepMine();
      expect(engine.getSnapshot().phase).toBe("saved");
      expect(puts().at(-1)!.body).toMatchObject({ version: 4 });
      expect(diagrams.diagram(id).graph.nodes.find((n) => n.id === ids.a)!.explanation).toBe("mine");
   });

   it("a reviewed choice that equals the other version is saved without a write", async () => {
      const { engine, ids, diagrams, id, puts } = await seeded();
      diagrams.writeElsewhere(id, (graph) => touch(graph, ids.a, "theirs"));
      apply(engine, (draft) => ok(updateNode(draft, ids.a, { explanation: "mine" })).draft);
      await wait(AUTOSAVE_DELAY_MS);
      const sent = puts().length;
      await engine.resolveWith((mine, theirs) => buildReviewed(mine, theirs, {}).draft);
      expect(engine.getSnapshot()).toMatchObject({ phase: "saved", dirty: false });
      expect(puts()).toHaveLength(sent);
   });

   it("Take theirs replaces the local graph only as the learner's choice", async () => {
      const { engine, ids, diagrams, id } = await seeded();
      diagrams.writeElsewhere(id, (graph) => touch(graph, ids.a, "theirs"));
      apply(engine, (draft) => ok(updateNode(draft, ids.a, { explanation: "mine" })).draft);
      await wait(AUTOSAVE_DELAY_MS);
      await engine.takeTheirs();
      expect(engine.getSnapshot().phase).toBe("saved");
      expect(engine.getSnapshot().draft.graph.nodes.find((n) => n.id === ids.a)!.explanation).toBe("theirs");
   });

   it("delete versus edit: Keep mine restores the deleted component with my edit", async () => {
      const { engine, ids, diagrams, id } = await seeded();
      diagrams.writeElsewhere(id, (graph) => ({ ...graph, nodes: graph.nodes.filter((n) => n.id !== ids.c), edges: graph.edges.filter((e) => e.to !== ids.c) }));
      apply(engine, (draft) => ok(updateNode(draft, ids.c, { explanation: "my edit" })).draft);
      await wait(AUTOSAVE_DELAY_MS);
      expect(engine.getSnapshot().phase).toBe("conflict");
      const diff = differences(engine.getSnapshot().draft, engine.getSnapshot().theirs!);
      expect(diff.map((d) => d.id).sort()).toEqual([ids.c, ids.bc].sort());
      await engine.keepMine();
      const saved = diagrams.diagram(id);
      expect(saved.graph.nodes.find((n) => n.id === ids.c)!.explanation).toBe("my edit");
      expect(saved.tombstones).toEqual([]);
   });

   it("delete versus delete: idempotent, no choice to make", async () => {
      const { engine, ids, diagrams, id } = await seeded();
      diagrams.writeElsewhere(id, (graph) => ({ ...graph, nodes: graph.nodes.filter((n) => n.id !== ids.c), edges: graph.edges.filter((e) => e.to !== ids.c) }));
      apply(engine, (draft) => ok(deleteNode(draft, ids.c)).draft);
      await wait(AUTOSAVE_DELAY_MS);
      expect(engine.getSnapshot()).toMatchObject({ phase: "saved", dirty: false });
   });

   it("delete versus new connection: a review that keeps the connection without its end reports it dangling", async () => {
      const { engine, ids, diagrams, id } = await seeded();
      diagrams.writeElsewhere(id, (graph) => ({ ...graph, nodes: graph.nodes.filter((n) => n.id !== ids.c), edges: graph.edges.filter((e) => e.to !== ids.c) }));
      let added = "";
      apply(engine, (draft) => {
         const edge = ok(addEdge(draft, ids.a, ids.c, "write"));
         added = edge.id;
         return edge.draft;
      });
      await wait(AUTOSAVE_DELAY_MS);
      const theirs = engine.getSnapshot().theirs!;
      const reviewed = buildReviewed(engine.getSnapshot().draft, theirs, { [added]: "mine" });
      expect(reviewed.dangling).toEqual([added]);
      const fixed = buildReviewed(engine.getSnapshot().draft, theirs, { [added]: "mine", [ids.c]: "mine" });
      expect(fixed.dangling).toEqual([]);
      await engine.resolveWith(() => fixed.draft);
      expect(engine.getSnapshot().phase).toBe("saved");
      expect(diagrams.diagram(id).graph.edges.some((e) => e.id === added)).toBe(true);
   });
});

describe("terminal, offline and session", () => {
   it("an attempt that ended during a save halts the engine for good; a late success cannot reopen it", async () => {
      const { engine, ids, attempts, id, puts, hold } = await seeded();
      const release = hold();
      apply(engine, (draft) => ok(updateNode(draft, ids.a, { explanation: "in flight" })).draft);
      const flight = engine.persist();
      await wait(0);
      engine.halt();
      release();
      await flight;
      expect(engine.getSnapshot().phase).toBe("terminal");
      expect(engine.getSnapshot().saved.graph.nodes.find((n) => n.id === ids.a)!.explanation).toBe("in flight");
      attempts.endAttempt(id, "submitted");
      const sent = puts().length;
      apply(engine, (draft) => ok(updateNode(draft, ids.a, { explanation: "later" })).draft);
      await wait(AUTOSAVE_DELAY_MS * 4);
      await engine.retry();
      expect(puts()).toHaveLength(sent);
      expect(engine.getSnapshot()).toMatchObject({ phase: "terminal", note: expect.stringMatching(/^Not saved/) });
   });

   it("a write that finds the attempt ended reports it once and stops", async () => {
      const { ids, attempts, id, open, puts } = await seeded();
      let ended = 0;
      const engine = await open(() => (ended += 1));
      attempts.endAttempt(id, "abandoned");
      apply(engine, (draft) => ok(updateNode(draft, ids.a, { explanation: "x" })).draft);
      await wait(AUTOSAVE_DELAY_MS);
      expect(engine.getSnapshot().phase).toBe("terminal");
      expect(ended).toBe(1);
      expect(puts().at(-1)!.body).toBeDefined();
   });

   it("keeps work in memory while offline and saves it when the network is back", async () => {
      const { engine, ids, api, puts } = await seeded();
      api.failNext("network");
      apply(engine, (draft) => ok(updateNode(draft, ids.a, { explanation: "offline text" })).draft);
      await wait(AUTOSAVE_DELAY_MS);
      expect(engine.getSnapshot().phase).toBe("offline");
      expect(engine.getSnapshot().draft.graph.nodes.find((n) => n.id === ids.a)!.explanation).toBe("offline text");
      await wait(5_000);
      expect(engine.getSnapshot().phase).toBe("saved");
      expect(puts().at(-1)!.body).toMatchObject({ graph: { nodes: expect.arrayContaining([expect.objectContaining({ explanation: "offline text" })]) } });
   });

   it("after a session change (dispose) nothing more is sent", async () => {
      const { engine, ids, puts } = await seeded();
      apply(engine, (draft) => ok(updateNode(draft, ids.a, { explanation: "unsent" })).draft);
      engine.dispose();
      await wait(AUTOSAVE_DELAY_MS * 3);
      expect(puts()).toHaveLength(1);
   });

   it("a scripted session of 200 canvas and text edits makes zero provider calls (AC-12.1)", async () => {
      const { engine, ids, api } = await seeded();
      for (let i = 0; i < 200; i++) {
         if (i % 2 === 0) apply(engine, (draft) => ok(moveNode(draft, ids.a, { x: i, y: i })).draft);
         else apply(engine, (draft) => ok(updateEdge(draft, ids.ab, { explanation: `edit ${i}` })).draft);
         if (i % 20 === 0) await wait(AUTOSAVE_DELAY_MS);
      }
      await wait(AUTOSAVE_DELAY_MS);
      const routes = new Set(api.requests.map((r) => r.route));
      expect([...routes].sort()).toEqual(["create_attempt", "get_diagram", "put_diagram"]);
      expect(api.requests.some((r) => r.route === "stage_turn" || r.route === "stage_hint" || !r.path.startsWith("/me/practice"))).toBe(false);
   });
});
