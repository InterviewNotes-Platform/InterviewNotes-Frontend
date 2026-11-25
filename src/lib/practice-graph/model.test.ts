import { describe, expect, it } from "vitest";
import { isElementId, newId } from "./ids";
import {
   EMPTY_DRAFT,
   addBoundary,
   addEdge,
   addNode,
   bendEdge,
   deleteBoundary,
   deleteNode,
   deletionGroupSize,
   duplicateNode,
   moveNode,
   recreateAsNew,
   restoreElements,
   retypeNode,
   swapEdge,
   updateEdge,
   updateNode,
   type DiagramDraft,
   type Op,
} from "./model";
import { GraphHistory, HISTORY_LIMIT } from "./history";
import { codePoints, sanitizeInput, storedText, textRule } from "./text";
import { validateDraft } from "./validate";
import { LIMITS } from "./vocabulary";

function ok<T>(result: Op<T>): { draft: DiagramDraft } & T {
   if (!result.ok) throw new Error(result.reason);
   return result as { ok: true; draft: DiagramDraft } & T;
}

function threeNodes() {
   const a = ok(addNode(EMPTY_DRAFT, "client", { label: "Web app", at: { x: 0, y: 0 } }));
   const b = ok(addNode(a.draft, "service", { label: "API" }));
   const c = ok(addNode(b.draft, "database", { label: "Store" }));
   const ab = ok(addEdge(c.draft, a.id, b.id));
   const bc = ok(addEdge(ab.draft, b.id, c.id, "read"));
   return { draft: bc.draft, a: a.id, b: b.id, c: c.id, ab: ab.id, bc: bc.id };
}

describe("IDs", () => {
   it("are prefixed Crockford ULIDs that match the contract pattern", () => {
      for (const prefix of ["n", "e", "b"] as const) {
         const id = newId(prefix);
         expect(id).toMatch(/^(n|e|b)_[0-9A-HJKMNP-TV-Z]{26}$/);
         expect(isElementId(id, prefix)).toBe(true);
      }
      expect(new Set(Array.from({ length: 500 }, () => newId("n"))).size).toBe(500);
      expect(newId("n", 1) < newId("n", 2)).toBe(true);
   });
});

describe("text rules (mirror of the backend's strings.py)", () => {
   it("counts code points, not UTF-16 units", () => {
      expect(codePoints("😀".repeat(40))).toBe(40);
      expect("😀".repeat(40).length).toBe(80);
   });

   it("normalizes to NFC and trims with the ECMAScript set", () => {
      expect(storedText("  café ﻿")).toBe("café");
   });

   it("refuses what the server refuses and nothing else", () => {
      expect(textRule("a\u0007b", true)).toBe("control_character");
      expect(textRule("line one\nline two", true)).toBeNull();
      expect(textRule("line one\nline two", false)).toBe("control_character");
      expect(textRule("abc‮def", false)).toBe("bidi_control");
      expect(textRule("abc﷐", false)).toBe("noncharacter");
      expect(textRule("abc\uD800", false)).toBe("invalid_unicode");
      expect(textRule("x".repeat(256), false)).toBeNull();
      expect(textRule("x".repeat(257), false)).toBe("unbroken_run");
      expect(textRule(`<script>alert(1)</script> SELECT * FROM t; {{x}} data:text/html;base64,AAAA`, true)).toBeNull();
   });

   it("drops unsavable characters as they are typed and cuts at the limit in code points", () => {
      expect(sanitizeInput("a\tb\u0000c‮d", { limit: 40, newline: false })).toEqual({ value: "a bcd", changed: true });
      expect(sanitizeInput("one\r\ntwo", { limit: 600, newline: true })).toEqual({ value: "one\ntwo", changed: false });
      expect(sanitizeInput("😀".repeat(45), { limit: 40, newline: false }).value).toBe("😀".repeat(40));
   });
});

describe("graph operations keep one canonical graph and stable IDs", () => {
   it("rename, retype, move and subtype changes keep the ID and the explanation", () => {
      const { draft, b } = threeNodes();
      const explained = ok(updateNode(draft, b, { explanation: "Answers questions." })).draft;
      const renamed = ok(updateNode(explained, b, { label: "Answer API" })).draft;
      const retyped = ok(retypeNode(renamed, b, "gateway")).draft;
      const moved = ok(moveNode(retyped, b, { x: 300.4, y: 99.6 })).draft;
      const node = moved.graph.nodes.find((n) => n.id === b)!;
      expect(node).toMatchObject({ id: b, type: "gateway", label: "Answer API", explanation: "Answers questions." });
      expect(moved.layout.nodes[b]).toEqual({ x: 300, y: 100, w: 140, h: 56 });
   });

   it("a subtype that is not legal for the new type is cleared on retype; an illegal subtype is refused", () => {
      const { draft, c } = threeNodes();
      const vector = ok(updateNode(draft, c, { subtype: "vector" })).draft;
      expect(updateNode(vector, c, { subtype: "llm" })).toEqual({ ok: false, reason: "That subtype does not belong to this type." });
      expect(ok(retypeNode(vector, c, "cache")).draft.graph.nodes.find((n) => n.id === c)!.subtype).toBeNull();
   });

   it("connections are directed, never self-loops or dangling, and the same connection is not added twice", () => {
      const { draft, a, b, ab } = threeNodes();
      expect(addEdge(draft, a, a).ok).toBe(false);
      expect(addEdge(draft, a, "n_00000000000000000000000000").ok).toBe(false);
      const again = ok(addEdge(draft, a, b));
      expect(again).toMatchObject({ id: ab, existing: true });
      expect(again.draft).toBe(draft);
      const other = ok(addEdge(draft, a, b, "stream"));
      expect(other.id).not.toBe(ab);
   });

   it("swap keeps the ID, kind, tag and explanation", () => {
      const { draft, a, b, ab } = threeNodes();
      const tagged = ok(updateEdge(draft, ab, { kind: "write", tag: "question", explanation: "Sends it." })).draft;
      const swapped = ok(swapEdge(tagged, ab)).draft.graph.edges.find((e) => e.id === ab)!;
      expect(swapped).toEqual({ id: ab, from: b, to: a, kind: "write", tag: "question", explanation: "Sends it." });
   });

   it("deleting a node removes its connections and their layout in one step", () => {
      const { draft, b, ab, bc } = threeNodes();
      const bent = ok(bendEdge(draft, ab, { x: 5, y: 5 })).draft;
      expect(deletionGroupSize(bent, b)).toBe(3);
      const result = ok(deleteNode(bent, b));
      expect(result.edges.sort()).toEqual([ab, bc].sort());
      expect(result.draft.graph.edges).toEqual([]);
      expect(result.draft.layout.edges).toEqual({});
      expect(validateDraft(result.draft)).toEqual([]);
   });

   it("deleting a boundary clears memberships in the same step", () => {
      const { draft, a } = threeNodes();
      const boundary = ok(addBoundary(draft, "tenant", "Tenant A"));
      const member = ok(updateNode(boundary.draft, a, { boundary: boundary.id })).draft;
      const gone = ok(deleteBoundary(member, boundary.id)).draft;
      expect(gone.graph.boundaries).toEqual([]);
      expect(gone.graph.nodes.find((n) => n.id === a)!.boundary).toBeNull();
   });

   it("duplicate makes a new ID and copies the learner's own text", () => {
      const { draft, a } = threeNodes();
      const copy = ok(duplicateNode(draft, a));
      expect(copy.id).not.toBe(a);
      expect(copy.draft.graph.nodes.find((n) => n.id === copy.id)).toMatchObject({ type: "client", label: "Web app" });
   });

   it("limits are enforced by the operations themselves", () => {
      let draft = EMPTY_DRAFT;
      for (let i = 0; i < LIMITS.max_nodes; i++) draft = ok(addNode(draft, "service")).draft;
      expect(addNode(draft, "service")).toEqual({ ok: false, reason: "A diagram holds at most 60 components." });
      let boundaries = EMPTY_DRAFT;
      for (let i = 0; i < LIMITS.max_boundaries; i++) boundaries = ok(addBoundary(boundaries, "group")).draft;
      expect(addBoundary(boundaries, "group").ok).toBe(false);
   });
});

describe("restoration", () => {
   it("restores a tombstone group with the same IDs and explanations, nodes before edges", () => {
      const { draft, b, ab, bc } = threeNodes();
      const explained = ok(updateEdge(draft, ab, { explanation: "Why." })).draft;
      const before = explained.graph;
      const deleted = ok(deleteNode(explained, b)).draft;
      const group = [
         { kind: "edge" as const, element: before.edges.find((e) => e.id === ab)! },
         { kind: "node" as const, element: before.nodes.find((n) => n.id === b)! },
         { kind: "edge" as const, element: before.edges.find((e) => e.id === bc)! },
      ];
      const restored = ok(restoreElements(deleted, group));
      expect(restored.skipped).toEqual([]);
      expect(restored.draft.graph.edges.find((e) => e.id === ab)!.explanation).toBe("Why.");
      expect(validateDraft(restored.draft)).toEqual([]);
   });

   it("never restores a connection whose end is missing", () => {
      const { draft, a, b, ab } = threeNodes();
      const edge = draft.graph.edges.find((e) => e.id === ab)!;
      const noA = ok(deleteNode(draft, a)).draft;
      const result = ok(restoreElements(noA, [{ kind: "edge", element: edge }]));
      expect(result.skipped).toEqual([ab]);
      expect(result.draft.graph.edges.some((e) => e.id === ab)).toBe(false);
      expect(b).toBeTruthy();
   });

   it("re-adds retired elements under new IDs, keeping their text and connections consistent", () => {
      const { draft, b, ab, bc } = threeNodes();
      const result = ok(recreateAsNew(draft, [b, ab, bc]));
      const nb = result.mapping[b];
      expect(nb).not.toBe(b);
      expect(result.draft.graph.edges.every((e) => e.from === nb || e.to === nb)).toBe(true);
      expect(validateDraft(result.draft)).toEqual([]);
   });
});

describe("validation mirrors T10", () => {
   it("finds text, limit and structure problems with the backend's reason names", () => {
      const { draft, a, ab } = threeNodes();
      const bad = ok(updateNode(draft, a, { label: "x".repeat(41), explanation: "ok" })).draft;
      const worse = ok(updateEdge(bad, ab, { tag: "abc‮" })).draft;
      const rules = validateDraft(worse).map((i) => i.rule);
      expect(rules).toEqual(["label_too_long", "bidi_control"]);
      const total = ok(updateNode(draft, a, { explanation: "y ".repeat(300).trim() })).draft;
      expect(validateDraft(total)).toEqual([]);
   });

   it("counts the aggregate explanation limit in code points", () => {
      let draft = EMPTY_DRAFT;
      const ids: string[] = [];
      for (let i = 0; i < 21; i++) {
         const added = ok(addNode(draft, "service"));
         draft = added.draft;
         ids.push(added.id);
      }
      for (const id of ids) draft = ok(updateNode(draft, id, { explanation: "😀 ".repeat(300).trim() })).draft;
      expect(validateDraft(draft).map((i) => i.rule)).toEqual(["explanations_total_too_large"]);
   });
});

describe("history", () => {
   it("undoes and redoes whole drafts, coalesces one typing run and is bounded", () => {
      const history = new GraphHistory();
      const { draft } = threeNodes();
      history.record(EMPTY_DRAFT, "text:x:label");
      history.record(draft, "text:x:label");
      expect(history.undo(draft)).toBe(EMPTY_DRAFT);
      expect(history.redo(EMPTY_DRAFT)).toBe(draft);
      for (let i = 0; i < HISTORY_LIMIT + 20; i++) history.record(draft);
      let steps = 0;
      while (history.undo(draft)) steps++;
      expect(steps).toBe(HISTORY_LIMIT);
   });
});
