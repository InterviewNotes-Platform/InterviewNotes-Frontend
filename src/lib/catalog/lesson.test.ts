import { describe, expect, it } from "vitest";
import { contentsOf, lessonRelations, plainHeading, PRACTICE_LIMIT } from "./lesson";
import type { CatalogHeading, CatalogMeta } from "./types";

const heading = (id: string, level: number, text = id): CatalogHeading => ({ id, level, text });

describe("contentsOf", () => {
   it("keeps h2 and h3 in document order with the API's ids untouched", () => {
      const entries = contentsOf([heading("intro", 1), heading("why", 2), heading("how-it-works", 3), heading("deep", 4), heading("wrap-up", 2)]);
      expect(entries).toEqual([
         { id: "why", level: 2, text: "why" },
         { id: "how-it-works", level: 3, text: "how-it-works" },
         { id: "wrap-up", level: 2, text: "wrap-up" },
      ]);
   });

   it("is empty below two eligible headings, however many other levels there are", () => {
      expect(contentsOf([])).toEqual([]);
      expect(contentsOf([heading("only", 2)])).toEqual([]);
      expect(contentsOf([heading("title", 1), heading("only", 2), heading("deep", 4), heading("deeper", 5)])).toEqual([]);
   });

   it("starts at exactly two", () => {
      expect(contentsOf([heading("a", 2), heading("b", 3)])).toHaveLength(2);
   });

   it("rejects a repeated id rather than rewrite it", () => {
      expect(contentsOf([heading("example", 2), heading("example", 3), heading("more", 2)])).toEqual([]);
      // a repeat among headings the contents would not list still means the API's ids cannot be trusted
      expect(contentsOf([heading("a", 2), heading("b", 3), heading("deep", 4), heading("deep", 5)])).toEqual([]);
   });

   it("shows heading source as the reader sees it, never inventing an id from it", () => {
      const [first] = contentsOf([heading("sizing-the-kv-cache-budget", 2, "Sizing the `kv_cache` **budget**"), heading("b", 2)]);
      expect(first).toEqual({ id: "sizing-the-kv-cache-budget", level: 2, text: "Sizing the kv_cache budget" });
   });
});

describe("plainHeading", () => {
   it.each([
      ["Why [batching](ref:knowledge.batching) matters", "Why batching matters"],
      ["The `kv_cache` budget", "The kv_cache budget"],
      ["**Bold** and ~~struck~~", "Bold and struck"],
      ["Plain heading", "Plain heading"],
   ])("%s", (source, plain) => expect(plainHeading(source)).toBe(plain));
});

const meta = (id: string, over: Partial<CatalogMeta> = {}): CatalogMeta => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogMeta["type"], slug, title: `Title ${slug}`, summary: "", tags: [], category: null, difficulty: null, level: null, access: "free", ...over };
};
const ids = (rows: { entry: CatalogMeta }[]) => rows.map(({ entry }) => entry.id);

describe("lessonRelations", () => {
   it("sends each relation to its place by relation name and target type, in the API's order", () => {
      const grouped = lessonRelations({
         applies: [meta("knowledge.zeta"), meta("knowledge.alpha")],
         prerequisite: [meta("knowledge.base"), meta("lesson.first")],
         prerequisite_of: [meta("problem.practice")],
         related: [meta("lesson.sibling"), meta("problem.other"), meta("knowledge.mid")],
      });
      expect(ids(grouped.prerequisites)).toEqual(["knowledge.base", "lesson.first"]);
      expect(ids(grouped.practice)).toEqual(["problem.practice"]);
      expect(ids(grouped.knowledge)).toEqual(["knowledge.zeta", "knowledge.alpha", "knowledge.mid"]);
      expect(ids(grouped.lessons)).toEqual(["lesson.sibling"]);
      expect(ids(grouped.problems)).toEqual(["problem.other"]);
   });

   it("does not assume a related target is Knowledge: the target's own type decides", () => {
      const grouped = lessonRelations({ related: [meta("problem.a"), meta("lesson.b"), meta("knowledge.c")] });
      expect(ids(grouped.knowledge)).toEqual(["knowledge.c"]);
      expect(ids(grouped.problems)).toEqual(["problem.a"]);
      expect(ids(grouped.lessons)).toEqual(["lesson.b"]);
   });

   it("makes Practice only of Problems that name this Lesson as a prerequisite", () => {
      const grouped = lessonRelations({ prerequisite_of: [meta("lesson.next"), meta("knowledge.builds-on"), meta("problem.p")], related: [meta("problem.q")] });
      expect(ids(grouped.practice)).toEqual(["problem.p"]);
      expect(ids(grouped.problems)).toEqual(["problem.q"]);
      expect(ids(grouped.lessons)).toEqual(["lesson.next"]);
      expect(ids(grouped.knowledge)).toEqual(["knowledge.builds-on"]);
   });

   it("caps Practice at two in the API's order; the rest stay reachable as quiet Problems", () => {
      expect(PRACTICE_LIMIT).toBe(2);
      const grouped = lessonRelations({ prerequisite_of: [meta("problem.a"), meta("problem.b"), meta("problem.c")] });
      expect(ids(grouped.practice)).toEqual(["problem.a", "problem.b"]);
      expect(ids(grouped.problems)).toEqual(["problem.c"]);
   });

   it("shows a target once: a prerequisite or Practice Problem is not repeated, and a repeat across relations collapses", () => {
      const grouped = lessonRelations({
         applies: [meta("knowledge.base"), meta("knowledge.once")],
         prerequisite: [meta("knowledge.base")],
         prerequisite_of: [meta("problem.p")],
         related: [meta("problem.p"), meta("knowledge.once")],
      });
      expect(ids(grouped.prerequisites)).toEqual(["knowledge.base"]);
      expect(ids(grouped.knowledge)).toEqual(["knowledge.once"]);
      expect(ids(grouped.practice)).toEqual(["problem.p"]);
      expect(grouped.problems).toEqual([]);
   });

   it("returns empty groups for no relations, unknown names and unlinkable targets", () => {
      const empty = { prerequisites: [], practice: [], knowledge: [], lessons: [], problems: [] };
      expect(lessonRelations({})).toEqual(empty);
      expect(lessonRelations({ mentioned_in: [meta("lesson.x")], invented: [meta("knowledge.y")] })).toEqual(empty);
      expect(lessonRelations({ related: [{ ...meta("lesson.x"), slug: "other" }] })).toEqual(empty);
   });

   it("keeps premium targets as metadata and links each to its canonical route", () => {
      const { practice } = lessonRelations({ prerequisite_of: [meta("problem.paid", { access: "premium" })] });
      expect(practice).toEqual([{ entry: expect.objectContaining({ access: "premium" }), href: "/problems/paid" }]);
   });
});
