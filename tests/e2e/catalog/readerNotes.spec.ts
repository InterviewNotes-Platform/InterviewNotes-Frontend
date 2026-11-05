import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import fixture from "./fixture.json";
import { canonical, exposures, expect, ITEM_API_ORIGIN, READER_ORIGIN, test } from "./harness";

// P7-T47: the private note on a Lesson and a Problem, on the build that has the Prepare flag on and the item-state double as its API.
// It uses its own items, so it never shares a row with readerControls.spec.ts.
const LESSON = "lesson.p3-seq-two";
const PROBLEM = "problem.p3-seq-drill-1";
const ME = fixture.identities.unentitled.user.id;
const TOKEN = fixture.identities.unentitled.token;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const ITEM_STATE_PATH = /^\/me\/prep\/(features|item-state\/(lesson|problem)\.[a-z0-9-]+(\/visit)?)$/;

test.use({ baseURL: READER_ORIGIN });
test.describe.configure({ mode: "serial" });

const log = async (request: APIRequestContext) => (await (await request.get(`${ITEM_API_ORIGIN}/__item-state-log`)).json()) as string[];
const reset = (request: APIRequestContext, content: string) => request.delete(`${ITEM_API_ORIGIN}/__item-state?user=${ME}&content=${content}`);
const serverCopy = async (request: APIRequestContext, content: string) =>
   (await request.get(`${ITEM_API_ORIGIN}/me/prep/item-state/${content}`, { headers: { authorization: `Bearer ${TOKEN}` } })).json() as Promise<{ note: string | null; version: number; completed_at: string | null }>;

const toggle = (page: Page) => page.getByRole("button", { name: /^Your note/ });
const box = (page: Page) => page.getByRole("textbox", { name: /private note/ });
const status = (page: Page) => page.locator('[data-slot="disclosure"] [data-slot="save-status"]');
const complete = (page: Page) => page.getByRole("button", { name: "Mark complete" });
const openNote = async (page: Page) => {
   await expect(complete(page)).toBeEnabled();
   if ((await toggle(page).getAttribute("aria-expanded")) !== "true") await toggle(page).click();
   await expect(box(page)).toBeVisible();
};
const write = async (page: Page, text: string) => {
   await box(page).fill(text);
   await expect(status(page)).toContainText("Saved");
};

test.describe("signed in, M2 on", () => {
   test.use({ identity: "unentitled" });

   for (const id of [LESSON, PROBLEM]) {
      test(`${id}: creates, updates and clears a note from the keyboard, and a reload shows what the server holds`, async ({ page, request }) => {
         await reset(request, id);
         await page.goto(canonical(id));
         await expect(complete(page)).toBeEnabled();
         await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");

         await toggle(page).focus();
         await page.keyboard.press("Enter");
         await expect(box(page)).toBeVisible();
         await page.keyboard.press("Tab");
         await expect(box(page)).toBeFocused();

         await page.keyboard.type("first thought");
         await expect(status(page)).toContainText("Unsaved changes");
         await expect(status(page)).toContainText("Saved");
         expect((await serverCopy(request, id)).note).toBe("first thought");

         await page.reload();
         await expect(complete(page)).toBeEnabled();
         await expect(toggle(page)).toContainText("Has a note");
         await openNote(page);
         await expect(box(page)).toHaveValue("first thought");

         await write(page, "second thought");
         expect((await serverCopy(request, id)).note).toBe("second thought");

         await write(page, "");
         expect((await serverCopy(request, id)).note).toBeNull();
         await page.reload();
         await openNote(page);
         await expect(box(page)).toHaveValue("");
      });
   }

   test("is there after sign-out and sign-in, and in a second browser context of the same learner", async ({ page, request, context, browser }) => {
      await reset(request, LESSON);
      await page.goto(canonical(LESSON));
      await openNote(page);
      await write(page, "kept across contexts");

      const cookies = await context.cookies();
      const second = await browser.newContext({ baseURL: READER_ORIGIN });
      await second.addCookies(cookies);
      const other = await second.newPage();
      await other.goto(canonical(LESSON));
      await openNote(other);
      await expect(box(other)).toHaveValue("kept across contexts");
      await second.close();

      await context.clearCookies();
      const before = (await log(request)).length;
      await page.reload();
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForTimeout(500);
      await expect(box(page)).toHaveCount(0);
      expect((await log(request)).slice(before)).toEqual([]);

      await context.addCookies(cookies);
      await page.reload();
      await openNote(page);
      await expect(box(page)).toHaveValue("kept across contexts");
   });

   test("shares one version with the controls: marking complete after a note, then another note, loses nothing", async ({ page, request }) => {
      await reset(request, PROBLEM);
      await page.goto(canonical(PROBLEM));
      await openNote(page);
      await write(page, "note before");
      await complete(page).click();
      await expect(complete(page)).toHaveAttribute("aria-pressed", "true");
      await expect(box(page)).toHaveValue("note before");
      await write(page, "note after");
      await expect(complete(page)).toHaveAttribute("aria-pressed", "true");
      const copy = await serverCopy(request, PROBLEM);
      expect(copy).toMatchObject({ note: "note after", completed_at: expect.any(String) });
      await page.reload();
      await expect(complete(page)).toHaveAttribute("aria-pressed", "true");
      await openNote(page);
      await expect(box(page)).toHaveValue("note after");
   });

   test("asks only the allowed routes, and keeps the note out of the address, storage, cookies and every page the server sent", async ({ page, request, traffic }) => {
      const text = "private-note-canary-7f3a91";
      await reset(request, LESSON);
      const before = (await log(request)).length;
      await page.goto(canonical(LESSON));
      await openNote(page);
      await write(page, text);

      const made = (await log(request)).slice(before);
      expect(made.every((line) => ITEM_STATE_PATH.test(line.split(" ")[1]))).toBe(true);
      expect(made.filter((line) => line.startsWith("PATCH"))).toEqual([`PATCH /me/prep/item-state/${LESSON}`]);
      expect(made.join("\n")).not.toContain(text);

      const kept = await page.evaluate(async () => ({
         local: JSON.stringify(localStorage),
         session: JSON.stringify(sessionStorage),
         databases: ((await indexedDB.databases?.()) ?? []).length,
         address: location.href,
         cookies: document.cookie,
      }));
      expect(kept.local + kept.session + kept.address + kept.cookies).not.toContain(text);
      expect(kept.databases).toBe(0);

      await page.reload();
      await expect(complete(page)).toBeEnabled();
      const served = (await exposures(page, await traffic.responses(), text)).filter(({ channel }) => channel === "HTML" || channel === "RSC");
      expect(served).toEqual([]);
   });

   test("a Knowledge page has no note and makes no item-state request", async ({ page, request }) => {
      const before = (await log(request)).length;
      await page.goto(canonical("knowledge.catalog-e2e-sections"));
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForTimeout(500);
      await expect(toggle(page)).toHaveCount(0);
      expect((await log(request)).slice(before).filter((line) => line.includes("/item-state/"))).toEqual([]);
   });
});

test.describe("signed out", () => {
   test.use({ identity: "signed-out" });

   for (const id of [LESSON, PROBLEM]) {
      test(`${id}: no note, no note text in the page, no request to the item-state API`, async ({ page, request }) => {
         const before = (await log(request)).length;
         await page.goto(canonical(id));
         await expect(page.locator("h1").first()).toBeVisible();
         await page.waitForTimeout(500);
         await expect(toggle(page)).toHaveCount(0);
         await expect(page.getByRole("textbox", { name: /private note/ })).toHaveCount(0);
         expect((await log(request)).slice(before)).toEqual([]);
      });
   }
});

test.describe("the note has no WCAG A or AA violation", () => {
   test.use({ identity: "unentitled" });

   for (const colorScheme of ["light", "dark"] as const) {
      for (const width of [390, 1440]) {
         test.describe(`${colorScheme} at ${width}px`, () => {
            test.use({ colorScheme, viewport: { width, height: 900 } });

            for (const id of [LESSON, PROBLEM]) {
               test(`${id}: collapsed, open and with a saved note`, async ({ page, request }) => {
                  await reset(request, id);
                  await page.goto(canonical(id));
                  await expect(complete(page)).toBeEnabled();
                  const scan = async (state: string) => {
                     const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
                     return violations.map(({ id: rule, nodes }) => `${id} (${state}): ${rule} on ${nodes.length} node(s)`);
                  };
                  const found = [...(await scan("collapsed"))];
                  await openNote(page);
                  found.push(...(await scan("open")));
                  await write(page, "A note to scan.");
                  found.push(...(await scan("saved")));
                  expect(found).toEqual([]);
                  await write(page, "");
               });
            }
         });
      }
   }
});
