import type { Locator, Page } from "@playwright/test";
import { canonical, expect, item, test } from "./harness";

// P4-T17 the static Self-review (AC-11, S-RUB-1 … 5, S-SEN-1 … 4, S-LAY-4) on the synthetic P4 Problems: SD carries structured
// expectations for Senior and Staff and two rubric dimensions; ML carries legacy prose expectations. The lens is deferred (SA-D3).
const SD = item("problem.p4-sd-complete");
const ML = item("problem.p4-ml-complete");
const sd = canonical(SD.id);
const ml = canonical(ML.id);

const main = (page: Page) => page.getByRole("main");
const review = (page: Page) => main(page).getByRole("region", { name: "Self-review", exact: true });
const control = (scope: Locator, name: string) => scope.locator("summary").filter({ hasText: name });
const textOf = (id: string, section: string) => item(id).sections!.find((candidate) => candidate.id === section)!.text;
const titleOf = (id: string, section: string) => item(id).sections!.find((candidate) => candidate.id === section)!.title!;
const unit = (page: Page, id: string) => main(page).locator(`#${id}`).locator("..");
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const partLabels = (scope: Locator) => scope.locator("[data-part] > p:first-child").allTextContents();
const DELIVERY = `Show rubric: ${titleOf(SD.id, "rubric-delivery")}`;
const COMMUNICATION = `Show rubric: ${titleOf(SD.id, "rubric-communication")}`;

async function openSelfReview(page: Page) {
   await page.goto(sd);
   await control(review(page), "Open self-review").click();
}

test.describe("expectations by seniority (S-SEN-2, S-SEN-4)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("each bar sits under its own seniority in order, and the other seniorities are stated, never given a bar", async ({ page }) => {
      await openSelfReview(page);
      const group = review(page).getByRole("heading", { level: 3, name: "Expectations by seniority" }).locator("..");
      expect(await partLabels(group)).toEqual(["Senior bar", "Staff bar"]);
      await expect(group.getByText("This Problem is not written to the Mid bar.")).toBeVisible();
      await expect(group.getByText("This Problem is not written to the Principal bar.")).toBeVisible();
      await expect(group.getByText("This Problem is not written to the Senior bar.")).toHaveCount(0);
      for (const bar of ["Mid bar", "Principal bar"]) await expect(group.getByText(bar, { exact: true })).toHaveCount(0);
   });

   test("legacy prose is shown as authored, with no bar labels and no untargeted lines", async ({ page }) => {
      await page.goto(ml);
      await control(review(page), "Open self-review").click();
      await expect(main(page).getByText(textOf(ML.id, "level-expectations"))).toBeVisible();
      const group = review(page).getByRole("heading", { level: 3, name: "Expectations by seniority" }).locator("..");
      await expect(group.locator("[data-part], [data-untargeted]")).toHaveCount(0);
      await expect(review(page).getByText(/is not written to the/)).toHaveCount(0);
   });

   test("the page has no seniority lens or selection control, and never calls seniority a level (S-SEN-4, SA-D3)", async ({ page }) => {
      await openSelfReview(page);
      await expect(main(page).getByText(/Reviewing for|Your bar/)).toHaveCount(0);
      await expect(review(page).getByRole("radio")).toHaveCount(0);
      await expect(review(page).getByRole("tab")).toHaveCount(0);
      await expect(review(page).getByText(/\blevel\b/i)).toHaveCount(0);
      expect(new URL(page.url()).hash).toBe("");
   });
});

test.describe("rubric dimensions (S-RUB-1, S-RUB-4, AC-11)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("lists the dimensions in authored order with their shared labels, each on its own closed control", async ({ page }) => {
      await openSelfReview(page);
      await expect(review(page).getByRole("heading", { level: 4 })).toHaveText([titleOf(SD.id, "rubric-delivery"), titleOf(SD.id, "rubric-communication")]);
      await expect(unit(page, "rubric-delivery")).toContainText("Dimension: Architecture");
      await expect(unit(page, "rubric-delivery")).toContainText("Mostly evaluates: Design");
      await expect(unit(page, "rubric-communication")).toContainText("Dimension: Communication and structure");
      await expect(unit(page, "rubric-communication")).not.toContainText("Mostly evaluates");
      for (const id of ["rubric-delivery", "rubric-communication"]) await expect(review(page).locator(`details[data-reveal="${id}"]`), id).not.toHaveAttribute("open", "");
      await expect(review(page).locator('details[data-reveal="rubric-delivery"] [data-part]').first()).toBeHidden();
   });

   test("opening one dimension shows its parts under plain labels and leaves the other closed", async ({ page }) => {
      await openSelfReview(page);
      await control(review(page), DELIVERY).click();
      const body = review(page).locator('details[data-reveal="rubric-delivery"]');
      expect(await partLabels(body)).toEqual(["What it evaluates", "Strong evidence", "Weak evidence", "Senior bar", "Staff bar"]);
      for (const label of ["Mid bar", "Principal bar"]) await expect(body.getByText(label, { exact: true })).toHaveCount(0);
      await expect(body.getByText(textOf(SD.id, "rubric-delivery").split("\n")[1])).toBeVisible();
      await expect(review(page).locator('details[data-reveal="rubric-communication"]')).not.toHaveAttribute("open", "");
      expect(await partLabels(review(page).locator('details[data-reveal="rubric-communication"]'))).toEqual(["What it evaluates", "Strong evidence", "Weak evidence", "Mid bar"]);
   });

   test("strong and weak evidence sit side by side on a wide screen", async ({ page }) => {
      await openSelfReview(page);
      await control(review(page), DELIVERY).click();
      const body = review(page).locator('details[data-reveal="rubric-delivery"]');
      const strong = (await body.locator("[data-part=strong_evidence]").boundingBox())!;
      const weak = (await body.locator("[data-part=weak_evidence]").boundingBox())!;
      expect(Math.abs(strong.y - weak.y)).toBeLessThan(2);
      expect(weak.x).toBeGreaterThan(strong.x + strong.width - 1);
      expect(await overflows(page)).toBe(false);
   });

   test("common mistakes stay closed until their own control opens them", async ({ page }) => {
      await openSelfReview(page);
      await expect(main(page).getByText(textOf(SD.id, "common-mistakes"))).toBeHidden();
      await control(review(page), "Show common mistakes").click();
      await expect(main(page).getByText(textOf(SD.id, "common-mistakes"))).toBeVisible();
   });

   test("no score, mark, checkbox, slider, progress or self-assessment control exists anywhere in the opened surface", async ({ page }) => {
      await openSelfReview(page);
      await control(review(page), DELIVERY).click();
      await control(review(page), COMMUNICATION).click();
      await control(review(page), "Show common mistakes").click();
      await expect(
         review(page).locator("input, select, textarea, button, progress, meter, [role=checkbox], [role=switch], [role=slider], [role=progressbar], [role=meter]")
      ).toHaveCount(0);
      expect(await review(page).locator("summary").allTextContents()).toEqual(["Open self-review", DELIVERY, COMMUNICATION, "Show common mistakes"]);
      const text = (await review(page).innerText()).toLowerCase();
      for (const word of ["score", "pass mark", "covered", "progress", "reviewing for", "your bar"]) expect(text, word).not.toContain(word);
      expect(text).not.toMatch(/\d+\s*\/\s*\d+|\d+%/);
   });
});

test.describe("on a phone (S-LAY-4)", () => {
   test.use({ viewport: { width: 390, height: 844 } });

   test("strong evidence stacks above weak evidence and the page does not scroll sideways", async ({ page }) => {
      await openSelfReview(page);
      await control(review(page), DELIVERY).click();
      const body = review(page).locator('details[data-reveal="rubric-delivery"]');
      const strong = (await body.locator("[data-part=strong_evidence]").boundingBox())!;
      const weak = (await body.locator("[data-part=weak_evidence]").boundingBox())!;
      expect(weak.y).toBeGreaterThanOrEqual(strong.y + strong.height - 1);
      expect(Math.abs(weak.x - strong.x)).toBeLessThan(2);
      expect(await overflows(page)).toBe(false);
   });
});

test.describe("keyboard and without JavaScript (AC-19, AC-22)", () => {
   for (const javaScriptEnabled of [true, false]) {
      test.describe(javaScriptEnabled ? "with JavaScript" : "without JavaScript", () => {
         test.use({ javaScriptEnabled, viewport: { width: 1440, height: 900 } });

         test("Self-review, a dimension and common mistakes open from the keyboard and show the static content", async ({ page }) => {
            await page.goto(sd);
            for (const name of ["Open self-review", DELIVERY, "Show common mistakes"]) {
               const summary = control(review(page), name);
               await summary.focus();
               await expect(summary).toBeFocused();
               await page.keyboard.press("Enter");
               await expect(summary.locator("..")).toHaveAttribute("open", "");
            }
            await expect(review(page).getByText("This Problem is not written to the Mid bar.")).toBeVisible();
            expect(await partLabels(review(page).locator('details[data-reveal="rubric-delivery"]'))).toContain("Strong evidence");
            await expect(main(page).getByText(textOf(SD.id, "common-mistakes"))).toBeVisible();
         });
      });
   }
});
