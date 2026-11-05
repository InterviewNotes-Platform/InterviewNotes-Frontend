import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import fixture from "./fixture.json";
import { canonical, expect, ITEM_API_ORIGIN, READER_ORIGIN, test } from "./harness";

// P7-T45: the signed-in reader controls, on the build that has the Prepare flag on and the item-state double as its API.
const LESSON = "lesson.p3-seq-one";
const PROBLEM = "problem.p3-seq-check";
const KNOWLEDGE = "knowledge.catalog-e2e-sections";
const ME = fixture.identities.unentitled.user.id;
const OFF = fixture.identities.entitled.user.id;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const ITEM_STATE_PATH = /^\/me\/prep\/(features|item-state\/(lesson|problem)\.[a-z0-9-]+(\/visit)?)$/;

test.use({ baseURL: READER_ORIGIN });
test.describe.configure({ mode: "serial" });

const log = async (request: APIRequestContext) => (await (await request.get(`${ITEM_API_ORIGIN}/__item-state-log`)).json()) as string[];
const about = (lines: string[], id: string) => lines.filter((line) => line.includes(id));
const reset = (request: APIRequestContext, user: string, content: string) =>
   request.delete(`${ITEM_API_ORIGIN}/__item-state?user=${user}&content=${content}`);
const controls = (page: Page) => page.getByRole("group", { name: /actions$/ });
const complete = (page: Page) => page.getByRole("button", { name: "Mark complete" });
const bookmark = (page: Page) => page.getByRole("button", { name: "Bookmark" });

test.describe("signed in, M2 on", () => {
   test.use({ identity: "unentitled" });

   for (const id of [LESSON, PROBLEM]) {
      test(`${id}: completes and bookmarks from the keyboard and keeps focus`, async ({ page, request }) => {
         await reset(request, ME, id);
         await page.goto(canonical(id));
         await expect(complete(page)).toBeEnabled();
         await expect(complete(page)).toHaveAttribute("aria-pressed", "false");

         await complete(page).focus();
         await page.keyboard.press("Space");
         await expect(complete(page)).toHaveAttribute("aria-pressed", "true");
         await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
         await expect(complete(page)).toBeFocused();

         await page.keyboard.press("Tab");
         await expect(bookmark(page)).toBeFocused();
         await page.keyboard.press("Enter");
         await expect(bookmark(page)).toHaveAttribute("aria-pressed", "true");

         await page.reload();
         await expect(complete(page)).toHaveAttribute("aria-pressed", "true");
         await expect(bookmark(page)).toHaveAttribute("aria-pressed", "true");
         await complete(page).click();
         await expect(complete(page)).toHaveAttribute("aria-pressed", "false");
      });
   }

   test("asks only the allowed routes: features once, then a visit and a read per open, and a write per press", async ({ page, request }) => {
      await reset(request, ME, LESSON);
      const before = (await log(request)).length;
      await page.goto(canonical(LESSON));
      await expect(complete(page)).toBeEnabled();
      await complete(page).click();
      await expect(complete(page)).toHaveAttribute("aria-pressed", "true");
      const made = (await log(request)).slice(before);
      expect(about(made, LESSON)).toEqual([
         `POST /me/prep/item-state/${LESSON}/visit`,
         `GET /me/prep/item-state/${LESSON}`,
         `PATCH /me/prep/item-state/${LESSON}`,
      ]);
      expect(made.every((line) => ITEM_STATE_PATH.test(line.split(" ")[1]))).toBe(true);
   });

   test("writes nothing to the browser: no storage, no database, no address change, no cookie but the session's", async ({ page, request }) => {
      await reset(request, ME, PROBLEM);
      await page.goto(canonical(PROBLEM));
      await expect(complete(page)).toBeEnabled();
      await complete(page).click();
      await bookmark(page).click();
      await expect(bookmark(page)).toHaveAttribute("aria-pressed", "true");
      const kept = await page.evaluate(async () => ({
         local: localStorage.length,
         session: sessionStorage.length,
         databases: ((await indexedDB.databases?.()) ?? []).length,
         address: location.search + location.hash,
         cookies: document.cookie.split("; ").filter(Boolean).map((cookie) => cookie.split("=")[0]),
      }));
      expect(kept).toMatchObject({ local: 0, session: 0, databases: 0, address: "" });
      expect(kept.cookies.every((name) => name.startsWith("sb-"))).toBe(true);
      await complete(page).click();
   });

   test("a Knowledge page has no controls and makes no item-state request", async ({ page, request }) => {
      const before = (await log(request)).length;
      await page.goto(canonical(KNOWLEDGE));
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForTimeout(500);
      await expect(controls(page)).toHaveCount(0);
      expect(about((await log(request)).slice(before), KNOWLEDGE)).toEqual([]);
   });
});

test.describe("signed out", () => {
   test.use({ identity: "signed-out" });

   for (const id of [LESSON, PROBLEM]) {
      test(`${id}: no control, no learner state in the page, no request to the item-state API`, async ({ page, request }) => {
         const before = (await log(request)).length;
         await page.goto(canonical(id));
         await expect(page.locator("h1").first()).toBeVisible();
         await page.waitForTimeout(500);
         await expect(controls(page)).toHaveCount(0);
         expect(await page.locator("[data-reader-controls]").count()).toBe(0);
         expect((await log(request)).slice(before)).toEqual([]);
      });
   }
});

test.describe("signed in, M2 off", () => {
   test.use({ identity: "entitled" });

   test.beforeEach(({ request }) => request.put(`${ITEM_API_ORIGIN}/__item-state?user=${OFF}&continuity=off`));
   test.afterEach(({ request }) => request.delete(`${ITEM_API_ORIGIN}/__item-state?user=${OFF}`));

   for (const id of [LESSON, PROBLEM]) {
      test(`${id}: no control, and the only request is the capability read`, async ({ page, request }) => {
         const before = (await log(request)).length;
         await page.goto(canonical(id));
         await expect(page.locator("h1").first()).toBeVisible();
         await page.waitForTimeout(500);
         await expect(controls(page)).toHaveCount(0);
         const made = (await log(request)).slice(before);
         expect(made.filter((line) => line.includes("/item-state/"))).toEqual([]);
         expect(made.every((line) => line === "GET /me/prep/features")).toBe(true);
      });
   }
});

test.describe("the signed-in controls have no WCAG A or AA violation", () => {
   test.use({ identity: "unentitled" });

   for (const colorScheme of ["light", "dark"] as const) {
      for (const width of [390, 1440]) {
         test.describe(`${colorScheme} at ${width}px`, () => {
            test.use({ colorScheme, viewport: { width, height: 900 } });

            for (const id of [LESSON, PROBLEM]) {
               test(`${id}: loaded and pressed`, async ({ page, request }) => {
                  await reset(request, ME, id);
                  await page.goto(canonical(id));
                  await expect(complete(page)).toBeEnabled();
                  const scan = async (state: string) => {
                     const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
                     return violations.map(({ id: rule, nodes }) => `${id} (${state}): ${rule} on ${nodes.length} node(s)`);
                  };
                  const found = [...(await scan("loaded"))];
                  await complete(page).click();
                  await bookmark(page).click();
                  await expect(bookmark(page)).toHaveAttribute("aria-pressed", "true");
                  found.push(...(await scan("pressed")));
                  expect(found).toEqual([]);
                  await complete(page).click();
                  await bookmark(page).click();
               });
            }
         });
      }
   }
});
