import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
   createClient: async () => ({ auth: { getSession } }),
}));

import { listCatalogItems, listCatalogTracks } from "./client";
import type { CatalogItemListParams } from "./types";

const TOKEN = "unit-synthetic-preview-token-0123456789abcdef";
const TRACK = { id: "track.alpha", slug: "alpha", title: "Alpha Track", summary: "Synthetic summary" };
const META = (slug: string, over: object = {}) => ({
   id: `lesson.${slug}`,
   type: "lesson",
   slug,
   title: `Title ${slug}`,
   summary: "Synthetic summary",
   tags: ["synthetic"],
   difficulty: null,
   level: "foundational",
   access: "free",
   ...over,
});
const PAGE = { items: [META("a"), META("b")], next_cursor: "lesson.b" };

const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn();
const urlOf = (call = 0) => fetchMock.mock.calls[call][0] as string;
const MALFORMED = { status: "unavailable", cause: "malformed" };

beforeEach(() => {
   process.env.API_URL = "https://api.test/";
   getSession.mockResolvedValue({ data: { session: { access_token: "reader-token" } } });
   vi.stubEnv("CATALOG_PREVIEW_TOKEN", "");
   vi.stubGlobal("fetch", fetchMock);
   vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
   vi.unstubAllGlobals();
   vi.unstubAllEnvs();
   vi.restoreAllMocks();
   fetchMock.mockReset();
   getSession.mockReset();
});

describe("listCatalogTracks", () => {
   it("returns the Tracks in the order the API sent them", async () => {
      const tracks = [{ ...TRACK, id: "track.zeta", slug: "zeta" }, TRACK];
      fetchMock.mockResolvedValue(reply(200, { tracks }));
      expect(await listCatalogTracks()).toEqual({ status: "ok", data: { tracks } });
   });

   it("calls only the public list endpoint, with no query and no session", async () => {
      fetchMock.mockResolvedValue(reply(200, { tracks: [TRACK] }));
      await listCatalogTracks();
      expect(urlOf()).toBe("https://api.test/catalog/tracks");
      expect(getSession).not.toHaveBeenCalled();
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers).toEqual({});
      expect(init.next).toEqual({ revalidate: 60 });
   });

   it("returns an empty list as ok, leaving the empty state to the page", async () => {
      fetchMock.mockResolvedValue(reply(200, { tracks: [] }));
      expect(await listCatalogTracks()).toEqual({ status: "ok", data: { tracks: [] } });
   });

   it("maps a disabled catalog (404) to notFound", async () => {
      fetchMock.mockResolvedValue(reply(404, { detail: "Not Found" }));
      expect(await listCatalogTracks()).toEqual({ status: "notFound" });
   });

   it.each([500, 502, 503])("maps HTTP %i to unavailable/upstream without leaking the body", async (code) => {
      fetchMock.mockResolvedValue(reply(code, { detail: "postgres://secret@internal" }));
      const result = await listCatalogTracks();
      expect(result).toEqual({ status: "unavailable", cause: "upstream" });
      expect(JSON.stringify(result)).not.toContain("secret");
   });

   it("maps a network failure and a missing API_URL to unavailable/transport", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      expect(await listCatalogTracks()).toEqual({ status: "unavailable", cause: "transport" });
      delete process.env.API_URL;
      fetchMock.mockClear();
      expect(await listCatalogTracks()).toEqual({ status: "unavailable", cause: "transport" });
      expect(fetchMock).not.toHaveBeenCalled();
   });

   it.each<[string, unknown]>([
      ["a body that is not JSON", "<html>"],
      ["no tracks array", {}],
      ["tracks that is not an array", { tracks: {} }],
      ["a bare array", [TRACK]],
      ["a Track without a title", { tracks: [{ ...TRACK, title: undefined }] }],
      ["a Track without a summary", { tracks: [{ ...TRACK, summary: null }] }],
      ["a Track that is not an object", { tracks: ["alpha"] }],
   ])("refuses %s", async (_name, payload) => {
      fetchMock.mockResolvedValue(
         typeof payload === "string" ? new Response(payload, { status: 200 }) : reply(200, payload)
      );
      expect(await listCatalogTracks()).toEqual(MALFORMED);
   });
});

describe("listCatalogItems request", () => {
   beforeEach(() => {
      fetchMock.mockImplementation(async () => reply(200, PAGE));
   });

   it("calls the bare list endpoint when no filter is given", async () => {
      await listCatalogItems();
      expect(urlOf()).toBe("https://api.test/catalog/items");
      await listCatalogItems({});
      expect(urlOf(1)).toBe("https://api.test/catalog/items");
   });

   it.each<[string, CatalogItemListParams, string]>([
      ["type", { type: "problem" }, "type=problem"],
      ["tag", { tag: "ranking" }, "tag=ranking"],
      ["difficulty", { difficulty: "hard" }, "difficulty=hard"],
      ["level", { level: "advanced" }, "level=advanced"],
      ["access", { access: "premium" }, "access=premium"],
      ["track", { track: "llm-platform" }, "track=llm-platform"],
      ["module and track", { track: "llm-platform", module: "m1" }, "track=llm-platform&module=m1"],
      ["limit", { limit: 25 }, "limit=25"],
      ["cursor", { cursor: "lesson.b" }, "cursor=lesson.b"],
   ])("forwards %s", async (_name, params, query) => {
      await listCatalogItems(params);
      expect(urlOf()).toBe(`https://api.test/catalog/items?${query}`);
   });

   it("sends every supported filter together, in a fixed order", async () => {
      await listCatalogItems({
         cursor: "lesson.b",
         limit: 10,
         module: "m1",
         track: "t",
         access: "free",
         level: "intermediate",
         difficulty: "easy",
         tag: "x",
         type: "lesson",
      });
      expect(urlOf()).toBe(
         "https://api.test/catalog/items?type=lesson&tag=x&difficulty=easy&level=intermediate&access=free&track=t&module=m1&limit=10&cursor=lesson.b"
      );
   });

   it("never sends a parameter the API does not support, even when one is passed", async () => {
      const unsupported = { kind: "concept", sort: "title", branch: "main", commit: "abc", q: "rag", offset: 10 };
      await listCatalogItems({ type: "knowledge", ...unsupported } as CatalogItemListParams);
      expect(urlOf()).toBe("https://api.test/catalog/items?type=knowledge");
   });

   it("leaves out filters that are undefined or empty", async () => {
      await listCatalogItems({ type: "lesson", tag: "", level: undefined, cursor: "" });
      expect(urlOf()).toBe("https://api.test/catalog/items?type=lesson");
   });

   it("encodes values so one cannot add or change a parameter", async () => {
      await listCatalogItems({ tag: "a&access=premium", track: "../x?y=1" });
      expect(urlOf()).toBe("https://api.test/catalog/items?tag=a%26access%3Dpremium&track=..%2Fx%3Fy%3D1");
   });

   it("treats the cursor as opaque: never parsed or reshaped, only encoded", async () => {
      await listCatalogItems({ cursor: "not an item id/=+" });
      expect(urlOf()).toBe("https://api.test/catalog/items?cursor=not%20an%20item%20id%2F%3D%2B");
   });

   it("sends no credential, no session and allows the 60 s shared cache", async () => {
      await listCatalogItems({ type: "lesson" });
      expect(getSession).not.toHaveBeenCalled();
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers).toEqual({});
      expect(init.next).toEqual({ revalidate: 60 });
   });
});

describe("listCatalogItems results", () => {
   it("returns a page in the API's order, never re-sorted", async () => {
      const page = { items: [META("zeta"), META("alpha")], next_cursor: null };
      fetchMock.mockResolvedValue(reply(200, page));
      const result = await listCatalogItems({ type: "lesson" });
      expect(result).toEqual({ status: "ok", data: page });
      expect(result.status === "ok" && result.data.items.map((item) => item.slug)).toEqual(["zeta", "alpha"]);
   });

   it("returns an empty result as ok", async () => {
      fetchMock.mockResolvedValue(reply(200, { items: [], next_cursor: null }));
      expect(await listCatalogItems({ tag: "none" })).toEqual({ status: "ok", data: { items: [], next_cursor: null } });
   });

   it("walks pages by passing each next_cursor back untouched", async () => {
      fetchMock
         .mockResolvedValueOnce(reply(200, { items: [META("a")], next_cursor: "lesson.a" }))
         .mockResolvedValueOnce(reply(200, { items: [META("b")], next_cursor: null }));
      const first = await listCatalogItems({ limit: 1 });
      const cursor = first.status === "ok" ? (first.data.next_cursor ?? undefined) : undefined;
      const second = await listCatalogItems({ limit: 1, cursor });
      expect(urlOf(1)).toBe("https://api.test/catalog/items?limit=1&cursor=lesson.a");
      expect(second.status === "ok" && second.data.next_cursor).toBeNull();
   });

   it.each([
      [404, { status: "notFound" }],
      [410, { status: "retired" }],
   ])("maps HTTP %i for an unknown or retired Track filter", async (code, expected) => {
      fetchMock.mockResolvedValue(reply(code, { detail: "Track not found" }));
      expect(await listCatalogItems({ track: "gone" })).toEqual(expected);
   });

   it.each([422, 500, 503])("maps HTTP %i to unavailable/upstream without leaking the body", async (code) => {
      fetchMock.mockResolvedValue(reply(code, { detail: "Unsupported query parameter: kind postgres://secret" }));
      const result = await listCatalogItems({ type: "lesson" });
      expect(result).toEqual({ status: "unavailable", cause: "upstream" });
      expect(JSON.stringify(result)).not.toContain("secret");
   });

   it("maps a network failure to unavailable/transport", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      expect(await listCatalogItems()).toEqual({ status: "unavailable", cause: "transport" });
   });

   it.each<[string, unknown]>([
      ["a body that is not JSON", "<html>"],
      ["no items array", { next_cursor: null }],
      ["items that is not an array", { items: {}, next_cursor: null }],
      ["no next_cursor", { items: [] }],
      ["a numeric next_cursor", { items: [], next_cursor: 3 }],
      ["an item without a title", { items: [{ ...META("a"), title: undefined }], next_cursor: null }],
      ["an item of type track", { items: [{ ...META("a"), type: "track" }], next_cursor: null }],
      ["an item with an invalid access value", { items: [META("a", { access: "gold" })], next_cursor: null }],
      ["a bare array", [META("a")]],
   ])("refuses %s", async (_name, payload) => {
      fetchMock.mockResolvedValue(
         typeof payload === "string" ? new Response(payload, { status: 200 }) : reply(200, payload)
      );
      expect(await listCatalogItems()).toEqual(MALFORMED);
   });
});

describe.each([
   ["listCatalogTracks", () => listCatalogTracks(), { tracks: [TRACK] }],
   ["listCatalogItems", () => listCatalogItems({ type: "lesson" }), PAGE],
] as const)("%s in a preview deployment", (_name, read, body) => {
   beforeEach(() => {
      vi.stubEnv("CATALOG_PREVIEW_TOKEN", TOKEN);
      fetchMock.mockResolvedValue(reply(200, body));
   });

   it("sends X-Preview-Token and never the reader's session, uncached", async () => {
      expect((await read()).status).toBe("ok");
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers).toEqual({ "X-Preview-Token": TOKEN });
      expect(init.cache).toBe("no-store");
      expect(init.next).toBeUndefined();
      expect(getSession).not.toHaveBeenCalled();
   });

   it("keeps the credential out of the URL", async () => {
      await read();
      expect(urlOf()).not.toContain(TOKEN);
   });

   it("answers a rejected credential as unavailable after exactly one request", async () => {
      fetchMock.mockResolvedValue(reply(403, { detail: "Forbidden" }));
      expect(await read()).toEqual({ status: "unavailable", cause: "upstream" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
   });

   it("makes no request when the credential cannot be sent safely", async () => {
      vi.stubEnv("CATALOG_PREVIEW_TOKEN", "short");
      expect(await read()).toEqual({ status: "unavailable", cause: "transport" });
      expect(fetchMock).not.toHaveBeenCalled();
   });
});

describe("listing in production", () => {
   it("sends no preview header and keeps its shareable cache", async () => {
      fetchMock.mockResolvedValue(reply(200, { tracks: [] }));
      await listCatalogTracks();
      const [, init] = fetchMock.mock.calls[0];
      expect(Object.keys(init.headers).map((name) => name.toLowerCase())).not.toContain("x-preview-token");
      expect(init.next).toEqual({ revalidate: 60 });
   });
});
