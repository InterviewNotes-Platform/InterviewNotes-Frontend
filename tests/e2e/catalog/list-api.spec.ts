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

test.describe("the Knowledge fixture models P1-T27 (P2-T6 discovery)", () => {
   interface Topic {
      id: string;
      category: string | null;
      access: string;
      tags: string[];
      sections?: { id: string; type: string; access: string }[];
      relations?: Record<string, string[]>;
   }
   const topics = fixture.items.filter((candidate) => candidate.type === "knowledge") as unknown as Topic[];

   test("holds at least eight Knowledge items, enough for a second page of twelve, in all six categories", () => {
      expect(topics.length).toBeGreaterThanOrEqual(13);
      const present = new Set(topics.map((topic) => topic.category));
      for (const category of ["concept", "term", "technology", "research", "pattern", "quick_reference"]) expect(present, category).toContain(category);
      expect(present, "an item with no category stays in the list and in no group").toContain(null);
   });

   test("has a rich-relations item, a quick reference, a premium item and a free item with premium sections", () => {
      const relationCount = (topic: Topic) => Object.values(topic.relations ?? {}).flat().length;
      expect(topics.some((topic) => relationCount(topic) >= 6 && Object.keys(topic.relations ?? {}).length >= 4)).toBe(true);
      const quick = topics.filter((topic) => topic.category === "quick_reference");
      expect(quick.length).toBeGreaterThan(0);
      for (const topic of quick) expect(topic.sections!.map((section) => section.type)).toEqual(["quick_facts"]);
      expect(topics.some((topic) => topic.access === "premium")).toBe(true);
      expect(topics.some((topic) => topic.access === "free" && topic.sections!.some((section) => section.access === "premium"))).toBe(true);
   });

   test("carries diverse tags and a section type outside the Knowledge vocabulary", () => {
      expect(new Set(topics.flatMap((topic) => topic.tags)).size).toBeGreaterThanOrEqual(8);
      const known = ["definition", "why_it_matters", "how_it_works", "architecture", "when_to_use", "when_not_to_use", "trade_offs", "failure_modes", "example", "interview_considerations", "quick_facts"];
      expect(topics.flatMap((topic) => topic.sections!.map((section) => section.type)).some((type) => !known.includes(type))).toBe(true);
   });

   test("names only items that exist as relation targets, and never itself", () => {
      const ids = new Set(fixture.items.map((candidate) => candidate.id));
      for (const topic of topics) {
         for (const target of Object.values(topic.relations ?? {}).flat()) {
            expect(ids.has(target), `${topic.id} relates to unknown ${target}`).toBe(true);
            expect(target).not.toBe(topic.id);
         }
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

   test("filters by category as the backend's D-18 contract does, with or without a type", async ({ request }) => {
      const knowledge = fixture.items.filter((candidate) => candidate.type === "knowledge") as unknown as { id: string; category: string | null }[];
      const expected = (category: string) => knowledge.filter((candidate) => candidate.category === category).map((candidate) => candidate.id).sort();
      for (const category of ["concept", "term", "technology", "research", "pattern", "quick_reference"]) {
         expect(expected(category).length, `fixture has no ${category}`).toBeGreaterThan(0);
         expect((await page(request, `?type=knowledge&category=${category}`)).items.map((i) => i.id), category).toEqual(expected(category));
         expect((await page(request, `?category=${category}`)).items.map((i) => i.id), `${category} needs no type`).toEqual(expected(category));
      }
      const problems = (await page(request, "?category=system_design")).items;
      expect(problems.length).toBeGreaterThan(0);
      for (const i of problems) expect(i.type).toBe("problem");
      expect((await page(request, "?category=ml_system_design")).items).toEqual([]);
   });

   test("combines category with the other filters and pages it like any other", async ({ request }) => {
      const premium = await page(request, "?type=knowledge&category=technology&access=premium");
      expect(premium.items.length).toBeGreaterThan(0);
      for (const i of premium.items) expect([i.type, i.access]).toEqual(["knowledge", "premium"]);
      expect((await page(request, "?category=term&access=premium")).items).toEqual([]);

      const first = await page(request, "?type=knowledge&category=concept&limit=1");
      expect(first.items).toHaveLength(1);
      expect(first.next_cursor).toBe(first.items[0].id);
      const second = await page(request, `?type=knowledge&category=concept&limit=1&cursor=${encodeURIComponent(first.next_cursor!)}`);
      expect(second.items[0].id > first.items[0].id).toBe(true);
   });

   test("never lists an item with no category under a category filter", async ({ request }) => {
      const every = await page(request, "?type=knowledge&limit=100");
      const unlabelled = every.items.filter((i) => (i as unknown as { category: unknown }).category === null);
      expect(unlabelled.length).toBeGreaterThan(0);
      for (const category of ["concept", "term", "technology", "research", "pattern", "quick_reference"]) {
         const listed = (await page(request, `?type=knowledge&category=${category}`)).items.map((i) => i.id);
         for (const i of unlabelled) expect(listed).not.toContain(i.id);
      }
   });

   test("refuses a category the way the backend does: 422 for an undefined value or the wrong type, never 200 for either", async ({ request }) => {
      const status = async (query: string) => (await get(request, `/catalog/items?${query}`)).status();
      for (const query of [
         "category=gadget",
         "category=",
         "type=knowledge&category=system_design",
         "type=problem&category=technology",
         "type=lesson&category=concept",
         "type=track&category=concept",
         "type=knowledge&category=gadget",
      ]) {
         expect(await status(query), query).toBe(422);
      }
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
