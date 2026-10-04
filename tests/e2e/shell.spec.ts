import type { Page } from "@playwright/test";
import { canonical, expect, FAKE_AUTH_ORIGIN, legacyCourse, test, track } from "./catalog/harness";

// P2-T2 application shell: structure, active area, skip link, account states, mobile menu and legacy reachability.
const [freeChapter] = legacyCourse.chapters;
const LESSON = canonical("lesson.catalog-e2e-free");
const NAMES = ["Learn", "Practice", "Knowledge"];
const HREFS = ["/tracks", "/practice", "/knowledge"];

const banner = (page: Page) => page.getByRole("banner");
const primary = (page: Page) => banner(page).getByRole("navigation", { name: "Primary" });
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const focusedName = (page: Page) =>
   page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      return element.getAttribute("aria-label") ?? element.textContent?.trim();
   });

test.describe("desktop shell", () => {
   test("shows the logo, Learn / Practice / Knowledge, Sign in and the theme control", async ({ page }) => {
      await page.goto("/login");
      await expect(banner(page).getByRole("link", { name: "InterviewNotes" })).toHaveAttribute("href", "/");

      const links = primary(page).getByRole("link");
      await expect(links).toHaveText(NAMES);
      for (const [index, href] of HREFS.entries()) await expect(links.nth(index)).toHaveAttribute("href", href);

      await expect(banner(page).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
      await expect(banner(page).getByRole("button", { name: "Toggle theme" })).toBeVisible();
      await expect(banner(page).getByRole("button", { name: "Menu" })).toBeHidden();
   });

   test("has no Subscribe, Upgrade, search or Sign up affordance", async ({ page }) => {
      await page.goto("/login");
      await expect(banner(page).getByRole("link", { name: "Sign in" })).toBeVisible();
      await expect(banner(page).getByRole("link", { name: /subscribe|upgrade|pricing|sign up|log in/i })).toHaveCount(0);
      await expect(page.getByRole("search")).toHaveCount(0);
      await expect(page.getByRole("searchbox")).toHaveCount(0);
   });

   test("keeps the header the height that legacy layouts are sized against", async ({ page }) => {
      for (const route of ["/login", `/learn/${legacyCourse.slug}/${freeChapter.slug}`]) {
         await page.goto(route);
         expect(await banner(page).boundingBox(), route).toMatchObject({ y: 0, height: 65 });
      }
   });
});

test.describe("active area", () => {
   const routes: [string, string | null][] = [
      [`/tracks/${track("catalog-e2e-home").slug}`, "Learn"],
      [LESSON, "Learn"],
      ["/learn", "Learn"],
      [canonical("problem.catalog-e2e-related"), "Practice"],
      [canonical("knowledge.catalog-e2e-sections"), "Knowledge"],
      ["/login", null],
   ];

   for (const [route, label] of routes) {
      test(`${route} marks ${label ?? "no area"} as the current page`, async ({ page }) => {
         await page.goto(route);
         const current = primary(page).locator("[aria-current]");
         if (label) await expect(current).toHaveText(label);
         await expect(current).toHaveCount(label ? 1 : 0);
         if (label) await expect(current).toHaveAttribute("aria-current", "page");
      });
   }
});

test.describe("keyboard", () => {
   test("the skip link is the first Tab stop, becomes visible and focuses the content wrapper", async ({ page }) => {
      await page.goto(LESSON);
      await page.keyboard.press("Tab");

      const skip = page.getByRole("link", { name: "Skip to content" });
      await expect(skip).toBeFocused();
      expect((await skip.boundingBox())!.width).toBeGreaterThan(80);

      await page.keyboard.press("Enter");
      await expect(page.locator("#main-content")).toBeFocused();
      await expect(page.getByRole("main")).toHaveCount(1);
   });

   test("tab order runs skip link, logo, destinations, account, theme", async ({ page }) => {
      await page.goto("/login");
      await expect(banner(page).getByRole("link", { name: "Sign in" })).toBeVisible();

      const order: (string | undefined)[] = [];
      for (let stop = 0; stop < 7; stop++) {
         await page.keyboard.press("Tab");
         order.push(await focusedName(page));
      }
      expect(order).toEqual(["Skip to content", "InterviewNotes", ...NAMES, "Sign in", "Toggle theme"]);
   });

   test.describe("theme control", () => {
      test.use({ colorScheme: "light" });

      test("chooses a theme from the keyboard", async ({ page }) => {
         await page.goto("/login");
         await expect(page.locator("html")).not.toHaveClass(/dark/);
         await banner(page).getByRole("button", { name: "Toggle theme" }).focus();

         await page.keyboard.press("Enter");
         await expect(page.getByRole("menuitem", { name: "Light" })).toBeFocused();
         await page.keyboard.press("ArrowDown");
         await expect(page.getByRole("menuitem", { name: "Dark" })).toBeFocused();
         await page.keyboard.press("Enter");
         await expect(page.locator("html")).toHaveClass(/dark/);
      });
   });
});

test.describe("signed in", () => {
   test.use({ identity: "entitled" });

   test("the account menu replaces Sign in and works from the keyboard", async ({ page }) => {
      await page.goto("/login");
      const trigger = banner(page).getByRole("button", { name: "Account menu" });
      await expect(trigger).toBeVisible();
      await expect(banner(page).getByRole("link", { name: "Sign in" })).toHaveCount(0);

      await trigger.focus();
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu");
      await expect(menu.getByText("entitled@e2e.invalid")).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Courses" })).toHaveAttribute("href", "/learn");
      await expect(menu.getByRole("menuitem", { name: "Log out" })).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
   });

   test("Log out signs out through the auth endpoint and returns home", async ({ page }) => {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
      await page.route(`${FAKE_AUTH_ORIGIN}/auth/v1/logout*`, (route) => route.fulfill({ status: 204, headers: cors }));
      await page.goto("/login");

      await banner(page).getByRole("button", { name: "Account menu" }).click();
      await page.getByRole("menuitem", { name: "Log out" }).click();
      await expect(page).toHaveURL("/");
      await expect(banner(page).getByRole("link", { name: "Sign in" })).toBeVisible();
   });

   test("legacy courses stay reachable from the account menu", async ({ page }) => {
      await page.goto(LESSON);
      await banner(page).getByRole("button", { name: "Account menu" }).click();
      await page.getByRole("menuitem", { name: "Courses" }).click();
      await expect(page).toHaveURL("/learn");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Interview Paths");
   });
});

test.describe("legacy", () => {
   test("/learn, a legacy chapter and /login render under the new header", async ({ page }) => {
      for (const [route, marker] of [
         ["/learn", page.getByRole("heading", { level: 1, name: "Interview Paths" })],
         [`/learn/${legacyCourse.slug}/${freeChapter.slug}`, page.getByText("Legacy free chapter marker.")],
         ["/login", page.getByText("Welcome Back")],
      ] as const) {
         await page.goto(route);
         await expect(marker, route).toBeVisible();
         await expect(banner(page), route).toBeVisible();
         await expect(primary(page).getByRole("link"), route).toHaveText(NAMES);
      }
   });

   test("legacy courses stay reachable for a signed-out learner through the footer", async ({ page }) => {
      await page.goto("/");
      await page.locator("footer").getByRole("link", { name: "All courses" }).click();
      await expect(page).toHaveURL("/learn");
   });
});

test.describe("mobile menu at 390px", () => {
   test.use({ viewport: { width: 390, height: 844 } });

   test("hides the desktop navigation, keeps the logo stable and overflows nowhere", async ({ page }) => {
      await page.goto(LESSON);
      await expect(primary(page)).toBeHidden();
      const logo = await banner(page).getByRole("link", { name: "InterviewNotes" }).boundingBox();
      expect(logo!.height).toBeLessThan(40);
      expect(await noHorizontalOverflow(page)).toBe(true);
      expect(await page.locator("nav").evaluateAll((navs) => navs.some((nav) => getComputedStyle(nav).position === "fixed"))).toBe(false);
   });

   test("opens onto the first destination and offers destinations, account and theme in 44px targets", async ({ page }) => {
      await page.goto(LESSON);
      const trigger = page.getByRole("button", { name: "Menu" });
      expect(await trigger.boundingBox()).toMatchObject({ width: 44, height: 44 });

      await trigger.click();
      const menu = page.getByRole("dialog", { name: "Menu" });
      await expect(menu.getByRole("link", { name: "Learn" })).toBeFocused();
      await expect(menu.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveText(NAMES);
      await expect(menu.getByRole("link", { name: "Learn" })).toHaveAttribute("aria-current", "page");
      await expect(menu.getByRole("link", { name: "Sign in" })).toBeVisible();
      await expect(menu.getByRole("button", { name: "Toggle theme" })).toBeVisible();

      for (const control of await menu.locator("a, button").all()) {
         expect((await control.boundingBox())!.height, await control.innerText()).toBeGreaterThanOrEqual(44);
      }
      expect(await noHorizontalOverflow(page)).toBe(true);
   });

   test("traps focus, closes on Escape or Close, and gives focus back to the trigger", async ({ page }) => {
      await page.goto(LESSON);
      const trigger = page.getByRole("button", { name: "Menu" });
      const menu = page.getByRole("dialog", { name: "Menu" });

      await trigger.click();
      for (let stop = 0; stop < 12; stop++) {
         await page.keyboard.press("Tab");
         expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")), `Tab ${stop + 1}`).toBe(true);
      }

      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();

      await page.keyboard.press("Enter");
      await menu.getByRole("button", { name: "Close" }).click();
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
   });

   test("closes after a destination is chosen", async ({ page }) => {
      await page.goto(LESSON);
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
   });

   test.describe("signed in with a very long email", () => {
      test.use({ identity: "entitled" });

      test("truncates the email inside the menu without widening the page", async ({ page }) => {
         const email = `${"a-very-long-local-part-".repeat(6)}@a-long-company-name-for-layout-testing.invalid`;
         await page.goto(LESSON);
         await page.getByRole("button", { name: "Menu" }).click();

         const menu = page.getByRole("dialog", { name: "Menu" });
         const shown = menu.locator("p.truncate");
         await expect(shown).toHaveText("entitled@e2e.invalid");
         await expect(menu.getByRole("button", { name: "Log out" })).toBeVisible();
         // The fake identity's email is short, so lengthen what is rendered: this test is about layout.
         await shown.evaluate((element, text) => void (element.textContent = text), email);

         const clipped = await shown.evaluate((element) => element.scrollWidth > element.clientWidth);
         const box = (await menu.boundingBox())!;
         expect(clipped).toBe(true);
         expect((await shown.boundingBox())!.x + (await shown.boundingBox())!.width).toBeLessThanOrEqual(box.x + box.width);
         expect(box.width).toBeLessThan(300);
         expect(await noHorizontalOverflow(page)).toBe(true);
      });
   });
});

test.describe("reduced motion", () => {
   const seconds = (page: Page, selector: string, property: "animationDuration" | "transitionDuration") =>
      page.locator(selector).first().evaluate((element, name) => parseFloat(getComputedStyle(element)[name]), property);

   test.describe("preferred", () => {
      test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });

      test("makes the sheet and navigation transitions effectively instant", async ({ page }) => {
         await page.goto(LESSON);
         await page.getByRole("button", { name: "Menu" }).click();
         await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
         expect(await seconds(page, "[role=dialog]", "animationDuration")).toBeLessThan(0.001);
         expect(await seconds(page, "[role=dialog] nav a", "transitionDuration")).toBeLessThan(0.001);
      });
   });

   test.describe("not preferred", () => {
      test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });

      test("keeps the quick sheet and link transitions, so the measurement above is meaningful", async ({ page }) => {
         await page.goto(LESSON);
         await page.getByRole("button", { name: "Menu" }).click();
         await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
         expect(await seconds(page, "[role=dialog]", "animationDuration")).toBeGreaterThanOrEqual(0.1);
         expect(await seconds(page, "[role=dialog] nav a", "transitionDuration")).toBeGreaterThanOrEqual(0.1);
      });
   });
});
