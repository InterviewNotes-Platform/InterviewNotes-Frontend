import type { APIRequestContext } from "@playwright/test";
import fixture from "./catalog/fixture.json";
import { STARTING_API_ORIGIN, STARTING_ORIGIN, expect, test } from "./catalog/harness";

// A free-tier API that is starting, simulated: the API double holds every read of one page's paths for longer than the page's read
// budget (5 s). The production build on STARTING_ORIGIN, which no other test uses, reads that double; nothing here wakes a hosted API.
const WAKE_MS = 8000;
const PENDING = "Loading this page.";
const LESSON = fixture.items.find((item) => item.id === "lesson.catalog-e2e-free")!;
// A Track no Lesson here belongs to, so no earlier read has put it in this deployment's Data Cache.
const TRACK = fixture.tracks.find((track) => track.slug === "p3-single")!;
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const CRAWLER = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const PAGES = [
   // An item body is read uncached every time; a Track is a public read that the Data Cache keeps once the browser test has read it.
   { name: "Lesson", href: `/lessons/${LESSON.slug}`, api: `/catalog/items/lesson/${LESSON.slug}*`, title: LESSON.title, cached: false },
   { name: "Track", href: `/tracks/${TRACK.slug}`, api: `/catalog/tracks/${TRACK.slug}`, title: TRACK.title, cached: true },
];

const wake = (request: APIRequestContext, path: string) => request.put(`${STARTING_API_ORIGIN}/__fault`, { params: { path, delayMs: WAKE_MS } });
const awake = (request: APIRequestContext, path: string) => request.delete(`${STARTING_API_ORIGIN}/__fault`, { params: { path } });

test.describe("a catalog page while the API is starting (production mode)", () => {
   test.use({ baseURL: STARTING_ORIGIN });
   test.describe.configure({ mode: "serial", timeout: 90_000 });

   for (const { name, href, api, title, cached } of PAGES) {
      test(`${name}: a browser is told the page is loading within the budget, and the page arrives by the bounded refresh though every read stays slow`, async ({ page, request }) => {
         await wake(request, api);
         try {
            const started = Date.now();
            const response = await page.goto(href);
            expect(Date.now() - started, "the page waited for the starting API").toBeLessThan(WAKE_MS);
            expect(response?.status()).toBe(200);
            expect(response?.headers()["cache-control"]).toMatch(/no-store/);
            await expect(page.getByRole("status").filter({ hasText: PENDING })).toBeVisible();
            // The served document is what an indexer would keep; the live head changes while a refresh is in flight.
            expect(await response?.text()).toMatch(/<meta name="robots" content="noindex, nofollow"\/>/);
            await expect(page.getByText(title)).toHaveCount(0);
            // The refresh waits for its read (the pending screen stays meanwhile), so the API is never left behind by the budget.
            await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 40_000 });
            await expect(page.locator("[data-catalog-pending]")).toHaveCount(0);
         } finally {
            await awake(request, api);
         }
      });

      test(`${name}: a crawler waits for the whole page and its status, as before`, async ({ request }) => {
         await wake(request, api);
         try {
            const started = Date.now();
            const response = await request.get(`${STARTING_ORIGIN}${href}`, { headers: { "user-agent": CRAWLER } });
            if (!cached) expect(Date.now() - started, "the crawler was not made to wait for the API").toBeGreaterThanOrEqual(WAKE_MS);
            expect(response.status()).toBe(200);
            const html = await response.text();
            expect(html).toContain(title);
            expect(html).not.toContain(PENDING);
         } finally {
            await awake(request, api);
         }
      });
   }

   test("without JavaScript the pending page says to reload and links to it, and a reload once the API is up shows the page", async ({ browser, request }) => {
      const { href, api, title } = PAGES[0];
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await wake(request, api);
      try {
         await page.goto(href);
         // Playwright's text and role locators skip <noscript>, so these find its content by CSS.
         const fallback = page.locator("[data-catalog-pending] noscript");
         await expect(fallback.locator("p").first()).toContainText("This page is still loading, and it cannot refresh itself without JavaScript.");
         await expect(page.locator("[data-catalog-pending-js]")).toBeHidden();
         const reload = fallback.locator("a", { hasText: "Reload this page" });
         await expect(reload).toHaveAttribute("href", href);
         await awake(request, api);
         await reload.click();
         await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      } finally {
         await awake(request, api);
         await context.close();
      }
   });

   test("a missing item is a 404 to a crawler even while the API is slow, and a browser is never told it is missing before the API says so", async ({ page, request }) => {
      const api = "/catalog/items/lesson/catalog-e2e-missing*";
      await wake(request, api);
      try {
         const crawled = await request.get(`${STARTING_ORIGIN}/lessons/catalog-e2e-missing`, { headers: { "user-agent": CRAWLER } });
         expect(crawled.status()).toBe(404);
         const response = await page.goto("/lessons/catalog-e2e-missing");
         expect(response?.status()).toBe(200);
         await expect(page.getByRole("status").filter({ hasText: PENDING })).toBeVisible();
         await awake(request, api);
         // Asked as the browser asks (a document navigation), outside the page so the 404 is not a console error.
         const direct = await request.get(`${STARTING_ORIGIN}/lessons/catalog-e2e-missing`, { headers: { "user-agent": BROWSER, "sec-fetch-mode": "navigate" } });
         expect(direct.status()).toBe(404);
      } finally {
         await awake(request, api);
      }
   });
});
