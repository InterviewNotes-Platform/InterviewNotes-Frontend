import type { APIRequestContext, Locator, Page } from "@playwright/test";
import fixture from "./fixture.json";
import {
   EMPTY_ORIGIN,
   PREVIEW_API_ORIGIN,
   PREVIEW_ORIGIN,
   REJECTED_ORIGIN,
   CANARY,
   canonical,
   expect,
   expectNoCanary,
   item,
   test,
   track,
   type FixtureTrack,
} from "./harness";

// P2-T4 Learn: the /tracks discovery page and the curriculum-first Track page.
const CURRICULUM = track("p2-t4-curriculum");
const EMPTY_TRACK = track("p2-t4-empty");
const HOME = track("catalog-e2e-home");
const [FOUNDATIONS, DEPTH, NEXT] = CURRICULUM.modules;
const LESSON = item("lesson.p2-t4-foundations");
const PRACTICE = item("problem.p2-t4-practice");
const PREMIUM = item("lesson.p2-t4-premium-depth");
const PREMIUM_FIRST = track("p2-t4-premium-first");
const ALL_TRACKS: FixtureTrack[] = [...fixture.tracks].sort((a, b) => (a.id < b.id ? -1 : 1));

const main = (page: Page) => page.getByRole("main");
const h1 = (page: Page) => main(page).getByRole("heading", { level: 1 });
const outline = (page: Page, t: FixtureTrack) => page.getByRole("navigation", { name: `${t.title} outline` });
// The control reads "Module <n> <title> <counts>", n being the Module's place among all of the Track's Modules.
const moduleControl = (page: Page, t: FixtureTrack, key: string) =>
   outline(page, t).getByRole("button", {
      name: new RegExp(`^Module ${t.modules.findIndex((m) => m.key === key) + 1} ${t.modules.find((m) => m.key === key)!.title}`),
   });
const countsOf = (ids: string[]) => {
   const lessons = ids.filter((id) => item(id).type === "lesson").length;
   const problems = ids.length - lessons;
   return [lessons ? plural(lessons, "lesson") : "", problems ? plural(problems, "practice problem") : ""].filter(Boolean).join(" · ");
};
const panelOf = async (page: Page, control: Locator) => page.locator(`[id="${await control.getAttribute("aria-controls")}"]`);
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const marker = (page: Page) => page.getByRole("complementary", { name: "Preview" });
const robots = (page: Page) => page.locator('meta[name="robots"]');
const columns = (page: Page) =>
   main(page)
      .getByRole("list")
      .getByRole("listitem")
      .evaluateAll((cards) => new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))).size);

/** Tab until `target` has focus, so any focus ring comes from real keyboard modality. */
async function tabTo(page: Page, target: Locator) {
   for (let stop = 0; stop < 40; stop++) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((element) => element === document.activeElement)) return;
   }
   throw new Error("focus never reached the target");
}

const typesIn = (t: FixtureTrack) => t.modules.flatMap((m) => m.items).map((id) => item(id).type);
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

test.describe("/tracks", () => {
   test("opens with the Learn proposition, then a card for every Track in the API's order", async ({ page }) => {
      const response = await page.goto("/tracks");
      expect(response?.status()).toBe(200);
      await expect(h1(page)).toHaveText("Learn, one Track at a time.");
      await expect(main(page).getByRole("heading", { level: 2, name: "Tracks" })).toBeVisible();

      const cards = main(page).getByRole("list").getByRole("listitem");
      await expect(cards.getByRole("heading", { level: 3 })).toHaveText(ALL_TRACKS.map((t) => t.title));
      for (const [index, t] of ALL_TRACKS.entries()) {
         await expect(cards.nth(index).getByRole("link")).toHaveCount(1);
         await expect(cards.nth(index).getByRole("link", { name: t.title })).toHaveAttribute("href", canonical(t.id));
         await expect(cards.nth(index)).toContainText(t.summary);
      }
   });

   test("is server-rendered, with the proposition and every Track in the HTML", async ({ request }) => {
      const html = await (await request.get("/tracks")).text();
      expect(html).toContain("Learn, one Track at a time.");
      for (const t of ALL_TRACKS) expect(html, `${t.title} missing from the server HTML`).toContain(t.title);
   });

   test("cards carry only what the list response has: no counts, hours, ratings or progress", async ({ page }) => {
      await page.goto("/tracks");
      const text = await main(page).getByRole("list").innerText();
      expect(text).not.toMatch(/\d+\s*(modules?|lessons?|hours?|min|learners?|students?|reviews?)|%|★/i);
   });

   test("a card opens its Track with one click, from the keyboard too", async ({ page }) => {
      await page.goto("/tracks");
      await main(page).getByRole("link", { name: CURRICULUM.title }).click();
      await expect(page).toHaveURL(canonical(CURRICULUM.id));
      await expect(h1(page)).toHaveText(CURRICULUM.title);

      await page.goBack();
      const card = main(page).getByRole("link", { name: HOME.title });
      await tabTo(page, card);
      const article = main(page).locator("article", { has: page.getByRole("link", { name: HOME.title }) });
      await expect(article).toHaveCSS("outline-style", "solid");
      await expect(article).toHaveCSS("outline-width", "2px");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(canonical(HOME.id));
   });

   test("the Learn destination is the current area", async ({ page }) => {
      await page.goto("/tracks");
      await expect(page.getByRole("banner").getByRole("navigation", { name: "Primary" }).locator("[aria-current]")).toHaveText("Learn");
   });

   const viewports = [
      { width: 1440, height: 900, columns: 3 },
      { width: 1024, height: 768, columns: 3 },
      { width: 768, height: 1024, columns: 2 },
      { width: 390, height: 844, columns: 1 },
   ];
   for (const { width, height, columns: expected } of viewports) {
      test(`is ${expected} column${expected > 1 ? "s" : ""} with no horizontal overflow at ${width}x${height}`, async ({ page }) => {
         await page.setViewportSize({ width, height });
         await page.goto("/tracks");
         await expect(main(page).getByRole("link", { name: HOME.title })).toBeVisible();
         expect(await columns(page)).toBe(expected);
         expect(await overflows(page)).toBe(false);
      });
   }

   test("keeps comfortable 44px targets on a phone", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/tracks");
      for (const card of await main(page).getByRole("list").getByRole("listitem").all()) {
         expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
   });

   test.describe("dark", () => {
      test.use({ colorScheme: "dark" });

      test("uses the dark tokens for the page and the cards", async ({ page }) => {
         await page.goto("/tracks");
         await expect(page.locator("html")).toHaveClass(/dark/);
         await expect(page.locator("body")).toHaveCSS("background-color", "rgb(15, 15, 17)");
         await expect(main(page).locator("article").first()).toHaveCSS("background-color", "rgb(26, 26, 29)");
      });
   });
});

test.describe("/tracks deployments and states", () => {
   test.describe("preview", () => {
      test.use({ baseURL: PREVIEW_ORIGIN });

      test("is marked, noindex, never publicly cacheable, with every link on this deployment", async ({ page, request }) => {
         await page.goto("/tracks");
         await expect(h1(page)).toBeVisible();
         await expect(marker(page)).toBeVisible();
         await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");

         const response = await request.get("/tracks");
         const html = await response.text();
         expect(html).toContain('aria-label="Preview"');
         expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"\/?>/);
         expect(response.headers()["cache-control"] ?? "").toMatch(/no-store|private/);
         expect(html).not.toMatch(/<link[^>]+rel="(canonical|alternate)"/);

         const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
         for (const href of hrefs) expect(href, `${href} leaves the deployment`).toMatch(/^(\/(?!\/)|#)/);
         const cardHrefs = await main(page).locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
         expect(cardHrefs).toEqual(ALL_TRACKS.map((t) => canonical(t.id)));
      });

      test("reads the shared list endpoint and never a Track outline or an item, whatever the card count", async ({ page, request }) => {
         const log = async (): Promise<{ path: string; query: string }[]> =>
            (await request.get(`${PREVIEW_API_ORIGIN}/__catalog-log`)).json();
         const before = (await log()).length;
         await page.goto("/tracks");
         const card = main(page).getByRole("link", { name: CURRICULUM.title });
         await expect(card).toBeVisible();
         await card.hover();
         await page.waitForTimeout(1000); // prefetches, if any, are scheduled once links are in view or hovered

         // Other specs share this API double, so only requests naming this task's own records can be attributed.
         const mine = (await log()).slice(before).filter(({ path }) => path.includes("p2-t4-"));
         expect(mine, "/tracks fetched a Track or an item per card").toEqual([]);
         const reads = (await log()).filter(({ path }) => path === "/catalog/tracks");
         expect(reads.length, "/tracks never called the Track list endpoint").toBeGreaterThan(0);
      });
   });

   test("production has neither the marker nor a robots directive", async ({ page, request }) => {
      await page.goto("/tracks");
      await expect(page.getByRole("complementary")).toHaveCount(0);
      await expect(robots(page)).toHaveCount(0);
      const html = await (await request.get("/tracks")).text();
      expect(html).not.toContain('aria-label="Preview"');
      expect(html).not.toMatch(/noindex/i);
   });

   test.describe("a catalog with nothing published", () => {
      test.use({ baseURL: EMPTY_ORIGIN });

      test("keeps the proposition and says so calmly, with no Track card", async ({ page }) => {
         expect((await page.goto("/tracks"))?.status()).toBe(200);
         await expect(h1(page)).toHaveText("Learn, one Track at a time.");
         await expect(main(page).getByRole("status")).toHaveText("No Tracks are published yet. Please check back soon.");
         await expect(main(page).getByRole("list")).toHaveCount(0);
         await expect(main(page).getByRole("heading", { level: 3 })).toHaveCount(0);
         await expect(marker(page)).toBeVisible();
         await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");
         expect(await overflows(page)).toBe(false);
      });
   });

   test.describe("a catalog the API refuses", () => {
      test.use({ baseURL: REJECTED_ORIGIN });

      test("keeps the proposition, shows the unavailable notice and none of another environment's Tracks", async ({ page }) => {
         const response = await page.goto("/tracks");
         expect(response?.status()).toBe(200);
         const html = await response!.text();
         for (const t of ALL_TRACKS) expect(html, `${t.title} leaked into an unavailable page`).not.toContain(t.title);
         expect(html).not.toContain("Forbidden");
         await expect(h1(page)).toHaveText("Learn, one Track at a time.");
         await expect(main(page).getByRole("status")).toHaveText("This content is temporarily unavailable. Please try again later.");
         await expect(main(page).getByRole("list")).toHaveCount(0);
         await expect(marker(page)).toBeVisible();
         await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");
         expect(await main(page).innerText()).not.toMatch(/403|forbidden|postgres|traceback|token/i);
      });
   });
});

test.describe("Track page", () => {
   test("puts the proposition first, then Start, then the curriculum, then supporting context", async ({ page }) => {
      await page.goto(canonical(CURRICULUM.id));
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(h1(page)).toHaveText(CURRICULUM.title);
      await expect(main(page).getByText(CURRICULUM.summary)).toBeVisible();

      const types = typesIn(CURRICULUM);
      const counts = `${plural(CURRICULUM.modules.length, "module")} · ${plural(types.filter((t) => t === "lesson").length, "lesson")} · ${plural(types.filter((t) => t === "problem").length, "practice problem")}`;
      await expect(main(page).getByText(counts, { exact: true })).toBeVisible();

      const y = async (locator: Locator) => (await locator.boundingBox())!.y;
      const start = main(page).getByRole("link", { name: "Start" });
      const first = outline(page, CURRICULUM);
      const support = main(page).getByRole("region", { name: "In this Track" });
      expect(await y(h1(page))).toBeLessThan(await y(start));
      expect(await y(start)).toBeLessThan(await y(first));
      expect(await y(first)).toBeLessThan(await y(support));
   });

   test("Start points at the first linkable entry in curriculum order and begins the Track", async ({ page }) => {
      await page.goto(canonical(CURRICULUM.id));
      const start = main(page).getByRole("link", { name: `Start with ${LESSON.title}`, exact: true });
      await expect(start).toHaveAttribute("href", canonical(LESSON.id));
      await expect(main(page).getByText("Recommended starting point")).toBeVisible();

      await start.click();
      await expect(page).toHaveURL(canonical(LESSON.id));
      await expect(h1(page)).toHaveText(LESSON.title);
      await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(`Learn/${CURRICULUM.title}/${FOUNDATIONS.title}`);
   });

   test("Start on another Track follows that Track's own order", async ({ page }) => {
      await page.goto(canonical(HOME.id));
      await expect(main(page).getByRole("link", { name: "Start" })).toHaveAttribute("href", canonical(HOME.modules[0].items[0]));
   });

   test("a Track with nothing published has a calm start state and no invented destination", async ({ page }) => {
      await page.goto(canonical(EMPTY_TRACK.id));
      await expect(h1(page)).toHaveText(EMPTY_TRACK.title);
      await expect(main(page).getByRole("link", { name: "Start" })).toHaveCount(0);
      await expect(main(page).getByText("Nothing is published in this Track yet.")).toBeVisible();
      await expect(main(page).getByText("This Track has no published content yet.")).toHaveCount(0);
      await expect(outline(page, EMPTY_TRACK)).toHaveCount(0);
   });

   test("modules are h2 sections: the first open, the rest collapsed, each numbered with its Lesson and Problem counts", async ({ page }) => {
      await page.goto(canonical(CURRICULUM.id));
      const nav = outline(page, CURRICULUM);
      await expect(nav.getByRole("heading", { level: 2 })).toHaveCount(CURRICULUM.modules.length);
      for (const [index, module] of CURRICULUM.modules.entries()) {
         const control = moduleControl(page, CURRICULUM, module.key);
         const name = `Module ${index + 1} ${module.title} ${countsOf(module.items)}`.trim();
         await expect(control).toHaveAccessibleName(name);
         await expect(control).toHaveAttribute("aria-expanded", index === 0 ? "true" : "false");
         await expect(await panelOf(page, control)).toHaveCount(1);
      }
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
   });

   test("entries show their type, premium state and a fixed leading slot, in curriculum order", async ({ page }) => {
      await page.goto(canonical(CURRICULUM.id));
      const rows = (await panelOf(page, moduleControl(page, CURRICULUM, FOUNDATIONS.key))).getByRole("listitem");
      await expect(rows).toHaveCount(FOUNDATIONS.items.length);
      await expect(rows.nth(0).getByRole("link")).toContainText(LESSON.title);
      await expect(rows.nth(0).getByText("Lesson", { exact: true })).toBeVisible();
      await expect(rows.nth(0)).toContainText(LESSON.summary);
      await expect(rows.nth(1).getByRole("link")).toContainText(PRACTICE.title);
      await expect(rows.nth(1).getByText("Practice problem", { exact: true })).toBeVisible();
      await expect(rows.nth(1)).not.toContainText(PRACTICE.summary);
      await expect(rows.getByText("Premium", { exact: true })).toHaveCount(0);

      const slots = rows.locator('[data-slot="entry-leading"]');
      const widths = await slots.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
      expect(new Set(widths).size, "the leading slot is not a fixed width").toBe(1);
      for (const [position, id] of FOUNDATIONS.items.entries()) {
         await expect(rows.nth(position).getByRole("link")).toHaveAttribute("href", canonical(id));
      }
   });

   test("expanding a module reveals its premium entry, linkable and marked, without its body", async ({ page, traffic }) => {
      const route = canonical(CURRICULUM.id);
      await page.goto(route);
      const control = moduleControl(page, CURRICULUM, DEPTH.key);
      const panel = await panelOf(page, control);
      await expect(panel.locator("a")).toBeHidden();
      await control.click();
      await expect(control).toHaveAttribute("aria-expanded", "true");
      const row = panel.getByRole("link");
      await expect(row).toBeVisible();
      await expect(row).toContainText(PREMIUM.title);
      await expect(row.getByText("Premium", { exact: true })).toBeVisible();
      await expect(row).toHaveAttribute("href", canonical(PREMIUM.id));
      await expectNoCanary(page, traffic, route, "signed-out");

      await row.click();
      await expect(page).toHaveURL(canonical(PREMIUM.id));
      await expect(main(page).getByRole("status")).toContainText("Sign in to read this content.");
   });

   test("an empty module is a real section that says so", async ({ page }) => {
      await page.goto(canonical(CURRICULUM.id));
      const control = moduleControl(page, CURRICULUM, NEXT.key);
      await expect(control).toHaveAccessibleName(`Module ${CURRICULUM.modules.length} ${NEXT.title}`);
      await control.click();
      await expect(main(page).getByText("No published items in this Module yet.")).toBeVisible();
      await expect((await panelOf(page, control)).locator("a")).toHaveCount(0);
   });

   test("supporting context lists the outline's own Problem placements, and never Knowledge", async ({ page }) => {
      const problem = item("problem.catalog-e2e-related");
      for (const [t, expected] of [
         [HOME, problem],
         [CURRICULUM, PRACTICE],
      ] as const) {
         await page.goto(canonical(t.id));
         const support = main(page).getByRole("region", { name: "In this Track" });
         await expect(support.getByRole("heading", { level: 3 })).toHaveText(["Practice"]);
         await expect(support.getByRole("link")).toHaveText([expected.title]);
         await expect(support.getByRole("link")).toHaveAttribute("href", canonical(expected.id));
         await expect(main(page).getByText(/knowledge/i)).toHaveCount(0);
      }
   });

   test("no Module has a URL of its own, and every link is a canonical item route", async ({ page, request }) => {
      await page.goto(canonical(CURRICULUM.id));
      for (const control of await outline(page, CURRICULUM).getByRole("button").all()) await control.click();
      const hrefs = await main(page).locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) expect(href).toMatch(/^\/(lessons|problems|knowledge)\/[a-z0-9]+(-[a-z0-9]+)*$/);

      for (const path of [`${canonical(CURRICULUM.id)}/${FOUNDATIONS.key}`, `/modules/${FOUNDATIONS.key}`, `/tracks/${FOUNDATIONS.key}`]) {
         expect((await request.get(path)).status(), path).toBe(404);
      }
   });

   test.describe("request discipline", () => {
      // A preview never caches, so every render reaches the API double and its log shows exactly what was read.
      test.use({ baseURL: PREVIEW_ORIGIN });
      // Other specs share this API double, so only requests naming this task's own records can be attributed. One
      // is not the Track's: the preview Lesson specs show this Problem in Practice and read its relations (P3-T6).
      const LESSON_PRACTICE_READ = `/catalog/items/problem/${PRACTICE.slug}/related`;
      const reads = async (request: APIRequestContext, since: number) =>
         ((await (await request.get(`${PREVIEW_API_ORIGIN}/__catalog-log`)).json()) as { path: string; query: string }[])
            .slice(since)
            .map(({ path, query }) => (query ? `${path}?${query}` : path))
            .filter((path) => path.includes("p2-t4-") && path !== LESSON_PRACTICE_READ);
      // P3 §17.2: the outline, then one Lesson list page (the fixture fits in one), and no item, meta or Git read.
      const TRACK_READS = [`/catalog/tracks/${CURRICULUM.slug}`, `/catalog/items?type=lesson&track=${CURRICULUM.slug}&limit=100`];
      const logged = async (request: APIRequestContext) =>
         ((await (await request.get(`${PREVIEW_API_ORIGIN}/__catalog-log`)).json()) as unknown[]).length;

      test("rendering the Track reads the outline and one Lesson list page: no entry is fetched for it", async ({ request }) => {
         const since = await logged(request);
         expect((await request.get(canonical(CURRICULUM.id))).status()).toBe(200);
         expect(await reads(request, since)).toEqual(TRACK_READS);
      });

      test("in a browser too: opening every module, hovering and focusing entries reads nothing more", async ({ page, request }) => {
         const since = await logged(request);
         await page.goto(canonical(CURRICULUM.id));
         await expect(h1(page)).toHaveText(CURRICULUM.title);
         for (const control of await outline(page, CURRICULUM).getByRole("button").all()) {
            if ((await control.getAttribute("aria-expanded")) === "false") await control.click();
         }
         for (const row of await outline(page, CURRICULUM).getByRole("link").all()) await row.hover();
         await main(page).getByRole("link", { name: "Start" }).hover();
         await page.waitForTimeout(1000); // prefetches, if any, are scheduled once links are in view or hovered

         expect(await reads(request, since), "the Track page read more than its outline and summary list").toEqual(TRACK_READS);

         // Only following a link reads the next page.
         await outline(page, CURRICULUM).getByRole("link", { name: new RegExp(LESSON.title) }).click();
         await expect(h1(page)).toHaveText(LESSON.title);
         expect((await reads(request, since)).some((path) => path.startsWith(`/catalog/items/lesson/${LESSON.slug}`))).toBe(true);
      });
   });

   test.describe("prefetch", () => {
      // Tall enough that every link is in view at once, so any prefetch would be scheduled together.
      test.use({ viewport: { width: 1280, height: 2400 } });

      test("no entry is prefetched, free or premium; only a click requests it", async ({ page, traffic }) => {
         const paths = () => traffic.requests.map((url) => new URL(url).pathname);
         await page.goto(canonical(CURRICULUM.id));
         for (const control of await outline(page, CURRICULUM).getByRole("button").all()) {
            if ((await control.getAttribute("aria-expanded")) === "false") await control.click();
         }
         const entries = [LESSON, PRACTICE, PREMIUM].map((entry) => canonical(entry.id));
         await expect(outline(page, CURRICULUM).getByRole("link")).toHaveCount(entries.length);
         await page.waitForTimeout(1000);
         for (const entry of entries) expect(paths(), `${entry} was prefetched`).not.toContain(entry);

         await outline(page, CURRICULUM).getByRole("link", { name: new RegExp(PREMIUM.title) }).click();
         await expect(page).toHaveURL(canonical(PREMIUM.id));
      });
   });
});

// "Linkable" is a route question. The outline is public and has no viewer: Start follows curriculum order, and
// the item page, not the Track page, decides what each reader may see.
test.describe("Start into a premium first entry", () => {
   const route = canonical(PREMIUM_FIRST.id);
   const target = canonical(PREMIUM.id);
   const identities = [
      { identity: "signed-out", notice: "Sign in to read this content." },
      { identity: "unentitled", notice: "Paid access is not available yet." },
   ] as const;

   for (const { identity, notice } of identities) {
      test.describe(identity, () => {
         test.use({ identity });

         test("Start still points at the premium Lesson, marked Premium, and the item page withholds the body", async ({ page, traffic }) => {
            const start = main(page).getByRole("link", { name: `Start with ${PREMIUM.title}`, exact: true });
            await page.goto(route);
            await expect(start).toHaveAttribute("href", target);
            await expect(main(page).getByText("Recommended starting point").locator("..")).toContainText("Premium");
            await expectNoCanary(page, traffic, route, identity);

            await start.click();
            await expect(page).toHaveURL(target);
            await expect(main(page).getByRole("status")).toContainText(notice);
            await expectNoCanary(page, traffic, target, identity);
         });
      });
   }

   test.describe("entitled", () => {
      test.use({ identity: "entitled" });

      test("the same Start releases the body, because the item page decides, not the Track page", async ({ page }) => {
         await page.goto(route);
         await expect(main(page).getByRole("link", { name: "Start" })).toHaveAttribute("href", target);
         await main(page).getByRole("link", { name: "Start" }).click();
         await expect(page).toHaveURL(target);
         await expect(main(page).getByText(CANARY)).toBeVisible();
      });
   });

   test("every viewer is served the same Track page: the outline carries no per-reader state", async ({ request }) => {
      const html = await (await request.get(route)).text();
      expect(html).toContain(`href="${target}"`);
      expect(html).not.toContain(CANARY);
   });

   test("the premium entry keeps its place in order: premium first, free second, both linkable", async ({ page }) => {
      await page.goto(route);
      const rows = (await panelOf(page, moduleControl(page, PREMIUM_FIRST, "opening"))).getByRole("listitem");
      await expect(rows.getByRole("link")).toHaveCount(2);
      await expect(rows.nth(0).getByRole("link")).toHaveAttribute("href", target);
      await expect(rows.nth(0)).toContainText("Premium");
      await expect(rows.nth(1).getByRole("link")).toHaveAttribute("href", canonical(LESSON.id));
      await expect(rows.nth(1)).not.toContainText("Premium");
   });
});

test.describe("module disclosure by keyboard", () => {
   test("Tab reaches the control; Enter and Space toggle it; collapsed rows are never a tab stop", async ({ page }) => {
      await page.goto(canonical(CURRICULUM.id));
      const foundations = moduleControl(page, CURRICULUM, FOUNDATIONS.key);
      const depth = moduleControl(page, CURRICULUM, DEPTH.key);
      const next = moduleControl(page, CURRICULUM, NEXT.key);
      const depthRow = (await panelOf(page, depth)).getByRole("link");

      await tabTo(page, foundations);
      await expect(foundations).toHaveCSS("outline-style", "solid");
      await expect(foundations).toHaveCSS("outline-width", "2px");
      // The open module's entries are tab stops; the collapsed module's are skipped, straight to the next control.
      await page.keyboard.press("Tab");
      await expect(outline(page, CURRICULUM).getByRole("link", { name: new RegExp(LESSON.title) })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(outline(page, CURRICULUM).getByRole("link", { name: new RegExp(PRACTICE.title) })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(depth).toBeFocused();
      await expect(depth).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("Tab");
      await expect(next).toBeFocused();

      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Enter");
      await expect(depth).toBeFocused();
      await expect(depth).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Tab");
      await expect(depthRow).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(depth).toBeFocused();

      await page.keyboard.press("Space");
      await expect(depth).toHaveAttribute("aria-expanded", "false");
      await expect(depth).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(next).toBeFocused();
   });

   test("Start is reachable by keyboard, shows focus and activates with Enter", async ({ page }) => {
      await page.goto(canonical(CURRICULUM.id));
      const start = main(page).getByRole("link", { name: "Start" });
      await tabTo(page, start);
      await expect(start).toHaveCSS("outline-style", "solid");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(canonical(LESSON.id));
   });
});

test.describe("motion", () => {
   const seconds = (duration: string) => duration.split(",").map((value) => parseFloat(value));

   test("module panels animate briefly by default", async ({ page }) => {
      await page.goto(canonical(CURRICULUM.id));
      const panel = await panelOf(page, moduleControl(page, CURRICULUM, DEPTH.key));
      const duration = await panel.evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(Math.max(...seconds(duration))).toBeCloseTo(0.2, 2);
   });

   test.describe("with reduced motion", () => {
      test.use({ reducedMotion: "reduce" });

      test("module panels and their chevrons change instantly", async ({ page }) => {
         await page.goto(canonical(CURRICULUM.id));
         const control = moduleControl(page, CURRICULUM, DEPTH.key);
         const panel = await panelOf(page, control);
         const chevron = control.locator("svg");
         for (const element of [panel, chevron]) {
            const duration = await element.evaluate((el) => getComputedStyle(el).transitionDuration);
            expect(Math.max(...seconds(duration)), "non-essential motion was not disabled").toBeLessThan(0.001);
         }
         await control.click();
         await expect(panel.locator("a")).toBeVisible();
         await control.click();
         await expect(panel.locator("a")).toBeHidden();
      });
   });
});

test.describe("Track page responsive", () => {
   const viewports = [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
   ];
   for (const { width, height } of viewports) {
      test(`has no horizontal overflow, with every module open, at ${width}x${height}`, async ({ page }) => {
         await page.setViewportSize({ width, height });
         for (const t of [CURRICULUM, HOME, EMPTY_TRACK]) {
            await page.goto(canonical(t.id));
            for (const control of await page.getByRole("navigation", { name: `${t.title} outline` }).getByRole("button").all()) {
               if ((await control.getAttribute("aria-expanded")) === "false") await control.click();
            }
            expect(await overflows(page), `${t.slug} overflows at ${width}px`).toBe(false);
         }
      });
   }

   test.describe("on a phone", () => {
      test.use({ viewport: { width: 390, height: 844 } });

      test("keeps Start in the first screen and every control at least 44px tall", async ({ page }) => {
         await page.goto(canonical(CURRICULUM.id));
         const start = main(page).getByRole("link", { name: "Start" });
         await expect(start).toBeInViewport();
         expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
         for (const control of await outline(page, CURRICULUM).getByRole("button").all()) {
            expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
         }
         await moduleControl(page, CURRICULUM, FOUNDATIONS.key).scrollIntoViewIfNeeded();
         for (const row of await (await panelOf(page, moduleControl(page, CURRICULUM, FOUNDATIONS.key))).getByRole("link").all()) {
            expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
         }
      });
   });
});

test.describe("Learn flow", () => {
   test("/tracks to a Track, a module, a Lesson, and back to open a Problem", async ({ page }) => {
      await page.goto("/tracks");
      await main(page).getByRole("link", { name: CURRICULUM.title }).click();
      await expect(page).toHaveURL(canonical(CURRICULUM.id));

      const depth = moduleControl(page, CURRICULUM, DEPTH.key);
      await depth.click();
      await expect(depth).toHaveAttribute("aria-expanded", "true");

      const foundations = await panelOf(page, moduleControl(page, CURRICULUM, FOUNDATIONS.key));
      await foundations.getByRole("link", { name: new RegExp(LESSON.title) }).click();
      await expect(page).toHaveURL(canonical(LESSON.id));
      await expect(h1(page)).toHaveText(LESSON.title);

      const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
      await expect(breadcrumb).toHaveText(`Learn/${CURRICULUM.title}/${FOUNDATIONS.title}`);
      await breadcrumb.getByRole("link", { name: CURRICULUM.title }).click();
      await expect(page).toHaveURL(canonical(CURRICULUM.id));

      await (await panelOf(page, moduleControl(page, CURRICULUM, FOUNDATIONS.key)))
         .getByRole("link", { name: new RegExp(PRACTICE.title) })
         .click();
      await expect(page).toHaveURL(canonical(PRACTICE.id));
      await expect(h1(page)).toHaveText(PRACTICE.title);
      await expect(main(page).getByText("Curriculum practice prompt marker.")).toBeVisible();
   });
});

test.describe("Learn smoke", () => {
   test("neighbouring routes still render", async ({ page }) => {
      for (const route of [canonical(LESSON.id), canonical(PRACTICE.id), canonical("knowledge.catalog-e2e-sections"), "/learn"]) {
         expect((await page.goto(route))?.status(), route).toBe(200);
         await expect(page.getByRole("heading").first()).toBeVisible();
      }
      expect((await page.goto("/login"))?.status()).toBe(200);
      await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
   });
});
