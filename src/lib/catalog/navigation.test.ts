import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogModule, CatalogOutlineEntry, CatalogTrack } from "./types";

const { getCatalogRelated, getCatalogTrack } = vi.hoisted(() => ({
   getCatalogRelated: vi.fn(),
   getCatalogTrack: vi.fn(),
}));
vi.mock("./client", () => ({ getCatalogRelated, getCatalogTrack }));

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
      expect([ids(placement?.previous ?? null), ids(placement?.next ?? null)]).toEqual([null, "lesson.a"]);
   });

   it("gives the last item no next", () => {
      const placement = placeInTrack(t, "lesson.b");
      expect([ids(placement?.previous ?? null), ids(placement?.next ?? null)]).toEqual(["problem.z", null]);
   });

   it("gives a middle item both neighbours in backend order, across a module boundary", () => {
      const placement = placeInTrack(t, "lesson.a");
      expect([ids(placement?.previous ?? null), ids(placement?.next ?? null)]).toEqual(["lesson.m", "problem.z"]);
      expect(placement?.module.key).toBe("zz");
   });

   it("has no neighbours for the only item in a Track", () => {
      const placement = placeInTrack(track("solo", [mod("m", ["lesson.only"])]), "lesson.only");
      expect([placement?.previous, placement?.next]).toEqual([null, null]);
   });

   it("returns null when the Track does not contain the item", () => {
      expect(placeInTrack(t, "lesson.other")).toBeNull();
   });

   it("skips entries that cannot map to a canonical route instead of linking them", () => {
      const bad = entry("lesson.bad", { type: "problem" });
      const placement = placeInTrack(track("t", [{ ...mod("m", ["lesson.a", "lesson.c"]), items: [entry("lesson.a"), bad, entry("lesson.c")] }]), "lesson.a");
      expect(ids(placement?.next ?? null)).toBe("lesson.c");
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
      expect([ids(navigation?.home?.previous ?? null), ids(navigation?.home?.next ?? null)]).toEqual(["lesson.prev", "lesson.next"]);
   });

   it("invents no home Track when the API marks none primary", async () => {
      getCatalogRelated.mockResolvedValue(related([placement("other", false)]));
      const navigation = await loadItemNavigation("lesson", "item");
      expect(navigation?.home).toBeNull();
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
});
