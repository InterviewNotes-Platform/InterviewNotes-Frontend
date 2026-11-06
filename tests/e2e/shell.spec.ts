import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { canonical, expect, FAKE_AUTH_ORIGIN, legacyCourse, test, track } from "./catalog/harness";

// P2-T2 application shell: structure, active area, skip link, account states, mobile menu and legacy reachability.
const [freeChapter] = legacyCourse.chapters;
const LESSON = canonical("lesson.catalog-e2e-free");
const NAMES = ["Tracks", "Knowledge", "Pricing", "FAQ"];
const HREFS = ["/#tracks", "/knowledge", "/#pricing", "/#faq"];

const banner = (page: Page) => page.getByRole("banner");
const primary = (page: Page) => banner(page).getByRole("navigation", { name: "Primary" });
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const focusedName = (page: Page) =>
   page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      return element.getAttribute("aria-label") ?? element.textContent?.trim();
   });

test.describe("desktop shell", () => {
   test("shows the logo, Tracks / Knowledge / Pricing / FAQ, Premium, Sign in and the theme control", async ({ page }) => {
      await page.goto("/login");
      await expect(banner(page).getByRole("link", { name: "InterviewNotes" })).toHaveAttribute("href", "/");

      const links = primary(page).getByRole("link");
      await expect(links).toHaveText(NAMES);
      for (const [index, href] of HREFS.entries()) await expect(links.nth(index)).toHaveAttribute("href", href);

      await expect(banner(page).getByRole("link", { name: "Premium" })).toHaveAttribute("href", "/#pricing");
      await expect(banner(page).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
      await expect(banner(page).getByRole("button", { name: "Toggle theme" })).toBeVisible();
      await expect(banner(page).getByRole("button", { name: "Menu" })).toBeHidden();
   });

   test("Tracks opens the homepage Tracks section from another page, the same place as the Browse Tracks actions", async ({ page }) => {
      await page.goto("/login");
      await primary(page).getByRole("link", { name: "Tracks" }).click();
      await expect(page).toHaveURL("/#tracks");
      await expect(page.locator("#tracks")).toBeInViewport();
      await page.goto("/");
      await page.getByRole("main").getByRole("link", { name: "Browse Tracks" }).first().click();
      await expect(page).toHaveURL("/#tracks");
      await expect(page.locator("#tracks")).toBeInViewport();
   });

   test("has no Practice entry, Subscribe, Upgrade, search or Sign up affordance", async ({ page }) => {
      await page.goto("/login");
      await expect(banner(page).getByRole("link", { name: "Sign in" })).toBeVisible();
      await expect(banner(page).getByRole("link", { name: /subscribe|upgrade|practice|sign up|log in/i })).toHaveCount(0);
      await expect(page.getByRole("search")).toHaveCount(0);
      await expect(page.getByRole("searchbox")).toHaveCount(0);
   });

   test("keeps the header the height that legacy layouts are sized against", async ({ page }) => {
      for (const route of ["/login", LESSON]) {
         await page.goto(route);
         expect(await banner(page).boundingBox(), route).toMatchObject({ y: 0, height: 65 });
      }
   });
});

test.describe("active area", () => {
   const routes: [string, string | null][] = [
      [`/tracks/${track("catalog-e2e-home").slug}`, "Tracks"],
      [LESSON, "Tracks"],
      [canonical("problem.catalog-e2e-related"), "Tracks"],
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

   test("tab order runs skip link, logo, destinations, Premium, theme, account", async ({ page }) => {
      await page.goto("/login");
      await expect(banner(page).getByRole("link", { name: "Sign in" })).toBeVisible();

      const order: (string | undefined)[] = [];
      for (let stop = 0; stop < 9; stop++) {
         await page.keyboard.press("Tab");
         order.push(await focusedName(page));
      }
      expect(order).toEqual(["Skip to content", "InterviewNotes", ...NAMES, "Premium", "Toggle theme", "Sign in"]);
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
      await expect(menu.getByRole("menuitem", { name: "Tracks" })).toHaveAttribute("href", "/#tracks");
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

   test("the account menu's Tracks opens the homepage Tracks section", async ({ page }) => {
      await page.goto(LESSON);
      await banner(page).getByRole("button", { name: "Account menu" }).click();
      await page.getByRole("menuitem", { name: "Tracks" }).click();
      await expect(page).toHaveURL("/#tracks");
      await expect(page.locator("#tracks")).toBeInViewport();
   });
});

test.describe("retired /learn", () => {
   test("/login still renders under the new header", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByText("Welcome Back")).toBeVisible();
      await expect(banner(page)).toBeVisible();
      await expect(primary(page).getByRole("link")).toHaveText(NAMES);
   });

   test("/learn, a legacy chapter and /tracks all end on the homepage Tracks section", async ({ page }) => {
      for (const route of ["/learn", `/learn/${legacyCourse.slug}/${freeChapter.slug}`, "/tracks"]) {
         await page.goto(route);
         await expect(page, route).toHaveURL("/#tracks");
         await expect(page.locator("#tracks"), route).toBeInViewport();
      }
   });

   test("the footer's Tracks link opens the Tracks section, and no footer link enters /learn", async ({ page }) => {
      await page.goto("/");
      const footer = page.locator("footer");
      const hrefs = await footer.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      expect(hrefs.filter((href) => href?.startsWith("/learn"))).toEqual([]);
      await footer.getByRole("link", { name: "Tracks" }).click();
      await expect(page).toHaveURL("/#tracks");
   });
});

test.describe("mobile menu at 390px", () => {
   test.use({ viewport: { width: 390, height: 844 } });

   test("Tracks opens the same section as the desktop navigation", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Tracks" }).click();
      await expect(page).toHaveURL("/#tracks");
      await expect(page.locator("#tracks")).toBeInViewport();
   });

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
      await expect(menu.getByRole("link", { name: "Tracks" })).toBeFocused();
      await expect(menu.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveText(NAMES);
      await expect(menu.getByRole("link", { name: "Tracks" })).toHaveAttribute("aria-current", "page");
      await expect(menu.getByRole("link", { name: "Premium" })).toHaveAttribute("href", "/#pricing");
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

   test("keeps the page behind inert while open, has no WCAG A or AA violation, and restores focus on close (X-12)", async ({ page }) => {
      await page.goto(LESSON);
      const trigger = page.getByRole("button", { name: "Menu" });
      const menu = page.getByRole("dialog", { name: "Menu" });

      await trigger.click();
      await expect(menu).toBeVisible();
      // An inert page leaves the accessibility tree, so the page is found by selector, not role.
      expect(await page.locator("button[aria-label=Menu]").evaluate((el) => !!el.closest("[inert]"))).toBe(true);
      expect(await page.locator("main").evaluate((el) => !!el.closest("[inert]"))).toBe(true);
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(violations.map(({ id, nodes }) => `${id} on ${nodes.length} node(s)`)).toEqual([]);

      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await page.evaluate(() => document.querySelectorAll("[inert]").length)).toBe(0);
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
