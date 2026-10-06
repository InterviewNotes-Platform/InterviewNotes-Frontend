import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
   createClient: async () => ({ auth: { getSession } }),
}));

import { getCatalogItem, getCatalogItemMeta, getCatalogRelated, getCatalogTrack } from "./client";

const TOKEN = "unit-synthetic-preview-token-0123456789abcdef";
const META = {
   id: "lesson.dynamic-batching",
   type: "lesson",
   slug: "dynamic-batching",
   title: "Synthetic Lesson",
   summary: "Synthetic summary",
   tags: [],
   category: null,
   difficulty: null,
   level: null,
   access: "free",
};
const LESSON = { ...META, body: { format: "markdown@1", text: "Synthetic." }, headings: [], sections: [], sections_withheld: false };
const TRACK = { id: "track.t", slug: "t", title: "Synthetic Track", summary: "", modules: [] };
const RELATED = { id: META.id, relations: {}, placements: [] };

// Each read, what the API answers it with, and whether it carries the reader's session.
const reads = [
   ["item", () => getCatalogItem("lesson", "dynamic-batching"), LESSON, true],
   ["meta", () => getCatalogItemMeta("lesson", "dynamic-batching"), META, false],
   ["related", () => getCatalogRelated("lesson", "dynamic-batching"), RELATED, true],
   ["track", () => getCatalogTrack("t"), TRACK, false],
] as const;

const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn();
const logged = () =>
   JSON.stringify([...vi.mocked(console.error).mock.calls, ...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.log).mock.calls]);

beforeEach(() => {
   process.env.API_URL = "https://api.test";
   getSession.mockResolvedValue({ data: { session: null } });
   vi.stubGlobal("fetch", fetchMock);
   vi.spyOn(console, "error").mockImplementation(() => {});
   vi.spyOn(console, "warn").mockImplementation(() => {});
   vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
   vi.unstubAllGlobals();
   vi.unstubAllEnvs();
   vi.restoreAllMocks();
   fetchMock.mockReset();
   getSession.mockReset();
});

describe.each(reads)("%s read in a preview deployment", (_name, read, body, withSession) => {
   beforeEach(() => {
      vi.stubEnv("CATALOG_PREVIEW_TOKEN", TOKEN);
      fetchMock.mockResolvedValue(reply(200, body));
   });

   it("sends X-Preview-Token and is never cached", async () => {
      expect((await read()).status).toBe("ok");
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers).toEqual({ "X-Preview-Token": TOKEN });
      expect(init.cache).toBe("no-store");
      expect(init.next).toBeUndefined();
   });

   it("keeps the credential out of the URL, which stays a bare catalog path", async () => {
      await read();
      const [url] = fetchMock.mock.calls[0];
      expect(url).toMatch(/^https:\/\/api\.test\/catalog\/(items\/lesson\/dynamic-batching|tracks\/t)(\/meta|\/related)?$/);
      expect(url).not.toContain(TOKEN);
      expect(url).not.toContain("?");
   });

   it("keeps the reader's session in its own header beside the credential", async () => {
      getSession.mockResolvedValue({ data: { session: { access_token: "session-token" } } });
      await read();
      expect(fetchMock.mock.calls[0][1].headers).toEqual({
         "X-Preview-Token": TOKEN,
         ...(withSession ? { Authorization: "Bearer session-token" } : {}),
      });
   });
});

describe.each(reads)("%s read in production", (_name, read, body) => {
   beforeEach(() => {
      vi.stubEnv("CATALOG_PREVIEW_TOKEN", "");
      fetchMock.mockResolvedValue(reply(200, body));
   });

   it("sends no preview header, in any casing, and keeps its shareable cache", async () => {
      await read();
      const [, init] = fetchMock.mock.calls[0];
      expect(Object.keys(init.headers).map((name) => name.toLowerCase())).not.toContain("x-preview-token");
      expect(JSON.stringify(init)).not.toMatch(/preview/i);
      expect(init.next).toEqual({ revalidate: 60 });
   });
});

describe("a preview that fails", () => {
   beforeEach(() => vi.stubEnv("CATALOG_PREVIEW_TOKEN", TOKEN));

   it.each([403, 500, 502])("answers %i as unavailable after exactly one request, never retrying or falling back", async (status) => {
      fetchMock.mockResolvedValue(reply(status, { detail: "backend internals: postgres://secret" }));
      const result = await getCatalogItem("lesson", "dynamic-batching");
      expect(result).toEqual({ status: "unavailable", cause: "upstream" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe("https://api.test/catalog/items/lesson/dynamic-batching");
      expect(JSON.stringify(result)).not.toContain("postgres");
   });

   it("answers an unreachable API as unavailable after one request, without logging the credential", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      expect(await getCatalogItem("lesson", "dynamic-batching")).toEqual({ status: "unavailable", cause: "transport" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(logged()).not.toContain(TOKEN);
   });

   it("answers an invalid catalog response as unavailable", async () => {
      fetchMock.mockResolvedValue(reply(200, { title: "not an item" }));
      expect(await getCatalogItem("lesson", "dynamic-batching")).toEqual({ status: "unavailable", cause: "malformed" });
      fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
      expect(await getCatalogTrack("t")).toEqual({ status: "unavailable", cause: "malformed" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
   });

   it("still reports what the API decides about the reader", async () => {
      fetchMock.mockResolvedValue(reply(402));
      expect(await getCatalogItem("lesson", "dynamic-batching")).toEqual({ status: "unentitled" });
      fetchMock.mockResolvedValue(reply(404));
      expect(await getCatalogItem("lesson", "dynamic-batching")).toEqual({ status: "notFound" });
   });
});

describe("a preview that cannot send its credential safely", () => {
   it.each([
      ["a malformed credential", "short", "https://api.test"],
      ["a plain-http remote API", TOKEN, "http://api.internal"],
   ])("makes no request for %s", async (_label, token, apiUrl) => {
      vi.stubEnv("CATALOG_PREVIEW_TOKEN", token);
      process.env.API_URL = apiUrl;
      for (const [, read] of reads) {
         expect(await read()).toEqual({ status: "unavailable", cause: "transport" });
      }
      expect(fetchMock).not.toHaveBeenCalled();
      expect(logged()).not.toContain(token);
   });
});
