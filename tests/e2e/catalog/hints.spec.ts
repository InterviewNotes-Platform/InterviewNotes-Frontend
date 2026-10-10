import type { Locator, Page } from "@playwright/test";
import { P4_FOLLOW_UP_CANARY } from "../../leak/canaries";
import { canonical, expect, item, test } from "./harness";

// P4-T15 hint sequences (S-HNT-5 … 9) on the synthetic P4 Problems: SD carries hints in a narrative stage and in both unit
// stages; STAGES has a free hint over a withheld follow-up (X-1).
const SD = item("problem.p4-sd-complete");
const STAGES = item("problem.p4-premium-stages");
const sd = canonical(SD.id);
const stages = canonical(STAGES.id);

const EXPLANATION = "Hints nudge your thinking without giving the answer. Use as few as you need.";
const main = (page: Page) => page.getByRole("main");
const band = (page: Page, name: string) => main(page).getByRole("region", { name, exact: true });
const control = (scope: Locator, name: string) => scope.locator("summary").filter({ hasText: new RegExp(`^${name}`) });
const textOf = (id: string, section: string) => item(id).sections!.find((candidate) => candidate.id === section)!.text;
const openCount = (page: Page) => main(page).locator("details[data-reveal][open]").count();

test.describe("hints open one at a time, in authored order (AC-6, S-HNT-6)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("a stage's hints: one closed control, the next only inside the previous hint, the others untouched", async ({ page }) => {
      await page.goto(sd);
      const design = band(page, "Design");
      const first = textOf(SD.id, "hint-design-1");
      const second = textOf(SD.id, "hint-design-2");

      await expect(control(design, "Show a hint")).toHaveText("Show a hint, hint 1 for Design");
      await expect(control(design, "Show the next hint").first()).toBeHidden(); // inside a closed panel
      await expect(design.getByText(/^Hint \d of \d$/)).toHaveCount(2);
      await expect(design.getByText(/^Hint \d of \d$/).first()).toBeHidden(); // a cue shows only inside an open sequence
      expect(await openCount(page)).toBe(0);

      await control(design, "Show a hint").click();
      await expect(main(page).getByText(first)).toBeVisible();
      await expect(design.getByText("Hint 1 of 2")).toBeVisible();
      await expect(main(page).getByText(second)).toBeHidden();
      await expect(control(design, "Show the next hint")).toHaveText("Show the next hint, hint 2 for Design");
      expect(await openCount(page), "no other sequence or reference opens").toBe(1);
      for (const other of ["Frame", "Requirements"]) await expect(main(page).getByText(textOf(SD.id, `hint-${other.toLowerCase()}`))).toBeHidden();

      await control(design, "Show the next hint").click();
      await expect(main(page).getByText(second)).toBeVisible();
      await expect(design.getByText("Hint 2 of 2")).toBeVisible();
      await expect(design.getByText("No more hints for Design. Open the reference when you're ready.")).toBeVisible();
      await expect(control(design, "Show the next hint")).toBeVisible(); // the same control, now open
      expect(await openCount(page)).toBe(2);
      const [one, two] = await Promise.all([main(page).getByText(first).boundingBox(), main(page).getByText(second).boundingBox()]);
      expect(one!.y).toBeLessThan(two!.y); // stacked in authored order
      await expect(main(page).getByText(textOf(SD.id, "high-level-design"))).toBeHidden(); // the reference stays closed
   });

   test("the one explanation sits on the first sequence in presentation order and nowhere else", async ({ page }) => {
      await page.goto(sd);
      await expect(main(page).getByText(EXPLANATION)).toHaveCount(1);
      await expect(band(page, "Frame").getByText(EXPLANATION)).toBeVisible();
      await control(band(page, "Design"), "Show a hint").click();
      await expect(main(page).getByText(EXPLANATION)).toHaveCount(1);
   });

   test("a unit's hints sit between its heading and its body control, and its body opens no hint", async ({ page }) => {
      await page.goto(sd);
      const depth = band(page, "Depth & Trade-offs");
      await control(depth, "Compare with the topics").click();
      const heading = depth.getByRole("heading", { name: "Delivery guarantees", level: 3 });
      const hints = control(depth, "Show a hint, hint 1 for Delivery guarantees");
      const body = control(depth, "Show reference: Delivery guarantees");
      const [h, c, b] = await Promise.all([heading.boundingBox(), hints.boundingBox(), body.boundingBox()]);
      expect(h!.y).toBeLessThan(c!.y);
      expect(c!.y).toBeLessThan(b!.y);
      await expect(depth.getByRole("heading", { name: "Ordering" })).toBeVisible();
      await expect(control(depth, "Show a hint, hint 1 for Ordering")).toHaveCount(0); // that unit has no hint

      await body.click();
      await expect(main(page).getByText(textOf(SD.id, "deep-dive-delivery"))).toBeVisible();
      await expect(main(page).getByText(textOf(SD.id, "hint-depth"))).toBeHidden();
      await hints.click();
      await expect(main(page).getByText(textOf(SD.id, "hint-depth"))).toBeVisible();
      await expect(depth.getByText("No more hints for Delivery guarantees. Open the reference when you're ready.")).toBeVisible();
   });

   test("a fragment naming the second hint opens its sequence through that hint, in order, and nothing else", async ({ page }) => {
      await page.goto(`${sd}#hint-design-2`);
      await expect(main(page).getByText(textOf(SD.id, "hint-design-1"))).toBeVisible();
      await expect(main(page).getByText(textOf(SD.id, "hint-design-2"))).toBeVisible();
      expect(await openCount(page)).toBe(2);
   });

   test("a reload returns every sequence to closed, with nothing kept", async ({ page }) => {
      await page.goto(sd);
      await control(band(page, "Design"), "Show a hint").click();
      await page.reload();
      expect(await openCount(page)).toBe(0);
      expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie.includes("hint"), location.hash])).toEqual([0, 0, false, ""]);
   });
});

for (const identity of ["signed-out", "unentitled"] as const) {
   test.describe(`a free hint over a withheld target, as ${identity} (AC-21, X-1)`, () => {
      test.use({ identity, viewport: { width: 1440, height: 900 } });

      test("sits in the stage's own sequence and shows nothing about its target", async ({ page }) => {
         await page.goto(stages);
         const followUps = band(page, "Follow-ups");
         await expect(followUps.getByText("Some material in this stage is included with full access.")).toBeVisible();
         await expect(followUps.locator("summary")).toHaveText(["Show a hint, hint 1 for Follow-ups"]); // no list: its only follow-up is withheld

         await control(followUps, "Show a hint").click();
         await expect(followUps.getByText(textOf(STAGES.id, "hint-follow-up"))).toBeVisible();
         await expect(followUps.getByText("No more hints for Follow-ups.")).toBeVisible(); // nothing of a reference to open
         await expect(followUps.getByText(/Open the reference/)).toHaveCount(0);

         const html = await (await page.request.get(stages)).text();
         const rsc = await (await page.request.get(stages, { headers: { RSC: "1" } })).text();
         for (const text of [html, rsc]) {
            expect(text).not.toContain("follow-up-secret");
            expect(text).not.toContain(P4_FOLLOW_UP_CANARY);
            expect(text).not.toContain(textOf(STAGES.id, "follow-up-secret"));
         }
      });

      test("hints over withheld references in a narrative stage are still that stage's one sequence", async ({ page }) => {
         await page.goto(stages);
         const design = band(page, "Design");
         await expect(design.locator("summary")).toHaveText(["Show a hint, hint 1 for Design", "Show the next hint, hint 2 for Design"]);
         await control(design, "Show a hint").click();
         await control(design, "Show the next hint").click();
         await expect(design.getByText("No more hints for Design.")).toBeVisible();
         await expect(design.getByText(/Open the reference/)).toHaveCount(0); // its whole reference is withheld
      });
   });
}

test.describe("without JavaScript (AC-22, S-RVL-12b)", () => {
   test.use({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });

   test("each hint opens in order from the keyboard, the next control existing only once the previous is shown", async ({ page }) => {
      await page.goto(sd);
      const design = band(page, "Design");
      const first = control(design, "Show a hint");
      for (let stop = 0; stop < 80 && !(await first.evaluate((element) => element === document.activeElement)); stop++) await page.keyboard.press("Tab");
      await expect(first).toBeFocused();
      await expect(control(design, "Show the next hint").first()).toBeHidden();
      await page.keyboard.press("Enter");
      await expect(main(page).getByText(textOf(SD.id, "hint-design-1"))).toBeVisible();
      await expect(main(page).getByText(textOf(SD.id, "hint-design-2"))).toBeHidden();

      await page.keyboard.press("Tab"); // the next control is now the next stop
      await expect(control(design, "Show the next hint")).toBeFocused();
      await page.keyboard.press("Space");
      await expect(main(page).getByText(textOf(SD.id, "hint-design-2"))).toBeVisible();
      await expect(design.getByText("No more hints for Design. Open the reference when you're ready.")).toBeVisible();
   });

   test("every hint on the page opens by keyboard, and nothing beyond a hint opens with it", async ({ page }) => {
      await page.goto(sd);
      const hintSummaries = main(page).locator("details[data-reveal] > summary").filter({ hasText: /hint/i });
      let opened = 0;
      for (let step = 0; step < 20; step++) {
         const next = main(page).locator("details[data-reveal]:not([open]) > summary").filter({ hasText: /hint/i }).filter({ visible: true }).first();
         if ((await next.count()) === 0) {
            // A unit's hints sit in a closed list and unit: open those controls by keyboard, then carry on.
            const gate = main(page).locator("details[data-reveal]:not([open]) > summary").filter({ hasText: /^(Compare with the topics|Show the follow-up questions)/ }).filter({ visible: true }).first();
            if ((await gate.count()) === 0) break;
            await gate.focus();
            await page.keyboard.press("Space");
            continue;
         }
         await next.focus();
         await page.keyboard.press("Space");
         opened++;
      }
      expect(opened).toBe(await hintSummaries.count());
      for (const id of ["hint-frame", "hint-requirements", "hint-design-1", "hint-design-2", "hint-depth", "hint-follow-up"]) {
         await expect(main(page).getByText(textOf(SD.id, id)), id).toBeVisible();
      }
      await expect(main(page).getByText(textOf(SD.id, "high-level-design"))).toBeHidden(); // no reference opened
      await expect(main(page).getByText(textOf(SD.id, "deep-dive-delivery"))).toBeHidden();
   });
});
