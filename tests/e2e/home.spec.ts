import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import fixture from "./catalog/fixture.json";
import { EMPTY_ORIGIN, expect, ISOLATED_API_ORIGIN, ISOLATED_ORIGIN, PREVIEW_ORIGIN, REJECTED_ORIGIN, test } from "./catalog/harness";

// Homepage: Tracks lead and are the published catalog Tracks; Knowledge supports them. Look and feel is validated by hand.
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** What the fake API's `GET /catalog/tracks` returns for the default deployment: every fixture Track, by id. */
const CATALOG_TRACKS = [...fixture.tracks].sort(byId);
const FIRST_PROBLEM = fixture.items.filter((item) => item.type === "problem").sort(byId)[0];
const PROBLEMS_PATH = "/catalog/items";
const FREE_CHAPTER_PATH = "/catalog/items/lesson/anatomy-of-a-model-request/meta";
const FREE_CHAPTER_HREF = "/lessons/anatomy-of-a-model-request";
const READ_FREE_CHAPTER = "Read a free chapter";

const KNOWLEDGE_HREFS = ["/knowledge?group=core-concepts", "/knowledge?group=technologies-research", "/knowledge?group=patterns", "/knowledge?group=quick-references", "/knowledge"];

const hero = (page: Page) => page.getByRole("region", { name: /Crack Your Next/ });
const tracks = (page: Page) => page.getByRole("region", { name: "Choose Your Track" });
const trackCards = (page: Page) => tracks(page).getByRole("list").last().getByRole("link");
const pricing = (page: Page) => page.locator("#pricing");
const plans = (page: Page) => pricing(page).getByRole("list", { name: "Pricing plans" }).getByRole("listitem");

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

   test("loading / reads at most the Track list, the free Lesson's metadata and one page of one Problem's metadata, all on the server and none from the browser", async ({ page, request }) => {
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
      expect(added.length, "the homepage read more than three catalog endpoints").toBeLessThanOrEqual(3);
      expect(added.map((entry) => entry.path).filter((path) => ![PROBLEMS_PATH, "/catalog/tracks", FREE_CHAPTER_PATH].includes(path))).toEqual([]);
      for (const entry of added) expect(entry.presented).toBeNull();
      for (const entry of added.filter((e) => e.path === PROBLEMS_PATH)) expect(new URLSearchParams(entry.query)).toEqual(new URLSearchParams("type=problem&limit=1"));
      for (const entry of added.filter((e) => e.path !== PROBLEMS_PATH)) expect(entry.query).toBe("");
      // Whether the 60-second data cache was warm decides how many of the three this load made; together they are the only three ever.
      expect(new Set(log.map((entry) => entry.path))).toEqual(new Set(["/catalog/tracks", FREE_CHAPTER_PATH, PROBLEMS_PATH]));
      expect(browserRequests, "the browser requested catalog data or prefetched a catalog route").toEqual([]);
   });

   test("offers the free chapter, opening its Lesson, when the API confirms the Lesson is free", async ({ page }) => {
      await page.goto("/");
      await expect(hero(page).getByRole("link", { name: READ_FREE_CHAPTER })).toHaveAttribute("href", FREE_CHAPTER_HREF);
      await expect(hero(page).getByRole("link")).toHaveText(["Browse Tracks", READ_FREE_CHAPTER]);
   });

   test("keyboard moves from Browse Tracks to Read a free chapter, with a solid 2px focus ring, past the animation pause control, then to the first Track card", async ({ page }) => {
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
      await expect(hero(page).getByRole("button", { name: "Pause animation" })).toBeFocused();

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

test("keyboard reaches the hero action, the animation pause control, then the Track cards in order, each with a solid 2px focus ring", async ({ page }) => {
   await page.goto("/");
   await page.keyboard.press("Tab"); // skip link
   await page.keyboard.press("Enter");
   await expect(page.locator("#main-content")).toBeFocused();

   await page.keyboard.press("Tab");
   await expect(hero(page).getByRole("link", { name: "Browse Tracks" })).toBeFocused();

   await page.keyboard.press("Tab");
   await expect(hero(page).getByRole("button", { name: "Pause animation" })).toBeFocused();

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
      await expect(page.getByRole("region", { name: "Choose Your Track" })).toBeVisible();
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

test("shows the three prices with no Planned label, says nothing is for sale, and has no purchase control", async ({ page }) => {
   await page.goto("/");
   await expect(plans(page)).toHaveText(["Annual$50/year", "3-year$100/3 years", "Lifetime$150/lifetime"]);
   await expect(pricing(page).getByText("Planned", { exact: true })).toHaveCount(0);
   await expect(pricing(page).getByText("Paid access is not currently available, and nothing is for sale.")).toBeVisible();
   await expect(pricing(page).locator("button, form, input")).toHaveCount(0);
   await expect(pricing(page).getByRole("link")).toHaveCount(1); // Start Learning only
});

test("puts the Tracks right after the hero, ahead of the sample statistics", async ({ page }) => {
   await page.goto("/");
   const top = (locator: Locator) => locator.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
   const [heroTop, tracksTop, statsTop, knowledgeTop] = [
      await top(hero(page)),
      await top(tracks(page)),
      await top(page.getByText("Sample statistics: illustrative figures, not verified results.")),
      await top(page.locator("#knowledge")),
   ];
   expect(heroTop).toBeLessThan(tracksTop);
   expect(tracksTop).toBeLessThan(statsTop);
   expect(statsTop).toBeLessThan(knowledgeTop);
   await expect(trackCards(page).first()).toBeVisible();
   await expect(page.getByText("80+", { exact: true })).toBeVisible();
});

test("shows all eight testimonials, Emily C. included, each marked a sample", async ({ page }) => {
   await page.goto("/");
   const section = page.getByRole("region", { name: "Sample Testimonials" });
   await expect(section.getByText("not real customer testimonials", { exact: false })).toBeVisible();
   for (const row of ["Testimonials, first row", "Testimonials, second row"]) await expect(section.getByRole("list", { name: row }).getByRole("figure")).toHaveCount(4);
   await expect(section.getByRole("figure").filter({ hasText: "Emily C." })).toContainText("Premium was a no-brainer");
   for (const figure of await section.getByRole("figure").all()) await expect(figure).toContainText("Sample, not a real customer");
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

const TOPICS = ["ML and AI engineering", "ML platform design", "LLM platform design", "GenAI native design", "ML system design"];
const topicStep = 2400;

test("the hero's headline loops through every phrase, in order, for more than two rotations, animates the stage and logs no console error", async ({ page }) => {
   test.setTimeout(60_000);
   const errors: string[] = [];
   page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
   page.on("pageerror", (error) => errors.push(error.message));
   await page.goto("/");
   const h1 = hero(page).getByRole("heading", { level: 1 });
   await expect(h1).toHaveAccessibleName("Crack Your Next ML and AI engineering Interview");
   const visibleTopic = () => h1.locator("[aria-hidden='true'] > span").evaluateAll((spans) => spans.filter((s) => getComputedStyle(s).opacity === "1").map((s) => s.textContent));
   await expect.poll(visibleTopic).toEqual([TOPICS[0]]);
   const seen: string[] = [];
   for (let step = 1; step <= TOPICS.length * 2 + 1; step++) {
      const next = TOPICS[step % TOPICS.length];
      await expect.poll(visibleTopic, { timeout: topicStep * 2 }).toEqual([next]);
      seen.push(next);
   }
   expect(seen.slice(TOPICS.length - 1, TOPICS.length + 1), "wraps from the last phrase back to the first").toEqual([TOPICS[0], TOPICS[1]]);
   await expect(h1).toHaveAccessibleName("Crack Your Next ML and AI engineering Interview");
   await expect(page.locator("[data-hero-stage] .home-rise")).toHaveCSS("animation-name", "home-rise");
   await expect(page.locator("[data-hero-stage] .home-node").first()).toBeVisible();
   expect(errors).toEqual([]);
});

test("the headline does not move the layout while it rotates", async ({ page }) => {
   await page.goto("/");
   const h1 = hero(page).getByRole("heading", { level: 1 });
   const box = () => h1.evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
   const first = await box();
   const visibleTopic = () => h1.locator("[aria-hidden='true'] > span").evaluateAll((spans) => spans.filter((s) => getComputedStyle(s).opacity === "1").map((s) => s.textContent));
   for (const topic of TOPICS.slice(1)) {
      await expect.poll(visibleTopic, { timeout: topicStep * 2 }).toEqual([topic]);
      expect(await box()).toEqual(first);
   }
});

test("the hero's pause control freezes the headline, the ambient loops and the packet together, and play resumes them", async ({ page }) => {
   await page.goto("/");
   const h1 = hero(page).getByRole("heading", { level: 1 });
   const visibleTopic = () => h1.locator("[aria-hidden='true'] > span").evaluateAll((spans) => spans.filter((s) => getComputedStyle(s).opacity === "1").map((s) => s.textContent));
   const floating = page.locator("[data-hero-stage] .home-pop-in").first();
   await expect(floating).toHaveCSS("animation-play-state", /^running(, running)?$/);
   await expect.poll(visibleTopic).toEqual([TOPICS[1]]); // the headline has moved on, so the page has hydrated and the click below reaches a live button
   const pause = page.getByRole("button", { name: "Pause animation" });
   await expect(pause).toHaveAccessibleDescription(/rotating headline/i);
   await pause.click();
   await expect(floating).toHaveCSS("animation-play-state", /^paused(, paused)?$/);
   const frozen = await visibleTopic();
   await page.waitForTimeout(topicStep * 2 + 400);
   expect(await visibleTopic()).toEqual(frozen);
   await page.getByRole("button", { name: "Play animation" }).click();
   await expect(floating).toHaveCSS("animation-play-state", /^running(, running)?$/);
   await expect.poll(async () => (await visibleTopic())[0], { timeout: topicStep * 2 }).not.toBe(frozen[0]);
});

test.describe("hero popups", () => {
   test.use({ baseURL: ISOLATED_ORIGIN }); // the deployment whose free chapter is confirmed, so both hero actions are present
   const stageText = (page: Page) => page.locator("[data-hero-stage]").evaluate((el) => el.parentElement!.textContent ?? "");

   test("show the first listed Track and Problem, the Knowledge groups and no interview-simulation content", async ({ page }) => {
      await page.goto("/");
      const text = await stageText(page);
      for (const expected of [CATALOG_TRACKS[0].title, FIRST_PROBLEM.title, "Core Concepts", "Technologies & Research", "Patterns"]) expect(text, expected).toContain(expected);
      for (const stale of ["Mock round", "Interviewer", "Round clock", "Chapter complete", "Next up", "Saved to notes", "Deep dive", "Clarify", "Docs · 50M", "18 · ~8h", "PRO", "FREE"]) expect(text, stale).not.toContain(stale);
      expect(text).not.toMatch(/\b\d{2}:\d{2}\b/);
   });

   test("never intercept the pointer: both hero actions and the pause control are what a click at their centre reaches", async ({ page }) => {
      await page.goto("/");
      for (const target of [hero(page).getByRole("link", { name: "Browse Tracks" }), hero(page).getByRole("link", { name: READ_FREE_CHAPTER }), page.getByRole("button", { name: "Pause animation" })]) {
         const hit = await target.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return top === el || el.contains(top);
         });
         expect(hit).toBe(true);
      }
      expect(await page.locator("[data-hero-stage] .home-pop-card, main > section .home-pop-card").evaluateAll((els) => els.map((el) => getComputedStyle(el).pointerEvents))).not.toContain("auto");
   });

   for (const [width, height, floatingCards] of [
      [1440, 900, 6],
      [1280, 800, 2],
      [390, 844, 0],
   ] as const) {
      test(`at ${width}px ${floatingCards} cards show, clear of the headline text and the actions and inside the page`, async ({ page }) => {
         await page.setViewportSize({ width, height });
         await page.goto("/");
         await page.waitForTimeout(2600); // the cards finish popping in
         const cards = await page.locator(".home-pop-card").evaluateAll((els) => els.filter((el) => el.checkVisibility()).map((el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top + window.scrollY, r: r.right, b: r.bottom + window.scrollY }; }));
         expect(cards).toHaveLength(floatingCards);
         const protectedRects = await hero(page).evaluate((section) => {
            const lines: DOMRect[] = [];
            const range = document.createRange();
            range.selectNodeContents(section.querySelector("h1")!);
            lines.push(...range.getClientRects());
            for (const el of section.querySelectorAll("a, button, [class*='max-w-[680px]']")) lines.push(el.getBoundingClientRect());
            return lines.filter((r) => r.width > 0).map((r) => ({ l: r.left, t: r.top + window.scrollY, r: r.right, b: r.bottom + window.scrollY }));
         });
         for (const card of cards) {
            for (const target of protectedRects) {
               expect(card.r <= target.l || card.l >= target.r || card.b <= target.t || card.t >= target.b, `a card covers text or an action: ${JSON.stringify({ card, target })}`).toBe(true);
            }
            expect(card.l, "a card leaves the page on the left").toBeGreaterThanOrEqual(-1);
            expect(card.r, "a card leaves the page on the right").toBeLessThanOrEqual(width + 1);
         }
         expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      });
   }
});

test.describe("when the catalog has no Problem and no Track", () => {
   test.use({ baseURL: EMPTY_ORIGIN });

   test("the popups fall back to neutral category cards, with no invented item", async ({ page }) => {
      await page.goto("/");
      const text = await page.locator("[data-hero-stage]").evaluate((el) => el.parentElement!.textContent ?? "");
      expect(text).toContain("Interview Problems");
      expect(text).toContain("Choose a Track");
      expect(text).not.toContain(FIRST_PROBLEM.title);
      expect(text).not.toContain(CATALOG_TRACKS[0].title);
   });
});

const html = (page: Page) => page.locator("html");
const header = (page: Page) => page.getByRole("banner");
/** Distance from the viewport top to the section, less its scroll margin: 0 when the section sits exactly where an anchor should leave it. */
const offBy = (page: Page, selector: string) =>
   page.locator(selector).evaluate((el) => Math.round(el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).scrollMarginTop)));

test("the homepage uses the prototype's three self-hosted faces, and the shared header and other routes do not", async ({ page }) => {
   await page.goto("/");
   await page.evaluate(() => document.fonts.ready);
   const family = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).fontFamily);
   const loaded = await page.evaluate(() => [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family));
   expect(loaded.length).toBeGreaterThanOrEqual(2); // Newsreader and Inter load for the first view; JetBrains Mono loads on use
   expect(await family("main[data-home] p")).not.toBe(await family("[data-site-header] a"));
   const requests: string[] = [];
   page.on("request", (request) => requests.push(request.url()));
   await page.goto("/login");
   expect(requests.filter((url) => /\.woff2/.test(url))).toEqual([]);
});

test.describe("smooth scrolling (Lenis, homepage only)", () => {
   test("exists while the homepage is mounted and is destroyed by a client navigation away", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
      await page.goto("/");
      await expect(html(page)).toHaveClass(/\blenis\b/);
      await header(page).getByRole("link", { name: "Knowledge", exact: true }).first().click();
      await expect(page).toHaveURL(/\/knowledge$/);
      await expect(html(page)).not.toHaveClass(/lenis/);
      await page.goBack();
      await expect(html(page)).toHaveClass(/\blenis\b/);
      expect(await page.evaluate(() => document.querySelectorAll("html.lenis").length)).toBe(1);
      expect(errors).toEqual([]);
   });

   test("other routes keep native scrolling: no instance, and the reader's own fragment handling is untouched", async ({ page }) => {
      await page.goto("/knowledge");
      await expect(page.locator("main")).toBeVisible();
      await expect(html(page)).not.toHaveClass(/lenis/);
      await page.goto("/login");
      await expect(html(page)).not.toHaveClass(/lenis/);
   });

   for (const [name, selector] of [
      ["Tracks", "#tracks"],
      ["Pricing", "#pricing"],
      ["FAQ", "#faq"],
   ] as const) {
      test(`the header's ${name} link scrolls with easing, lands the section at its scroll margin, and keeps #${selector.slice(1)} in the URL`, async ({ page }) => {
         await page.goto("/");
         await expect(html(page)).toHaveClass(/\blenis\b/);
         await header(page).getByRole("link", { name, exact: true }).first().click();
         const seen = await page.evaluate(
            () =>
               new Promise<number[]>((resolve) => {
                  const values: number[] = [];
                  const end = performance.now() + 1200;
                  const tick = () => (values.push(Math.round(scrollY)), performance.now() < end ? requestAnimationFrame(tick) : resolve(values));
                  tick();
               }),
         );
         const final = seen.at(-1)!;
         expect(final).toBeGreaterThan(900);
         expect(seen.some((y) => y > 0 && y < final - 50), "an intermediate position was drawn").toBe(true);
         await expect.poll(() => offBy(page, selector)).toBeLessThanOrEqual(2);
         expect(Math.abs(await offBy(page, selector))).toBeLessThanOrEqual(2);
         await expect(page).toHaveURL(new RegExp(`${selector}$`));
      });
   }

   test("the hero and closing Browse Tracks actions land on the Tracks section", async ({ page }) => {
      await page.goto("/");
      await expect(html(page)).toHaveClass(/\blenis\b/);
      await hero(page).getByRole("link", { name: "Browse Tracks" }).click();
      await expect.poll(() => offBy(page, "#tracks")).toBe(0);
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await page.getByRole("region", { name: "Pick a Track and start reading" }).getByRole("link", { name: "Browse Tracks" }).click();
      await expect.poll(() => offBy(page, "#tracks")).toBe(0);
   });

   test("a direct load with a fragment lands on the section", async ({ page }) => {
      await page.goto("/#pricing");
      await expect(html(page)).toHaveClass(/\blenis\b/);
      await expect.poll(() => offBy(page, "#pricing")).toBeLessThanOrEqual(2);
   });

   test("a link from another route lands on the fragment, and back and forward move through the history", async ({ page }) => {
      await page.goto("/knowledge");
      await header(page).getByRole("link", { name: "Tracks", exact: true }).first().click();
      await expect(page).toHaveURL(/\/#tracks$/);
      await expect.poll(() => offBy(page, "#tracks")).toBe(0);
      await page.goBack();
      await expect(page).toHaveURL(/\/knowledge$/);
      await page.goForward();
      await expect(page).toHaveURL(/\/#tracks$/);
      await expect.poll(() => offBy(page, "#tracks")).toBe(0);
      await expect(html(page)).toHaveClass(/\blenis\b/);
   });

   test("keyboard scrolling and focus are native: Tab reaches the skip link first, and End and Home move the page", async ({ page }) => {
      await page.goto("/");
      await expect(html(page)).toHaveClass(/\blenis\b/);
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: /skip to/i })).toBeFocused();
      await page.locator("body").click({ position: { x: 5, y: 300 } });
      await page.keyboard.press("End");
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(3000);
      await page.keyboard.press("Home");
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
   });
});

test("the statistics count up with CSS only and end on the exact existing values", async ({ page }) => {
   await page.goto("/");
   const figures = page.locator("li:has(.home-count)");
   await expect(figures).toHaveCount(4);
   const shown = () => page.locator(".home-count").evaluateAll((els) => els.map((el) => getComputedStyle(el).getPropertyValue("--n")));
   expect(await shown(), "below the fold, the digits wait at 0").toEqual(["0", "0", "0", "0"]);
   await figures.first().scrollIntoViewIfNeeded();
   await page.evaluate(() => scrollBy({ top: 400, behavior: "instant" }));
   await expect.poll(shown).toEqual(["80", "5", "90", "6"]);
   await expect(figures.nth(0)).toContainText("80+");
   await expect(figures.nth(1)).toContainText("5K+");
   await expect(figures.nth(2)).toContainText("90%");
   await expect(figures.nth(3)).toContainText("6");
   await expect(page.getByText("Sample statistics: illustrative figures, not verified results.")).toBeVisible();
});

test.describe("statistics without JavaScript", () => {
   test.use({ javaScriptEnabled: false });

   test("show every final value", async ({ page }) => {
      await page.goto("/");
      const band = page.locator("ul:has(.home-count)");
      for (const value of ["80+", "5K+", "90%", "6"]) await expect(band.getByText(value, { exact: true })).toHaveCount(1);
      await band.scrollIntoViewIfNeeded();
      await expect(band).toBeVisible();
   });
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

   test("creates no Lenis instance, so anchors, keyboard and touch scroll natively and the statistics show their final values at once", async ({ page }) => {
      await page.goto("/");
      await expect(html(page)).not.toHaveClass(/lenis/);
      await header(page).getByRole("link", { name: "FAQ", exact: true }).first().click();
      await expect(page).toHaveURL(/#faq$/);
      await expect.poll(() => offBy(page, "#faq")).toBeLessThanOrEqual(2);
      const shown = await page.locator(".home-count").evaluateAll((els) => els.map((el) => getComputedStyle(el).getPropertyValue("--n")));
      expect(shown).toEqual(["80", "5", "90", "6"]);
   });

   test("keeps the headline on ML and AI engineering, with no rotation", async ({ page }) => {
      await page.goto("/");
      const h1 = hero(page).getByRole("heading", { level: 1 });
      const visibleTopic = () => h1.locator("[aria-hidden='true'] > span").evaluateAll((spans) => spans.filter((s) => getComputedStyle(s).opacity === "1").map((s) => s.textContent));
      await page.waitForTimeout(topicStep * 2 + 600);
      expect(await visibleTopic()).toEqual(["ML and AI engineering"]);
   });

   test("stops the hero's motion and hides its pause control", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: /animation$/ })).toBeHidden();
      await expect(page.locator("[data-hero-stage] .home-rise")).toHaveCSS("animation-name", "none");
      await expect(page.locator("[data-hero-stage] .home-pop-in").first()).toHaveCSS("animation-name", "none");
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
