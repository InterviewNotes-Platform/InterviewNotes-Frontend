import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ArchGraph } from "@/lib/practice-workspace/types";
import { canonicalJson, topologyJson, wireGraph, wireLayout } from "./canonical";
import { draftFromServer } from "./model";

// T10's vectors, byte for byte (backend `tests/practice/graph_hash_vectors.json`, evidence `P9-T10-graph-hash-test-vectors.json`).
const vectors = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "graph-hash-vectors.json"), "utf8")) as {
   vectors: { case: string; submitted: ArchGraph; canonical_json: string; topology_json: string; graph_hash: string; topology_hash: string }[];
};
const sha = (text: string) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

describe("canonical serialization against T10's hash vectors", () => {
   it("has the seven published cases", () => {
      expect(vectors.vectors.map((v) => v.case)).toEqual(["empty", "sample", "text-only-edit", "structural-edit", "equivalent-order-and-defaults", "equivalent-trim", "nfc-and-escapes"]);
   });

   for (const vector of vectors.vectors) {
      it(`reproduces ${vector.case} byte for byte, and both hashes`, () => {
         const draft = draftFromServer(vector.submitted, null);
         const graph = wireGraph(draft.graph);
         expect(canonicalJson(graph)).toBe(vector.canonical_json);
         expect(topologyJson(graph)).toBe(vector.topology_json);
         expect(sha(canonicalJson(graph))).toBe(vector.graph_hash);
         expect(sha(topologyJson(graph))).toBe(vector.topology_hash);
      });
   }

   it("a layout change changes neither serialization; a text-only edit changes the graph but not the topology", () => {
      const sample = vectors.vectors.find((v) => v.case === "sample")!;
      const draft = draftFromServer(sample.submitted, null);
      const moved = { ...draft, layout: { nodes: { [draft.graph.nodes[0].id]: { x: 10, y: 20, w: 100, h: 50 } }, edges: {} } };
      expect(canonicalJson(wireGraph(moved.graph))).toBe(sample.canonical_json);
      expect(JSON.stringify(wireLayout(moved))).not.toBe(JSON.stringify(wireLayout(draft)));
      const renamed = { ...draft.graph, nodes: draft.graph.nodes.map((n, i) => (i === 0 ? { ...n, label: `${n.label} two` } : n)) };
      expect(canonicalJson(wireGraph(renamed))).not.toBe(sample.canonical_json);
      expect(topologyJson(wireGraph(renamed))).toBe(sample.topology_json);
   });

   it("sends only live layout entries, rounded and inside the bounds, with no viewport", () => {
      const sample = vectors.vectors.find((v) => v.case === "sample")!;
      const draft = draftFromServer(sample.submitted, null);
      const id = draft.graph.nodes[0].id;
      const layout = wireLayout({ ...draft, layout: { nodes: { [id]: { x: 1e9, y: -3.6, w: 140.4, h: 0 }, n_00000000000000000000000ZZZ: { x: 1, y: 1, w: 1, h: 1 } }, edges: {} } });
      expect(layout.nodes).toEqual({ [id]: { x: 100000, y: -4, w: 140, h: 1 } });
      expect(layout).not.toHaveProperty("viewport");
   });
});
