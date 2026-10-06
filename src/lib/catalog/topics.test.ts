import { beforeEach, describe, expect, it, vi } from "vitest";

const { listCatalogItems } = vi.hoisted(() => ({ listCatalogItems: vi.fn() }));
vi.mock("./client", () => ({ listCatalogItems }));

import { KNOWLEDGE_GROUPS } from "./knowledge";
import { TOPICS_PAGE_SIZE, loadTopics } from "./topics";
import type { CatalogMeta } from "./types";

const meta = (slug: string, category: CatalogMeta["category"]): CatalogMeta => ({
   id: `knowledge.${slug}`,
   type: "knowledge",
   slug,
   title: slug,
   summary: "",
   tags: [],
   category,
   difficulty: null,
   level: null,
   access: "free",
});
const page = (items: CatalogMeta[], next_cursor: string | null = null) => ({ status: "ok" as const, data: { items, next_cursor } });
const ids = (result: Awaited<ReturnType<typeof loadTopics>>) => (result.status === "ok" ? result.data.items.map((item) => item.slug) : result.status);
const [CORE, TECH, PATTERNS] = KNOWLEDGE_GROUPS;
const ALL = { group: null, tag: null, cursor: null };

beforeEach(() => {
   vi.clearAllMocks();
});

describe("loadTopics: every topic", () => {
   it("reads one list page of Knowledge, in the API's order, and ends when the API has no more", async () => {
      listCatalogItems.mockResolvedValueOnce(page([meta("b", "term"), meta("a", null), meta("c", "pattern")]));
      const result = await loadTopics(ALL);
      expect(listCatalogItems).toHaveBeenCalledExactlyOnceWith({ type: "knowledge", tag: undefined, limit: TOPICS_PAGE_SIZE, cursor: undefined });
      expect(ids(result)).toEqual(["b", "a", "c"]);
      expect(result).toMatchObject({ data: { next_cursor: null } });
   });

   it("keeps an item with no category, which no group contains", async () => {
      listCatalogItems.mockResolvedValueOnce(page([meta("plain", null)]));
      expect(ids(await loadTopics(ALL))).toEqual(["plain"]);
   });

   it("passes the tag and the cursor through untouched", async () => {
      listCatalogItems.mockResolvedValueOnce(page([]));
      await loadTopics({ group: null, tag: "serving", cursor: "opaque cursor/with?odd=chars" });
      expect(listCatalogItems).toHaveBeenCalledExactlyOnceWith({ type: "knowledge", tag: "serving", limit: TOPICS_PAGE_SIZE, cursor: "opaque cursor/with?odd=chars" });
   });

   it("stops at a full page even when more exist, so a plain page costs one read", async () => {
      const full = Array.from({ length: TOPICS_PAGE_SIZE }, (_, index) => meta(`t${index}`, "concept"));
      listCatalogItems.mockResolvedValueOnce(page(full, "knowledge.t11"));
      const result = await loadTopics(ALL);
      expect(listCatalogItems).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ data: { next_cursor: "knowledge.t11" } });
   });
});

describe("loadTopics: an editorial group is assembled from list metadata", () => {
   it("partitions the page on category, so a two-category group holds both", async () => {
      listCatalogItems.mockResolvedValueOnce(
         page([meta("a", "concept"), meta("b", "technology"), meta("c", "term"), meta("d", null), meta("e", "research"), meta("f", "pattern")])
      );
      expect(ids(await loadTopics({ ...ALL, group: CORE }))).toEqual(["a", "c"]);
      listCatalogItems.mockResolvedValueOnce(
         page([meta("a", "concept"), meta("b", "technology"), meta("c", "term"), meta("d", null), meta("e", "research"), meta("f", "pattern")])
      );
      expect(ids(await loadTopics({ ...ALL, group: TECH }))).toEqual(["b", "e"]);
   });

   it("never sends category=, so no value from the UI can make the API answer 422", async () => {
      listCatalogItems.mockResolvedValue(page([meta("a", "pattern")]));
      for (const group of [null, ...KNOWLEDGE_GROUPS]) await loadTopics({ ...ALL, group });
      for (const [params] of listCatalogItems.mock.calls) expect(params).not.toHaveProperty("category");
   });

   it("keeps reading until a page's worth is held, each read using the cursor the API issued", async () => {
      listCatalogItems
         .mockResolvedValueOnce(page([meta("a", "pattern"), meta("x", "concept")], "knowledge.cursor-one"))
         .mockResolvedValueOnce(page([meta("y", "term")], "knowledge.cursor-two"))
         .mockResolvedValueOnce(page([meta("b", "pattern")], null));
      const result = await loadTopics({ ...ALL, group: PATTERNS });
      expect(listCatalogItems.mock.calls.map(([params]) => params.cursor)).toEqual([undefined, "knowledge.cursor-one", "knowledge.cursor-two"]);
      expect(ids(result)).toEqual(["a", "b"]);
      expect(result).toMatchObject({ data: { next_cursor: null } });
   });

   it("lists every item of every page exactly once, in order, and never reads an item", async () => {
      const everything = Array.from({ length: 30 }, (_, index) => meta(`k${String(index).padStart(2, "0")}`, index % 3 === 0 ? "concept" : index % 3 === 1 ? "term" : "pattern"));
      const serve = ({ cursor, limit }: { cursor?: string; limit: number }) => {
         const start = cursor ? everything.findIndex((item) => item.id === cursor) + 1 : 0;
         const items = everything.slice(start, start + limit);
         return Promise.resolve(page(items, start + limit < everything.length ? items.at(-1)!.id : null));
      };
      listCatalogItems.mockImplementation(serve);

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
         const result = await loadTopics({ group: CORE, tag: null, cursor });
         if (result.status !== "ok") throw new Error("expected ok");
         seen.push(...result.data.items.map((item) => item.slug));
         cursor = result.data.next_cursor;
      } while (cursor);

      expect(seen).toEqual(everything.filter(({ category }) => category !== "pattern").map(({ slug }) => slug));
      expect(new Set(seen).size).toBe(seen.length);
   });

   it("bounds its reads on a sparse group and leaves the rest one cursor away", async () => {
      listCatalogItems.mockImplementation(() => Promise.resolve(page([meta("n", "concept")], "knowledge.n")));
      const result = await loadTopics({ ...ALL, group: PATTERNS });
      expect(listCatalogItems).toHaveBeenCalledTimes(6);
      expect(ids(result)).toEqual([]);
      expect(result).toMatchObject({ data: { next_cursor: "knowledge.n" } });
   });
});

describe("loadTopics: unavailable states pass through", () => {
   it.each(["notFound", "unavailable"] as const)("returns %s from the first read", async (status) => {
      listCatalogItems.mockResolvedValueOnce(status === "unavailable" ? { status, cause: "upstream" } : { status });
      expect(await loadTopics(ALL)).toMatchObject({ status });
   });

   it("returns an unavailable second read rather than a half-filled page", async () => {
      listCatalogItems.mockResolvedValueOnce(page([meta("x", "concept")], "knowledge.x")).mockResolvedValueOnce({ status: "unavailable", cause: "transport" });
      expect(await loadTopics({ ...ALL, group: PATTERNS })).toEqual({ status: "unavailable", cause: "transport" });
   });
});
