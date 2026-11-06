import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import fixture from "./fixture.json";
import { expect, FAKE_AUTH_ORIGIN, ITEM_API_ORIGIN, READER_ORIGIN, test } from "./harness";

// P7-T46: completion marks in the Track page's leading slot, on the reader build (Prepare flag on, item-state double as API).
// Its own Track and items, so no state is shared with readerControls.spec.ts.
const TRACK = "p2-t4-curriculum";
const DONE = "lesson.p2-t4-foundations";
const OPEN = "problem.p2-t4-practice";
const HIDDEN = "lesson.p2-t4-premium-depth";
const { token, user } = fixture.identities.unentitled;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test.use({ baseURL: READER_ORIGIN });

const log = async (request: APIRequestContext) => (await (await request.get(`${ITEM_API_ORIGIN}/__item-state-log`)).json()) as string[];
const row = (page: Page, title: RegExp) => page.getByRole("navigation", { name: /outline$/ }).getByRole("link", { name: title });
const slot = (page: Page, title: RegExp) => row(page, title).locator('[data-slot="entry-leading"]');
const boxOf = async (page: Page, title: RegExp) => ({ row: await row(page, title).boundingBox(), slot: await slot(page, title).boundingBox() });

async function seed(request: APIRequestContext, id: string, completed: boolean) {
   await request.delete(`${ITEM_API_ORIGIN}/__item-state?user=${user.id}&content=${id}`);
   if (completed) {
      const sent = await request.patch(`${ITEM_API_ORIGIN}/me/prep/item-state/${id}`, {
         headers: { authorization: `Bearer ${token}` },
         data: { version: 0, completed: true },
      });
      expect(sent.ok()).toBe(true);
   }
}

test.describe("signed in, M2 on", () => {
   test.use({ identity: "unentitled" });

   test.beforeAll(async ({ request }) => {
      await seed(request, DONE, true);
      await seed(request, OPEN, false);
      await seed(request, HIDDEN, false);
   });

   test("marks the completed Lesson, leaves the others plain, and moves nothing when the mark arrives", async ({ page }) => {
      let release = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route(`${ITEM_API_ORIGIN}/me/prep/item-state/*`, async (route) => {
         await held;
         await route.continue();
      });
      await page.goto(`/tracks/${TRACK}`);
      const foundations = /Synthetic Foundations Lesson/;
      await expect(slot(page, foundations)).toBeVisible();
      const before = await Promise.all([boxOf(page, foundations), boxOf(page, /Synthetic Practice Step/)]);
      expect(await page.locator('[data-state="completed"]').count()).toBe(0);

      release();
      await expect(slot(page, foundations)).toHaveAttribute("data-state", "completed");
      const after = await Promise.all([boxOf(page, foundations), boxOf(page, /Synthetic Practice Step/)]);
      expect(after).toEqual(before);
      expect(before[0].slot).toMatchObject({ width: 32, height: 32 });
      await expect(row(page, foundations)).toHaveAccessibleName(/^Completed\s*Synthetic Foundations Lesson/);
      await expect(slot(page, /Synthetic Practice Step/)).not.toHaveAttribute("data-state", "completed");
      await expect(row(page, foundations)).toHaveAttribute("href", /\/lessons\//);
   });

   test("asks for the capability, then reads only the open Module's entries, and writes nothing", async ({ page, request }) => {
      const before = (await log(request)).length;
      const origins = new Set<string>();
      page.on("request", (sent) => origins.add(new URL(sent.url()).origin));
      await page.goto(`/tracks/${TRACK}`);
      await expect(slot(page, /Synthetic Foundations Lesson/)).toHaveAttribute("data-state", "completed");
      await page.waitForTimeout(500);
      // The browser reaches no catalog origin: beyond the app and its sign-in service, it calls only the item-state API.
      expect([...origins].filter((origin) => origin !== READER_ORIGIN && origin !== FAKE_AUTH_ORIGIN)).toEqual([ITEM_API_ORIGIN]);
      const made = (await log(request)).slice(before);
      expect(made[0]).toBe("GET /me/prep/features");
      expect(made.filter((line) => line.includes(DONE))).toEqual([`GET /me/prep/item-state/${DONE}`]);
      expect(made.filter((line) => line.includes(HIDDEN))).toEqual([]);
      expect(made.every((line) => line.startsWith("GET "))).toBe(true);

      await page.getByRole("button", { name: /^Module 2 /i }).click();
      await expect.poll(async () => (await log(request)).slice(before).filter((line) => line.includes(HIDDEN)).length).toBe(1);
   });

   test("leaves the mark out of the tab order: the entry links are the only stops, in order", async ({ page }) => {
      await page.goto(`/tracks/${TRACK}`);
      await expect(slot(page, /Synthetic Foundations Lesson/)).toHaveAttribute("data-state", "completed");
      await page.getByRole("button", { name: /^Module 1 /i }).focus();
      const stops: string[] = [];
      for (let press = 0; press < 3; press++) {
         await page.keyboard.press("Tab");
         stops.push(await page.evaluate(() => `${document.activeElement?.tagName}:${(document.activeElement?.textContent ?? "").trim().slice(0, 40)}`));
      }
      expect(stops[0]).toMatch(/^A:Completed\s*Synthetic Foundations Lesson/);
      expect(stops[1]).toMatch(/^A:Synthetic Practice Step/);
      expect(stops[2]).toMatch(/^BUTTON:Module 2/);
      expect(await page.locator('[data-slot="entry-leading"] :is(a, button, [tabindex])').count()).toBe(0);
   });

   for (const colorScheme of ["light", "dark"] as const) {
      for (const width of [390, 1440]) {
         test.describe(`${colorScheme} at ${width}px`, () => {
            test.use({ colorScheme, viewport: { width, height: 900 } });

            test("has no WCAG A or AA violation with a mark shown, and no horizontal overflow", async ({ page }) => {
               await page.goto(`/tracks/${TRACK}`);
               await expect(slot(page, /Synthetic Foundations Lesson/)).toHaveAttribute("data-state", "completed");
               const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
               expect(violations.map(({ id, nodes }) => `${id} on ${nodes.length} node(s)`)).toEqual([]);
               expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
            });
         });
      }
   }
});

test.describe("signed out", () => {
   test.use({ identity: "signed-out" });

   test("shows no mark and makes no request to the item-state API", async ({ page, request }) => {
      const before = (await log(request)).length;
      await page.goto(`/tracks/${TRACK}`);
      await expect(row(page, /Synthetic Foundations Lesson/)).toBeVisible();
      await page.waitForTimeout(500);
      expect(await page.locator('[data-state="completed"]').count()).toBe(0);
      expect((await log(request)).slice(before)).toEqual([]);
   });
});
