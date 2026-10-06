import { beforeEach, describe, expect, it, vi } from "vitest";

const { listCatalogItems } = vi.hoisted(() => ({ listCatalogItems: vi.fn() }));
vi.mock("./client", () => ({ listCatalogItems }));

import { PROBLEMS_PAGE_SIZE, TOPIC_SCAN_CAP, loadProblemTopics, loadProblems } from "./problems";
import type { CatalogMeta } from "./types";

const problem = (slug: string, tags: string[]): CatalogMeta => ({
   id: `problem.${slug}`,
   type: "problem",
   slug,
   title: slug,
   summary: "",
   tags,
   category: "system_design",
   difficulty: null,
   level: null,
   access: "free",
});
const page = (items: CatalogMeta[], next_cursor: string | null = null) => ({ status: "ok" as const, data: { items, next_cursor } });
const NONE = { tag: null, difficulty: null, level: null, track: null, access: null, cursor: null };

beforeEach(() => {
   vi.clearAllMocks();
});

describe("loadProblems", () => {
   it("reads one page of Problems with the filters it is given, and only those", async () => {
      listCatalogItems.mockResolvedValueOnce(page([]));
      await loadProblems({ ...NONE, difficulty: "hard", track: "ranking", cursor: "problem.c" });
      expect(listCatalogItems).toHaveBeenCalledExactlyOnceWith({
         type: "problem",
         tag: undefined,
         difficulty: "hard",
         level: undefined,
         access: undefined,
         track: "ranking",
         limit: PROBLEMS_PAGE_SIZE,
         cursor: "problem.c",
      });
   });

   it("hands the API's result back untouched, failures included", async () => {
      listCatalogItems.mockResolvedValueOnce({ status: "unavailable", cause: "upstream" });
      expect(await loadProblems(NONE)).toEqual({ status: "unavailable", cause: "upstream" });
   });
});

describe("loadProblemTopics", () => {
   it("derives Topics from one unfiltered page of Problems when the API has no more", async () => {
      listCatalogItems.mockResolvedValueOnce(page([problem("a", ["serving", "latency"]), problem("b", ["ranking"])]));
      expect(await loadProblemTopics()).toEqual({ status: "ok", data: ["latency", "ranking", "serving"] });
      expect(listCatalogItems).toHaveBeenCalledExactlyOnceWith({ type: "problem", limit: 100, cursor: undefined });
   });

   it("follows the API's own cursor until it runs out, never fetching a Problem", async () => {
      listCatalogItems.mockResolvedValueOnce(page([problem("a", ["x1"])], "problem.a")).mockResolvedValueOnce(page([problem("b", ["x2"])]));
      expect(await loadProblemTopics()).toEqual({ status: "ok", data: ["x1", "x2"] });
      expect(listCatalogItems).toHaveBeenCalledTimes(2);
      expect(listCatalogItems).toHaveBeenLastCalledWith({ type: "problem", limit: 100, cursor: "problem.a" });
   });

   it("stops at the documented cap even if the API still has more", async () => {
      listCatalogItems.mockImplementation(async () => page([problem("a", ["t"])], "problem.more"));
      await loadProblemTopics();
      expect(TOPIC_SCAN_CAP).toBe(200);
      expect(listCatalogItems).toHaveBeenCalledTimes(TOPIC_SCAN_CAP / 100);
   });

   it("fails whole when a read fails, rather than offering a partial list as complete", async () => {
      listCatalogItems.mockResolvedValueOnce(page([problem("a", ["t"])], "problem.a")).mockResolvedValueOnce({ status: "unavailable", cause: "transport" });
      expect(await loadProblemTopics()).toEqual({ status: "unavailable", cause: "transport" });
   });

   it("is an empty list for an empty catalog", async () => {
      listCatalogItems.mockResolvedValueOnce(page([]));
      expect(await loadProblemTopics()).toEqual({ status: "ok", data: [] });
   });
});
