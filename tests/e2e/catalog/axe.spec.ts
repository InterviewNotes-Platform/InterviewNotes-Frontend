import AxeBuilder from "@axe-core/playwright";
import { canonical, expect, test } from "./harness";

// One page of each P3 reading shape: a Lesson with code and diagrams, a Lesson with Next and Practice, a Track, a Problem placed in a Track.
const PAGES = [
   { path: canonical("lesson.p3-technical"), ready: "figure svg" },
   { path: canonical("lesson.p3-prac-lesson"), ready: "h1" },
   { path: canonical("track.p3-sequence"), ready: "h1" },
   { path: canonical("problem.p3-seq-check"), ready: "h1" },
];
// WCAG A and AA only, so a new best-practice rule in an axe upgrade cannot fail the suite.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

for (const colorScheme of ["light", "dark"] as const) {
   for (const width of [390, 1440]) {
      test.describe(`${colorScheme} at ${width}px`, () => {
         test.use({ colorScheme, viewport: { width, height: 900 } });

         test("the P3 reading pages have no WCAG A or AA violation", async ({ page }) => {
            for (const { path, ready } of PAGES) {
               await page.goto(path);
               await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
               await expect(page.locator(ready).first()).toBeVisible();
               const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
               expect(violations.map(({ id, nodes }) => `${path}: ${id} on ${nodes.length} node(s)`)).toEqual([]);
            }
         });
      });
   }
}

test("the scan reports a violation planted on a P3 page, so a clean result means something", async ({ page }) => {
   await page.goto(PAGES[1].path);
   await page.getByRole("main").evaluate((main) => main.insertAdjacentHTML("beforeend", "<button></button>"));
   const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
   expect(violations.map(({ id }) => id)).toContain("button-name");
});
