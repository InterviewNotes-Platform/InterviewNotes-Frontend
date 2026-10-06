import fixture from "./fixture.json";
import { FAKE_API_ORIGIN, expect, test } from "./harness";

// The list endpoints of the API double, held to the backend contract (`app/routers/catalog.py`), because
// P2-T6 and P2-T7 will test their discovery pages against it.
const META_FIELDS = ["access", "category", "difficulty", "id", "level", "slug", "summary", "tags", "title", "type"];
const sortedIds = (rows: { id: string }[]) => rows.map((row) => row.id).sort();
const ALL_ITEMS = sortedIds(fixture.items);

interface Page {
   items: { id: string; access: string; level: string | null; type: string }[];
   next_cursor: string | null;
}

test.describe("the catalog fixture models P1", () => {
   const placed = fixture.tracks.flatMap((t) => t.modules.flatMap((m) => m.items.map((id) => ({ track: t.slug, id }))));
   const byId = new Map(fixture.items.map((i) => [i.id, i]));

   test("a Track places only Lessons and Problems (P1 §6.6): no Knowledge, no Track, no unknown item", () => {
      for (const { track, id } of placed) {
         expect(byId.has(id), `${track} places unknown ${id}`).toBe(true);
         expect(["lesson", "problem"], `${track} places ${id}`).toContain(byId.get(id)!.type);
      }
   });

   test("an item appears at most once per Track, module keys are unique, and Knowledge has no home Track", () => {
      for (const t of fixture.tracks) {
         const ids = t.modules.flatMap((m) => m.items);
         expect(new Set(ids).size, `${t.slug} places an item twice`).toBe(ids.length);
         expect(new Set(t.modules.map((m) => m.key)).size, `${t.slug} repeats a module key`).toBe(t.modules.length);
      }
      for (const i of fixture.items.filter((candidate) => candidate.type === "knowledge")) expect(i.home, i.id).toBe("");
   });

   test("an item's home Track, when it has one, is a Track that places it", () => {
      for (const i of fixture.items.filter((candidate) => candidate.home !== "")) {
         expect(placed.some(({ track, id }) => track === i.home && id === i.id), `${i.id} names a home Track that does not place it`).toBe(true);
      }
   });
});

test.describe("fake catalog list endpoints", () => {
   const get = (request: { get: (url: string) => Promise<{ status(): number; json(): Promise<unknown> }> }, path: string) =>
      request.get(`${FAKE_API_ORIGIN}${path}`);
   const page = async (request: Parameters<typeof get>[0], query: string) => (await (await get(request, `/catalog/items${query}`)).json()) as Page;

   test("GET /catalog/tracks lists every Track by id as identity and summary only", async ({ request }) => {
      const response = await get(request, "/catalog/tracks");
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { tracks: Record<string, unknown>[] };
      expect(body.tracks.map((t) => t.id)).toEqual(sortedIds(fixture.tracks));
      for (const t of body.tracks) expect(Object.keys(t).sort()).toEqual(["id", "slug", "summary", "title"]);
   });

   test("GET /catalog/items returns public metadata for every item, ordered by id, unpaginated by default", async ({ request }) => {
      const body = await page(request, "");
      expect(body.items.map((i) => i.id)).toEqual(ALL_ITEMS);
      expect(body.next_cursor).toBeNull();
      for (const i of body.items) expect(Object.keys(i).sort()).toEqual(META_FIELDS);
   });

   test("combines filters with AND", async ({ request }) => {
      const premiumLessons = await page(request, "?type=lesson&access=premium");
      expect(premiumLessons.items.length).toBeGreaterThan(0);
      for (const i of premiumLessons.items) expect([i.type, i.access]).toEqual(["lesson", "premium"]);

      const narrowed = await page(request, "?type=lesson&access=premium&level=advanced&tag=e2e");
      for (const i of narrowed.items) expect([i.type, i.access, i.level]).toEqual(["lesson", "premium", "advanced"]);
      expect(narrowed.items.length).toBeLessThanOrEqual(premiumLessons.items.length);
   });

   test("an empty result is 200 with no items and no cursor", async ({ request }) => {
      const response = await get(request, "/catalog/items?tag=no-such-tag");
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ items: [], next_cursor: null });
   });

   test("track and module narrow by placement, still ordered by id rather than curriculum order", async ({ request }) => {
      const curriculum = fixture.tracks.find((t) => t.slug === "p2-t4-curriculum")!;
      const placed = curriculum.modules.flatMap((m) => m.items).sort();
      expect((await page(request, "?track=p2-t4-curriculum")).items.map((i) => i.id)).toEqual(placed);

      const depth = curriculum.modules.find((m) => m.key === "depth")!;
      expect((await page(request, "?track=p2-t4-curriculum&module=depth")).items.map((i) => i.id)).toEqual(depth.items);
      expect((await page(request, "?track=p2-t4-curriculum&module=coming-next")).items).toEqual([]);
      expect((await page(request, "?track=p2-t4-empty")).items).toEqual([]);
   });

   test("limit and the opaque cursor walk every item exactly once, in order", async ({ request }) => {
      const walked: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
         const body: Page = await page(request, `?limit=4${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
         expect(body.items.length).toBeLessThanOrEqual(4);
         if (body.next_cursor) expect(body.next_cursor).toBe(body.items.at(-1)!.id);
         walked.push(...body.items.map((i) => i.id));
         cursor = body.next_cursor;
         pages += 1;
      } while (cursor && pages < 20);
      expect(walked).toEqual(ALL_ITEMS);
      expect(pages).toBe(Math.ceil(ALL_ITEMS.length / 4));
   });

   test("a page that exactly exhausts the items has no cursor", async ({ request }) => {
      const body = await page(request, `?limit=${ALL_ITEMS.length}`);
      expect(body.items).toHaveLength(ALL_ITEMS.length);
      expect(body.next_cursor).toBeNull();
   });

   test("refuses what the API refuses: 422 for bad input, 404 for an unknown Track", async ({ request }) => {
      const status = async (query: string) => (await get(request, `/catalog/items?${query}`)).status();
      for (const query of [
         "kind=concept",
         "sort=title",
         "type=track",
         "type=course",
         "difficulty=trivial",
         "level=expert",
         "access=gold",
         "tag=",
         "limit=0",
         "limit=101",
         "limit=many",
         "cursor=track.alpha",
         "cursor=not-an-id",
         "module=depth",
         "track=p2-t4-curriculum&module=Bad_Key",
      ]) {
         expect(await status(query), query).toBe(422);
      }
      expect(await status("track=no-such-track")).toBe(404);
   });

   test("names the unsupported parameters in the 422, as the backend does", async ({ request }) => {
      const body = (await (await get(request, "/catalog/items?zeta=1&kind=concept")).json()) as { detail: string };
      expect(body.detail).toBe("Unsupported query parameter: kind, zeta");
   });
});
