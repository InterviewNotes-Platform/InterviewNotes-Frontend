import type { Page } from "@playwright/test";
import { canonical, expect, item, test, track } from "./harness";

// P3-T2 curriculum navigation over the synthetic P3 fixtures: Previous and Next name Lessons, never Problems.
const steps = (page: Page) => page.getByRole("navigation", { name: /^Previous and next in / });
const breadcrumb = (page: Page) => page.getByRole("navigation", { name: "Breadcrumb" });

type Side = string | null;

const cases: { name: string; id: string; previous: Side; next: Side; premiumNext?: boolean }[] = [
   { name: "Lesson -> Problem -> Lesson skips the Problem", id: "lesson.p3-seq-one", previous: null, next: "lesson.p3-seq-two" },
   { name: "a Problem between two Lessons names both Lessons", id: "problem.p3-seq-check", previous: "lesson.p3-seq-one", next: "lesson.p3-seq-two" },
   { name: "Next lesson crosses a Module boundary whose first entry is a Problem", id: "lesson.p3-seq-two", previous: "lesson.p3-seq-one", next: "lesson.p3-seq-three" },
   { name: "three consecutive Problems are skipped", id: "lesson.p3-seq-three", previous: "lesson.p3-seq-two", next: "lesson.p3-seq-four" },
   { name: "a Problem in a run of Problems names the Lessons around the run", id: "problem.p3-seq-drill-3", previous: "lesson.p3-seq-three", next: "lesson.p3-seq-four" },
   { name: "the last Lesson has no Next, though a Problem trails it", id: "lesson.p3-seq-last", previous: "lesson.p3-seq-four", next: null },
   { name: "a trailing Problem has only a Previous lesson", id: "problem.p3-seq-trailing", previous: "lesson.p3-seq-last", next: null },
   { name: "a leading Problem has only a Next lesson", id: "problem.p3-lead-warmup", previous: null, next: "lesson.p3-lead-first" },
   { name: "a Lesson after a leading Problem has no Previous", id: "lesson.p3-lead-first", previous: null, next: null },
   { name: "a single-Lesson Track has neither", id: "lesson.p3-single-only", previous: null, next: null },
   { name: "a Track of Problems only has neither", id: "problem.p3-only-one", previous: null, next: null },
   { name: "a Lesson in two Tracks follows its home Track only", id: "lesson.p3-multi-shared", previous: "lesson.p3-multi-a-before", next: "lesson.p3-multi-a-after" },
   { name: "the lone unmarked placement is home and gets Lesson navigation (F-2)", id: "lesson.p3-unmarked-lone", previous: null, next: "lesson.p3-unmarked-after" },
   { name: "an empty Module before the first Lesson changes nothing", id: "lesson.p3-edge-first", previous: null, next: "lesson.p3-edge-shell" },
   { name: "a premium Next lesson is linked and marked", id: "lesson.p3-gate-open", previous: null, next: "lesson.p3-locked-premium", premiumNext: true },
];

for (const { name, id, previous, next, premiumNext } of cases) {
   test(name, async ({ page }) => {
      await page.goto(canonical(id));
      const nav = steps(page);
      if (!previous && !next) {
         await expect(nav).toHaveCount(0);
         return;
      }
      for (const [label, target] of [["Previous lesson", previous], ["Next lesson", next]] as const) {
         const link = nav.getByRole("link", { name: new RegExp(`^${label}`) });
         if (!target) {
            await expect(link).toHaveCount(0);
            continue;
         }
         await expect(link).toHaveAttribute("href", canonical(target));
         await expect(link).toHaveAccessibleName(new RegExp(`^${label}: ${item(target).title}`));
      }
      if (premiumNext) await expect(nav.getByRole("link", { name: /^Next lesson/ }).getByText("Premium", { exact: true })).toBeVisible();
      await expect(nav.getByRole("link")).toHaveCount((previous ? 1 : 0) + (next ? 1 : 0));
   });
}

test.describe("home Track", () => {
   test("two Tracks and no primary placement: no home Track, no Lesson navigation, both Tracks as alternates", async ({ page }) => {
      await page.goto(canonical("lesson.p3-nohome-shared"));
      await expect(breadcrumb(page)).toHaveCount(0);
      await expect(steps(page)).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Also in these Tracks" })).toBeVisible();
   });

   test("an unplaced Lesson has no Track context at all", async ({ page }) => {
      await page.goto(canonical("lesson.p3-unplaced"));
      await expect(breadcrumb(page)).toHaveCount(0);
      await expect(steps(page)).toHaveCount(0);
   });

   test("the lone unmarked placement gets its Track breadcrumb", async ({ page }) => {
      await page.goto(canonical("lesson.p3-unmarked-lone"));
      await expect(breadcrumb(page)).toContainText(track("p3-unmarked").title);
      await expect(breadcrumb(page).getByRole("link", { name: track("p3-unmarked").title })).toHaveAttribute("href", canonical("track.p3-unmarked"));
   });
});

// AC-3: Start is the first Lesson, never the Problem that is placed before it.
test("Start on a Track whose first placement is a Problem opens its first Lesson", async ({ page }) => {
   const leading = track("p3-leading");
   const [warmup, first] = leading.modules[0].items.map(item);
   expect(warmup.type, "fixture no longer leads with a Problem").toBe("problem");
   await page.goto(canonical(leading.id));
   const start = page.getByRole("main").getByRole("link", { name: /^Start/ });
   await expect(start).toHaveCount(1);
   await expect(start).toHaveAccessibleName(`Start with ${first.title}`);
   await expect(start).toHaveAttribute("href", canonical(first.id));
   await start.click();
   await expect(page).toHaveURL(canonical(first.id));
   await expect(page.getByRole("heading", { level: 1 })).toHaveText(first.title);
});

// S-MOD-4, S-MOD-5, AC-7 (orientation half): a Lesson's Module link lands on the Track page with that Module open and in view.
const sequence = track("p3-sequence");
const moduleOf = (key: string) => sequence.modules.findIndex((m) => m.key === key);
const controlOf = (page: Page, key: string) =>
   page.getByRole("navigation", { name: `${sequence.title} outline` }).getByRole("button", { name: new RegExp(`^Module ${moduleOf(key) + 1} `) });

for (const width of [390, 1440]) {
   test.describe(`Module location at ${width}`, () => {
      test.use({ viewport: { width, height: 900 } });

      test("the breadcrumb Module link opens that Module below the sticky header", async ({ page }) => {
         await page.goto(canonical("lesson.p3-seq-last"));
         await expect(page.getByText("Module 3 of 3 · Lesson 1 of 1")).toBeVisible();
         await breadcrumb(page).getByRole("link", { name: "Tail" }).click();
         await expect(page).toHaveURL(`${canonical(sequence.id)}#tail`);
         await expect(controlOf(page, "tail")).toHaveAttribute("aria-expanded", "true");
         await expect(controlOf(page, "basics")).toHaveAttribute("aria-expanded", "true");
         await expect(controlOf(page, "crossing")).toHaveAttribute("aria-expanded", "false");
         const section = page.locator("#tail");
         await expect(section).toBeInViewport({ ratio: 1 });
         const header = await page.locator("body > header, header").first().boundingBox();
         expect((await section.boundingBox())!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
         expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      });

      test("arriving on a fragment, or changing it, opens that Module; an unknown fragment does nothing", async ({ page }) => {
         await page.goto(`${canonical(sequence.id)}#crossing`);
         await expect(controlOf(page, "crossing")).toHaveAttribute("aria-expanded", "true");
         await expect(page.locator("#crossing")).toBeInViewport({ ratio: 1 });
         await page.evaluate(() => (window.location.hash = "#tail"));
         await expect(controlOf(page, "tail")).toHaveAttribute("aria-expanded", "true");
         await page.evaluate(() => (window.location.hash = "#nowhere"));
         await page.waitForTimeout(100);
         await expect(controlOf(page, "tail")).toHaveAttribute("aria-expanded", "true");
         await expect(controlOf(page, "crossing")).toHaveAttribute("aria-expanded", "true");
      });
   });
}

test("a Module keyed like the app shell has no fragment: its link is the plain Track URL", async ({ page }) => {
   await page.goto(canonical("lesson.p3-edge-shell"));
   await expect(breadcrumb(page).getByRole("link", { name: "Shell id" })).toHaveAttribute("href", canonical("track.p3-module-edges"));
   await page.goto(canonical("track.p3-module-edges"));
   await expect(page.locator("#main-content")).toHaveCount(1);
});

test("a deep-linked later Lesson shows its orientation, nothing locked or warned (AC-5)", async ({ page }) => {
   await page.goto(canonical("lesson.p3-seq-four"));
   await expect(breadcrumb(page)).toBeVisible();
   await expect(page.getByText("Module 2 of 3 · Lesson 2 of 2")).toBeVisible();
   await expect(page.getByRole("main")).not.toContainText(/locked|premium required|continue|resume/i);
});
