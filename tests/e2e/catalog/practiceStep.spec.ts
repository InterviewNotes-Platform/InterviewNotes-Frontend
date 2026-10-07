import type { Page } from "@playwright/test";
import { canonical, expect, item, test, track } from "./harness";

// P3-T6 Practice step and unique rendering over the synthetic P3 fixtures: A -> P -> B, three Interposed Problems,
// the Practice track (every selection shape), a trailing Problem, and a premium Practice Problem.
const practiceRegion = (page: Page) => page.getByRole("region", { name: "Practice", exact: true });
const relatedProblems = (page: Page) => page.getByRole("region", { name: "Related Problems" });
const rowOf = (page: Page, id: string) => practiceRegion(page).getByRole("listitem").filter({ has: page.getByRole("link", { name: item(id).title, exact: true }) });
const linksOf = (region: ReturnType<typeof practiceRegion>) => region.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
const path = (id: string) => canonical(id);

test("A -> P -> B: Lesson A's Practice offers the Interposed Problem with its Placement basis, and Next is still Lesson B (AC-2, AC-11)", async ({ page }) => {
   await page.goto(path("lesson.p3-seq-one"));
   const row = rowOf(page, "problem.p3-seq-check");
   await expect(row).toHaveCount(1);
   await expect(row.getByRole("link")).toHaveAttribute("href", path("problem.p3-seq-check"));
   await expect(row).toContainText("Problem");
   await expect(row).toContainText(item("problem.p3-seq-check").summary);
   await expect(row).toContainText("Medium");
   await expect(row).toContainText(`Practice for this part of ${track("p3-sequence").modules[0].title}`);
   await expect(relatedProblems(page)).toHaveCount(0);
   await expect(page.getByRole("navigation", { name: /^Next in / }).getByRole("link")).toHaveAttribute("href", path("lesson.p3-seq-two"));
});

test("three Interposed Problems: Practice shows two, and the third is neither shown nor listed under Related Problems (S-PRC-3)", async ({ page }) => {
   await page.goto(path("lesson.p3-seq-three"));
   expect(await linksOf(practiceRegion(page))).toEqual([path("problem.p3-seq-drill-1"), path("problem.p3-seq-drill-2")]);
   await expect(relatedProblems(page)).toHaveCount(0);
   const closeLinks = await page.locator("main a[href]").evaluateAll((links) => links.filter((link) => !link.closest("details")).map((link) => link.getAttribute("href")!));
   expect(closeLinks).not.toContain(path("problem.p3-seq-drill-3"));
});

test.describe("every Practice selection shape (P3 Practice Lesson)", () => {
   const lesson = "lesson.p3-prac-lesson";

   test("shows two Problems: Interposed and prerequisite_of merged once with all three bases, then the next Interposed with its meta", async ({ page }) => {
      await page.goto(path(lesson));
      expect(await linksOf(practiceRegion(page))).toEqual([path("problem.p3-prac-a"), path("problem.p3-prac-b")]);
      await expect(rowOf(page, "problem.p3-prac-a")).toContainText(
         `Practice for this part of ${track("p3-practice").modules[0].title} · Builds on this lesson · Also applies ${item("knowledge.p3-prac-shared").title}`
      );
      const b = rowOf(page, "problem.p3-prac-b");
      await expect(b).toContainText(`Practice for this part of ${track("p3-practice").modules[0].title}`);
      await expect(b).not.toContainText("Builds on this lesson");
      await expect(b).not.toContainText("Also applies");
      await expect(b).toContainText(item("problem.p3-prac-b").summary); // from the Problem's public meta: the relations lack it
   });

   test("lists the rest once under Related Problems: prerequisite_of overflow and related-only, never a Problem shown in Practice (S-PRC-4)", async ({ page }) => {
      await page.goto(path(lesson));
      const hrefs = await linksOf(relatedProblems(page));
      expect([...hrefs].sort()).toEqual([path("problem.p3-prac-extra-1"), path("problem.p3-prac-premium"), path("problem.p3-prac-related-only")]);
      const shown = await linksOf(practiceRegion(page));
      expect(hrefs.filter((href) => shown.includes(href))).toEqual([]);
   });

   test("renders the Next lesson once: it is also a related Lesson, and stays in the Next block only (S-LSN-16)", async ({ page }) => {
      await page.goto(path(lesson));
      await expect(page.getByRole("navigation", { name: /^Next in / }).getByRole("link")).toHaveAttribute("href", path("lesson.p3-prac-next"));
      await expect(page.getByRole("region", { name: "Related Lessons" })).toHaveCount(0);
      const outsideOutline = await page.locator("main a[href]").evaluateAll((links) => links.filter((link) => !link.closest("details")).map((link) => link.getAttribute("href")!));
      expect(outsideOutline.filter((href) => href === path("lesson.p3-prac-next"))).toHaveLength(1);
   });

   test("no Lesson or Problem is linked twice across Builds on, Next lesson and the close groups", async ({ page }) => {
      for (const id of [lesson, "lesson.p3-seq-one", "lesson.p3-seq-three", "lesson.p3-seq-last", "lesson.p2-t5-long"]) {
         await page.goto(path(id));
         const hrefs = await page
            .locator("main a[href]")
            .evaluateAll((links) => links.filter((link) => link.closest("section[aria-labelledby^='lesson_'], nav[aria-label^='Next in']")).map((link) => link.getAttribute("href")!));
                const closing = hrefs.filter((href) => /^\/(lessons|problems)\//.test(href) && href !== path(id));
         expect(new Set(closing).size, `${id} shows a Lesson or Problem twice`).toBe(closing.length);
      }
   });
});

test("the last Lesson ends the Track and its trailing Problem is its Practice (S-PRC-1, AC-4)", async ({ page }) => {
   await page.goto(path("lesson.p3-seq-last"));
   await expect(page.getByRole("navigation", { name: `End of ${track("p3-sequence").title}` })).toBeVisible();
   const row = rowOf(page, "problem.p3-seq-trailing");
   await expect(row).toContainText(`Practice for this part of ${track("p3-sequence").modules[2].title}`);
   await expect(page.getByRole("link", { name: /^Next lesson/ })).toHaveCount(0);
});

test("a premium Practice Problem keeps its marker and its other bases, and shows no shared-Knowledge basis to a signed-out reader (S-PRM-3)", async ({ page }) => {
   await page.goto(path("lesson.p2-t5-long"));
   const premium = rowOf(page, "problem.p2-t5-premium-practice");
   await expect(premium).toHaveCount(1);
   await expect(premium.getByText("Premium", { exact: true })).toBeVisible();
   await expect(premium).toContainText("Builds on this lesson");
   await expect(premium).not.toContainText("Also applies");
   await expect(premium).not.toContainText(/solution|hint|rubric/i);
});

test.describe("a Lesson without Practice", () => {
   for (const id of ["lesson.p3-seq-four", "lesson.p3-single-only", "lesson.p3-unplaced"]) {
      test(`${id} renders no Practice shell, no empty container and no gap`, async ({ page }) => {
         await page.goto(path(id));
         await expect(page.getByRole("heading", { name: "Practice", exact: true })).toHaveCount(0);
         await expect(practiceRegion(page)).toHaveCount(0);
         await expect(page.getByRole("main")).not.toContainText("Practice for this part of");
         const empty = await page.locator("main div:empty").evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).display !== "none").length);
         expect(empty, "a visible empty container").toBe(0);
      });
   }
});

for (const width of [390, 1440]) {
   test.describe(`the Practice step at ${width}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test("sits after Related Knowledge and Next, is secondary to Next, wraps its rows and never overflows", async ({ page }) => {
         await page.goto(path("lesson.p3-prac-lesson"));
         const region = practiceRegion(page);
         await expect(region).toBeVisible();
         const next = (await page.getByRole("navigation", { name: /^Next in / }).boundingBox())!;
         const knowledge = (await page.getByRole("heading", { level: 2, name: "Related Knowledge" }).boundingBox())!;
         const practice = (await region.boundingBox())!;
         expect(next.y).toBeLessThan(knowledge.y);
         expect(knowledge.y).toBeLessThan(practice.y);
         expect(await page.locator("main [data-slot='button']").count(), "Next stays the one primary action").toBe(1);
         for (const row of await region.getByRole("listitem").all()) {
            const box = (await row.boundingBox())!;
            expect(box.height, "a tappable row").toBeGreaterThanOrEqual(44);
            expect(box.x + box.width, "inside the viewport").toBeLessThanOrEqual(width);
         }
         expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      });

      test("keeps one focus stop per Problem, visibly focused, and reads the Problem label before its title", async ({ page }) => {
         await page.goto(path("lesson.p3-prac-lesson"));
         const row = rowOf(page, "problem.p3-prac-a");
         const link = row.getByRole("link");
         await expect(row.getByRole("link")).toHaveCount(1);
         await link.focus();
         await expect(link).toBeFocused();
         expect(await row.evaluate((element) => getComputedStyle(element).outlineStyle !== "none")).toBe(true);
         expect(await row.evaluate((element) => element.textContent!.indexOf("Problem") < element.textContent!.indexOf("P3 Practice A"))).toBe(true);
         await link.press("Enter");
         await expect(page).toHaveURL(path("problem.p3-prac-a"));
      });
   });
}
