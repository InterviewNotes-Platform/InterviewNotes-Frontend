import { afterEach, describe, expect, it, vi } from "vitest";

// `after` needs a request scope, and `cache` memoises per render; both are stubbed so the module's own logic is what runs.
const afterCallbacks: (() => void)[] = [];
const render = vi.hoisted(() => ({ memo: undefined as unknown }));
vi.mock("next/server", () => ({ after: (callback: () => void) => void afterCallbacks.push(callback) }));
vi.mock("react", async (importOriginal) => {
   const actual = await importOriginal<typeof import("react")>();
   return { ...actual, cache: <T,>(fn: () => T) => () => (render.memo ??= fn()) as T };
});

const SLUG = "anatomy-of-a-model-request";
const SECRETS = [SLUG, "eyJhbGciOiJIUzI1NiJ9.token", "person@example.com", "Bearer ", "http", "?cursor=", "preview-token-0123456789abcdef"];

afterEach(() => {
   afterCallbacks.length = 0;
   render.memo = undefined;
   delete process.env.HOTPATH_TIMING;
   vi.resetModules();
   vi.restoreAllMocks();
});

async function load() {
   vi.resetModules();
   return import("./hotpath");
}

describe("readKind", () => {
   it("reduces every catalog path to a closed kind and keeps no segment", async () => {
      const { readKind } = await load();
      expect(readKind("/catalog/tracks")).toBe("tracks");
      expect(readKind(`/catalog/tracks/${SLUG}`)).toBe("track");
      expect(readKind(`/catalog/items/lesson/${SLUG}`)).toBe("item:lesson");
      expect(readKind(`/catalog/items/knowledge/${SLUG}/meta`)).toBe("meta:knowledge");
      expect(readKind(`/catalog/items/problem/${SLUG}/related`)).toBe("related:problem");
      expect(readKind("/catalog/items?type=lesson&cursor=abc")).toBe("list");
   });

   it("calls anything it does not recognise `other`, including an item type it does not know", async () => {
      const { readKind } = await load();
      expect(readKind(`/catalog/items/secret-type/${SLUG}`)).toBe("other");
      expect(readKind(`/me/prep/${SLUG}`)).toBe("other");
      expect(readKind(`/catalog/items/lesson/${SLUG}/something/else`)).toBe("other");
   });
});

describe("waveCount", () => {
   it("counts overlapping reads as one wave and a read that starts after they end as the next", async () => {
      const { waveCount } = await load();
      expect(waveCount([{ s: 0, ms: 30 }, { s: 1, ms: 36 }])).toBe(1);
      expect(waveCount([{ s: 0, ms: 36 }, { s: 36, ms: 60 }, { s: 98, ms: 40 }, { s: 99, ms: 20 }])).toBe(3);
      expect(waveCount([])).toBe(0);
   });
});

describe("the line a render writes", () => {
   it("holds only the route, numbers and read kinds: no slug, URL, query value, token or preview credential reaches it", async () => {
      const { reportRender, timeRead } = await load();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const headers = new Headers({ date: new Date().toUTCString(), authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.token", "x-preview-token": "preview-token-0123456789abcdef" });
      const response = new Response(JSON.stringify({ email: "person@example.com" }), { headers });

      const meta = timeRead(`/catalog/items/lesson/${SLUG}/meta?cursor=abc`);
      meta.session();
      meta.headers(response, "rv");
      meta.end(200);
      const item = timeRead(`/catalog/items/lesson/${SLUG}`);
      item.headers(null, "ns");
      item.end(0);
      reportRender("lesson");
      expect(afterCallbacks).toHaveLength(1);
      afterCallbacks[0]();

      expect(log).toHaveBeenCalledTimes(1);
      const line = String(log.mock.calls[0][0]);
      const parsed = JSON.parse(line);
      expect(parsed).toMatchObject({ hp: 1, route: "lesson" });
      expect(parsed.reads.map((read: { k: string }) => read.k)).toEqual(["meta:lesson", "item:lesson"]);
      expect(parsed.reads[0]).toMatchObject({ m: "rv", a: "f", st: 200 });
      expect(parsed.reads[1]).toMatchObject({ m: "ns", a: "u", st: 0 });
      for (const secret of SECRETS) expect(line, secret).not.toContain(secret);
      expect(Object.keys(parsed).sort()).toEqual(["cpu", "hp", "reads", "route", "wall", "waves"]);
   });

   it("calls an answer older than two seconds a cached one, and one without a usable Date unknown", async () => {
      const { reportRender, timeRead } = await load();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const old = new Response("{}", { headers: { date: new Date(Date.now() - 45_000).toUTCString() } });
      const read = timeRead("/catalog/tracks");
      read.headers(old, "rv");
      read.end(200);
      const bare = timeRead("/catalog/tracks");
      bare.headers(new Response("{}"), "rv");
      bare.end(200);
      reportRender("home");
      afterCallbacks[0]();
      const { reads } = JSON.parse(String(log.mock.calls[0][0]));
      expect(reads.map((r: { a: string }) => r.a)).toEqual(["c", "u"]);
   });

   it("is silent, and schedules nothing, when HOTPATH_TIMING is off", async () => {
      process.env.HOTPATH_TIMING = "off";
      const { reportRender, timeRead } = await load();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const read = timeRead("/catalog/tracks");
      read.headers(null, "rv");
      read.end(200);
      reportRender("home");
      expect(afterCallbacks).toHaveLength(0);
      expect(log).not.toHaveBeenCalled();
   });

   it("keeps at most sixteen reads", async () => {
      const { reportRender, timeRead } = await load();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      for (let i = 0; i < 40; i += 1) {
         const read = timeRead("/catalog/tracks");
         read.headers(null, "rv");
         read.end(200);
      }
      reportRender("home");
      afterCallbacks[0]();
      expect(JSON.parse(String(log.mock.calls[0][0])).reads).toHaveLength(16);
   });
});

describe("reportHomeLate", () => {
   it("writes the late fact at once and, once the read has answered, how long it took, naming only the closed set of reads", async () => {
      const { reportHomeLate } = await load();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      let answer!: () => void;
      const settled = new Promise<void>((resolve) => (answer = resolve));
      reportHomeLate(["tracks", "free"], settled);

      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ hp: 1, route: "home", ev: "late", late: ["tracks", "free"] });
      expect(afterCallbacks).toHaveLength(1);
      answer();
      await (afterCallbacks[0] as () => Promise<void>)();
      expect(log).toHaveBeenCalledTimes(2);
      const settledLine = String(log.mock.calls[1][0]);
      expect(JSON.parse(settledLine)).toMatchObject({ hp: 1, route: "home", ev: "settled", late: ["tracks", "free"] });
      expect(Object.keys(JSON.parse(settledLine)).sort()).toEqual(["ev", "hp", "late", "ms", "route"]);
      for (const secret of SECRETS) expect(settledLine, secret).not.toContain(secret);
   });

   it("still keeps the request alive for the read when timing is off, and writes nothing", async () => {
      process.env.HOTPATH_TIMING = "off";
      const { reportHomeLate } = await load();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      reportHomeLate(["tracks"], Promise.resolve());
      expect(afterCallbacks).toHaveLength(1);
      await (afterCallbacks[0] as () => Promise<void>)();
      expect(log).not.toHaveBeenCalled();
   });
});
