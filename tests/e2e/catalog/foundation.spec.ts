import type { Page } from "@playwright/test";
import { expect, item, test } from "./harness";

// P2-T1 visual foundation: behaviours worth a repeatable regression (look and feel is validated by hand).
const LESSON = `/lessons/${item("lesson.catalog-e2e-free").slug}`;
const TECHNICAL = "/lessons/p2-t1-technical";

/** Tab until `target` has focus, so the focus ring comes from real keyboard modality. */
async function tabTo(page: Page, target: ReturnType<Page["locator"]>) {
   for (let stop = 0; stop < 12; stop++) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((element) => element === document.activeElement)) return;
   }
   throw new Error("focus never reached the target");
}

test.describe("focus", () => {
   test.use({ colorScheme: "dark" });

   test("keyboard focus on a catalog page draws a solid 2px ring that differs from the dark page", async ({ page }) => {
      await page.goto(LESSON);
      await expect(page.locator("html")).toHaveClass(/dark/);
      const breadcrumb = page.getByRole("navigation", { name: "Track context" }).getByRole("link");
      await tabTo(page, breadcrumb);

      const ring = await breadcrumb.evaluate((element) => {
         const style = getComputedStyle(element);
         return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor, page: getComputedStyle(document.body).backgroundColor };
      });
      expect(ring.style).toBe("solid");
      expect(ring.width).toBe("2px");
      expect(ring.color).not.toBe(ring.page);
   });

   test("a Button keeps the same ring instead of a faint halo", async ({ page }) => {
      await page.goto("/login");
      const signIn = page.getByRole("banner").getByRole("link", { name: "Sign In" });
      await tabTo(page, signIn);
      await expect(signIn).toHaveCSS("outline-style", "solid");
      await expect(signIn).toHaveCSS("outline-width", "2px");
   });
});

test.describe("technical content at 390px", () => {
   test.use({ viewport: { width: 390, height: 844 } });

   test("wide code and tables scroll inside their own regions, never the page", async ({ page }) => {
      await page.goto(TECHNICAL);
      const code = page.getByRole("region", { name: "Code" });
      const table = page.getByRole("region", { name: "Table" });
      await expect(code).toHaveAttribute("tabindex", "0");
      await expect(table).toHaveAttribute("tabindex", "0");

      for (const region of [code, table]) {
         expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
   });

   test("a code region is reachable by keyboard and scrolls itself", async ({ page }) => {
      await page.goto(TECHNICAL);
      const code = page.getByRole("region", { name: "Code" });
      await expect(code).toHaveAttribute("tabindex", "0");
      await tabTo(page, code);
      await expect(code).toHaveCSS("outline-style", "solid");

      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollX)).toBe(0);
   });

   test("keeps the reading column inside the 16px gutters", async ({ page }) => {
      await page.goto(LESSON);
      const column = await page.locator("main > div").first().boundingBox();
      expect(column?.x).toBe(16);
      expect(column?.width).toBe(358);
   });
});

test.describe("reading measure", () => {
   test("is ~736px on desktop", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(LESSON);
      const column = await page.locator("main > div").first().boundingBox();
      expect(column?.width).toBeGreaterThanOrEqual(720);
      expect(column?.width).toBeLessThanOrEqual(760);
   });
});

test.describe("motion", () => {
   test("smooth scrolling and transitions are switched off when the reader prefers reduced motion", async ({ page }) => {
      const link = () => page.getByRole("main").getByRole("link").first();
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(LESSON);
      await expect(page.locator("html")).toHaveCSS("scroll-behavior", "smooth");
      await expect(link()).not.toHaveCSS("transition-duration", "1e-05s");

      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
      await expect(link()).toHaveCSS("transition-duration", "1e-05s");
   });
});
