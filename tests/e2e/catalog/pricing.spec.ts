import AxeBuilder from "@axe-core/playwright";
import { canonical, CANARY, expect, test, type Identity } from "./harness";

// P8-T32: /pricing with purchase off (the default build), and the locked-Premium notice for signed-out (401) and unentitled (402) readers.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const PREMIUM_LESSON = canonical("lesson.catalog-e2e-premium");
const NOT_CLAIMED = /discord|coupon|promo|discount|trial|refund|tax|unlimited|gpt|openai|groq/i;

test("/pricing answers 200 with the three plans, no purchase control and the unavailable statement", async ({ page }) => {
   const response = await page.goto("/pricing");
   expect(response?.status()).toBe(200);
   const main = page.getByRole("main");
   await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
   await expect(main.getByText("Purchase is not available yet. Nothing is for sale today.")).toBeVisible();
   await expect(main.locator("[data-plan]")).toHaveText([
      /^Annual\$50USD per yearRenews automatically every year\./,
      /^3-year\$100USD, one paymentOne-time payment\./,
      /^Lifetime\$150USD, one paymentOne-time payment\./,
   ]);
   await expect(main.getByRole("button")).toHaveCount(0);
   await expect(main.locator("form")).toHaveCount(0);
   await expect(main.locator('[data-purchase-entry="off"]')).toHaveCount(1);
   expect(await main.innerText()).not.toMatch(NOT_CLAIMED);
});

for (const colorScheme of ["light", "dark"] as const) {
   for (const width of [390, 1440]) {
      test.describe(`/pricing, ${colorScheme} at ${width}px`, () => {
         test.use({ colorScheme, viewport: { width, height: 900 } });

         test("has no WCAG A or AA violation and no horizontal overflow", async ({ page }) => {
            await page.goto("/pricing");
            await expect(page.getByRole("table")).toBeVisible();
            const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
            expect(violations.map(({ id, nodes }) => `${id} on ${nodes.length} node(s)`)).toEqual([]);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            await page.screenshot({ path: `test-results/pricing-${colorScheme}-${width}.png`, fullPage: true });
         });
      });
   }
}

test("the comparison table is reachable by keyboard and reads by header", async ({ page }) => {
   await page.goto("/pricing");
   const table = page.getByRole("table", { name: "What Free and Premium include today" });
   await expect(table.getByRole("columnheader")).toHaveText(["Content", "Free", "Premium, any plan"]);
   await expect(table.getByRole("row", { name: /^Content marked Premium/ }).getByRole("cell")).toHaveText(["Not included", "Included"]);
   await page.keyboard.press("Tab");
   await expect(page.locator(":focus")).toBeVisible();
});

for (const identity of ["signed-out", "unentitled"] as const satisfies Identity[]) {
   test.describe(`a locked Premium Lesson as ${identity}, purchase off`, () => {
      test.use({ identity });

      test("says it is Premium and that paid access is unavailable, with no body and no Track orientation", async ({ page }) => {
         const response = await page.goto(PREMIUM_LESSON);
         expect(response?.status()).toBe(200);
         const notice = page.getByRole("main").getByRole("status");
         await expect(notice).toContainText("This is Premium content.");
         await expect(notice).toContainText("Paid access is not available yet.");
         await expect(notice.getByRole("link", { name: /plans/i })).toHaveCount(0);
         if (identity === "signed-out") await expect(notice.getByRole("link", { name: "Sign in" })).toBeVisible();
         expect(await page.content()).not.toContain(CANARY);
      });
   });
}
