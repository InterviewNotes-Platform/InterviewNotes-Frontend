import type { APIRequestContext } from "@playwright/test";
import fixture from "./catalog/fixture.json";
import { STARTING_API_ORIGIN, STARTING_ORIGIN, expect, test } from "./catalog/harness";

// A free-tier API that is starting, simulated: the API double holds its health answer for longer than Proxy's budget (5 s),
// until the test wakes it. The production build on STARTING_ORIGIN, which no other test uses, reads that double; nothing
// here wakes a hosted API.
const WAKE_MS = 60_000;
const HEADING = "This page is temporarily unavailable";
const LESSON = fixture.items.find((item) => item.id === "lesson.catalog-e2e-free")!;
const TRACK = fixture.tracks.find((track) => track.slug === "p3-single")!;
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const CRAWLER = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const PAGES = [
   { name: "Lesson", href: `/lessons/${LESSON.slug}`, title: LESSON.title },
   { name: "Track", href: `/tracks/${TRACK.slug}`, title: TRACK.title },
];

const wake = (request: APIRequestContext, delayMs = WAKE_MS) =>
   request.put(`${STARTING_API_ORIGIN}/__fault`, { params: { path: "/content/health", delayMs } });
const awake = (request: APIRequestContext) => request.delete(`${STARTING_API_ORIGIN}/__fault`, { params: { path: "/content/health" } });

test.describe("a catalog page while the API is starting (production mode)", () => {
   test.use({ baseURL: STARTING_ORIGIN });
   test.describe.configure({ mode: "serial", timeout: 90_000 });
   test.afterEach(({ request }) => awake(request));

   for (const { name, href, title } of PAGES) {
      test(`${name}: every client gets the same temporary 503 within the budget, never stored, indexed or naming the item`, async ({ request }) => {
         await wake(request);
         for (const ua of [BROWSER, CRAWLER]) {
            const started = Date.now();
            const response = await request.get(`${STARTING_ORIGIN}${href}`, { headers: { "user-agent": ua } });
            expect(Date.now() - started, "the request waited out the starting API").toBeLessThan(10_000);
            expect(response.status()).toBe(503);
            expect(response.headers()["retry-after"]).toBe("15");
            expect(response.headers()["cache-control"]).toBe("private, no-store");
            expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
            const html = await response.text();
            expect(html).toContain(HEADING);
            expect(html).not.toContain(title);
         }
      });

      test(`${name}: the page reloads itself once the API answers, with its own status`, async ({ browser, request }) => {
         // Its own context: the harness's page fails any test whose console logs an error, and Chrome logs every 503 document.
         const context = await browser.newContext({ baseURL: STARTING_ORIGIN });
         const page = await context.newPage();
         const errors: string[] = [];
         page.on("pageerror", (error) => errors.push(error.message));
         try {
            await wake(request);
            expect((await page.goto(href))?.status()).toBe(503);
            await expect(page.getByRole("heading", { level: 1, name: HEADING })).toBeVisible();
            await expect(page.getByRole("status")).toContainText("reload automatically in 15 seconds");
            await awake(request);
            const settled = page.waitForResponse((r) => r.url() === `${STARTING_ORIGIN}${href}` && r.request().isNavigationRequest(), { timeout: 30_000 });
            expect((await settled).status()).toBe(200);
            await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
            expect(errors).toEqual([]);
         } finally {
            await context.close();
         }
      });
   }

   test("without JavaScript: reload guidance and a Try again link that brings the page in", async ({ browser, request }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, baseURL: STARTING_ORIGIN });
      const page = await context.newPage();
      try {
         await wake(request);
         expect((await page.goto(PAGES[0].href))?.status()).toBe(503);
         // Role and text locators skip <noscript>; its paragraph is rendered when scripting is off.
         await expect(page.locator("noscript p")).toContainText("Reload this page in a minute");
         await awake(request);
         await page.getByRole("link", { name: "Try again" }).click();
         await expect(page.getByRole("heading", { level: 1, name: PAGES[0].title })).toBeVisible();
      } finally {
         await context.close();
      }
   });

   test("a missing item is a 503 while the API is starting, never a false 404, and a 404 once it answers", async ({ request }) => {
      const missing = `${STARTING_ORIGIN}/lessons/catalog-e2e-missing`;
      await wake(request);
      expect((await request.get(missing)).status()).toBe(503);
      await awake(request);
      expect((await request.get(missing)).status()).toBe(404);
   });

   test("an API that answers 5xx is temporarily unavailable too", async ({ request }) => {
      await request.put(`${STARTING_API_ORIGIN}/__fault`, { params: { path: "/content/health", status: 503 } });
      expect((await request.get(`${STARTING_ORIGIN}${PAGES[0].href}`)).status()).toBe(503);
   });
});
