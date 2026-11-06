import { describe, expect, it } from "vitest";
import { filterOutline, outlineOf } from "./outline";
import type { CatalogModule, CatalogOutlineEntry, CatalogTrack } from "./types";

const entry = (id: string, over: Partial<CatalogOutlineEntry> = {}): CatalogOutlineEntry => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogOutlineEntry["type"], slug, title: `Title ${slug}`, access: "free", primary: true, ...over };
};
const mod = (key: string, items: CatalogOutlineEntry[]): CatalogModule => ({ key, title: `Module ${key}`, position: 0, items });
const track = (...modules: CatalogModule[]): CatalogTrack => ({ id: "track.t", slug: "t", title: "Track t", summary: "", modules });

describe("outlineOf (S6-RDR-3)", () => {
   it("names the Track and links it to its own page", () => {
      const outline = outlineOf(track(mod("a", [entry("lesson.x")])), "lesson.x");
      expect(outline).toMatchObject({ title: "Track t", href: "/tracks/t" });
   });

   it("keeps the API's Module and entry order, with each canonical route, and never sorts", () => {
      const outline = outlineOf(track(mod("zz", [entry("lesson.m"), entry("lesson.a")]), mod("aa", [entry("problem.z"), entry("lesson.b")])), "lesson.a")!;
      expect(outline.groups.map(({ key }) => key)).toEqual(["zz", "aa"]);
      expect(outline.groups.flatMap(({ entries }) => entries.map(({ id, href }) => [id, href]))).toEqual([
         ["lesson.m", "/lessons/m"],
         ["lesson.a", "/lessons/a"],
         ["problem.z", "/problems/z"],
         ["lesson.b", "/lessons/b"],
      ]);
   });

   it("lists linkable entries only, and leaves out a Module with none while numbering the rest as the Track page does", () => {
      const unlinkable = entry("lesson.bad", { type: "problem" });
      const outline = outlineOf(track(mod("empty", []), mod("bad-only", [unlinkable]), mod("m", [entry("lesson.a"), unlinkable, entry("lesson.c")])), "lesson.a")!;
      expect(outline.groups).toHaveLength(1);
      expect(outline.groups[0]).toMatchObject({ key: "m", number: 3 });
      expect(outline.groups[0].entries.map(({ id }) => id)).toEqual(["lesson.a", "lesson.c"]);
   });

   it("marks exactly the current entry, and opens only its Module", () => {
      const outline = outlineOf(track(mod("a", [entry("lesson.a")]), mod("b", [entry("lesson.b"), entry("lesson.c")])), "lesson.c")!;
      expect(outline.groups.map(({ current }) => current)).toEqual([false, true]);
      expect(outline.groups.flatMap(({ entries }) => entries).filter(({ current }) => current).map(({ id }) => id)).toEqual(["lesson.c"]);
   });

   it("opens the first Module when the current entry is not in the outline", () => {
      const outline = outlineOf(track(mod("a", [entry("lesson.a")]), mod("b", [entry("lesson.b")])), "lesson.gone")!;
      expect(outline.groups.map(({ current }) => current)).toEqual([true, false]);
      expect(outline.groups.flatMap(({ entries }) => entries).some(({ current }) => current)).toBe(false);
   });

   it("labels a Problem Practice problem and carries the premium marker from access", () => {
      const outline = outlineOf(track(mod("a", [entry("lesson.a"), entry("problem.p", { access: "premium" })])), "lesson.a")!;
      const [lesson, problem] = outline.groups[0].entries;
      expect([lesson.kind, lesson.access]).toEqual([null, "free"]);
      expect([problem.kind, problem.access]).toEqual(["Practice problem", "premium"]);
   });

   it("is null when nothing can be linked, so no empty sidebar is drawn", () => {
      expect(outlineOf(track(), "lesson.a")).toBeNull();
      expect(outlineOf(track(mod("a", [entry("lesson.a", { type: "problem" })])), "lesson.a")).toBeNull();
   });
});

describe("filterOutline (S6-RDR-4)", () => {
   const groups = outlineOf(
      track(
         mod("a", [entry("lesson.cache", { title: "Caching basics" }), entry("lesson.queue", { title: "Queues" })]),
         mod("b", [entry("problem.cdn", { title: "Design a CDN cache" }), entry("lesson.other", { title: "Other" })])
      ),
      "lesson.queue"
   )!.groups;

   it("matches a title substring case-insensitively and keeps the API's order", () => {
      const { groups: kept, count } = filterOutline(groups, "CACHE");
      expect(kept.flatMap(({ entries }) => entries.map(({ id }) => id))).toEqual(["problem.cdn"]);
      expect(filterOutline(groups, "cach").groups.flatMap(({ entries }) => entries.map(({ id }) => id))).toEqual(["lesson.cache", "problem.cdn"]);
      expect(count).toBe(1);
   });

   it("leaves out a Module with no match, keeps the numbering and never invents or duplicates an entry", () => {
      const { groups: kept } = filterOutline(groups, "cdn");
      expect(kept).toHaveLength(1);
      expect(kept[0]).toMatchObject({ key: "b", number: 2 });
      expect(kept[0].entries.map(({ id }) => id)).toEqual(["problem.cdn"]);
   });

   it("returns every group for a blank query and an empty result for no match", () => {
      expect(filterOutline(groups, "  ")).toEqual({ groups, count: 4 });
      expect(filterOutline(groups, "zzz")).toEqual({ groups: [], count: 0 });
   });
});
