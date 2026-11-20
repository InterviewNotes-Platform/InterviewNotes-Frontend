import type { Page } from "@playwright/test";
import fixture from "./fixture.json";
import { canonical, expect, ITEM_API_ORIGIN, itemStateCalls, itemStateLog, READER_ORIGIN, tagCaller, test } from "./harness";

// The item-state double keeps one request log for every test running at once. These are the controls for the tag that
// keeps one test's log apart from another's: the tests in readerControls.spec.ts and readerNotes.spec.ts that expect silence rely on it.
const KNOWLEDGE = "knowledge.catalog-e2e-sections";
const LESSON = "lesson.p3-seq-two";

// Signed in with the learner's token, so the deliberate request is answered 200: the harness fails a test on any browser console error.
test.use({ baseURL: READER_ORIGIN, identity: "unentitled" });

const ask = (page: Page, path: string, token?: string) =>
   page.evaluate(
      ([origin, to, bearer]) => fetch(`${origin}${to}`, bearer ? { headers: { authorization: `Bearer ${bearer}` } } : {}).then(async (response) => (await response.text(), response.status)),
      [ITEM_API_ORIGIN, path, token] as const,
   );

test("a request for a different item is still seen by the check that a Knowledge page makes none", async ({ page, request, caller }) => {
   await page.goto(canonical(KNOWLEDGE));
   await expect(page.locator("h1").first()).toBeVisible();
   expect(itemStateCalls(await itemStateLog(request, caller))).toEqual([]);

   expect(await ask(page, `/me/prep/item-state/${LESSON}`, fixture.identities.unentitled.token)).toBe(200);
   const seen = itemStateCalls(await itemStateLog(request, caller));
   expect(seen).toEqual([`GET /me/prep/item-state/${LESSON}`]);
   expect(() => expect(seen).toEqual([])).toThrow();
});

test("two browsers asking at the same moment, neither signed in, each read back only their own requests", async ({ browser, request, caller }) => {
   const callers = [`${caller}.a`, `${caller}.b`];
   const pages = await Promise.all(
      callers.map(async (caller) => {
         const context = await browser.newContext({ baseURL: READER_ORIGIN });
         await tagCaller(context, caller);
         const page = await context.newPage();
         await page.goto(canonical(KNOWLEDGE));
         return page;
      }),
   );
   const itemsOf = (caller: string) => Array.from({ length: 8 }, (_, n) => `/me/prep/item-state/lesson.${caller}-${n}`);

   await Promise.all(pages.flatMap((page, index) => itemsOf(callers[index]).map((path) => ask(page, path))));
   // A call the double cannot attribute: it must show up in no caller's log.
   await request.get(`${ITEM_API_ORIGIN}/me/prep/item-state/lesson.isolation-untagged`);

   for (const caller of callers) {
      const own = (await itemStateLog(request, caller)).sort();
      expect(own).toEqual(itemsOf(caller).map((path) => `GET ${path}`).sort());
   }
   await Promise.all(pages.map((page) => page.context().close()));
});
