import { describe, expect, it } from "vitest";
import {
   homePlacement,
   interposedProblems,
   leadingProblems,
   lessonNeighbours,
   lessonPosition,
   sequenceOf,
   startLesson,
} from "./curriculum";
import type { CatalogModule, CatalogOutlineEntry, CatalogTrack } from "./types";

const entry = (id: string, over: Partial<CatalogOutlineEntry> = {}): CatalogOutlineEntry => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogOutlineEntry["type"], slug, title: `Title ${slug}`, access: "free", primary: true, ...over };
};
const mod = (key: string, ids: string[]): CatalogModule => ({ key, title: `Module ${key}`, position: 0, items: ids.map((id) => entry(id)) });
const track = (...modules: CatalogModule[]): CatalogTrack => ({ id: "track.t", slug: "t", title: "Track t", summary: "", modules });
const flat = (...ids: string[]) => track(mod("m", ids));
const ids = (entries: CatalogOutlineEntry[]) => entries.map((e) => e.id);
const around = (t: CatalogTrack, id: string) => {
   const found = lessonNeighbours(t, id);
   return found && [found.previousLesson?.id ?? null, found.nextLesson?.id ?? null];
};

describe("sequenceOf", () => {
   it("keeps the outline's module and entry order, never a sort", () => {
      const t = track(mod("zz", ["lesson.m", "lesson.a"]), mod("aa", ["problem.z", "lesson.b"]));
      expect(sequenceOf(t).map((s) => s.entry.id)).toEqual(["lesson.m", "lesson.a", "problem.z", "lesson.b"]);
   });

   it("skips entries that map to no canonical route and contributes nothing for empty Modules", () => {
      const bad = entry("lesson.bad", { type: "problem" });
      const t = track(mod("empty", []), { ...mod("m", []), items: [entry("lesson.a"), bad, entry("lesson.c")] });
      expect(sequenceOf(t).map((s) => [s.entry.id, s.moduleIndex])).toEqual([["lesson.a", 1], ["lesson.c", 1]]);
   });
});

describe("homePlacement (S-CUR-1)", () => {
   const p = (track: string, primary: boolean) => ({ track, primary });

   it("(a) takes the one placement marked primary, wherever it is listed", () => {
      expect(homePlacement([p("a", false), p("b", true)])?.track).toBe("b");
   });

   it("(a) takes a lone placement that is marked primary", () => {
      expect(homePlacement([p("a", true)])?.track).toBe("a");
   });

   it("(b) takes a lone placement even when it is not marked primary", () => {
      expect(homePlacement([p("a", false)])?.track).toBe("a");
   });

   it("(c) has no home for several placements and none marked primary", () => {
      expect(homePlacement([p("a", false), p("b", false)])).toBeNull();
   });

   it("(c) has no home for several placements marked primary, and does not take the first", () => {
      expect(homePlacement([p("a", true), p("b", true), p("c", false)])).toBeNull();
   });

   it("has no home for an item with no placement", () => {
      expect(homePlacement([])).toBeNull();
   });
});

describe("lessonNeighbours (S-CUR-5, S-CUR-6, S-CUR-7, spec 4.8)", () => {
   it("skips a Problem between two Lessons: L1 -> P1 -> L2", () => {
      const t = flat("lesson.l1", "problem.p1", "lesson.l2");
      expect(around(t, "lesson.l1")).toEqual([null, "lesson.l2"]);
      expect(around(t, "lesson.l2")).toEqual(["lesson.l1", null]);
   });

   it("skips three consecutive Problems", () => {
      const t = flat("lesson.l1", "problem.p1", "problem.p2", "problem.p3", "lesson.l2");
      expect(around(t, "lesson.l1")).toEqual([null, "lesson.l2"]);
      expect(around(t, "lesson.l2")).toEqual(["lesson.l1", null]);
   });

   it("gives the first Lesson no previous when a Problem leads the Track", () => {
      const t = flat("problem.p0", "lesson.l1", "lesson.l2");
      expect(around(t, "lesson.l1")).toEqual([null, "lesson.l2"]);
   });

   it("crosses a Module boundary, and over an empty Module", () => {
      const t = track(mod("one", ["lesson.l1"]), mod("none", []), mod("two", ["problem.p1", "lesson.l2"]));
      expect(around(t, "lesson.l1")).toEqual([null, "lesson.l2"]);
      expect(around(t, "lesson.l2")).toEqual(["lesson.l1", null]);
      expect(lessonNeighbours(t, "lesson.l2")?.module.key).toBe("two");
   });

   it("gives the last Lesson no next when a Problem trails it", () => {
      const t = flat("lesson.l8", "lesson.l9", "problem.p9");
      expect(around(t, "lesson.l9")).toEqual(["lesson.l8", null]);
   });

   it("gives a single Lesson neither neighbour", () => {
      expect(around(flat("lesson.only"), "lesson.only")).toEqual([null, null]);
   });

   it("carries a premium Next Lesson's access through for the marker", () => {
      const t = track({ ...mod("m", []), items: [entry("lesson.l1"), entry("lesson.l2", { access: "premium" })] });
      expect(lessonNeighbours(t, "lesson.l1")?.nextLesson?.access).toBe("premium");
   });

   it("is null for an item the Track omits", () => {
      expect(lessonNeighbours(flat("lesson.a"), "lesson.other")).toBeNull();
   });

   it("for a Problem (S-CUR-14), names the nearest Lessons and never another Problem", () => {
      const t = flat("lesson.a", "problem.p1", "problem.p2", "lesson.b");
      expect(around(t, "problem.p1")).toEqual(["lesson.a", "lesson.b"]);
      expect(around(t, "problem.p2")).toEqual(["lesson.a", "lesson.b"]);
   });

   it("for a Problem at either end, names only the side that has a Lesson", () => {
      const t = flat("problem.first", "lesson.a", "problem.last");
      expect(around(t, "problem.first")).toEqual([null, "lesson.a"]);
      expect(around(t, "problem.last")).toEqual(["lesson.a", null]);
   });

   it("for a Problem in a Track with no Lesson, names nothing", () => {
      const t = flat("problem.a", "problem.b");
      expect(around(t, "problem.a")).toEqual([null, null]);
   });
});

describe("interposedProblems and leadingProblems (S-CUR-9, S-CUR-10)", () => {
   it("takes the Problem between a Lesson and its Next", () => {
      expect(ids(interposedProblems(flat("lesson.l1", "problem.p1", "lesson.l2"), "lesson.l1")!)).toEqual(["problem.p1"]);
   });

   it("keeps three Problems in Sequence order", () => {
      const t = flat("lesson.l1", "problem.p1", "problem.p2", "problem.p3", "lesson.l2");
      expect(ids(interposedProblems(t, "lesson.l1")!)).toEqual(["problem.p1", "problem.p2", "problem.p3"]);
   });

   it("takes the Problems across a Module boundary", () => {
      const t = track(mod("a", ["lesson.l1"]), mod("b", ["problem.p1", "lesson.l2"]));
      expect(ids(interposedProblems(t, "lesson.l1")!)).toEqual(["problem.p1"]);
   });

   it("takes the trailing Problems for the last Lesson", () => {
      const t = flat("lesson.l8", "lesson.l9", "problem.p9");
      expect(ids(interposedProblems(t, "lesson.l9")!)).toEqual(["problem.p9"]);
      expect(interposedProblems(t, "lesson.l8")).toEqual([]);
   });

   it("gives a Lesson after a leading Problem none, and owns no leading Problem", () => {
      const t = flat("problem.p0", "lesson.l1", "lesson.l2");
      expect(interposedProblems(t, "lesson.l1")).toEqual([]);
      expect(ids(leadingProblems(t))).toEqual(["problem.p0"]);
   });

   it("has no leading Problem when a Lesson comes first, and all Problems when there is no Lesson", () => {
      expect(leadingProblems(flat("lesson.l1", "problem.p1"))).toEqual([]);
      expect(ids(leadingProblems(flat("problem.a", "problem.b")))).toEqual(["problem.a", "problem.b"]);
   });

   it("is null for a Problem or an item the Track omits", () => {
      const t = flat("lesson.l1", "problem.p1");
      expect(interposedProblems(t, "problem.p1")).toBeNull();
      expect(interposedProblems(t, "lesson.absent")).toBeNull();
   });
});

describe("lessonPosition (S-CUR-4)", () => {
   it("does not let Problems inflate the Lesson count: A -> P -> B is 1 of 2 and 2 of 2", () => {
      const t = flat("lesson.a", "problem.p", "lesson.b");
      expect(lessonPosition(t, "lesson.a")?.lesson).toEqual({ index: 1, count: 2 });
      expect(lessonPosition(t, "lesson.b")?.lesson).toEqual({ index: 2, count: 2 });
   });

   it("counts an empty Module: the first populated Module after it is Module 2", () => {
      const t = track(mod("empty", []), mod("first", ["lesson.a"]), mod("last", ["lesson.b"]));
      expect(lessonPosition(t, "lesson.a")?.module).toEqual({ index: 2, count: 3 });
      expect(lessonPosition(t, "lesson.b")?.module).toEqual({ index: 3, count: 3 });
   });

   it("counts Lessons within their own Module only", () => {
      const t = track(mod("one", ["lesson.a", "lesson.b"]), mod("two", ["lesson.c"]));
      expect(lessonPosition(t, "lesson.c")?.lesson).toEqual({ index: 1, count: 1 });
   });

   it("is null for a Problem or an item the Track omits", () => {
      const t = flat("lesson.a", "problem.p");
      expect(lessonPosition(t, "problem.p")).toBeNull();
      expect(lessonPosition(t, "lesson.absent")).toBeNull();
   });
});

describe("startLesson (S-CUR-13)", () => {
   it("is the first Lesson, not a leading Problem", () => {
      expect(startLesson(flat("problem.p0", "lesson.a", "lesson.b"))?.id).toBe("lesson.a");
   });

   it("is found in a later Module when the first one is empty", () => {
      expect(startLesson(track(mod("empty", []), mod("m", ["lesson.a"])))?.id).toBe("lesson.a");
   });

   it("is null for a Track with Problems but no Lesson, and for an empty Track", () => {
      expect(startLesson(flat("problem.a"))).toBeNull();
      expect(startLesson(track())).toBeNull();
   });
});
