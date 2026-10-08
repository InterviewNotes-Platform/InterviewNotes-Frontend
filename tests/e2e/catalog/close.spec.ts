import type { Locator, Page } from "@playwright/test";
import { canonical, expect, item, test, track } from "./harness";

// P3-T5 Lesson close over the synthetic P3 fixtures: Next lesson or End of Track, relations, Curriculum block, secondary.
const sequence = track("p3-sequence");
const practice = track("p3-practice");
const nextNav = (page: Page, trackTitle: string) => page.getByRole("navigation", { name: `Next in ${trackTitle}` });
const endNav = (page: Page, trackTitle: string) => page.getByRole("navigation", { name: `End of ${trackTitle}` });
const curriculum = (page: Page) => page.getByRole("navigation", { name: "Curriculum" });
const top = async (locator: Locator) => (await locator.boundingBox())!.y;
const FORBIDDEN = /complet|finish|\bdone\b|congratulat|well done|\d+\s?%|[✓✔]/i;

test("a Lesson's Next lesson is the canonical next Lesson, never the Problem between them (AC-1, AC-2)", async ({ page }) => {
   await page.goto(canonical("lesson.p3-seq-one"));
   const next = nextNav(page, sequence.title).getByRole("link");
   await expect(next).toHaveCount(1);
   await expect(next).toHaveAccessibleName(`Next lesson: ${item("lesson.p3-seq-two").title}`);
   await expect(next).toHaveAttribute("href", canonical("lesson.p3-seq-two"));
   await expect(next).toContainText(item("lesson.p3-seq-two").summary);
   await next.click();
   await expect(page).toHaveURL(canonical("lesson.p3-seq-two"));
});

test("Lesson, Problem, Lesson: the Problem page's Next lesson is the same Lesson (AC-2, AC-8)", async ({ page }) => {
   await page.goto(canonical("lesson.p3-seq-one"));
   const lessonNext = await nextNav(page, sequence.title).getByRole("link").getAttribute("href");
   await page.goto(canonical("problem.p3-seq-check"));
   const problemNext = page.getByRole("navigation", { name: `Previous and next in ${sequence.title}` }).getByRole("link", { name: /^Next lesson/ });
   await expect(problemNext).toHaveAttribute("href", lessonNext!);
   await problemNext.click();
   await expect(page).toHaveURL(canonical("lesson.p3-seq-two"));
});

test("a premium Next lesson shows only its public fields and the premium marker (AC-18)", async ({ page }) => {
   await page.goto(canonical("lesson.p3-gate-open"));
   const next = nextNav(page, track("p3-gated").title).getByRole("link");
   await expect(next).toHaveAccessibleName(`Next lesson: ${item("lesson.p3-locked-premium").title}, premium`);
   await expect(next).toContainText(item("lesson.p3-locked-premium").summary);
   await expect(next.getByText("Premium", { exact: true })).toBeVisible();
});

test.describe("End of Track (AC-4)", () => {
   for (const id of ["lesson.p3-seq-last", "lesson.p3-single-only"]) {
      test(`${id} states its position, links the Track, and claims no completion`, async ({ page }) => {
         const owner = track(id === "lesson.p3-seq-last" ? "p3-sequence" : "p3-single");
         await page.goto(canonical(id));
         const end = endNav(page, owner.title);
         await expect(end).toContainText(`End of ${owner.title}`);
         await expect(end).toContainText("This is the last lesson in this track.");
         await expect(end.getByRole("link")).toHaveAttribute("href", canonical(owner.id));
         await expect(page.getByRole("navigation", { name: /^Next in / })).toHaveCount(0);
         await expect(page.getByRole("link", { name: /^Next lesson/ })).toHaveCount(0);
         expect(await end.innerText()).not.toMatch(FORBIDDEN);
         await expect(page.getByRole("main")).not.toContainText(/congratulations|well done/i);
      });
   }
});

test.describe("home Track and placement (AC-6)", () => {
   test("a Lesson in two Tracks follows its home Track for Next and Back to module", async ({ page }) => {
      await page.goto(canonical("lesson.p3-multi-shared"));
      await expect(nextNav(page, track("p3-multi-a").title).getByRole("link")).toHaveAttribute("href", canonical("lesson.p3-multi-a-after"));
      await expect(page.getByRole("link", { name: item("lesson.p3-multi-b-after").title })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Also in these Tracks" })).toBeVisible();
   });

   for (const id of ["lesson.p3-unplaced", "lesson.p3-nohome-shared"]) {
      test(`${id} has no Next, End of Track, Curriculum block or empty container`, async ({ page }) => {
         await page.goto(canonical(id));
         for (const name of [/^Next in /, /^End of /, "Curriculum"]) await expect(page.getByRole("navigation", { name })).toHaveCount(0);
         await expect(page.getByRole("link", { name: /^Next lesson|^Back to module/ })).toHaveCount(0);
         const empty = await page.locator("main div:empty").evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).display !== "none").length);
         expect(empty, "a visible empty container").toBe(0);
      });
   }
});

test("Back to module lands on the Module, open and in view (AC-7)", async ({ page }) => {
   await page.goto(canonical("lesson.p3-seq-last"));
   const back = curriculum(page).getByRole("link", { name: /^Back to module/ });
   await expect(back).toHaveAttribute("href", `${canonical(sequence.id)}#tail`);
   await expect(curriculum(page)).toContainText("Module 3 of 3");
   await back.click();
   await expect(page).toHaveURL(`${canonical(sequence.id)}#tail`);
   await expect(page.locator("#tail")).toBeInViewport({ ratio: 1 });
   await expect(page.getByRole("navigation", { name: `${sequence.title} outline` }).getByRole("button", { name: /^Module 3 / })).toHaveAttribute("aria-expanded", "true");
});

for (const width of [390, 1440]) {
   test.describe(`the close at ${width}`, () => {
      test.use({ viewport: { width, height: 900 } });
      const lesson = "lesson.p3-prac-lesson";

      test("reads Next, Knowledge, Practice, Problems, Curriculum, then the full outline, with nothing between the body and Next (AC-1, AC-9, AC-17)", async ({ page }) => {
         await page.goto(canonical(lesson));
         const body = page.getByText("P3 Practice Lesson body marker.");
         const next = nextNav(page, practice.title);
         const groups = ["Related Knowledge", "Practice", "Related Problems"].map((name) => page.getByRole("heading", { level: 2, name, exact: true }));
         const after = [next, ...groups, curriculum(page), page.getByText(`Full outline of ${practice.title}`)];
         const ys = [await top(body)];
         for (const locator of after) {
            await expect(locator).toBeVisible();
            ys.push(await top(locator));
         }
         ys.slice(1).forEach((y, index) => expect(y, `group ${index} sits below the one before it`).toBeGreaterThan(ys[index]));
         // DOM order equals visual order: a CSS reorder would put a group first in the DOM but last on screen
         const dom = await page.locator("main").evaluate((main) => {
            const at = (selector: string) => [...main.querySelectorAll(selector)][0];
            const nodes = [at('nav[aria-label^="Next in"]'), at("#lesson_related_knowledge"), at("#lesson_practice"), at("#lesson_related_problems"), at('nav[aria-label="Curriculum"]')];
            return nodes.every((node, index) => index === 0 || !!(nodes[index - 1]!.compareDocumentPosition(node!) & Node.DOCUMENT_POSITION_FOLLOWING));
         });
         expect(dom).toBe(true);
         expect(await page.locator("main [data-slot='button']").count(), "one primary action in the close").toBe(1);
      });

      test("keeps Next in the flow, never fixed or sticky, and never overflows", async ({ page }) => {
         for (const id of [lesson, "lesson.p3-seq-last", "lesson.p3-seq-one"]) {
            await page.goto(canonical(id));
            const positions = await page.locator("main nav, main nav a").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).position));
            expect(positions.filter((position) => position === "fixed" || position === "sticky")).toEqual([]);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), id).toBe(true);
         }
      });

      test("has a primary Next with a tap target of at least 44px and a visible keyboard focus", async ({ page }) => {
         await page.goto(canonical(lesson));
         const next = nextNav(page, practice.title).getByRole("link");
         expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
         await next.focus();
         expect(await next.evaluate((node) => getComputedStyle(node).outlineStyle !== "none" || getComputedStyle(node).boxShadow !== "none")).toBe(true);
         const back = curriculum(page).getByRole("link", { name: /^Back to module/ });
         expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      });
   });
}
