import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, ISOLATED_API_ORIGIN, ISOLATED_ORIGIN, test } from "./catalog/harness";

// Homepage: static and presentation-only (look and feel is validated by hand). Tracks lead, Knowledge supports them.
const TRACK_HREFS = ["/learn/gen-ai-native-design", "/learn/ml-system-design", "/learn/llm-platform-design", "/learn/ml-platform-design", "/learn/gen-ai-foundations"] as const;
const TRACK_TITLES = ["Gen AI Native Design", "ML System Design", "LLM Platform Design", "ML Platform Design", "Gen AI Foundations"] as const;

const tracks = (page: Page) => page.getByRole("region", { name: "Choose Your Path" });
const trackCards = (page: Page) => tracks(page).getByRole("list").last().getByRole("link");
const pricing = (page: Page) => page.locator("#pricing");
const plans = (page: Page) => pricing(page).getByRole("list", { name: "Planned pricing" }).getByRole("listitem");

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

test("offers one h1, the five tracks as links to their courses and Knowledge as a link to its explorer", async ({ page }) => {
   await page.goto("/");
   await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
   await expect(trackCards(page)).toHaveCount(TRACK_TITLES.length);
   for (const [index, title] of TRACK_TITLES.entries()) {
      await expect(trackCards(page).nth(index)).toHaveAttribute("href", TRACK_HREFS[index]);
      await expect(trackCards(page).nth(index)).toHaveAccessibleName(new RegExp(`^${title}\\b`));
   }
   await expect(page.locator("#knowledge").getByRole("link")).toHaveAttribute("href", "/knowledge");
   await expect(page.getByRole("link", { name: /practice/i })).toHaveCount(0);
});

test("keyboard reaches the two hero actions, then the track cards in order, each with a solid 2px focus ring", async ({ page }) => {
   await page.goto("/");
   await page.keyboard.press("Tab"); // skip link
   await page.keyboard.press("Enter");
   await expect(page.locator("#main-content")).toBeFocused();

   const hero = page.getByRole("region", { name: /Crack Your Next/ });
   for (const name of ["Start Learning", "View Pricing"]) {
      await page.keyboard.press("Tab");
      await expect(hero.getByRole("link", { name })).toBeFocused();
   }

   for (const index of TRACK_TITLES.keys()) {
      await page.keyboard.press("Tab");
      await expect(trackCards(page).nth(index)).toBeFocused();
      await expect(trackCards(page).nth(index)).toHaveCSS("outline-style", "solid");
      await expect(trackCards(page).nth(index)).toHaveCSS("outline-width", "2px");
   }
});

test("a visitor reaches real content: a track card opens its course and a chapter", async ({ page }) => {
   await page.goto("/");
   await trackCards(page).filter({ hasText: "ML System Design" }).click();
   await expect(page).toHaveURL("/learn/ml-system-design");
   await page.getByRole("link", { name: "E2E Home Card Chapter" }).click();
   await expect(page).toHaveURL("/learn/ml-system-design/e2e-home-card-free");
   await expect(page.getByText("Home card chapter marker.")).toBeVisible();
});

test("the hero and Explore Tracks actions open the course index, which lists the courses", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("link", { name: "Start Learning" }).first().click();
   await expect(page).toHaveURL("/learn");
   await expect(page.getByRole("link", { name: /\d+ chapters ML System Design/ })).toBeVisible();
});

test("the hero's pricing action scrolls to the pricing section", async ({ page }) => {
   await page.goto("/");
   await page.getByRole("link", { name: "View Pricing" }).click();
   await expect(page).toHaveURL(/#pricing$/);
   await expect(pricing(page)).toBeInViewport();
});

test("shows the three planned prices, labelled planned, with no purchase control", async ({ page }) => {
   await page.goto("/");
   await expect(plans(page)).toHaveText(["Annual$50/yearPlanned", "3-year$100/3 yearsPlanned", "Lifetime$150/lifetimePlanned"]);
   await expect(pricing(page).getByText("Paid access is not available yet", { exact: false }).first()).toBeVisible();
   await expect(pricing(page).locator("button, form, input")).toHaveCount(0);
   await expect(pricing(page).getByRole("link")).toHaveCount(1); // Start Learning only
});

test("the testimonials drift, and the pause button stops them", async ({ page }) => {
   await page.goto("/");
   const row = page.locator(".testimonial-scroll-left");
   await expect(row).toHaveCSS("animation-play-state", "running");
   await page.getByRole("button", { name: "Pause testimonials" }).click();
   await expect(row).toHaveCSS("animation-play-state", "paused");
   await page.getByRole("button", { name: "Play testimonials" }).click();
   await expect(row).toHaveCSS("animation-play-state", "running");
});

test.describe("reduced motion", () => {
   test.use({ reducedMotion: "reduce" });

   test("stops the testimonials, which scroll by hand, and removes the pause button", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".testimonial-scroll-left")).toHaveCSS("animation-name", "none");
      await expect(page.getByRole("button", { name: /testimonials/i })).toBeHidden();
      const row = page.getByRole("list", { name: "Testimonials, first row" });
      expect(await row.evaluate((el) => el.parentElement!.scrollWidth > el.parentElement!.clientWidth)).toBe(true);
      await expect(row.getByRole("figure")).toHaveCount(4);
   });

   test("collapses the track cards' hover transitions", async ({ page }) => {
      await page.goto("/");
      const card = trackCards(page).first();
      expect(await card.evaluate((a) => parseFloat(getComputedStyle(a).transitionDuration))).toBeLessThan(0.001);
      expect(await card.locator("svg").last().evaluate((svg) => parseFloat(getComputedStyle(svg).transitionDuration))).toBeLessThan(0.001);
   });
});

for (const [width, height] of [
   [320, 700],
   [390, 844],
   [768, 1024],
   [1024, 768],
   [1440, 900],
] as const) {
   test.describe(`at ${width}px`, () => {
      test.use({ viewport: { width, height } });

      test("has no horizontal overflow, and every track card fits the viewport", async ({ page }) => {
         await page.goto("/");
         expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
         const boxes = await trackCards(page).evaluateAll((links) => links.map((l) => ({ x: l.getBoundingClientRect().x, right: l.getBoundingClientRect().right })));
         for (const box of boxes) {
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.right).toBeLessThanOrEqual(width);
         }
      });

      test(`${width >= 768 ? "lays the three plans in a row" : "stacks the three plans"} inside the viewport`, async ({ page }) => {
         await page.goto("/");
         const boxes = await plans(page).evaluateAll((items) =>
            items.map((item) => {
               const { x, y, right } = item.getBoundingClientRect();
               return { x: Math.round(x), y: Math.round(y + window.scrollY), right: Math.round(right) };
            }),
         );
         expect(boxes).toHaveLength(3);
         expect(new Set(boxes.map((box) => (width >= 768 ? box.y : box.x))).size).toBe(1);
         expect(Math.max(...boxes.map((box) => box.right))).toBeLessThanOrEqual(width);
      });
   });
}

// The homepage carries the pre-P0 palette, so its contrast is checked in both themes (WCAG A and AA only).
for (const colorScheme of ["light", "dark"] as const) {
   test.describe(`${colorScheme} theme`, () => {
      test.use({ colorScheme, reducedMotion: "reduce" });

      for (const width of [390, 1440]) {
         test(`the homepage has no WCAG A or AA violation at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.goto("/");
            await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
            const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
            expect(violations.map(({ id, nodes }) => `${id} on ${nodes.length} node(s)`)).toEqual([]);
         });
      }
   });
}
