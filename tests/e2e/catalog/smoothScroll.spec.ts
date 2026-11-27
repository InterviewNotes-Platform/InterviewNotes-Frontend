import type { Page } from "@playwright/test";
import { canonical, expect, item, test } from "./harness";

// Smooth scrolling (Lenis, the root layout) on the homepage only: every other route scrolls natively, a glide never carried
// across a navigation, scrollable regions and modals left to the browser, and nothing for readers who prefer reduced motion.
// The homepage's own anchor behaviour stays in home.spec.ts.
const LESSON = canonical(item("lesson.p2-t5-long").id);
const PROBLEM = canonical(item("problem.p4-ml-complete").id);

const html = (page: Page) => page.locator("html");
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const header = (page: Page) => page.getByRole("banner");
const instances = (page: Page) => page.evaluate(() => document.querySelectorAll("html.lenis").length);

/** Scroll positions drawn every frame for `ms` after the call. */
const frames = (page: Page, ms: number) =>
   page.evaluate(
      (duration) =>
         new Promise<number[]>((resolve) => {
            const values: number[] = [];
            const end = performance.now() + duration;
            const tick = () => (values.push(Math.round(window.scrollY)), performance.now() < end ? requestAnimationFrame(tick) : resolve(values));
            tick();
         }),
      ms,
   );

test.describe("homepage only", () => {
   test("the homepage has exactly one instance", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/");
      await expect(html(page)).toHaveClass(/\blenis\b/);
      expect(await instances(page)).toBe(1);
      expect(errors).toEqual([]);
   });

   const ROUTES = [
      ["Knowledge", "/knowledge"],
      ["Tracks", "/tracks"],
      ["a Lesson", LESSON],
      ["a Problem", PROBLEM],
      ["Pricing", "/pricing"],
      ["Practice", "/practice"],
      ["Privacy", "/privacy"],
      ["Login", "/login"],
      ["Sign up", "/signup"],
      ["Demo", "/demo"],
   ] as const;

   for (const [name, path] of ROUTES) {
      test(`${name} (${path}) has none, so scrolling is native`, async ({ page }) => {
         const errors: string[] = [];
         page.on("pageerror", (error) => errors.push(error.message));
         await page.goto(path);
         await expect(page.locator("main").first()).toBeVisible();
         await expect(html(page)).not.toHaveClass(/lenis/);
         expect(errors).toEqual([]);
      });
   }

   test("client navigations between other routes never create one and raise no errors", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
      await page.goto("/knowledge");
      for (const [name, url] of [["Tracks", /\/tracks$/], ["Pricing", /\/pricing$/], ["Knowledge", /\/knowledge$/]] as const) {
         await header(page).getByRole("link", { name, exact: true }).first().click();
         await expect(page).toHaveURL(url);
         expect(await instances(page)).toBe(0);
      }
      expect(errors).toEqual([]);
   });
});

test.describe("wheel scrolling", () => {
   test("glides on the homepage: the page keeps moving after the wheel stops, and ends further down", async ({ page }) => {
      await page.goto("/");
      await expect(html(page)).toHaveClass(/\blenis\b/);
      await page.mouse.move(640, 450);
      await page.mouse.wheel(0, 900);
      const seen = await frames(page, 1500);
      const final = seen.at(-1)!;
      expect(final).toBeGreaterThan(300);
      expect(seen.some((y) => y > 0 && y < final - 50), "an intermediate position was drawn").toBe(true);
   });

   test("a reader page scrolls natively: the wheel moves it at once, with no glide afterwards", async ({ page }) => {
      await page.goto(LESSON);
      await expect(page.locator("main").first()).toBeVisible();
      await page.mouse.move(640, 450);
      await page.mouse.wheel(0, 900);
      await expect.poll(() => scrollY(page)).toBeGreaterThan(300);
      const settled = await scrollY(page);
      const seen = await frames(page, 600);
      expect(new Set(seen)).toEqual(new Set([settled]));
   });

   test("a scrollable region on the homepage scrolls under the pointer first, and the page behind it stays put", async ({ page }) => {
      await page.goto("/");
      await expect(html(page)).toHaveClass(/\blenis\b/);
      await page.evaluate(() => {
         const region = document.createElement("div");
         region.id = "nested-region";
         Object.assign(region.style, { position: "fixed", top: "120px", left: "120px", width: "320px", height: "200px", overflow: "auto", zIndex: "9999", background: "white" });
         const filler = document.createElement("div");
         filler.style.height = "4000px";
         region.append(filler);
         document.body.append(region);
      });
      await page.mouse.move(250, 220);
      await page.mouse.wheel(0, 300);
      await expect.poll(() => page.locator("#nested-region").evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await scrollY(page)).toBe(0);
   });

   test("the homepage behind an open modal does not move", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await expect(html(page)).toHaveClass(/\blenis\b/);
      await page.evaluate(() => window.scrollTo({ top: 500, behavior: "instant" }));
      await expect.poll(() => scrollY(page)).toBe(500);
      await header(page).getByRole("button", { name: "Menu" }).click();
      const dialog = page.getByRole("dialog", { name: "Menu" });
      await expect(dialog).toBeVisible();
      const box = (await dialog.boundingBox())!;
      expect(box.x, "the sheet leaves a strip of the page's overlay to wheel over").toBeGreaterThan(8);
      await page.mouse.move(box.x / 2, 400);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(900);
      expect(await scrollY(page)).toBe(500);
   });
});

test.describe("navigation", () => {
   test("a glide still running when a link is followed from the homepage does not drag the next page down", async ({ page }) => {
      const follow = async () => {
         await header(page).getByRole("link", { name: "Pricing", exact: true }).first().click();
         await expect(page).toHaveURL(/\/pricing$/);
         await page.waitForTimeout(1200);
         return scrollY(page);
      };
      // Where Next leaves a page after a client navigation from a page scrolled to rest (the router's own behaviour, Lenis or not).
      await page.goto("/");
      await expect(html(page)).toHaveClass(/\blenis\b/);
      await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "instant" }));
      const fromRest = await follow();

      await page.goto("/");
      await expect(html(page)).toHaveClass(/\blenis\b/);
      await page.mouse.move(640, 450);
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(120);
      expect(await scrollY(page), "the glide has begun").toBeGreaterThan(0);
      expect(await follow()).toBe(fromRest);
   });

   test("a Problem page keeps its own fragment scroll: the CSS animation stays off and there is no instance", async ({ page }) => {
      await page.goto(PROBLEM);
      await expect(page.locator("main").first()).toBeVisible();
      await expect(html(page)).not.toHaveClass(/lenis/);
      expect(await html(page).evaluate((el) => getComputedStyle(el).scrollBehavior)).toBe("auto");
   });
});

test.describe("reduced motion", () => {
   test.use({ reducedMotion: "reduce" });

   test("the homepage creates no instance, so scrolling is native", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("main").first()).toBeVisible();
      await expect(html(page)).not.toHaveClass(/lenis/);
   });
});
