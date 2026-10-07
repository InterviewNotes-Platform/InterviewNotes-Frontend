import { canonical, expect, test } from "./harness";

// P3-T8 code block chrome: Copy by keyboard puts the exact fence text on the clipboard and announces it.
const LESSON = canonical("lesson.p3-technical");
const FENCE = "def synthetic_rank(candidates):\n    return sorted(candidates)";

test("keyboard Copy on the titled block copies the exact fence text and announces Copied (AC-16)", async ({ page, context }) => {
   await context.grantPermissions(["clipboard-read", "clipboard-write"]);
   await page.goto(LESSON);

   const group = page.getByRole("group", { name: "Python code: synthetic_ranker.py" });
   await expect(group).toContainText("Python");
   await expect(group).toContainText("synthetic_ranker.py");
   const copy = group.getByRole("button", { name: "Copy Python code" });
   await expect(copy).toBeVisible();

   for (let stop = 0; stop < 90 && !(await copy.evaluate((element) => element === document.activeElement)); stop++) {
      await page.keyboard.press("Tab");
   }
   await expect(copy).toBeFocused();
   await page.keyboard.press("Enter");

   await expect(group.getByRole("status")).toHaveText("Copied");
   await expect(copy).toHaveText("Copied");
   expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(FENCE);
});
