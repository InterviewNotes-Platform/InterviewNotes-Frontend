import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
   createClient: async () => ({ auth: { getSession } }),
}));

import { getCatalogItem, getCatalogItemMeta } from "./client";

const META = {
   id: "lesson.dynamic-batching",
   type: "lesson",
   slug: "dynamic-batching",
   title: "Synthetic Lesson",
   summary: "Synthetic test fixture",
   tags: [],
   difficulty: "medium",
   level: null,
   access: "premium",
};

const LESSON = {
   ...META,
   kind: null,
   body: { format: "markdown@1", text: "Synthetic prose." },
   headings: [],
   sections: [],
   sections_withheld: false,
};

const KNOWLEDGE = {
   ...META,
   id: "knowledge.rag",
   type: "knowledge",
   slug: "rag",
   access: "free",
   kind: "concept",
   body: null,
   headings: [],
   sections: [
      { id: "definition", type: "definition", title: null, body: { format: "markdown@1", text: "Synthetic definition." } },
   ],
   sections_withheld: true,
};

function reply(status: number, body: unknown = {}) {
   return new Response(JSON.stringify(body), { status });
}

const fetchMock = vi.fn();

beforeEach(() => {
   process.env.API_URL = "https://api.test/";
   getSession.mockResolvedValue({ data: { session: null } });
   fetchMock.mockResolvedValue(reply(200, LESSON));
   vi.stubGlobal("fetch", fetchMock);
   vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
   vi.unstubAllGlobals();
   vi.restoreAllMocks();
   fetchMock.mockReset();
   getSession.mockReset();
});

describe("getCatalogItem success", () => {
   it("returns a lesson body as ok", async () => {
      expect(await getCatalogItem("lesson", "dynamic-batching")).toEqual({ status: "ok", data: LESSON });
   });

   it("returns sections and the withheld flag for a Knowledge item", async () => {
      fetchMock.mockResolvedValue(reply(200, KNOWLEDGE));
      const result = await getCatalogItem("knowledge", "rag");
      expect(result).toEqual({ status: "ok", data: KNOWLEDGE });
   });
});

describe("getCatalogItem request", () => {
   it("calls only the item endpoint, with no query string or Git selector", async () => {
      await getCatalogItem("lesson", "dynamic-batching");
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.test/catalog/items/lesson/dynamic-batching");
      expect(url).not.toContain("?");
   });

   it("encodes the slug so it cannot change the path", async () => {
      await getCatalogItem("lesson", "../tracks?branch=main");
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.test/catalog/items/lesson/..%2Ftracks%3Fbranch%3Dmain");
   });

   it("sends the session token and never caches a signed-in read", async () => {
      getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
      await getCatalogItem("lesson", "dynamic-batching");
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers).toEqual({ Authorization: "Bearer tok" });
      expect(init.cache).toBe("no-store");
      expect(init.next).toBeUndefined();
   });

   it("sends no credentials and allows a 60 s cache when signed out", async () => {
      await getCatalogItem("lesson", "dynamic-batching");
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers).toEqual({});
      expect(init.next).toEqual({ revalidate: 60 });
   });

   it("treats an unreadable session as signed out", async () => {
      getSession.mockRejectedValue(new Error("supabase down"));
      await getCatalogItem("lesson", "dynamic-batching");
      expect(fetchMock.mock.calls[0][1].headers).toEqual({});
   });
});

describe("getCatalogItem backend states", () => {
   it.each([
      [401, { status: "unauthenticated" }],
      [402, { status: "unentitled" }],
      [404, { status: "notFound" }],
      [410, { status: "retired" }],
   ])("maps HTTP %i", async (code, expected) => {
      fetchMock.mockResolvedValue(reply(code, { detail: { id: "lesson.x", status: "retired" } }));
      expect(await getCatalogItem("lesson", "x")).toEqual(expected);
   });

   it.each([500, 502, 503])("maps HTTP %i to unavailable/upstream without leaking the body", async (code) => {
      fetchMock.mockResolvedValue(reply(code, { detail: "postgres://secret@internal" }));
      const result = await getCatalogItem("lesson", "x");
      expect(result).toEqual({ status: "unavailable", cause: "upstream" });
      expect(JSON.stringify(result)).not.toContain("secret");
   });

   it("maps a network failure to unavailable/transport", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      expect(await getCatalogItem("lesson", "x")).toEqual({ status: "unavailable", cause: "transport" });
   });

   it("maps a missing API_URL to unavailable/transport without calling out", async () => {
      delete process.env.API_URL;
      expect(await getCatalogItem("lesson", "x")).toEqual({ status: "unavailable", cause: "transport" });
      expect(fetchMock).not.toHaveBeenCalled();
   });

   it("refuses a 2xx body that is not JSON", async () => {
      fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
      expect(await getCatalogItem("lesson", "x")).toEqual({ status: "unavailable", cause: "malformed" });
   });

   it("refuses a 2xx body of the wrong shape", async () => {
      fetchMock.mockResolvedValue(reply(200, { id: "lesson.x" }));
      expect(await getCatalogItem("lesson", "x")).toEqual({ status: "unavailable", cause: "malformed" });
   });

   it("refuses a body format it cannot render instead of showing it raw", async () => {
      fetchMock.mockResolvedValue(reply(200, { ...LESSON, body: { format: "blocks@1", text: "x" } }));
      expect(await getCatalogItem("lesson", "x")).toEqual({ status: "unavailable", cause: "malformed" });
   });

   it("refuses a section body format it cannot render", async () => {
      const section = { ...KNOWLEDGE.sections[0], body: { format: "blocks@1", text: "x" } };
      fetchMock.mockResolvedValue(reply(200, { ...KNOWLEDGE, sections: [section] }));
      expect(await getCatalogItem("knowledge", "rag")).toEqual({ status: "unavailable", cause: "malformed" });
   });
});

describe("getCatalogItemMeta", () => {
   it("returns public metadata without reading the session", async () => {
      fetchMock.mockResolvedValue(reply(200, META));
      expect(await getCatalogItemMeta("lesson", "dynamic-batching")).toEqual({ status: "ok", data: META });
      expect(getSession).not.toHaveBeenCalled();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.test/catalog/items/lesson/dynamic-batching/meta");
      expect(init.headers).toEqual({});
   });

   it("maps not found and retired", async () => {
      fetchMock.mockResolvedValueOnce(reply(404)).mockResolvedValueOnce(reply(410));
      expect(await getCatalogItemMeta("lesson", "x")).toEqual({ status: "notFound" });
      expect(await getCatalogItemMeta("lesson", "x")).toEqual({ status: "retired" });
   });
});
