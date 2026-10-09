import type { APIRequestContext, Page } from "@playwright/test";
import { expect, ISOLATED_API_ORIGIN, ISOLATED_ORIGIN, test } from "./catalog/harness";

// P2-T3 editorial homepage: static and presentation-only (look and feel is validated by hand).
const DOORS = [
   ["Learn", "/tracks"],
   ["Knowledge", "/knowledge"],
   ["Practice", "/practice"],
] as const;

const doors = (page: Page) => page.getByRole("region", { name: "Where to start" }).getByRole("link");

test("is prerendered, so it cannot depend on API data at request time", async ({ request }) => {
   const response = await request.get("/");
   expect(response.status()).toBe(200);
   expect(response.headers()["cache-control"]).not.toMatch(/no-store|private/);
});

test.describe("catalog independence", () => {
   // The private deployment's API double receives nothing from any other test, so its log is this test's alone.
   test.use({ baseURL: ISOLATED_ORIGIN });

   const catalogLog = async (request: APIRequestContext): Promise<{ path: string }[]> =>
      (await request.get(`${ISOLATED_API_ORIGIN}/__catalog-log`)).json();

   test("loading / makes no /catalog request, while a catalog route on the same deployment does", async ({ page, request }) => {
      const before = await catalogLog(request);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await catalogLog(request), "the homepage requested a /catalog endpoint").toEqual(before);

      // Control: the same deployment is wired to this API double, so a request would have been logged.
      const probe = `p2-t3-log-probe-${Date.now()}`;
      await request.get(`/lessons/${probe}`);
      const after = await catalogLog(request);
      expect(after.filter((entry) => entry.path.includes(probe)).length).toBeGreaterThan(0);
   });
});

test("offers one h1 and Learn, Knowledge and Practice as links to their landing routes", async ({ page }) => {
   await page.goto("/");
   await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
   await expect(doors(page)).toHaveCount(3);
   for (const [index, [title, href]] of DOORS.entries()) {
      await expect(doors(page).nth(index)).toHaveAttribute("href", href);
      await expect(doors(page).nth(index)).toHaveAccessibleName(new RegExp(`^${title}\\b`));
   }
});

test("keyboard reaches the two hero actions, the access action, then the three entry links in order, each with a solid 2px focus ring", async ({ page }) => {
   await page.goto("/");
   await page.keyboard.press("Tab"); // skip link
   await page.keyboard.press("Enter");
   await expect(page.locator("#main-content")).toBeFocused();

   const hero = page.getByRole("region", { name: /Crack your next/ });
   for (const name of ["Start learning", "How access works"]) {
      await page.keyboard.press("Tab");
      await expect(hero.getByRole("link", { name })).toBeFocused();
   }

   await page.keyboard.press("Tab");
   await expect(page.locator("#access").getByRole("link", { name: "Start learning" })).toBeFocused();

   for (const [index] of DOORS.entries()) {
      await page.keyboard.press("Tab");
      await expect(doors(page).nth(index)).toBeFocused();
      await expect(doors(page).nth(index)).toHaveCSS("outline-style", "solid");
      await expect(doors(page).nth(index)).toHaveCSS("outline-width", "2px");
   }
});

test("the hero's access action scrolls to the access section", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("link", { name: "How access works" }).click();
   await expect(page).toHaveURL(/#access$/);
   await expect(page.locator("#access")).toBeInViewport();
});

test("shows the three planned prices in the access section, with no purchase control", async ({ page }) => {
   await page.goto("/");
   const access = page.locator("#access");
   await expect(access.getByRole("list", { name: "Planned pricing" }).getByRole("listitem")).toHaveText(["$50/year", "$100/3 years", "$150/lifetime"]);
   await expect(access.getByText("Paid access is not available yet", { exact: false }).first()).toBeVisible();
   await expect(access.locator("button, form, input")).toHaveCount(0);
   await expect(access.getByRole("link")).toHaveCount(1); // Start learning only
});

test.describe("reduced motion", () => {
   test.use({ reducedMotion: "reduce" });

   test("collapses the door's hover transitions", async ({ page }) => {
      await page.goto("/");
      const arrow = doors(page).first().locator("svg").last(); // the icon tile's svg comes first
      expect(await arrow.evaluate((svg) => parseFloat(getComputedStyle(svg).transitionDuration))).toBeLessThan(0.001);
      const tile = doors(page).first().locator("svg").first().locator("..");
      expect(await tile.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(0.001);
      expect(await doors(page).first().evaluate((a) => parseFloat(getComputedStyle(a).transitionDuration))).toBeLessThan(0.001);
   });
});

for (const [width, height, row] of [
   [1440, 900, true],
   [1024, 768, true],
   [768, 1024, false],
   [390, 844, false],
] as const) {
   test.describe(`at ${width}px`, () => {
      test.use({ viewport: { width, height } });

      test(`${row ? "lays the three entry points side by side" : "stacks the three entry points"} without horizontal overflow`, async ({ page }) => {
         await page.goto("/");
         expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

         const boxes = await doors(page).evaluateAll((links) =>
            links.map((link) => {
               const { x, y, width: w } = link.getBoundingClientRect();
               return { x: Math.round(x), y: Math.round(y), w: Math.round(w) };
            }),
         );
         expect(new Set(boxes.map((box) => box.w)).size, "equal widths: no door dominates").toBe(1);
         expect(new Set(boxes.map((box) => (row ? box.y : box.x))).size, row ? "one row" : "one column").toBe(1);
      });

      test(`${width >= 640 ? "lays the three prices in a row" : "stacks the three prices"} inside the viewport`, async ({ page }) => {
         await page.goto("/");
         const prices = page.locator("#access").getByRole("list", { name: "Planned pricing" }).getByRole("listitem");
         const boxes = await prices.evaluateAll((items) =>
            items.map((item) => {
               const { x, y, right } = item.getBoundingClientRect();
               return { x: Math.round(x), y: Math.round(y), right: Math.round(right) };
            }),
         );
         expect(boxes).toHaveLength(3);
         expect(new Set(boxes.map((box) => (width >= 640 ? box.y : box.x))).size).toBe(1);
         expect(Math.max(...boxes.map((box) => box.right))).toBeLessThanOrEqual(width);
      });
   });
}
