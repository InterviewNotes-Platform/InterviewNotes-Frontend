import { describe, expect, it } from "vitest";
import { listedTracks, tracksIndex } from "./trackIndex";
import type { CatalogOutlineEntry, CatalogResult, CatalogTrack, CatalogTrackList } from "./types";

const summary = (slug: string, title = `${slug} title`) => ({ id: `track.${slug}`, slug, title, summary: ` ${slug} summary ` });
const list = (...tracks: CatalogTrackList["tracks"]): CatalogResult<CatalogTrackList> => ({ status: "ok", data: { tracks } });
const entry = (type: "lesson" | "problem" | "knowledge", slug: string, access: "free" | "premium" = "free"): CatalogOutlineEntry => ({
   id: `${type}.${slug}`,
   type,
   slug,
   title: `${slug} title`,
   access,
   primary: true,
});
const outline = (slug: string, modules: CatalogTrack["modules"]): CatalogResult<CatalogTrack> => ({
   status: "ok",
   data: { id: `track.${slug}`, slug, title: `${slug} title`, summary: "", modules },
});
const MODULES: CatalogTrack["modules"] = [
   { key: "empty", title: "Empty", position: 1, items: [] },
   { key: "one", title: "One", position: 2, items: [entry("problem", "warm-up"), entry("lesson", "first"), entry("lesson", "deep", "premium")] },
   { key: "two", title: "Two", position: 3, items: [entry("knowledge", "term"), entry("problem", "drill", "premium"), { ...entry("lesson", "bad"), id: "lesson.other" }] },
];

describe("tracksIndex", () => {
   it("lists each published Track in the API's order with counts taken from its linkable curriculum only", () => {
      const index = tracksIndex(list(summary("b"), summary("a")), new Map([["b", outline("b", MODULES)], ["a", outline("a", [])]]));
      expect(index).toEqual({
         status: "ok",
         tracks: [
            {
               id: "track.b",
               title: "b title",
               summary: "b summary",
               href: "/tracks/b",
               outline: {
                  // The empty Module is left out but keeps the numbering the Track page uses; Knowledge and a mismatched id are not curriculum.
                  modules: [
                     { key: "one", number: 2, title: "One", lessons: 2, problems: 1 },
                     { key: "two", number: 3, title: "Two", lessons: 0, problems: 1 },
                  ],
                  lessons: 2,
                  problems: 2,
                  access: { free: 2, premium: 2 },
                  start: { title: "first title", href: "/lessons/first", access: "free" },
               },
            },
            { id: "track.a", title: "a title", summary: "a summary", href: "/tracks/a", outline: { modules: [], lessons: 0, problems: 0, access: { free: 0, premium: 0 }, start: null } },
         ],
      });
   });

   it("offers no Start on a level-choice Track", () => {
      const slug = "behavioral-interview-preparation";
      const index = tracksIndex(list(summary(slug)), new Map([[slug, outline(slug, [{ key: "levels", title: "Levels", position: 1, items: [entry("lesson", "junior")] }])]]));
      expect(index).toMatchObject({ tracks: [{ outline: { lessons: 1, start: null } }] });
   });

   it("keeps a Track whose outline read failed, without inventing an outline", () => {
      const index = tracksIndex(list(summary("a")), new Map([["a", { status: "unavailable", cause: "upstream" } as const]]));
      expect(index).toMatchObject({ status: "ok", tracks: [{ href: "/tracks/a", outline: null }] });
      expect(tracksIndex(list(summary("a")), new Map())).toMatchObject({ tracks: [{ outline: null }] });
   });

   it("ignores an outline that belongs to a different Track", () => {
      expect(tracksIndex(list(summary("a")), new Map([["a", outline("b", MODULES)]]))).toMatchObject({ tracks: [{ outline: null }] });
   });

   it("drops a Track that is no longer published (404 or 410) and never shows one the list did not return", () => {
      const outlines = new Map<string, CatalogResult<CatalogTrack>>([
         ["gone", { status: "notFound" }],
         ["old", { status: "retired" }],
         ["draft", outline("draft", MODULES)],
         ["live", outline("live", [])],
      ]);
      const index = tracksIndex(list(summary("gone"), summary("old"), summary("live")), outlines);
      expect(index).toMatchObject({ status: "ok", tracks: [{ id: "track.live" }] });
      expect(JSON.stringify(index)).not.toContain("draft");
   });

   it("is empty for an empty list or when every listed Track was withdrawn, and unavailable when the list failed", () => {
      expect(tracksIndex(list(), new Map())).toEqual({ status: "empty" });
      expect(tracksIndex(list(summary("gone")), new Map([["gone", { status: "notFound" } as const]]))).toEqual({ status: "empty" });
      expect(tracksIndex({ status: "unavailable", cause: "upstream" }, new Map())).toEqual({ status: "unavailable" });
   });

   it("calls a non-empty list with nothing showable unavailable, not empty", () => {
      expect(tracksIndex(list({ id: "track.x", slug: "y", title: "X", summary: "" }, summary("t", "  ")), new Map())).toEqual({ status: "unavailable" });
   });
});

describe("listedTracks", () => {
   it("returns only Tracks with a canonical route and a title, or null when the list failed", () => {
      expect(listedTracks(list(summary("ok"), { id: "track.x", slug: "y", title: "X", summary: "" }))?.map(({ href }) => href)).toEqual(["/tracks/ok"]);
      expect(listedTracks({ status: "unavailable", cause: "upstream" })).toBeNull();
   });
});
