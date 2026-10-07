import { describe, expect, it } from "vitest";
import { PRACTICE_LIMIT, practiceCandidates, practiceRow, relevanceOf, sharedKnowledge } from "./practiceStep";
import type { CatalogMeta, CatalogModule, CatalogOutlineEntry, CatalogTrack } from "./types";

const meta = (id: string, over: Partial<CatalogMeta> = {}): CatalogMeta => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogMeta["type"], slug, title: `Title ${slug}`, summary: `Summary ${slug}`, tags: [], category: null, difficulty: null, level: null, access: "free", ...over };
};
const entry = (id: string): CatalogOutlineEntry => {
   const { type, slug, title, access } = meta(id);
   return { id, type, slug, title, access, primary: true };
};
const mod = (key: string, ids: string[]): CatalogModule => ({ key, title: `Module ${key}`, position: 0, items: ids.map(entry) });
const track = (...modules: CatalogModule[]): CatalogTrack => ({ id: "track.t", slug: "t", title: "Track t", summary: "", modules });
const ids = (candidates: { id: string }[]) => candidates.map(({ id }) => id);

describe("practiceCandidates", () => {
   const t = track(mod("a", ["lesson.l", "problem.p1", "problem.p2", "lesson.next"]), mod("b", ["problem.late"]));

   it("takes the Interposed Problems in Sequence order, each with the Module it is placed in (S-PRC-1)", () => {
      const found = practiceCandidates(track(mod("a", ["lesson.l", "problem.p1"]), mod("b", ["problem.p2"])), "lesson.l", {});
      expect(found.map(({ id, placedIn, prerequisite }) => [id, placedIn, prerequisite])).toEqual([
         ["problem.p1", "Module a", false],
         ["problem.p2", "Module b", false],
      ]);
   });

   it("puts Interposed Problems before `prerequisite_of`, and never takes a Problem related only through `related` (S-PRC-1)", () => {
      const found = practiceCandidates(t, "lesson.l", { prerequisite_of: [meta("problem.x")], related: [meta("problem.only")] });
      expect(ids(found)).toEqual(["problem.p1", "problem.p2"]);
      expect(ids(practiceCandidates(null, "lesson.l", { prerequisite_of: [meta("problem.x")], related: [meta("problem.only")] }))).toEqual(["problem.x"]);
   });

   it("lists a Problem that qualifies twice once, at its first position, with both bases (S-PRC-2)", () => {
      const found = practiceCandidates(t, "lesson.l", { prerequisite_of: [meta("problem.p2"), meta("problem.x")] });
      expect(found.map(({ id, placedIn, prerequisite }) => [id, placedIn, prerequisite])).toEqual([
         ["problem.p1", "Module a", false],
         ["problem.p2", "Module a", true],
      ]);
   });

   it("bounds the step at two; Interposed overflow is simply not shown (S-PRC-3)", () => {
      expect(PRACTICE_LIMIT).toBe(2);
      const crowded = track(mod("a", ["lesson.l", "problem.a", "problem.b", "problem.c", "lesson.next"]));
      expect(ids(practiceCandidates(crowded, "lesson.l", {}))).toEqual(["problem.a", "problem.b"]);
   });

   it("fills with `prerequisite_of` in the API's order when the curriculum gives fewer than two", () => {
      const one = track(mod("a", ["lesson.l", "problem.p1", "lesson.next"]));
      const found = practiceCandidates(one, "lesson.l", { prerequisite_of: [meta("problem.x"), meta("problem.y")] });
      expect(ids(found)).toEqual(["problem.p1", "problem.x"]);
   });

   it("keeps the trailing Problems of the last Lesson", () => {
      const last = track(mod("a", ["lesson.first", "lesson.l", "problem.tail"]));
      expect(ids(practiceCandidates(last, "lesson.l", {}))).toEqual(["problem.tail"]);
   });

   it("takes Lessons and Knowledge out of `prerequisite_of`, and unlinkable targets out of both lists", () => {
      const found = practiceCandidates(null, "lesson.l", { prerequisite_of: [meta("lesson.next"), meta("knowledge.k"), { ...meta("problem.bad"), slug: "other" }, meta("problem.ok")] });
      expect(ids(found)).toEqual(["problem.ok"]);
   });

   it("leaves out what an earlier place already claimed, by id (S-LSN-16)", () => {
      const found = practiceCandidates(t, "lesson.l", { prerequisite_of: [meta("problem.x")] }, ["problem.p1"]);
      expect(ids(found)).toEqual(["problem.p2", "problem.x"]);
   });

   it("takes an Interposed Problem's public fields from the Lesson's relations when it is there, any relation name", () => {
      const [first, second] = practiceCandidates(t, "lesson.l", { related: [meta("problem.p2", { summary: "From relations" })] });
      expect(first.meta).toBeNull();
      expect(second.meta?.summary).toBe("From relations");
   });

   it("is not fooled by two Problems with the same title", () => {
      const twins = track(mod("a", ["lesson.l", "problem.one", "problem.two"]));
      const found = practiceCandidates(twins, "lesson.l", { prerequisite_of: [meta("problem.two", { title: "Title one" })] });
      expect(ids(found)).toEqual(["problem.one", "problem.two"]);
   });

   it("has nothing for a Lesson the Track omits and that names no Problem", () => {
      expect(practiceCandidates(t, "lesson.elsewhere", {})).toEqual([]);
   });
});

describe("sharedKnowledge", () => {
   it("names the first Knowledge the Lesson applies, in the Lesson's order, that the Problem applies too (S-PRC-5)", () => {
      const lesson = [meta("knowledge.z"), meta("knowledge.a"), meta("knowledge.m")];
      expect(sharedKnowledge(lesson, [meta("knowledge.m"), meta("knowledge.a")])).toBe("Title a");
   });

   it("is null with no overlap, and ignores a non-Knowledge match", () => {
      expect(sharedKnowledge([meta("knowledge.a")], [meta("knowledge.b")])).toBeNull();
      expect(sharedKnowledge([meta("lesson.a")], [meta("lesson.a")])).toBeNull();
      expect(sharedKnowledge([], [meta("knowledge.a")])).toBeNull();
   });
});

describe("relevanceOf", () => {
   it("lists the bases Placement, Prerequisite, Shared Knowledge, joined with ' · ' (S-PRC-5)", () => {
      expect(relevanceOf({ placedIn: "Basics", prerequisite: true }, "Caching")).toBe(
         "Practice for this part of Basics · Builds on this lesson · Also applies Caching"
      );
   });

   it("lists only the bases that hold, and is empty when none does", () => {
      expect(relevanceOf({ placedIn: null, prerequisite: true }, null)).toBe("Builds on this lesson");
      expect(relevanceOf({ placedIn: "Basics", prerequisite: false }, "Caching")).toBe("Practice for this part of Basics · Also applies Caching");
      expect(relevanceOf({ placedIn: null, prerequisite: false }, null)).toBe("");
   });
});

describe("practiceRow", () => {
   const [candidate] = practiceCandidates(track(mod("a", ["lesson.l", "problem.p1"])), "lesson.l", {});

   it("takes summary and difficulty from the fetched meta when the relations lacked it", () => {
      const row = practiceRow(candidate, meta("problem.p1", { summary: "Fetched", difficulty: "hard" }), "Caching");
      expect(row).toMatchObject({ id: "problem.p1", href: "/problems/p1", summary: "Fetched", difficulty: "hard", access: "free" });
      expect(row.reason).toBe("Practice for this part of Module a · Also applies Caching");
   });

   it("keeps the row, title and reason when the meta read failed", () => {
      expect(practiceRow(candidate, null, null)).toMatchObject({ title: "Title p1", summary: null, difficulty: null, reason: "Practice for this part of Module a" });
   });

   it("prefers the Lesson's relations over a fetch", () => {
      const withMeta = { ...candidate, meta: meta("problem.p1", { summary: "From relations" }) };
      expect(practiceRow(withMeta, meta("problem.p1", { summary: "Fetched" }), null).summary).toBe("From relations");
   });
});
