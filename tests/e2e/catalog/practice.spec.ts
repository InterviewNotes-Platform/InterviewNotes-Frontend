import type { APIRequestContext, Locator, Page } from "@playwright/test";
import fixture from "./fixture.json";
import { EMPTY_ORIGIN, PREVIEW_API_ORIGIN, PREVIEW_ORIGIN, REJECTED_ORIGIN, canonical, expect, expectNoCanary, item, test, type Identity } from "./harness";

interface Problem {
   id: string;
   slug: string;
   title: string;
   tags: string[];
   difficulty: string | null;
   level: string | null;
   access: string;
}
interface Filter {
   tag?: string;
   difficulty?: string;
   level?: string;
   access?: string;
   track?: string;
}

const PAGE_SIZE = 12;
const byId = (a: Problem, b: Problem) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const PROBLEMS = (fixture.items as unknown as Problem[]).filter((candidate) => candidate.id.startsWith("problem.")).sort(byId);
const placedIn = (slug: string) => new Set(fixture.tracks.find((track) => track.slug === slug)!.modules.flatMap((module) => module.items));
// What the API should return for a filter: written from the fixture here, never borrowed from the code under test.
const expected = ({ tag, difficulty, level, access, track }: Filter) =>
   PROBLEMS.filter(
      (problem) =>
         (!tag || problem.tags.includes(tag)) &&
         (!difficulty || problem.difficulty === difficulty) &&
         (!level || problem.level === level) &&
         (!access || problem.access === access) &&
         (!track || placedIn(track).has(problem.id))
   );
const titles = (problems: Problem[]) => problems.map((problem) => problem.title);
const query = (filter: Filter) => new URLSearchParams(Object.entries(filter) as [string, string][]).toString();

const FEATURED = item("problem.p2-t7-01-feed-ranking");
const PREMIUM = item("problem.p2-t7-03-candidate-retrieval");
const SPARSE = item("problem.p2-t7-27-unrated-warm-up");

const main = (page: Page) => page.getByRole("main");
const h1 = (page: Page) => main(page).getByRole("heading", { level: 1 });
const cards = (page: Page) => main(page).locator("article");
const cardTitles = (page: Page) => cards(page).getByRole("heading", { level: 3 }).allTextContents();
const pager = (page: Page) => page.getByRole("navigation", { name: "Pagination" });
const filterForm = (page: Page) => page.getByRole("form", { name: "Filter Problems" });
const toggle = (page: Page) => main(page).getByRole("button", { name: /^Filters/ });
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const marker = (page: Page) => page.getByRole("complementary", { name: "Preview" });
const robots = (page: Page) => page.locator('meta[name="robots"]');

/** The titles on the page, polled until they are exactly `want`: a client navigation may still be rendering when the URL changes. */
const expectTitles = (page: Page, want: Problem[]) => expect.poll(() => cardTitles(page)).toEqual(titles(want));

/** Follows "Next page" to the end, a bounded number of times, and returns every page's titles. */
async function walk(page: Page, start: string) {
   await page.goto(start);
   const pages: string[][] = [];
   for (let guard = 0; guard < 10; guard += 1) {
      pages.push(await cardTitles(page));
      const next = pager(page).getByRole("link", { name: /Next page/ });
      if ((await next.count()) === 0) return pages;
      const before = page.url();
      const previous = pages[pages.length - 1];
      await Promise.all([page.waitForURL((url) => url.toString() !== before), next.click()]);
      await expect.poll(() => cardTitles(page)).not.toEqual(previous);
   }
   throw new Error("pagination did not end");
}

/** The focus ring the global :focus-visible rule draws, read from the element that holds focus. */
const focusRing = (page: Page) =>
   page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
   });
const height = async (locator: Locator) => (await locator.boundingBox())!.height;

test.describe("the Practice home", () => {
   test("is server-rendered: proposition, orientation, then the first twelve Problems in id order", async ({ page, request }) => {
      const response = await request.get("/practice");
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain("Practice, one Problem at a time.");
      expect(html).toContain(PROBLEMS[0].title);

      await page.goto("/practice");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(h1(page)).toHaveText("Practice, one Problem at a time.");
      await expect(main(page).locator("header")).toContainText("clarify the requirements, sketch a design, then defend the trade-offs");
      await expect(main(page).getByRole("link", { name: "Tracks", exact: true })).toHaveAttribute("href", "/tracks");
      await expect(main(page).getByRole("link", { name: "Knowledge", exact: true })).toHaveAttribute("href", "/knowledge");
      await expect(main(page).getByRole("heading", { level: 2, name: "Problems" })).toBeVisible();
      await expectTitles(page, PROBLEMS.slice(0, PAGE_SIZE));
      await expect(main(page).getByRole("status")).toHaveText(`Showing ${PAGE_SIZE} Problems`);
      const outline = await main(page).locator("h1, h2, h3").evaluateAll((nodes) => nodes.map((node) => node.tagName));
      expect(outline).toEqual(["H1", "H2", ...Array(PAGE_SIZE).fill("H3")]);
   });

   test("shows the first Problems without scrolling past the orientation on a desktop", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/practice");
      await expect(cards(page).first()).toBeVisible();
      const box = (await cards(page).first().boundingBox())!;
      expect(box.y, "the first Problem starts below the fold").toBeLessThan(900);
   });

   test("renders each Problem as one coherent link with difficulty and level up front, a premium mark and quiet topics", async ({ page }) => {
      await page.goto("/practice");
      for (const card of await cards(page).all()) {
         await expect(card.getByRole("link")).toHaveCount(1);
         await expect(card.locator("button, input, select")).toHaveCount(0);
      }
      const feed = cards(page).filter({ hasText: FEATURED.title });
      await expect(feed.getByRole("link")).toHaveAttribute("href", canonical(FEATURED.id));
      await expect(feed).toContainText("Difficulty: Medium");
      await expect(feed).toContainText("Level: Intermediate");
      await expect(feed.locator("p").filter({ hasText: /^Topics:/ })).toHaveText("Topics: ranking · recommendation · latency");
      await expect(feed.getByText("Premium", { exact: true })).toHaveCount(0);

      const premium = cards(page).filter({ hasText: PREMIUM.title });
      await expect(premium.getByText("Premium", { exact: true })).toHaveCount(1);
      await expect(premium.getByRole("link")).toHaveAttribute("href", canonical(PREMIUM.id));
   });

   test("a sparse Problem, with no difficulty, level or topic, is still a whole card", async ({ page }) => {
      await page.goto(`/practice?cursor=${PROBLEMS[PROBLEMS.length - 3].id}`);
      const sparse = cards(page).filter({ hasText: SPARSE.title });
      await expect(sparse).toHaveCount(1);
      await expect(sparse.getByRole("link")).toHaveAttribute("href", canonical(SPARSE.id));
      await expect(sparse).not.toContainText(/Difficulty|Level|Topics/);
   });

   test("production has neither the preview marker nor a robots directive", async ({ page }) => {
      await page.goto("/practice");
      await expect(marker(page)).toHaveCount(0);
      await expect(robots(page)).toHaveCount(0);
   });
});

test.describe("Practice filters", () => {
   test("has all five, each labelled, with Access as a radio group under its legend, and no Module", async ({ page }) => {
      await page.goto("/practice");
      const form = filterForm(page);
      for (const label of ["Topic", "Difficulty", "Level", "Track"]) await expect(form.getByLabel(label, { exact: true })).toBeVisible();
      await expect(form.getByRole("group", { name: "Access" }).getByRole("radio")).toHaveCount(3);
      await expect(form.getByRole("button", { name: "Apply" })).toBeVisible();
      await expect(form.getByLabel(/module/i)).toHaveCount(0);
      expect(await form.getByLabel("Topic", { exact: true }).locator("option").allTextContents()).toEqual([
         "All topics",
         ...[...new Set(PROBLEMS.flatMap((problem) => problem.tags))].sort(),
      ]);
      expect(await form.getByLabel("Track", { exact: true }).locator("option").allTextContents()).toEqual([
         "All Tracks",
         ...[...fixture.tracks].sort((a, b) => (a.id < b.id ? -1 : 1)).map((track) => track.title),
      ]);
   });

   for (const filter of [
      { difficulty: "hard" },
      { difficulty: "easy" },
      { level: "foundational" },
      { level: "advanced" },
      { access: "premium" },
      { access: "free" },
      { tag: "latency" },
      { tag: "evaluation" },
      { track: "p2-t7-serving" },
      { track: "p2-t7-ranking" },
      { tag: "serving", difficulty: "medium", track: "p2-t7-serving" },
      { level: "advanced", access: "premium", tag: "retrieval" },
   ] satisfies Filter[]) {
      test(`${query(filter)} lists exactly the matching Problems, in id order, with the controls showing it`, async ({ page }) => {
         const matching = expected(filter);
         expect(matching.length, "the fixture must give this filter something to find").toBeGreaterThan(0);
         await page.goto(`/practice?${query(filter)}`);
         await expectTitles(page, matching.slice(0, PAGE_SIZE));
         for (const [name, value] of Object.entries(filter)) {
            if (name === "access") await expect(page.getByRole("radio", { checked: true })).toHaveValue(value);
            else await expect(page.locator(`#practice-${name}`)).toHaveValue(value);
         }
      });
   }

   test("Apply puts the choices in the URL, a reload keeps them, and Clear filters removes them", async ({ page }) => {
      await page.goto("/practice");
      await page.getByLabel("Difficulty", { exact: true }).selectOption("hard");
      await page.getByLabel("Level", { exact: true }).selectOption("advanced");
      await page.getByLabel("Track", { exact: true }).selectOption("p2-t7-serving");
      await page.getByRole("radio", { name: "Free" }).check();
      await filterForm(page).getByRole("button", { name: "Apply" }).click();
      await expect(page).toHaveURL(/difficulty=hard/);

      const url = new URL(page.url());
      expect(url.pathname).toBe("/practice");
      expect(Object.fromEntries(url.searchParams)).toMatchObject({ difficulty: "hard", level: "advanced", track: "p2-t7-serving", access: "free" });
      const filtered = expected({ difficulty: "hard", level: "advanced", track: "p2-t7-serving", access: "free" });
      await expectTitles(page, filtered);

      await page.reload();
      await expectTitles(page, filtered);
      await expect(page.getByLabel("Difficulty", { exact: true })).toHaveValue("hard");
      await expect(page.getByRole("radio", { name: "Free" })).toBeChecked();

      await filterForm(page).getByRole("link", { name: "Clear filters" }).click();
      await expect(page).toHaveURL("/practice");
      await expectTitles(page, PROBLEMS.slice(0, PAGE_SIZE));
      await expect(page.getByLabel("Difficulty", { exact: true })).toHaveValue("");
      await expect(page.getByRole("radio", { name: "All" })).toBeChecked();
   });

   test("the controls always show the URL's state, even after a soft navigation, never a choice that was not applied", async ({ page }) => {
      await page.goto(`/practice?access=free`);
      await page.getByLabel("Difficulty", { exact: true }).selectOption("hard"); // chosen, not applied
      await pager(page).getByRole("link", { name: /Next page/ }).click();
      await expect(page).toHaveURL(/cursor=/);
      await expect(page.getByLabel("Difficulty", { exact: true })).toHaveValue("");
      await expect(page.getByRole("radio", { name: "Free" })).toBeChecked();
   });

   test("Apply from a later page starts again from the first, never from a stale cursor", async ({ page }) => {
      await page.goto(`/practice?cursor=${PROBLEMS[PAGE_SIZE - 1].id}`);
      await page.getByLabel("Difficulty", { exact: true }).selectOption("hard");
      await filterForm(page).getByRole("button", { name: "Apply" }).click();
      await expect(page).toHaveURL(/difficulty=hard/);
      expect(new URL(page.url()).searchParams.has("cursor")).toBe(false);
      await expectTitles(page, expected({ difficulty: "hard" }).slice(0, PAGE_SIZE));
   });

   test("the whole flow works from the keyboard: Tab order, visible focus, arrow keys on Access, Enter on Apply", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/practice");
      await page.getByLabel("Topic", { exact: true }).focus();
      const focused = () => page.evaluate(() => (document.activeElement as HTMLElement).id || (document.activeElement as HTMLInputElement).name || document.activeElement!.textContent);
      expect((await focusRing(page)).style).not.toBe("none");
      const order: (string | null)[] = [];
      for (let step = 0; step < 5; step += 1) {
         await page.keyboard.press("Tab");
         order.push(await focused());
         expect((await focusRing(page)).width, "no visible focus ring").toBeGreaterThanOrEqual(2);
      }
      expect(order).toEqual(["practice-difficulty", "practice-level", "practice-track", "access", "Apply"]);

      await page.keyboard.press("Shift+Tab");
      expect(await focused()).toBe("access");
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("radio", { name: "Free" })).toBeChecked();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/access=free/);
      await expectTitles(page, expected({ access: "free" }).slice(0, PAGE_SIZE));
   });
});

test.describe("unrecognised URL state", () => {
   test("is ignored: the page still renders the unfiltered first page and the controls show no filter", async ({ page }) => {
      const response = await page.goto(
         "/practice?difficulty=banana&level=expert&access=gold&tag=Not%20Kebab&track=ghost-track&module=retrieval&type=lesson&category=technology&limit=999&sort=title"
      );
      expect(response?.status()).toBe(200);
      await expectTitles(page, PROBLEMS.slice(0, PAGE_SIZE));
      for (const name of ["difficulty", "level", "track", "tag"]) await expect(page.locator(`#practice-${name}`)).toHaveValue("");
      await expect(page.getByRole("radio", { name: "All" })).toBeChecked();
      await expect(main(page).getByRole("link", { name: "Clear filters" })).toHaveCount(0);
   });

   test("a repeated or empty parameter is ignored too", async ({ page }) => {
      await page.goto("/practice?difficulty=hard&difficulty=easy&level=&tag=");
      await expectTitles(page, PROBLEMS.slice(0, PAGE_SIZE));
   });
});

test.describe("Practice pagination", () => {
   test("walks the whole catalog by the API's cursor: every Problem once, in order, no gaps", async ({ page }) => {
      const pages = await walk(page, "/practice");
      expect(pages.map((titlesOnPage) => titlesOnPage.length)).toEqual([12, 12, PROBLEMS.length - 24]);
      const walked = pages.flat();
      expect(new Set(walked).size, "a Problem was listed twice").toBe(walked.length);
      expect(walked).toEqual(titles(PROBLEMS));
   });

   test("keeps every active filter from page to page, and walks the filtered set exactly", async ({ page }) => {
      const filter = { difficulty: "medium" };
      const matching = expected(filter);
      expect(matching.length, "the fixture needs more than one page of this filter").toBeGreaterThan(PAGE_SIZE);
      const pages = await walk(page, `/practice?${query(filter)}`);
      expect(pages.flat()).toEqual(titles(matching));
      await expect(page).toHaveURL(/difficulty=medium/);
      await expect(page.getByLabel("Difficulty", { exact: true })).toHaveValue("medium");
      expect(new URL(page.url()).searchParams.get("cursor")).not.toBeNull();
   });

   test("a Next link carries the active filters and the cursor; First page keeps all five filters and drops the cursor", async ({ page }) => {
      const filter = { tag: "serving", difficulty: "medium", level: "intermediate", track: "p2-t7-serving", access: "free" };
      const broad = { access: "free" };
      expect(expected(broad).length).toBeGreaterThan(PAGE_SIZE);
      await page.goto(`/practice?${query(broad)}`);
      const next = new URL((await pager(page).getByRole("link", { name: /Next page/ }).getAttribute("href"))!, "http://x");
      expect(Object.fromEntries(next.searchParams)).toEqual({ access: "free", cursor: expected(broad)[PAGE_SIZE - 1].id });

      await page.goto(`/practice?${query(filter)}&cursor=${PROBLEMS[0].id}`);
      const first = new URL((await pager(page).getByRole("link", { name: "First page" }).getAttribute("href"))!, "http://x");
      expect(Object.fromEntries(first.searchParams)).toEqual(filter);
   });
});

test.describe("Practice states", () => {
   test("an empty result says so and offers a way back", async ({ page }) => {
      expect(expected({ difficulty: "easy", level: "advanced" })).toEqual([]);
      await page.goto("/practice?difficulty=easy&level=advanced");
      await expect(main(page).getByRole("status")).toHaveText(/No Problems match the current filters\./);
      await expect(cards(page)).toHaveCount(0);
      await expect(filterForm(page)).toBeVisible();
      await main(page).getByRole("link", { name: "Clear filters" }).last().click();
      await expect(page).toHaveURL("/practice");
      await expectTitles(page, PROBLEMS.slice(0, PAGE_SIZE));
   });

   test("a stale cursor past the end says there is no more, with a way back", async ({ page }) => {
      await page.goto("/practice?cursor=problem.zzz-after-everything");
      await expect(main(page).getByRole("status")).toHaveText(/There are no more Problems here\./);
      await page.getByRole("link", { name: "Back to the first page" }).click();
      await expect(page).toHaveURL("/practice");
   });

   test("a premium Problem stays linkable: its metadata shows, and opening it is the API's decision", async ({ page }) => {
      await page.goto("/practice");
      const premium = cards(page).filter({ hasText: PREMIUM.title });
      await expect(premium).toContainText("Difficulty: Hard");
      await premium.getByRole("link").click();
      await expect(page).toHaveURL(canonical(PREMIUM.id));
      await expect(page.getByText("Sign in to read this content.")).toBeVisible();
   });
});

test.describe("a catalog with nothing published", () => {
   test.use({ baseURL: EMPTY_ORIGIN });

   test("keeps the orientation, says Problems arrive soon, and shows no card and no filter", async ({ page }) => {
      expect((await page.goto("/practice"))?.status()).toBe(200);
      await expect(h1(page)).toHaveText("Practice, one Problem at a time.");
      await expect(main(page).locator("header")).toContainText("clarify the requirements");
      await expect(main(page).getByRole("status")).toHaveText("Problems arrive soon. Please check back.");
      await expect(cards(page)).toHaveCount(0);
      await expect(filterForm(page)).toHaveCount(0);
      await expect(marker(page)).toBeVisible();
      expect(await overflows(page)).toBe(false);
   });
});

test.describe("a catalog the API refuses", () => {
   test.use({ baseURL: REJECTED_ORIGIN });

   test("keeps the orientation, shows the unavailable notice, and none of another environment's Problems", async ({ page }) => {
      const response = await page.goto("/practice");
      expect(response?.status()).toBe(200);
      const html = await response!.text();
      for (const problem of PROBLEMS) expect(html, `${problem.title} leaked into an unavailable page`).not.toContain(problem.title);
      expect(html).not.toContain("Forbidden");
      await expect(h1(page)).toHaveText("Practice, one Problem at a time.");
      await expect(main(page).getByRole("status")).toHaveText("This content is temporarily unavailable. Please try again later.");
      await expect(cards(page)).toHaveCount(0);
      await expect(filterForm(page)).toHaveCount(0);
   });
});

test.describe("Practice in a preview deployment", () => {
   test.use({ baseURL: PREVIEW_ORIGIN });

   test("is marked, never indexed, and every link stays on this deployment", async ({ page }) => {
      await page.goto("/practice?difficulty=hard");
      await expect(marker(page)).toBeVisible();
      await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");
      await expectTitles(page, expected({ difficulty: "hard" }).slice(0, PAGE_SIZE));
      for (const href of await page.locator("main a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")!))) {
         expect(href, `${href} leaves the deployment`).toMatch(/^\/(?!\/)/);
      }
   });

   test.describe("request discipline", () => {
      // A preview never caches, so each render reaches the API double and the log shows exactly what was read. Other specs
      // share the double, so only this page's own reads are attributed: list reads of Problems, and any path naming p2-t7.
      const log = async (request: APIRequestContext) => (await (await request.get(`${PREVIEW_API_ORIGIN}/__catalog-log`)).json()) as { path: string; query: string }[];
      const mine = async (request: APIRequestContext, since: number) =>
         (await log(request))
            .slice(since)
            .filter((entry) => entry.query.includes("type=problem") || entry.path.includes("p2-t7-"))
            .map(({ path, query: q }) => `${path}?${q}`);

      test("a page is two list reads (capped Topic scan, then one page of Problems), and no Problem is ever fetched", async ({ page, request }) => {
         const since = (await log(request)).length;
         await page.goto("/practice");
         await expect(cards(page).first()).toBeVisible();
         for (const card of await cards(page).all()) await card.getByRole("link").hover();
         await page.waitForLoadState("networkidle");

         const reads = await mine(request, since);
         expect([...reads].sort()).toEqual([`/catalog/items?type=problem&limit=100`, `/catalog/items?type=problem&limit=${PAGE_SIZE}`].sort());
         expect(reads.some((read) => read.includes("p2-t7-")), "a Problem was fetched to build the list").toBe(false);
      });

      test("sends exactly the supported parameters for the filters in the URL, in the client's order", async ({ page, request }) => {
         const since = (await log(request)).length;
         await page.goto("/practice?track=p2-t7-serving&access=premium&level=advanced&difficulty=hard&tag=latency");
         await expect(cards(page).first()).toBeVisible();
         expect(await mine(request, since)).toContain(
            `/catalog/items?type=problem&tag=latency&difficulty=hard&level=advanced&access=premium&track=p2-t7-serving&limit=${PAGE_SIZE}`
         );
      });

      test("sends nothing for an unrecognised value, a Track the catalog does not list, a Module or a foreign parameter", async ({ page, request }) => {
         const since = (await log(request)).length;
         await page.goto("/practice?difficulty=banana&level=expert&access=gold&tag=Bad%20Tag&track=ghost-track&module=retrieval&type=lesson&category=technology&limit=999");
         await expect(cards(page).first()).toBeVisible();
         const reads = await mine(request, since);
         expect([...reads].sort()).toEqual([`/catalog/items?type=problem&limit=100`, `/catalog/items?type=problem&limit=${PAGE_SIZE}`].sort());
         await expect(main(page).getByRole("status")).toHaveText(`Showing ${PAGE_SIZE} Problems`);
      });

      test("passes the opaque cursor back to the API untouched, with the filters", async ({ page, request }) => {
         const since = (await log(request)).length;
         const cursor = expected({ access: "free" })[PAGE_SIZE - 1].id;
         await page.goto(`/practice?access=free&cursor=${cursor}`);
         await expect(cards(page).first()).toBeVisible();
         expect(await mine(request, since)).toContain(`/catalog/items?type=problem&access=free&limit=${PAGE_SIZE}&cursor=${cursor}`);
      });
   });
});

for (const identity of ["signed-out", "unentitled", "entitled"] as const satisfies readonly Identity[]) {
   test.describe(`premium Problems listed as ${identity}`, () => {
      test.use({ identity });

      test("every page of the list is the same public metadata, with no premium body in HTML, RSC, DOM or network", async ({ page, traffic }) => {
         for (const start of ["/practice", `/practice?cursor=${PROBLEMS[PAGE_SIZE - 1].id}`, `/practice?access=premium`]) {
            await page.goto(start);
            await expect(cards(page).first()).toBeVisible();
            await page.waitForLoadState("networkidle");
            await expectNoCanary(page, traffic, "/practice", identity);
         }
         await page.goto("/practice?access=premium");
         await expectTitles(page, expected({ access: "premium" }));
         for (const card of await cards(page).all()) await expect(card.getByText("Premium", { exact: true })).toHaveCount(1);
      });
   });
}

test.describe("Practice layout", () => {
   const VIEWPORTS = [
      { width: 1440, height: 900, columns: 3 },
      { width: 1024, height: 768, columns: 3 },
      { width: 768, height: 1024, columns: 2 },
      { width: 390, height: 844, columns: 1 },
   ];

   for (const { width, height: viewportHeight, columns } of VIEWPORTS) {
      test(`${width}px: ${columns} column(s) of cards and no horizontal page overflow, with results, an empty result and the notice`, async ({ page }) => {
         await page.setViewportSize({ width, height: viewportHeight });
         await page.goto("/practice");
         await expect(cards(page).first()).toBeVisible();
         const tops = await cards(page).evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
         expect(tops.filter((top) => top === tops[0]).length, "cards in the first row").toBe(columns);
         expect(await overflows(page)).toBe(false);

         await page.goto("/practice?difficulty=easy&level=advanced&tag=latency");
         await expect(main(page).getByRole("status")).toBeVisible();
         expect(await overflows(page)).toBe(false);
      });
   }

   test("a desktop shows the filter bar and no Filters button, and every control is at least 44px tall", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/practice?difficulty=hard");
      await expect(toggle(page)).toBeHidden();
      const form = filterForm(page);
      for (const select of await form.locator("select").all()) {
         await expect(select).toBeVisible();
         expect(await height(select)).toBeGreaterThanOrEqual(44);
      }
      for (const control of [form.getByRole("button", { name: "Apply" }), form.getByRole("link", { name: "Clear filters" }), ...(await form.locator("label:has(input[type=radio])").all())]) {
         expect(await height(control)).toBeGreaterThanOrEqual(44);
      }
   });

   test.describe("on a phone", () => {
      test.use({ viewport: { width: 390, height: 844 } });

      test("Filters is a disclosure: collapsed, counting what is active, opened and closed from the keyboard, Escape returns focus", async ({ page }) => {
         await page.goto("/practice?difficulty=hard&access=free");
         await expect(toggle(page)).toBeVisible();
         expect(await height(toggle(page))).toBeGreaterThanOrEqual(44);
         await expect(toggle(page)).toContainText("2 active");
         await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
         await expect(page.getByLabel("Difficulty", { exact: true })).toBeHidden();
         await expect(cards(page).first()).toBeVisible();
         const box = (await cards(page).first().boundingBox())!;
         expect(box.y, "the results must stay on the first screen").toBeLessThan(844);

         await toggle(page).focus();
         await page.keyboard.press("Enter");
         await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
         await expect(page.getByLabel("Difficulty", { exact: true })).toBeVisible();
         await page.keyboard.press("Space");
         await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
         await page.keyboard.press("Space");

         await page.getByLabel("Level", { exact: true }).focus();
         await page.keyboard.press("Escape");
         await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
         await expect(toggle(page)).toBeFocused();
         expect(await overflows(page)).toBe(false);
      });

      test("Apply from the open disclosure filters the list", async ({ page }) => {
         await page.goto("/practice");
         await expect(toggle(page)).not.toContainText("active");
         await toggle(page).click();
         await page.getByLabel("Difficulty", { exact: true }).selectOption("easy");
         await filterForm(page).getByRole("button", { name: "Apply" }).click();
         await expect(page).toHaveURL(/difficulty=easy/);
         await expectTitles(page, expected({ difficulty: "easy" }));
         await expect(toggle(page)).toContainText("1 active");
      });

      test("honours reduced motion: the disclosure's chevron does not animate", async ({ page }) => {
         await page.emulateMedia({ reducedMotion: "reduce" });
         await page.goto("/practice");
         const seconds = await toggle(page).locator("svg").evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration));
         expect(seconds).toBeLessThanOrEqual(0.001);
      });
   });
});
