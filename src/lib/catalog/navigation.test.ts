import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogModule, CatalogOutlineEntry, CatalogTrack } from "./types";

const { getCatalogItemMeta, getCatalogRelated, getCatalogTrack } = vi.hoisted(() => ({
   getCatalogItemMeta: vi.fn(),
   getCatalogRelated: vi.fn(),
   getCatalogTrack: vi.fn(),
}));
vi.mock("./client", () => ({ getCatalogItemMeta, getCatalogRelated, getCatalogTrack }));

import { loadItemNavigation, placeInTrack } from "./navigation";

const entry = (id: string, over: Partial<CatalogOutlineEntry> = {}): CatalogOutlineEntry => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogOutlineEntry["type"], slug, title: `Title ${slug}`, access: "free", primary: true, ...over };
};
const mod = (key: string, ids: string[]): CatalogModule => ({ key, title: `Module ${key}`, position: 0, items: ids.map((id) => entry(id)) });
const track = (slug: string, modules: CatalogModule[]): CatalogTrack => ({ id: `track.${slug}`, slug, title: `Track ${slug}`, summary: "", modules });
const ids = (e: CatalogOutlineEntry | null) => e?.id ?? null;

describe("placeInTrack", () => {
   // Deliberately not alphabetical: order must be the backend's, never a frontend sort.
   const t = track("t", [mod("zz", ["lesson.m", "lesson.a"]), mod("aa", ["problem.z", "lesson.b"])]);

   it("gives the first item no previous", () => {
      const placement = placeInTrack(t, "lesson.m");
      expect([ids(placement?.previousLesson ?? null), ids(placement?.nextLesson ?? null)]).toEqual([null, "lesson.a"]);
   });

   it("gives the last item no next", () => {
      const placement = placeInTrack(t, "lesson.b");
      expect([ids(placement?.previousLesson ?? null), ids(placement?.nextLesson ?? null)]).toEqual(["lesson.a", null]);
   });

   it("never names a Problem as a neighbour: Lesson A -> Problem P -> Lesson B", () => {
      const lessonsAround = track("t", [mod("m", ["lesson.a", "problem.p", "lesson.b"])]);
      const a = placeInTrack(lessonsAround, "lesson.a");
      const p = placeInTrack(lessonsAround, "problem.p");
      expect([ids(a?.previousLesson ?? null), ids(a?.nextLesson ?? null)]).toEqual([null, "lesson.b"]);
      expect([ids(p?.previousLesson ?? null), ids(p?.nextLesson ?? null)]).toEqual(["lesson.a", "lesson.b"]);
   });

   it("gives a middle item both neighbours in backend order, across a module boundary", () => {
      const placement = placeInTrack(t, "lesson.a");
      expect([ids(placement?.previousLesson ?? null), ids(placement?.nextLesson ?? null)]).toEqual(["lesson.m", "lesson.b"]);
      expect(placement?.module.key).toBe("zz");
   });

   it("has no neighbours for the only item in a Track", () => {
      const placement = placeInTrack(track("solo", [mod("m", ["lesson.only"])]), "lesson.only");
      expect([placement?.previousLesson, placement?.nextLesson]).toEqual([null, null]);
   });

   it("returns null when the Track does not contain the item", () => {
      expect(placeInTrack(t, "lesson.other")).toBeNull();
   });

   it("skips entries that cannot map to a canonical route instead of linking them", () => {
      const bad = entry("lesson.bad", { type: "problem" });
      const placement = placeInTrack(track("t", [{ ...mod("m", ["lesson.a", "lesson.c"]), items: [entry("lesson.a"), bad, entry("lesson.c")] }]), "lesson.a");
      expect(ids(placement?.nextLesson ?? null)).toBe("lesson.c");
   });
});

describe("loadItemNavigation", () => {
   const home = track("home", [mod("m", ["lesson.prev", "lesson.item", "lesson.next"])]);
   const other = track("other", [mod("x", ["lesson.elsewhere", "lesson.item", "lesson.beyond"])]);
   const RELATIONS = { prerequisite: [], related: [] };
   const related = (placements: unknown[], id = "lesson.item") => ({ status: "ok", data: { id, relations: RELATIONS, placements } });
   const placement = (slug: string, primary: boolean) => ({ track: slug, module: "m", position: 0, primary });

   beforeEach(() => {
      vi.clearAllMocks();
      getCatalogItemMeta.mockResolvedValue({ status: "ok", data: { id: "lesson.next", summary: "Next summary." } });
      getCatalogTrack.mockImplementation(async (slug: string) => {
         const found = [home, other].find((candidate) => candidate.slug === slug);
         return found ? { status: "ok", data: found } : { status: "notFound" };
      });
   });

   it("uses the API's primary placement as the home Track and the rest as alternates", async () => {
      getCatalogRelated.mockResolvedValue(related([placement("other", false), placement("home", true)]));
      const navigation = await loadItemNavigation("lesson", "item");
      expect(navigation?.home?.track.slug).toBe("home");
      expect(navigation?.alternates.map((p) => p.track.slug)).toEqual(["other"]);
      expect(navigation?.relations).toBe(RELATIONS);
   });

   it("takes previous and next from the home Track only, never another Track", async () => {
      getCatalogRelated.mockResolvedValue(related([placement("home", true), placement("other", false)]));
      const navigation = await loadItemNavigation("lesson", "item");
      expect([ids(navigation?.home?.previousLesson ?? null), ids(navigation?.home?.nextLesson ?? null)]).toEqual(["lesson.prev", "lesson.next"]);
   });

   it("invents no home Track when several placements and none is marked primary", async () => {
      getCatalogRelated.mockResolvedValue(related([placement("home", false), placement("other", false)]));
      const navigation = await loadItemNavigation("lesson", "item");
      expect(navigation?.home).toBeNull();
      expect(navigation?.alternates.map((p) => p.track.slug)).toEqual(["home", "other"]);
   });

   it("makes the lone placement the home Track even when it is not marked primary (F-2)", async () => {
      getCatalogRelated.mockResolvedValue(related([placement("home", false)]));
      const navigation = await loadItemNavigation("lesson", "item");
      expect(navigation?.home?.track.slug).toBe("home");
      expect(navigation?.alternates).toEqual([]);
   });

   it("gives no home Track when several placements are marked primary, and does not take the first", async () => {
      getCatalogRelated.mockResolvedValue(related([placement("home", true), placement("other", true)]));
      const navigation = await loadItemNavigation("lesson", "item");
      expect(navigation?.home).toBeNull();
      expect(navigation?.alternates.map((p) => p.track.slug)).toEqual(["home", "other"]);
   });

   it("promotes no other placement when the chosen home Track's outline fails to load", async () => {
      getCatalogRelated.mockResolvedValue(related([placement("gone", true), placement("home", false)]));
      const navigation = await loadItemNavigation("lesson", "item");
      expect(navigation?.home).toBeNull();
      expect(navigation?.alternates.map((p) => p.track.slug)).toEqual(["home"]);
   });

   it("promotes no other placement when the chosen home Track's outline omits the item", async () => {
      const omitting = track("omits", [mod("m", ["lesson.unrelated"])]);
      getCatalogTrack.mockImplementation(async (slug: string) => ({ status: "ok", data: slug === "omits" ? omitting : other }));
      getCatalogRelated.mockResolvedValue(related([placement("omits", true), placement("other", false)]));
      const navigation = await loadItemNavigation("lesson", "item");
      expect(navigation?.home).toBeNull();
      expect(navigation?.alternates.map((p) => p.track.slug)).toEqual(["other"]);
   });

   it("gives a Problem the neighbouring Lessons of its home Track", async () => {
      const mixed = track("mixed", [mod("m", ["lesson.a", "problem.p", "problem.q", "lesson.b"])]);
      getCatalogTrack.mockResolvedValue({ status: "ok", data: mixed });
      getCatalogRelated.mockResolvedValue(related([placement("mixed", true)], "problem.p"));
      const navigation = await loadItemNavigation("problem", "p");
      expect([ids(navigation?.home?.previousLesson ?? null), ids(navigation?.home?.nextLesson ?? null)]).toEqual(["lesson.a", "lesson.b"]);
   });

   it("returns empty Track context for an item placed in no Track", async () => {
      getCatalogRelated.mockResolvedValue(related([]));
      expect(await loadItemNavigation("lesson", "item")).toMatchObject({ home: null, alternates: [] });
      expect(getCatalogTrack).not.toHaveBeenCalled();
   });

   it("leaves out a Track that cannot be loaded and keeps the rest", async () => {
      getCatalogRelated.mockResolvedValue(related([placement("gone", true), placement("other", false)]));
      const navigation = await loadItemNavigation("lesson", "item");
      expect(navigation?.home).toBeNull();
      expect(navigation?.alternates.map((p) => p.track.slug)).toEqual(["other"]);
   });

   it("does not request a Track whose slug is not a valid slug", async () => {
      getCatalogRelated.mockResolvedValue(related([placement("home/../x?branch=main", true)]));
      expect(await loadItemNavigation("lesson", "item")).toMatchObject({ home: null });
      expect(getCatalogTrack).not.toHaveBeenCalled();
   });

   it("leaves a Track out when it does not list the item", async () => {
      getCatalogRelated.mockResolvedValue(related([placement("home", true)], "lesson.item"));
      getCatalogTrack.mockResolvedValue({ status: "ok", data: track("home", [mod("m", ["lesson.unrelated"])]) });
      expect(await loadItemNavigation("lesson", "item")).toMatchObject({ home: null });
   });

   it.each([
      { status: "unauthenticated" },
      { status: "unentitled" },
      { status: "notFound" },
      { status: "retired" },
      { status: "unavailable", cause: "upstream" },
   ])("returns no navigation, and loads no Track, when relationships are $status", async (result) => {
      getCatalogRelated.mockResolvedValue(result);
      expect(await loadItemNavigation("lesson", "item")).toBeNull();
      expect(getCatalogTrack).not.toHaveBeenCalled();
   });

   it("refuses relationships the API returned for a different item", async () => {
      getCatalogRelated.mockResolvedValue(related([placement("home", true)], "lesson.someone-else"));
      expect(await loadItemNavigation("lesson", "item")).toBeNull();
   });

   it("asks for relationships by the page's own type and slug", async () => {
      getCatalogRelated.mockResolvedValue(related([]));
      await loadItemNavigation("lesson", "item");
      expect(getCatalogRelated).toHaveBeenCalledExactlyOnceWith("lesson", "item");
   });

   describe("the Next Lesson summary (S-CUR-8)", () => {
      it("reads the public meta of the home Track's Next Lesson once, and only that", async () => {
         getCatalogRelated.mockResolvedValue(related([placement("home", true), placement("other", false)]));
         const navigation = await loadItemNavigation("lesson", "item");
         expect(navigation?.nextSummary).toBe("Next summary.");
         expect(getCatalogItemMeta).toHaveBeenCalledExactlyOnceWith("lesson", "next");
      });

      it.each([
         ["a failed read", { status: "unavailable", cause: "upstream" }],
         ["another item's meta", { status: "ok", data: { id: "lesson.elsewhere", summary: "Wrong." } }],
         ["an empty summary", { status: "ok", data: { id: "lesson.next", summary: "" } }],
      ])("leaves the summary out, never the link, after %s", async (_, result) => {
         getCatalogItemMeta.mockResolvedValue(result);
         getCatalogRelated.mockResolvedValue(related([placement("home", true)]));
         const navigation = await loadItemNavigation("lesson", "item");
         expect(navigation?.nextSummary).toBeNull();
         expect(ids(navigation?.home?.nextLesson ?? null)).toBe("lesson.next");
      });

      it("makes no read for the last Lesson, an unplaced Lesson or a Problem page", async () => {
         getCatalogRelated.mockResolvedValue(related([placement("home", true)], "lesson.next"));
         expect((await loadItemNavigation("lesson", "next"))?.nextSummary).toBeNull();
         getCatalogRelated.mockResolvedValue(related([]));
         expect((await loadItemNavigation("lesson", "item"))?.nextSummary).toBeNull();
         const mixed = track("mixed", [mod("m", ["lesson.a", "problem.p", "lesson.b"])]);
         getCatalogTrack.mockResolvedValue({ status: "ok", data: mixed });
         getCatalogRelated.mockResolvedValue(related([placement("mixed", true)], "problem.p"));
         expect((await loadItemNavigation("problem", "p"))?.nextSummary).toBeNull();
         expect(getCatalogItemMeta).not.toHaveBeenCalled();
      });
   });

   describe("the Practice step reads (S-PRC-5, S-PRC-6, S-PRM-3)", () => {
      const pmeta = (id: string, over: object = {}) => {
         const [type, slug] = id.split(".");
         return { id, type, slug, title: `Title ${slug}`, summary: `Summary ${slug}`, tags: [], category: null, difficulty: "easy", level: null, access: "free", ...over };
      };
      const shared = pmeta("knowledge.shared");
      const practiceTrack = track("practice", [mod("m", ["lesson.item", "problem.a", "problem.b", "problem.c", "lesson.next"])]);
      const lessonRelated = (relations: object) => ({ status: "ok", data: { id: "lesson.item", relations, placements: [placement("practice", true)] } });
      const problemRelated = (slug: string, applies: unknown[]) => ({ status: "ok", data: { id: `problem.${slug}`, relations: { applies }, placements: [] } });
      const calls = (mock: typeof getCatalogRelated | typeof getCatalogItemMeta, type: string) => mock.mock.calls.filter(([kind]) => kind === type).map(([, slug]) => slug);

      beforeEach(() => {
         getCatalogTrack.mockResolvedValue({ status: "ok", data: practiceTrack });
         getCatalogItemMeta.mockImplementation(async (type: string, slug: string) => ({ status: "ok", data: pmeta(`${type}.${slug}`, { summary: `Fetched ${slug}` }) }));
      });

      it("reads at most two Problem metas and two Problem relations however many Problems the Track holds, plus Next's meta", async () => {
         getCatalogRelated.mockImplementation(async (type: string, slug: string) =>
            type === "lesson" ? lessonRelated({ applies: [shared] }) : problemRelated(slug, [shared])
         );
         const navigation = await loadItemNavigation("lesson", "item");
         expect(navigation?.practice.map(({ id }) => id)).toEqual(["problem.a", "problem.b"]);
         expect(calls(getCatalogItemMeta, "problem")).toEqual(["a", "b"]);
         expect(calls(getCatalogItemMeta, "lesson")).toEqual(["next"]);
         expect(calls(getCatalogRelated, "problem")).toEqual(["a", "b"]);
         expect(getCatalogItemMeta.mock.calls.length + getCatalogRelated.mock.calls.length - 1).toBeLessThanOrEqual(5);
      });

      it("grounds each row: Placement, then the shared Knowledge from the Problem's own relations", async () => {
         getCatalogRelated.mockImplementation(async (type: string, slug: string) =>
            type === "lesson" ? lessonRelated({ applies: [shared] }) : problemRelated(slug, slug === "a" ? [shared] : [])
         );
         const [a, b] = (await loadItemNavigation("lesson", "item"))!.practice;
         expect(a).toMatchObject({ summary: "Fetched a", difficulty: "easy", reason: "Practice for this part of Module m · Also applies Title shared" });
         expect(b.reason).toBe("Practice for this part of Module m");
      });

      it("makes no meta read for a Problem the Lesson's relations carry, and no Problem relation read without Lesson Knowledge", async () => {
         getCatalogRelated.mockResolvedValue(lessonRelated({ prerequisite_of: [pmeta("problem.a", { summary: "From relations" })] }));
         const navigation = await loadItemNavigation("lesson", "item");
         expect(navigation?.practice[0]).toMatchObject({ summary: "From relations", reason: "Practice for this part of Module m · Builds on this lesson" });
         expect(calls(getCatalogItemMeta, "problem")).toEqual(["b"]);
         expect(calls(getCatalogRelated, "problem")).toEqual([]);
      });

      it.each([
         ["withheld", { status: "unentitled" }],
         ["unauthenticated", { status: "unauthenticated" }],
         ["failed", { status: "unavailable", cause: "upstream" }],
         ["for another item", problemRelated("zzz", [shared])],
      ])("omits the shared basis silently when the Problem's relations are %s, keeping the row and its other bases", async (_, result) => {
         getCatalogRelated.mockImplementation(async (type: string) => (type === "lesson" ? lessonRelated({ applies: [shared] }) : result));
         const navigation = await loadItemNavigation("lesson", "item");
         expect(navigation?.practice.map(({ reason }) => reason)).toEqual(["Practice for this part of Module m", "Practice for this part of Module m"]);
      });

      it("keeps the row with its title when the Problem's meta read fails or answers for another item", async () => {
         getCatalogRelated.mockResolvedValue(lessonRelated({}));
         getCatalogItemMeta.mockImplementation(async (type: string, slug: string) =>
            slug === "a" ? { status: "unavailable", cause: "upstream" } : slug === "b" ? { status: "ok", data: pmeta("problem.other") } : { status: "ok", data: pmeta(`${type}.${slug}`) }
         );
         const { practice } = (await loadItemNavigation("lesson", "item"))!;
         expect(practice.map(({ title, summary, difficulty }) => [title, summary, difficulty])).toEqual([
            ["Title a", null, null],
            ["Title b", null, null],
         ]);
      });

      it("does not offer Practice from a Problem or Knowledge page, and reads nothing for it", async () => {
         getCatalogRelated.mockResolvedValue({ status: "ok", data: { id: "problem.a", relations: { prerequisite_of: [pmeta("problem.x")] }, placements: [placement("practice", true)] } });
         expect((await loadItemNavigation("problem", "a"))?.practice).toEqual([]);
         expect(getCatalogItemMeta).not.toHaveBeenCalled();
      });

      it("has no Practice for a Lesson whose Track places no Problem after it and which names none", async () => {
         getCatalogTrack.mockResolvedValue({ status: "ok", data: home });
         getCatalogRelated.mockResolvedValue(related([placement("home", true)]));
         expect((await loadItemNavigation("lesson", "item"))?.practice).toEqual([]);
         expect(calls(getCatalogItemMeta, "problem")).toEqual([]);
      });
   });
});
