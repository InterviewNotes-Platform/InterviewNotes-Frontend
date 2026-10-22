import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import fixture from "./catalog/fixture.json";
import { EMPTY_ORIGIN, expect, ISOLATED_API_ORIGIN, ISOLATED_ORIGIN, PREVIEW_ORIGIN, REJECTED_ORIGIN, test } from "./catalog/harness";

// Homepage: Tracks lead and are the published catalog Tracks; Knowledge supports them. Look and feel is validated by hand.
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** What the fake API's `GET /catalog/tracks` returns for the default deployment: every fixture Track, by id. */
const CATALOG_TRACKS = [...fixture.tracks].sort(byId);
const FREE_CHAPTER_PATH = "/catalog/items/lesson/anatomy-of-a-model-request/meta";
const FREE_CHAPTER_HREF = "/lessons/anatomy-of-a-model-request";
const READ_FREE_CHAPTER = "Read a free chapter";

const KNOWLEDGE_HREFS = ["/knowledge?group=core-concepts", "/knowledge?group=technologies-research", "/knowledge?group=patterns", "/knowledge?group=quick-references", "/knowledge"];

const hero = (page: Page) => page.getByRole("region", { name: /Crack Your Next/ });
const tracks = (page: Page) => page.getByRole("region", { name: "Choose Your Path" });
const trackCards = (page: Page) => tracks(page).getByRole("list").last().getByRole("link");
const pricing = (page: Page) => page.locator("#pricing");
const plans = (page: Page) => pricing(page).getByRole("list", { name: "Planned pricing" }).getByRole("listitem");

test("is rendered for each request, so a build cannot freeze the catalog's state into it", async ({ request }) => {
   const response = await request.get("/");
   expect(response.status()).toBe(200);
   expect(response.headers()["cache-control"]).toMatch(/no-store|no-cache|private/);
});

test.describe("catalog reads", () => {
   // The private deployment's API double receives nothing from any other test, so its log is this describe's alone.
   test.use({ baseURL: ISOLATED_ORIGIN });

   const catalogLog = async (request: APIRequestContext): Promise<{ path: string; query: string; presented: string | null }[]> =>
      (await request.get(`${ISOLATED_API_ORIGIN}/__catalog-log`)).json();

   test("loading / reads at most the Track list and the free Lesson's metadata, both on the server and neither from the browser", async ({ page, request }) => {
      const before = await catalogLog(request);
      const browserRequests: string[] = [];
      page.on("request", (r) => {
         if (/^\/(catalog|tracks|lessons|problems|knowledge)\//.test(new URL(r.url()).pathname)) browserRequests.push(r.url());
      });

      await page.goto("/");
      await expect(trackCards(page).first()).toBeVisible();
      await page.waitForLoadState("networkidle");

      const log = await catalogLog(request);
      const added = log.slice(before.length);
      expect(added.length, "the homepage read more than two catalog endpoints").toBeLessThanOrEqual(2);
      expect(added.map((entry) => entry.path).filter((path) => path !== "/catalog/tracks" && path !== FREE_CHAPTER_PATH)).toEqual([]);
      for (const entry of added) expect(entry).toMatchObject({ query: "", presented: null });
      // Whether the 60-second data cache was warm decides how many of the two this load made; together they are the only two ever.
      expect(new Set(log.map((entry) => entry.path))).toEqual(new Set(["/catalog/tracks", FREE_CHAPTER_PATH]));
      expect(browserRequests, "the browser requested catalog data or prefetched a catalog route").toEqual([]);
   });

   test("offers the free chapter, opening its Lesson, when the API confirms the Lesson is free", async ({ page }) => {
      await page.goto("/");
      await expect(hero(page).getByRole("link", { name: READ_FREE_CHAPTER })).toHaveAttribute("href", FREE_CHAPTER_HREF);
      await expect(hero(page).getByRole("link")).toHaveText(["Browse Tracks", READ_FREE_CHAPTER]);
   });

   test("keyboard moves from Browse Tracks to Read a free chapter, with a solid 2px focus ring, then to the first Track card", async ({ page }) => {
      await page.goto("/");
      await page.keyboard.press("Tab"); // skip link
      await page.keyboard.press("Enter");
      await expect(page.locator("#main-content")).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(hero(page).getByRole("link", { name: "Browse Tracks" })).toBeFocused();

      const freeChapter = hero(page).getByRole("link", { name: READ_FREE_CHAPTER });
      await page.keyboard.press("Tab");
      await expect(freeChapter).toBeFocused();
      await expect(freeChapter).toHaveCSS("outline-style", "solid");
      await expect(freeChapter).toHaveCSS("outline-width", "2px");

      await page.keyboard.press("Tab");
      await expect(trackCards(page).first()).toBeFocused();
   });
});

test("offers no free chapter when the API does not know the Lesson", async ({ page }) => {
   await page.goto("/");
   await expect(hero(page).getByRole("link")).toHaveText(["Browse Tracks"]);
   await expect(page.getByText(READ_FREE_CHAPTER)).toHaveCount(0);
});

test("offers one h1, a card for every published Track in the API's order, and Knowledge as a link to its explorer", async ({ page }) => {
   await page.goto("/");
   await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
   await expect(trackCards(page)).toHaveCount(CATALOG_TRACKS.length);
   for (const [index, catalogTrack] of CATALOG_TRACKS.entries()) {
      const card = trackCards(page).nth(index);
      await expect(card).toHaveAttribute("href", `/tracks/${catalogTrack.slug}`);
      await expect(card.getByRole("heading", { level: 3 })).toHaveText(catalogTrack.title);
      await expect(card).toContainText(catalogTrack.summary);
      await expect(card).toContainText("Explore");
   }
   const knowledgeLinks = page.locator("#knowledge").getByRole("link");
   await expect(knowledgeLinks).toHaveCount(5);
   expect(await knowledgeLinks.evaluateAll((links) => links.map((l) => l.getAttribute("href")))).toEqual(KNOWLEDGE_HREFS);
   const hrefs = await page.locator("a").evaluateAll((links) => links.map((l) => l.getAttribute("href")));
   expect(hrefs.filter((href) => href?.startsWith("/practice") || href?.startsWith("/problems"))).toEqual([]);
});

test("shows no count, duration or badge on a Track card, and no card the catalog did not list", async ({ page }) => {
   await page.goto("/");
   await expect(tracks(page).getByText(/\b\d+\s*(chapters?|lessons?|modules?|problems?|hours?|h)\b/i)).toHaveCount(0);
   // A card holds its Track's title, its summary and the Explore cue, and nothing else: no badge, count or access claim.
   for (const [index, catalogTrack] of CATALOG_TRACKS.entries()) {
      await expect(trackCards(page).nth(index)).toHaveText(`${catalogTrack.title}${catalogTrack.summary}Explore`);
   }
   await expect(tracks(page).getByText("Gen AI Native Design")).toHaveCount(0); // a retired static card
   await expect(tracks(page).getByRole("link", { name: /explore tracks/i })).toHaveCount(0);
});

test("keyboard reaches the hero action, then the Track cards in order, each with a solid 2px focus ring", async ({ page }) => {
   await page.goto("/");
   await page.keyboard.press("Tab"); // skip link
   await page.keyboard.press("Enter");
   await expect(page.locator("#main-content")).toBeFocused();

   await page.keyboard.press("Tab");
   await expect(hero(page).getByRole("link", { name: "Browse Tracks" })).toBeFocused();

   for (const index of CATALOG_TRACKS.keys()) {
      await page.keyboard.press("Tab");
      await expect(trackCards(page).nth(index)).toBeFocused();
      await expect(trackCards(page).nth(index)).toHaveCSS("outline-style", "solid");
      await expect(trackCards(page).nth(index)).toHaveCSS("outline-width", "2px");
   }
});

test("a visitor reaches real content: a Track card opens its Track page", async ({ page }) => {
   await page.goto("/");
   await trackCards(page).filter({ hasText: "E2E Home Track" }).click();
   await expect(page).toHaveURL("/tracks/catalog-e2e-home");
   await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E Home Track");
});

test.describe("Browse Tracks", () => {
   test("in the hero and at the end of the page lands on the Tracks section", async ({ page }) => {
      await page.goto("/");
      await hero(page).getByRole("link", { name: "Browse Tracks" }).click();
      await expect(page).toHaveURL(/\/#tracks$/);
      await expect(page.locator("#tracks")).toBeInViewport();

      await page.goto("/");
      await page.getByRole("region", { name: "Pick a Track and start reading" }).getByRole("link", { name: "Browse Tracks" }).click();
      await expect(page).toHaveURL(/\/#tracks$/);
      await expect(page.locator("#tracks")).toBeInViewport();
   });

   test("the header's Tracks link lands on the section from another page, and names it by its heading", async ({ page }) => {
      await page.goto("/knowledge");
      await page.getByRole("banner").getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Tracks" }).click();
      await expect(page).toHaveURL(/\/#tracks$/);
      await expect(page.locator("#tracks")).toBeInViewport();
      await expect(page.getByRole("region", { name: "Choose Your Path" })).toBeVisible();
   });

   test("no link in the page's main content still sends Track discovery to /learn", async ({ page }) => {
      await page.goto("/");
      const hrefs = await page.getByRole("main").locator("a").evaluateAll((links) => links.map((l) => l.getAttribute("href")));
      expect(hrefs.filter((href) => href?.startsWith("/learn"))).toEqual([]);
   });
});

test.describe("when the catalog has published nothing", () => {
   test.use({ baseURL: EMPTY_ORIGIN });

   test("says so, with no card and no free chapter", async ({ page }) => {
      await page.goto("/");
      await expect(tracks(page).getByText("No Tracks are published yet.")).toBeVisible();
      await expect(tracks(page).getByRole("heading", { level: 3 })).toHaveCount(0);
      await expect(tracks(page).getByRole("link")).toHaveCount(0);
      await expect(hero(page).getByRole("link")).toHaveText(["Browse Tracks"]);
      await expect(page.locator("#knowledge")).toBeVisible();
   });
});

test.describe("when the catalog cannot be read", () => {
   test.use({ baseURL: REJECTED_ORIGIN });

   test("says the Tracks could not be loaded and offers Knowledge, with no card and no invented fallback", async ({ page }) => {
      const response = await page.goto("/");
      expect(response?.status()).toBe(200);
      await expect(tracks(page).getByText("Tracks could not be loaded right now.")).toBeVisible();
      await expect(tracks(page).getByRole("heading", { level: 3 })).toHaveCount(0);
      await expect(tracks(page).getByRole("link")).toHaveText(["Browse Knowledge"]);
      await expect(tracks(page).getByRole("link")).toHaveAttribute("href", "/knowledge");
      await expect(tracks(page).getByText("No Tracks are published yet.")).toHaveCount(0);
      await expect(hero(page).getByRole("link")).toHaveText(["Browse Tracks"]);
   });
});

test.describe("on a preview deployment", () => {
   test.use({ baseURL: PREVIEW_ORIGIN });

   test("shows the preview's Tracks, offers no free chapter for a Lesson that is not free, and is marked and kept out of search", async ({ page }) => {
      await page.goto("/");
      await expect(trackCards(page)).toHaveCount(CATALOG_TRACKS.length);
      await expect(hero(page).getByRole("link")).toHaveText(["Browse Tracks"]);
      await expect(page.getByRole("complementary", { name: "Preview" })).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
   });
});

test("shows the three planned prices, labelled planned, with no purchase control", async ({ page }) => {
   await page.goto("/");
   await expect(plans(page)).toHaveText(["Annual$50/yearPlanned", "3-year$100/3 yearsPlanned", "Lifetime$150/lifetimePlanned"]);
   await expect(pricing(page).getByText("Paid access is not available yet", { exact: false }).first()).toBeVisible();
   await expect(pricing(page).locator("button, form, input")).toHaveCount(0);
   await expect(pricing(page).getByRole("link")).toHaveCount(1); // Start Learning only
});

test("every link on the page has a real destination, with no placeholder", async ({ page }) => {
   await page.goto("/");
   const hrefs = await page.locator("a").evaluateAll((links) => links.map((l) => l.getAttribute("href")));
   expect(hrefs.length).toBeGreaterThan(0);
   expect(hrefs.filter((href) => !href || href === "#")).toEqual([]);
});

test.describe("FAQ without JavaScript", () => {
   test.use({ javaScriptEnabled: false });

   test("opens and shows each answer from its summary", async ({ page }) => {
      await page.goto("/");
      const faq = page.locator("#faq");
      await expect(faq.locator("details")).toHaveCount(5);
      const answer = faq.locator("details").first().locator("p");
      await expect(answer).toBeHidden();
      await faq.locator("summary").first().click();
      await expect(answer).toBeVisible();
      await expect(answer).toContainText("Each Track shows what is published today");
   });
});

test("the FAQ opens from the keyboard and exposes its state", async ({ page }) => {
   await page.goto("/");
   const summary = page.locator("#faq summary").nth(2);
   await summary.focus();
   await page.keyboard.press("Enter");
   await expect(page.locator("#faq details").nth(2)).toHaveJSProperty("open", true);
   await page.keyboard.press("Space");
   await expect(page.locator("#faq details").nth(2)).toHaveJSProperty("open", false);
   await expect(page.locator("#faq").getByRole("heading", { level: 3 })).toHaveCount(5);
});

test.describe("at 390px", () => {
   test.use({ viewport: { width: 390, height: 844 } });

   test("the testimonial pause button and every FAQ summary are at least 44px high", async ({ page }) => {
      await page.goto("/");
      const heights = async (selector: string) => page.locator(selector).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      expect(Math.min(...(await heights('button:has-text("Pause testimonials")')))).toBeGreaterThanOrEqual(44);
      expect(Math.min(...(await heights("#faq summary")))).toBeGreaterThanOrEqual(44);
   });
});

test("the testimonials drift, and the pause button stops them", async ({ page }) => {
   await page.goto("/");
   const row = page.locator(".testimonial-scroll-left");
   await expect(row).toHaveCSS("animation-play-state", "running");
   await page.getByRole("button", { name: "Pause testimonials" }).click();
   await expect(row).toHaveCSS("animation-play-state", "paused");
   await page.getByRole("button", { name: "Play testimonials" }).click();
   await expect(row).toHaveCSS("animation-play-state", "running");
});

test.describe("reduced motion", () => {
   test.use({ reducedMotion: "reduce" });

   test("stops the testimonials, which scroll by hand, and removes the pause button", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".testimonial-scroll-left")).toHaveCSS("animation-name", "none");
      await expect(page.getByRole("button", { name: /testimonials/i })).toBeHidden();
      const row = page.getByRole("list", { name: "Testimonials, first row" });
      expect(await row.evaluate((el) => el.parentElement!.scrollWidth > el.parentElement!.clientWidth)).toBe(true);
      await expect(row.getByRole("figure")).toHaveCount(4);
   });

   test("collapses the track cards' hover transitions", async ({ page }) => {
      await page.goto("/");
      const card = trackCards(page).first();
      expect(await card.evaluate((a) => parseFloat(getComputedStyle(a).transitionDuration))).toBeLessThan(0.001);
      expect(await card.locator("svg").last().evaluate((svg) => parseFloat(getComputedStyle(svg).transitionDuration))).toBeLessThan(0.001);
   });
});

for (const [width, height] of [
   [320, 700],
   [390, 844],
   [768, 1024],
   [1024, 768],
   [1440, 900],
] as const) {
   test.describe(`at ${width}px`, () => {
      test.use({ viewport: { width, height } });

      test("has no horizontal overflow, and every track card fits the viewport", async ({ page }) => {
         await page.goto("/");
         expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
         const boxes = await trackCards(page).evaluateAll((links) => links.map((l) => ({ x: l.getBoundingClientRect().x, right: l.getBoundingClientRect().right })));
         for (const box of boxes) {
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.right).toBeLessThanOrEqual(width);
         }
      });

      test(`${width >= 768 ? "lays the three plans in a row" : "stacks the three plans"} inside the viewport`, async ({ page }) => {
         await page.goto("/");
         const boxes = await plans(page).evaluateAll((items) =>
            items.map((item) => {
               const { x, y, right } = item.getBoundingClientRect();
               return { x: Math.round(x), y: Math.round(y + window.scrollY), right: Math.round(right) };
            }),
         );
         expect(boxes).toHaveLength(3);
         expect(new Set(boxes.map((box) => (width >= 768 ? box.y : box.x))).size).toBe(1);
         expect(Math.max(...boxes.map((box) => box.right))).toBeLessThanOrEqual(width);
      });
   });
}

// The homepage carries the pre-P0 palette, so its contrast is checked in both themes (WCAG A and AA only).
for (const colorScheme of ["light", "dark"] as const) {
   test.describe(`${colorScheme} theme`, () => {
      test.use({ colorScheme, reducedMotion: "reduce" });

      for (const width of [390, 1440]) {
         test(`the homepage has no WCAG A or AA violation at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.goto("/");
            await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
            const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
            expect(violations.map(({ id, nodes }) => `${id} on ${nodes.length} node(s)`)).toEqual([]);
         });
      }
   });
}
