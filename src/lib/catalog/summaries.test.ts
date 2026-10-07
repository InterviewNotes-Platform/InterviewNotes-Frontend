import { beforeEach, describe, expect, it, vi } from "vitest";

const { listCatalogItems } = vi.hoisted(() => ({ listCatalogItems: vi.fn() }));
vi.mock("./client", () => ({ listCatalogItems }));

import { SUMMARY_SCAN_PAGES, loadLessonSummaries } from "./summaries";
import type { CatalogMeta } from "./types";

const lesson = (slug: string, summary = `About ${slug}.`): CatalogMeta => ({
   id: `lesson.${slug}`,
   type: "lesson",
   slug,
   title: slug,
   summary,
   tags: [],
   category: null,
   difficulty: null,
   level: null,
   access: "free",
});
const page = (items: CatalogMeta[], next_cursor: string | null = null) => ({ status: "ok" as const, data: { items, next_cursor } });

beforeEach(() => {
   listCatalogItems.mockReset();
});

describe("loadLessonSummaries", () => {
   it("reads one page of the Track's Lessons and maps each summary to its item id", async () => {
      listCatalogItems.mockResolvedValueOnce(page([lesson("a"), lesson("b")]));
      const summaries = await loadLessonSummaries("t");
      expect(listCatalogItems).toHaveBeenCalledExactlyOnceWith({ type: "lesson", track: "t", limit: 100, cursor: undefined });
      expect(summaries).toEqual(
         new Map([
            ["lesson.a", "About a."],
            ["lesson.b", "About b."],
         ])
      );
   });

   it("follows next_cursor untouched until the last page and merges every page", async () => {
      listCatalogItems
         .mockResolvedValueOnce(page([lesson("a")], "lesson.a"))
         .mockResolvedValueOnce(page([lesson("b")], "lesson.b"))
         .mockResolvedValueOnce(page([lesson("c")]));
      const summaries = await loadLessonSummaries("t");
      expect(listCatalogItems.mock.calls.map(([params]) => params.cursor)).toEqual([undefined, "lesson.a", "lesson.b"]);
      expect([...summaries!.keys()]).toEqual(["lesson.a", "lesson.b", "lesson.c"]);
   });

   it("completes when the fifth page is the last", async () => {
      for (let index = 1; index < SUMMARY_SCAN_PAGES; index += 1) listCatalogItems.mockResolvedValueOnce(page([lesson(`p${index}`)], `lesson.p${index}`));
      listCatalogItems.mockResolvedValueOnce(page([lesson("last")]));
      const summaries = await loadLessonSummaries("t");
      expect(listCatalogItems).toHaveBeenCalledTimes(5);
      expect(summaries?.size).toBe(5);
   });

   it("returns nothing, and never reads a sixth page, when five pages leave more to read", async () => {
      listCatalogItems.mockImplementation(async ({ cursor }) => page([lesson(`p${(cursor ?? "").length}`)], `lesson.${(cursor ?? "").length + 1}`));
      expect(await loadLessonSummaries("t")).toBeNull();
      expect(listCatalogItems).toHaveBeenCalledTimes(SUMMARY_SCAN_PAGES);
   });

   it("returns nothing, not the pages that succeeded, when a later page fails, and reads no further", async () => {
      listCatalogItems
         .mockResolvedValueOnce(page([lesson("a")], "lesson.a"))
         .mockResolvedValueOnce({ status: "unavailable", cause: "upstream" })
         .mockResolvedValueOnce(page([lesson("c")]));
      expect(await loadLessonSummaries("t")).toBeNull();
      expect(listCatalogItems).toHaveBeenCalledTimes(2);
   });

   it("returns nothing when the first page fails, and does not retry", async () => {
      listCatalogItems.mockResolvedValue({ status: "unavailable", cause: "transport" });
      expect(await loadLessonSummaries("t")).toBeNull();
      expect(listCatalogItems).toHaveBeenCalledTimes(1);
   });

   it("treats any non-ok status, such as not found, as a failed page", async () => {
      listCatalogItems.mockResolvedValue({ status: "notFound" });
      expect(await loadLessonSummaries("t")).toBeNull();
   });

   it("returns an empty set, not a failure, for a Track with no published Lessons", async () => {
      listCatalogItems.mockResolvedValueOnce(page([]));
      expect(await loadLessonSummaries("t")).toEqual(new Map());
   });
});
