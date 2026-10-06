import { describe, expect, it } from "vitest";
import { curriculumOf } from "./track";
import type { CatalogModule, CatalogOutlineEntry, CatalogTrack } from "./types";

const entry = (id: string, over: Partial<CatalogOutlineEntry> = {}): CatalogOutlineEntry => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogOutlineEntry["type"], slug, title: `Title ${slug}`, access: "free", primary: true, ...over };
};
const mod = (key: string, items: CatalogOutlineEntry[], position = 0): CatalogModule => ({ key, title: `Module ${key}`, position, items });
const track = (modules: CatalogModule[]): CatalogTrack => ({ id: "track.t", slug: "t", title: "Track", summary: "", modules });
const premium = (id: string) => entry(id, { access: "premium" });
// Not alphabetical, and positions that disagree with the array: the API's order is the curriculum order.
const MIXED = track([
   mod("zeta", [entry("lesson.one"), entry("problem.two"), premium("lesson.three")], 9),
   mod("alpha", [entry("lesson.four"), entry("problem.five")], 1),
]);

describe("curriculumOf", () => {
   it("keeps the API's module and entry order, linking each entry canonically", () => {
      const { modules } = curriculumOf(MIXED);
      expect(modules.map(({ module }) => module.key)).toEqual(["zeta", "alpha"]);
      expect(modules.map(({ rows }) => rows.map(({ href }) => href))).toEqual([
         ["/lessons/one", "/problems/two", "/lessons/three"],
         ["/lessons/four", "/problems/five"],
      ]);
   });

   it("counts linkable Lessons and Problems", () => {
      expect(curriculumOf(MIXED).counts).toEqual({ lesson: 3, problem: 2 });
   });

   it("derives practice context from the outline's own Problem placements, with their modules", () => {
      const { practice } = curriculumOf(MIXED);
      expect(practice.map(({ entry, module }) => [entry.id, module.key])).toEqual([
         ["problem.two", "zeta"],
         ["problem.five", "alpha"],
      ]);
   });

   it("derives no Knowledge context: Knowledge is not placed in a Track (P1 §6.6)", () => {
      const curriculum = curriculumOf(MIXED);
      expect(Object.keys(curriculum).sort()).toEqual(["counts", "modules", "practice", "start"]);
      expect(Object.keys(curriculum.counts).sort()).toEqual(["lesson", "problem"]);
   });

   it("ignores a Knowledge entry in an outline: not shown, linked, counted, started from or used as context", () => {
      const stray = entry("knowledge.stray");
      const curriculum = curriculumOf(track([mod("a", [stray, entry("lesson.real")]), mod("b", [stray])]));
      expect(curriculum.modules.map(({ rows }) => rows.map(({ entry }) => entry.id))).toEqual([["lesson.real"], []]);
      expect(curriculum.counts).toEqual({ lesson: 1, problem: 0 });
      expect(curriculum.practice).toEqual([]);
      expect(curriculumOf(track([mod("only", [stray])])).start).toBeNull();
   });

   it("skips empty modules and unlinkable entries to find the start", () => {
      const bad = entry("lesson.bad", { type: "problem" });
      expect(curriculumOf(track([mod("empty", []), mod("also-empty", []), mod("real", [entry("problem.first")])])).start?.entry.id).toBe(
         "problem.first"
      );
      expect(curriculumOf(track([mod("a", [bad]), mod("b", [entry("lesson.next")])])).start?.entry.id).toBe("lesson.next");
      const inModule = curriculumOf(track([mod("m", [bad, entry("lesson.Bad_Slug", { slug: "Bad_Slug" }), entry("lesson.ok")])]));
      expect(inModule.start?.entry.id).toBe("lesson.ok");
      expect(inModule.counts).toEqual({ lesson: 1, problem: 0 });
      expect(inModule.modules[0].rows.map(({ entry }) => entry.id)).toEqual(["lesson.ok"]);
   });

   it("keeps a module that has nothing linkable, so it can say so", () => {
      const { modules } = curriculumOf(track([mod("a", [entry("lesson.bad", { type: "problem" })]), mod("b", [entry("lesson.ok")])]));
      expect(modules.map(({ module, rows }) => [module.key, rows.length])).toEqual([["a", 0], ["b", 1]]);
   });

   it("has no start and zero counts when nothing is linkable", () => {
      for (const empty of [track([]), track([mod("a", [])]), track([mod("a", [entry("lesson.bad", { type: "problem" })])])]) {
         const curriculum = curriculumOf(empty);
         expect(curriculum.start).toBeNull();
         expect(curriculum.counts).toEqual({ lesson: 0, problem: 0 });
         expect(curriculum.practice).toEqual([]);
      }
   });

   it("does not mutate or reorder the Track it reads", () => {
      const before = JSON.stringify(MIXED);
      curriculumOf(MIXED);
      expect(JSON.stringify(MIXED)).toBe(before);
   });
});

// The outline is public and has no viewer. "Linkable" is a route question; the item page enforces access.
describe("Start with premium entries", () => {
   it("is the first entry in curriculum order even when it is premium", () => {
      const { start } = curriculumOf(track([mod("m", [premium("lesson.paid"), entry("lesson.free")])]));
      expect(start?.entry.id).toBe("lesson.paid");
      expect(start?.href).toBe("/lessons/paid");
   });

   it("keeps the access flag on the start, so the page can mark it Premium before it is followed", () => {
      expect(curriculumOf(track([mod("m", [premium("lesson.paid")])])).start?.entry.access).toBe("premium");
      expect(curriculumOf(track([mod("m", [entry("lesson.free")])])).start?.entry.access).toBe("free");
   });

   it("never skips a premium entry to reach a free one, in its module or an earlier module than the free one", () => {
      expect(curriculumOf(track([mod("a", [premium("problem.paid")]), mod("b", [entry("lesson.free")])])).start?.entry.id).toBe("problem.paid");
      expect(curriculumOf(track([mod("empty", []), mod("b", [premium("lesson.paid"), entry("lesson.free")])])).start?.entry.id).toBe("lesson.paid");
   });

   it("still skips an unlinkable entry that comes first, whatever its access", () => {
      const unlinkable = entry("lesson.bad", { type: "problem", access: "free" });
      const start = curriculumOf(track([mod("m", [unlinkable, premium("lesson.paid"), entry("lesson.free")])])).start;
      expect(start?.entry.id).toBe("lesson.paid");
   });

   it("depends on the outline alone, so every viewer gets the same start", () => {
      expect(curriculumOf.length).toBe(1);
      const outline = track([mod("m", [premium("lesson.paid"), entry("lesson.free")])]);
      expect(curriculumOf(outline).start?.href).toBe(curriculumOf(structuredClone(outline)).start?.href);
   });

   it("reorders and hides nothing by access: premium rows keep their place and stay linkable", () => {
      const { modules } = curriculumOf(track([mod("m", [premium("lesson.a"), entry("lesson.b"), premium("lesson.c")])]));
      expect(modules[0].rows.map(({ entry, href }) => [entry.id, entry.access, href])).toEqual([
         ["lesson.a", "premium", "/lessons/a"],
         ["lesson.b", "free", "/lessons/b"],
         ["lesson.c", "premium", "/lessons/c"],
      ]);
   });
});
