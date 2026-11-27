import type { APIRequestContext } from "@playwright/test";
import fixture from "./catalog/fixture.json";
import { COLD_API_ORIGIN, COLD_ORIGIN, expect, test } from "./catalog/harness";

// A free-tier API that is starting, simulated: the API double holds every read of one page's paths for longer than the page's read
// budget (5 s). The production build on COLD_ORIGIN reads that double; nothing here wakes a hosted API.
const WAKE_MS = 8000;
const PENDING = "Loading this page.";
const LESSON = fixture.items.find((item) => item.id === "lesson.catalog-e2e-free")!;
const TRACK = fixture.tracks.find((track) => track.id === "track.catalog-e2e-home")!;
const CRAWLER = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const PAGES = [
   { name: "Lesson", href: `/lessons/${LESSON.slug}`, api: `/catalog/items/lesson/${LESSON.slug}*`, title: LESSON.title },
   { name: "Track", href: `/tracks/${TRACK.slug}`, api: `/catalog/tracks/${TRACK.slug}`, title: TRACK.title },
];

const wake = (request: APIRequestContext, path: string) => request.put(`${COLD_API_ORIGIN}/__fault`, { params: { path, delayMs: WAKE_MS } });
const awake = (request: APIRequestContext, path: string) => request.delete(`${COLD_API_ORIGIN}/__fault`, { params: { path } });

test.describe("a catalog page while the API is starting (production mode)", () => {
   test.use({ baseURL: COLD_ORIGIN });
   test.describe.configure({ mode: "serial", timeout: 90_000 });

   for (const { name, href, api, title } of PAGES) {
      test(`${name}: a browser is told the page is loading within the budget, and the page arrives by the bounded refresh`, async ({ page, request }) => {
         await wake(request, api);
         try {
            const started = Date.now();
            const response = await page.goto(href);
            expect(Date.now() - started, "the page waited for the starting API").toBeLessThan(WAKE_MS);
            expect(response?.status()).toBe(200);
            expect(response?.headers()["cache-control"]).toMatch(/no-store/);
            await expect(page.getByRole("status").filter({ hasText: PENDING })).toBeVisible();
            await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
            await expect(page.getByText(title)).toHaveCount(0);
            await awake(request, api);
            await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 30_000 });
            await expect(page.locator("[data-catalog-pending]")).toHaveCount(0);
         } finally {
            await awake(request, api);
         }
      });

      test(`${name}: a crawler waits for the whole page and its status, as before`, async ({ request }) => {
         await wake(request, api);
         try {
            const started = Date.now();
            const response = await request.get(`${COLD_ORIGIN}${href}`, { headers: { "user-agent": CRAWLER } });
            expect(Date.now() - started).toBeGreaterThanOrEqual(WAKE_MS);
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
         await expect(page.getByText("This page is still loading, and it cannot refresh itself without JavaScript.")).toBeVisible();
         await expect(page.getByRole("link", { name: "Reload this page" })).toHaveAttribute("href", href);
         await awake(request, api);
         await page.getByRole("link", { name: "Reload this page" }).click();
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
         const crawled = await request.get(`${COLD_ORIGIN}/lessons/catalog-e2e-missing`, { headers: { "user-agent": CRAWLER } });
         expect(crawled.status()).toBe(404);
         const response = await page.goto("/lessons/catalog-e2e-missing");
         expect(response?.status()).toBe(200);
         await expect(page.getByRole("status").filter({ hasText: PENDING })).toBeVisible();
         await awake(request, api);
         const direct = await page.goto("/lessons/catalog-e2e-missing");
         expect(direct?.status()).toBe(404);
      } finally {
         await awake(request, api);
      }
   });
});
