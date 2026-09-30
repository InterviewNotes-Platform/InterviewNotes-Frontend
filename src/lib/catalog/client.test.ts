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

const MALFORMED = { status: "unavailable", cause: "malformed" };
function without(value: object, key: string) {
   return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

const NO_TYPE = without(LESSON, "type");
const NO_SUMMARY = without(LESSON, "summary");
const NO_WITHHELD = without(LESSON, "sections_withheld");
const SECTION = KNOWLEDGE.sections[0];

describe("malformed 2xx payloads are rejected", () => {
   it.each<[string, unknown]>([
      ["missing type", NO_TYPE],
      ["unknown type", { ...LESSON, type: "track" }],
      ["missing summary", NO_SUMMARY],
      ["non-string tag", { ...LESSON, tags: ["ok", 1] }],
      ["tags not an array", { ...LESSON, tags: "ok" }],
      ["invalid difficulty", { ...LESSON, difficulty: "impossible" }],
      ["invalid level", { ...LESSON, level: "expert" }],
      ["missing kind", without(LESSON, "kind")],
      ["non-string kind", { ...LESSON, kind: 3 }],
      ["missing sections_withheld", NO_WITHHELD],
      ["non-boolean sections_withheld", { ...LESSON, sections_withheld: "no" }],
      ["heading without id", { ...LESSON, headings: [{ level: 2, text: "T" }] }],
      ["heading with string level", { ...LESSON, headings: [{ id: "t", level: "2", text: "T" }] }],
      ["heading without text", { ...LESSON, headings: [{ id: "t", level: 2 }] }],
      ["heading that is not an object", { ...LESSON, headings: ["t"] }],
      ["section without id", { ...KNOWLEDGE, sections: [{ ...SECTION, id: undefined }] }],
      ["section without type", { ...KNOWLEDGE, sections: [{ ...SECTION, type: undefined }] }],
      ["section with non-string title", { ...KNOWLEDGE, sections: [{ ...SECTION, title: 5 }] }],
      ["section with missing title", { ...KNOWLEDGE, sections: [without(SECTION, "title")] }],
      ["section without body", { ...KNOWLEDGE, sections: [{ ...SECTION, body: undefined }] }],
      ["section that is not an object", { ...KNOWLEDGE, sections: [null] }],
      ["lesson body with unsupported format", { ...LESSON, body: { format: "blocks@1", text: "x" } }],
      ["lesson body without text", { ...LESSON, body: { format: "markdown@1" } }],
      ["section body with unsupported format", { ...KNOWLEDGE, sections: [{ ...SECTION, body: { format: "html", text: "x" } }] }],
      ["an array", []],
      ["null", null],
   ])("item: %s", async (_name, payload) => {
      fetchMock.mockResolvedValue(reply(200, payload));
      expect(await getCatalogItem("lesson", "x")).toEqual(MALFORMED);
   });

   it.each<[string, unknown]>([
      ["missing type", NO_TYPE],
      ["missing summary", NO_SUMMARY],
      ["invalid tags element", { ...META, tags: [null] }],
      ["invalid difficulty", { ...META, difficulty: "trivial" }],
      ["invalid level", { ...META, level: "guru" }],
      ["invalid access", { ...META, access: "gold" }],
   ])("meta: %s", async (_name, payload) => {
      fetchMock.mockResolvedValue(reply(200, payload));
      expect(await getCatalogItemMeta("lesson", "x")).toEqual(MALFORMED);
   });

   it("still accepts every valid enum value and null difficulty/level", async () => {
      for (const difficulty of ["easy", "medium", "hard", null]) {
         for (const level of ["foundational", "intermediate", "advanced", null]) {
            fetchMock.mockResolvedValueOnce(reply(200, { ...LESSON, difficulty, level }));
            expect((await getCatalogItem("lesson", "x")).status).toBe("ok");
         }
      }
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
