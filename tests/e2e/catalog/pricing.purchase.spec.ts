import { canonical, CANARY, expect, test, type Identity } from "./harness";

// P8-T32/T33 with the build flag on (T33's checkout states are exercised by the T33 headless probe, against the fake billing double). Needs a build made with NEXT_PUBLIC_PURCHASE_ENABLED=true, so it is skipped in the default run;
// set E2E_PURCHASE_ENABLED=true for a run whose build has the flag on.
test.skip(process.env.E2E_PURCHASE_ENABLED !== "true", "needs a build with NEXT_PUBLIC_PURCHASE_ENABLED=true");

const PREMIUM_LESSON = canonical("lesson.catalog-e2e-premium");

test("/pricing with purchase on shows one buy action per accepted plan and no form", async ({ page }) => {
   expect((await page.goto("/pricing"))?.status()).toBe(200);
   const main = page.getByRole("main");
   await expect(main.locator('[data-purchase-entry="on"]')).toHaveCount(1);
   await expect(main.getByText("Checkout is not connected in this build, so no payment can be made yet.")).toHaveCount(0);
   await expect(main.getByRole("button")).toHaveText(["Buy Annual, $50 USD per year", "Buy 3-year, $100 USD, one payment", "Buy Lifetime, $150 USD, one payment"]);
   await expect(main.locator("form")).toHaveCount(0);
});

for (const identity of ["signed-out", "unentitled"] as const satisfies Identity[]) {
   test.describe(`a locked Premium Lesson as ${identity}, purchase on`, () => {
      test.use({ identity });

      test("links to /pricing, which opens, and never states unavailability", async ({ page }) => {
         await page.goto(PREMIUM_LESSON);
         const notice = page.getByRole("main").getByRole("status");
         await expect(notice).toContainText("This is Premium content.");
         await expect(notice).not.toContainText("Paid access is not available yet.");
         expect(await page.content()).not.toContain(CANARY);
         await notice.getByRole("link", { name: "See Premium plans and prices" }).click();
         await expect(page).toHaveURL(/\/pricing$/);
         await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      });
   });
}
