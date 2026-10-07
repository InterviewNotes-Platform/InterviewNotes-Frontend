import type { Locator, Page } from "@playwright/test";
import { canonical, expect, item, test } from "./harness";

// P3-T7 Knowledge in context over the synthetic "P3 Knowledge References" Lesson: a heading reference, the first body
// reference to related Knowledge, an unrelated reference and a repeat. The Lesson relates only `p3-ref-related`.
const LESSON = canonical("lesson.p3-knowledge-refs");
const RELATED = item("knowledge.p3-ref-related");
const toggleOf = (page: Page) => page.getByRole("button", { name: `About ${RELATED.title}` });
const panelOf = (page: Page) => page.getByRole("group", { name: `About ${RELATED.title}` });

/** The page hydrates after it loads: retry the interaction until the handler is attached, never assert before it. */
const until = (action: () => Promise<void>) => expect(action).toPass({ timeout: 10_000 });

async function open(page: Page, toggle: Locator) {
   await until(async () => {
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
   });
}

test("AC-12: the first reference to related Knowledge opens its summary by keyboard; Escape closes it and returns focus to the toggle", async ({ page }) => {
   await page.goto(LESSON);
   const toggle = toggleOf(page);
   await expect(toggle).toHaveCount(1);
   await expect(toggle).toHaveAttribute("aria-expanded", "false");
   await expect(page.getByText(RELATED.summary)).toHaveCount(0);

   await open(page, toggle);
   await expect(panelOf(page)).toContainText(RELATED.summary);
   await expect(panelOf(page).getByRole("link", { name: `Open ${RELATED.title}` })).toHaveAttribute("href", canonical(RELATED.id));
   await expect(page.getByRole("dialog")).toHaveCount(0);
   await expect(toggle).toBeFocused(); // opening moved no focus off the toggle the keyboard was on

   await page.keyboard.press("Escape");
   await expect(panelOf(page)).toHaveCount(0);
   await expect(toggle).toHaveAttribute("aria-expanded", "false");
   await expect(toggle).toBeFocused();
});

test("Tab reaches the panel's Open link in reading order, and Escape from inside returns focus to the same toggle", async ({ page }) => {
   await page.goto(LESSON);
   const toggle = toggleOf(page);
   await open(page, toggle);
   await page.keyboard.press("Tab");
   await expect(panelOf(page).getByRole("link", { name: `Open ${RELATED.title}` })).toBeFocused();
   await page.keyboard.press("Escape");
   await expect(panelOf(page)).toHaveCount(0);
   await expect(toggle).toBeFocused();
});

test("offers context at the first related reference only: none for the heading, the repeat or the unrelated reference", async ({ page }) => {
   await page.goto(LESSON);
   await expect(page.getByRole("button", { name: /^About / })).toHaveCount(1);
   const references = page.locator("main [data-reference='knowledge']");
   await expect(references).toHaveCount(4); // heading, first, unrelated, repeat: every one is still a link
   await expect(page.getByRole("heading", { level: 2 }).getByRole("button")).toHaveCount(0);
   const unrelated = page.getByRole("link", { name: "outside knowledge" });
   await expect(unrelated).toHaveAttribute("href", canonical("knowledge.p3-prac-shared"));
   await expect(unrelated.locator("xpath=following-sibling::*[1]//button")).toHaveCount(0);
   const repeat = page.getByRole("link", { name: "related knowledge again" });
   await expect(repeat.locator("xpath=following-sibling::*[1]//button")).toHaveCount(0);
   // the toggle sits right after the first reference, which stays a link
   const first = page.getByRole("link", { name: "related knowledge", exact: true });
   await expect(first).toHaveAttribute("href", canonical(RELATED.id));
   await expect(first.locator("xpath=following-sibling::*[1]//button")).toHaveCount(1);
});

test("the summary is shown once: in context, while Related Knowledge still lists the item without it (S-KNW-6)", async ({ page }) => {
   await page.goto(LESSON);
   const related = page.getByRole("region", { name: "Related Knowledge" });
   await expect(related.getByRole("link", { name: RELATED.title, exact: true })).toHaveAttribute("href", canonical(RELATED.id));
   await expect(related).not.toContainText(RELATED.summary);
   await open(page, toggleOf(page));
   await expect(page.getByText(RELATED.summary)).toHaveCount(1);
});

test("makes no catalog request of its own: opening a panel reads no item, route or API (the shell's own prefetches aside)", async ({ page }) => {
   await page.goto(LESSON);
   await open(page, toggleOf(page));
   const requests: string[] = [];
   page.on("request", (request) => void requests.push(new URL(request.url()).pathname));
   await page.keyboard.press("Escape");
   await open(page, toggleOf(page));
   await page.waitForTimeout(300);
   expect(requests.filter((path) => /^\/(lessons|knowledge|problems|tracks|catalog)(\/|$)/.test(path))).toEqual([]);
});

test("honours reduced motion: the panel has no transition or animation", async ({ page }) => {
   await page.emulateMedia({ reducedMotion: "reduce" });
   await page.goto(LESSON);
   await open(page, toggleOf(page));
   const motion = await panelOf(page).evaluate((panel) => {
      const style = getComputedStyle(panel);
      return { transition: style.transitionDuration, animation: style.animationName };
   });
   // the global reduced-motion rule floors transitions at 0.00001s; the panel declares none of its own
   expect(motion.animation).toBe("none");
   expect(parseFloat(motion.transition)).toBeLessThanOrEqual(0.001);
});

test.describe("by touch at 390px", () => {
   test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

   test("a tap opens the summary, a tap outside closes it, and the panel stays inside the viewport", async ({ page }) => {
      await page.goto(LESSON);
      const toggle = toggleOf(page);
      await until(async () => {
         await toggle.tap();
         await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
      });
      const box = await panelOf(page).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.getByRole("heading", { level: 1 }).tap();
      await expect(panelOf(page)).toHaveCount(0);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
   });
});
