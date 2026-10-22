import { describe, expect, it } from "vitest";
import { FREE_CHAPTER_LESSON_SLUG, freeChapterHref, homeProblem, homeTracks } from "./home";
import type { CatalogItemPage, CatalogMeta, CatalogResult, CatalogTrackList } from "./types";

const track = (slug: string, title = `${slug} title`, summary = `${slug} summary`) => ({ id: `track.${slug}`, slug, title, summary });
const list = (...tracks: CatalogTrackList["tracks"]): CatalogResult<CatalogTrackList> => ({ status: "ok", data: { tracks } });

describe("homeTracks", () => {
   it("maps each Track to its title, summary and canonical route, in the API's order", () => {
      expect(homeTracks(list(track("zeta"), track("alpha")))).toEqual({
         status: "ok",
         cards: [
            { id: "track.zeta", title: "zeta title", summary: "zeta summary", href: "/tracks/zeta" },
            { id: "track.alpha", title: "alpha title", summary: "alpha summary", href: "/tracks/alpha" },
         ],
      });
   });

   it("takes no card count from anywhere: one Track gives one card, many give many", () => {
      const many = Array.from({ length: 12 }, (_, i) => track(`t${i}`));
      expect(homeTracks(list(track("only")))).toMatchObject({ cards: [{ href: "/tracks/only" }] });
      expect(homeTracks(list(...many))).toMatchObject({ cards: expect.arrayContaining([expect.objectContaining({ href: "/tracks/t11" })]) });
   });

   it("keeps a Track with a blank summary, without inventing one", () => {
      expect(homeTracks(list(track("quiet", "Quiet Track", "   ")))).toMatchObject({ cards: [{ title: "Quiet Track", summary: "" }] });
   });

   it("reports an empty list as empty", () => {
      expect(homeTracks(list())).toEqual({ status: "empty" });
   });

   it.each<CatalogResult<CatalogTrackList>>([
      { status: "unavailable", cause: "transport" },
      { status: "unavailable", cause: "upstream" },
      { status: "unavailable", cause: "malformed" },
      { status: "notFound" },
      { status: "unauthenticated" },
      { status: "unentitled" },
      { status: "retired" },
   ])("reports %j as unavailable", (result) => {
      expect(homeTracks(result)).toEqual({ status: "unavailable" });
   });

   it("drops an entry that does not agree with its own route and one with no title, and links the rest", () => {
      const result = list(
         { id: "track.other", slug: "mismatch", title: "Wrong id", summary: "x" },
         { id: "track.bad slug", slug: "bad slug", title: "Unsafe slug", summary: "x" },
         { id: "track.untitled", slug: "untitled", title: "  ", summary: "x" },
         track("good"),
      );
      expect(homeTracks(result)).toEqual({ status: "ok", cards: [{ id: "track.good", title: "good title", summary: "good summary", href: "/tracks/good" }] });
   });

   it("is unavailable, not empty, when Tracks were listed but none can be shown", () => {
      expect(homeTracks(list({ id: "track.other", slug: "mismatch", title: "Wrong id", summary: "x" }))).toEqual({ status: "unavailable" });
   });
});

describe("freeChapterHref", () => {
   const lesson = (overrides: Partial<CatalogMeta> = {}): CatalogResult<CatalogMeta> => ({
      status: "ok",
      data: {
         id: `lesson.${FREE_CHAPTER_LESSON_SLUG}`,
         type: "lesson",
         slug: FREE_CHAPTER_LESSON_SLUG,
         title: "Anatomy of a model request",
         summary: "s",
         tags: [],
         category: null,
         difficulty: null,
         level: null,
         access: "free",
         ...overrides,
      },
   });

   it("names the first free Lesson of genai-system-design", () => {
      expect(FREE_CHAPTER_LESSON_SLUG).toBe("anatomy-of-a-model-request");
   });

   it("links the Lesson only when the API says it is free", () => {
      expect(freeChapterHref(lesson())).toBe("/lessons/anatomy-of-a-model-request");
   });

   it("is absent for a premium Lesson", () => {
      expect(freeChapterHref(lesson({ access: "premium" }))).toBeNull();
   });

   it.each<CatalogResult<CatalogMeta>>([
      { status: "notFound" },
      { status: "retired" },
      { status: "unauthenticated" },
      { status: "unentitled" },
      { status: "unavailable", cause: "transport" },
      { status: "unavailable", cause: "upstream" },
      { status: "unavailable", cause: "malformed" },
   ])("is absent for %j", (result) => {
      expect(freeChapterHref(result)).toBeNull();
   });

   it("is absent when the answer is not that Lesson or its id disagrees with its slug", () => {
      expect(freeChapterHref(lesson({ slug: "something-else", id: "lesson.something-else" }))).toBeNull();
      expect(freeChapterHref(lesson({ type: "knowledge", id: `knowledge.${FREE_CHAPTER_LESSON_SLUG}` }))).toBeNull();
      expect(freeChapterHref(lesson({ id: "lesson.another" }))).toBeNull();
   });
});

describe("homeProblem", () => {
   const problem = (over: Partial<CatalogMeta> = {}): CatalogMeta => ({
      id: "problem.p",
      type: "problem",
      slug: "p",
      title: " Design a Feed ",
      summary: " Rank a feed. ",
      tags: [],
      category: "system_design",
      difficulty: null,
      level: null,
      access: "premium",
      ...over,
   });
   const page = (...items: CatalogMeta[]): CatalogResult<CatalogItemPage> => ({ status: "ok", data: { items, next_cursor: null } });

   it("takes the first Problem's title and summary from list metadata, trimmed, with no access or route", () => {
      expect(homeProblem(page(problem(), problem({ title: "Second" })))).toEqual({ title: "Design a Feed", summary: "Rank a feed." });
   });

   it("skips an untitled or non-Problem entry and gives null when nothing usable is left", () => {
      expect(homeProblem(page(problem({ title: "  " }), problem({ type: "lesson", title: "A Lesson" }), problem({ title: "Next" })))).toEqual({ title: "Next", summary: "Rank a feed." });
      expect(homeProblem(page(problem({ title: "" })))).toBeNull();
      expect(homeProblem(page())).toBeNull();
   });

   it.each<CatalogResult<CatalogItemPage>>([{ status: "unavailable", cause: "transport" }, { status: "notFound" }, { status: "unauthenticated" }])("is null for %j", (result) => {
      expect(homeProblem(result)).toBeNull();
   });
});
