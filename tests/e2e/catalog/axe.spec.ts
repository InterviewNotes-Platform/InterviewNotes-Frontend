import AxeBuilder from "@axe-core/playwright";
import { canonical, expect, test } from "./harness";

// One page of each P3 reading shape: a Lesson with code and diagrams, a Lesson with Next and Practice, a Track, a Problem placed in a Track.
const PAGES = [
   { path: canonical("lesson.p3-technical"), ready: "figure svg" },
   { path: canonical("lesson.p3-prac-lesson"), ready: "h1" },
   { path: canonical("track.p3-sequence"), ready: "h1" },
   { path: canonical("problem.p3-seq-check"), ready: "h1" },
];
// P4: the fixture Problems that carry a spine, as a signed-out reader (withheld indications, generic link phrases), and the one with the most premium material as an entitled reader.
const P4_PAGES = [
   { id: "problem.p4-ml-complete", identity: "signed-out" },
   { id: "problem.p4-sd-complete", identity: "signed-out" },
   { id: "problem.p4-premium-stages", identity: "signed-out" },
   { id: "problem.p4-premium-hints", identity: "signed-out" },
   { id: "problem.p4-premium-followups", identity: "signed-out" },
   { id: "problem.p4-premium-units", identity: "signed-out" },
   { id: "problem.p4-premium-stages", identity: "entitled" },
] as const;
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

// Closed native disclosures hide their content from axe, so each Problem is scanned as it opens and again with every reveal open.
for (const colorScheme of ["light", "dark"] as const) {
   for (const width of [390, 1440]) {
      for (const identity of ["signed-out", "entitled"] as const) {
         test.describe(`P4 Problems as ${identity}, ${colorScheme} at ${width}px`, () => {
            test.use({ colorScheme, identity, viewport: { width, height: 900 } });

            for (const { id } of P4_PAGES.filter((page) => page.identity === identity)) {
               test(`${id} has no WCAG A or AA violation, closed or fully open`, async ({ page }) => {
                  const path = canonical(id);
                  await page.goto(path);
                  await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
                  await expect(page.locator("h1").first()).toBeVisible();
                  const scan = async (state: string) => {
                     const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
                     return violations.map(({ id: rule, nodes }) => `${path} (${state}): ${rule} on ${nodes.length} node(s)`);
                  };
                  const closed = await scan("closed");
                  // A hint's next control exists only inside the previous hint, so opening runs until nothing is left closed.
                  const reveals = page.locator("main details:not([open]) > summary").filter({ visible: true });
                  for (let pass = 0; pass < 40 && (await reveals.count()) > 0; pass++) await reveals.first().click();
                  await expect(reveals).toHaveCount(0);
                  expect([...closed, ...(await scan("open"))]).toEqual([]);
               });
            }
         });
      }
   }
}

// P6: the level-choice overview and a level's close (A-9), and the Track contents drawer open below 1024px (A-5).
// The sidebar is already scanned at 1440 on the placed P3 pages above; the homepage is scanned by home.spec.ts.
const LEVEL_PAGES = [canonical("track.behavioral-interview-preparation"), canonical("lesson.p6-level-two")];
const DRAWER_PAGES = [canonical("lesson.p3-seq-one"), canonical("problem.p3-seq-check")];

for (const colorScheme of ["light", "dark"] as const) {
   for (const width of [390, 1440]) {
      test.describe(`P6 readers, ${colorScheme} at ${width}px`, () => {
         test.use({ colorScheme, viewport: { width, height: 900 } });

         test("the level-choice Track and a level Lesson have no WCAG A or AA violation", async ({ page }) => {
            for (const path of LEVEL_PAGES) {
               await page.goto(path);
               await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
               await expect(page.locator("h1").first()).toBeVisible();
               const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
               expect(violations.map(({ id, nodes }) => `${path}: ${id} on ${nodes.length} node(s)`)).toEqual([]);
            }
         });

         if (width < 1024) {
            test("the open Track contents drawer, over a Lesson and a Problem, has no WCAG A or AA violation", async ({ page }) => {
               for (const path of DRAWER_PAGES) {
                  await page.goto(path);
                  await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
                  await page.getByRole("button", { name: "Track contents" }).click();
                  const dialog = page.getByRole("dialog");
                  await expect(dialog).toBeVisible();
                  await dialog.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
                  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
                  expect(violations.map(({ id, nodes }) => `${path} (drawer open): ${id} on ${nodes.length} node(s)`)).toEqual([]);
               }
            });
         }
      });
   }
}

test("the scan reports a violation planted on a P3 page, so a clean result means something", async ({ page }) => {
   await page.goto(PAGES[1].path);
   await page.getByRole("main").evaluate((main) => main.insertAdjacentHTML("beforeend", "<button></button>"));
   const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
   expect(violations.map(({ id }) => id)).toContain("button-name");
});
