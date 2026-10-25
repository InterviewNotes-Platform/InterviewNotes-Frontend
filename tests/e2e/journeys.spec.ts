import type { Page } from "@playwright/test";
import { CANARY, FAKE_AUTH_ORIGIN, JOURNEY_ORIGIN, canonical, expect, expectNoCanary, item, legacyCourse, test, track } from "./catalog/harness";

// P6-T25: the user journeys UJ-1 … UJ-8 across the homepage, navigation, reader and level-choice categories on one build.
// Every journey runs under the harness, which fails on any browser console error, React #418 included.
const SEQUENCE = track("p3-sequence");
const FIRST = item("lesson.p3-seq-one");
const SECOND = item("lesson.p3-seq-two");
const CROSS = item("problem.p3-seq-cross");
const PREMIUM = item("lesson.p2-t4-premium-depth");
const TOPIC = item("knowledge.p2-t6-attention");
const LEVELS = track("behavioral-interview-preparation");
const [, LEVEL_TWO, , LEVEL_FOUR] = LEVELS.modules[0].items.map(item);

const main = (page: Page) => page.getByRole("main");
const banner = (page: Page) => page.getByRole("banner");
const h1 = (page: Page) => main(page).getByRole("heading", { level: 1 });
const hero = (page: Page) => page.getByRole("region", { name: /Crack Your Next/ });
const trackCard = (page: Page, title: string) =>
   page.getByRole("region", { name: "Choose Your Track" }).getByRole("list").last().getByRole("link").filter({ hasText: title });
const noCurriculum = async (page: Page) => {
   await expect(page.getByRole("navigation", { name: "Track contents" })).toHaveCount(0);
   await expect(page.getByRole("button", { name: "Track contents" })).toHaveCount(0);
};
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

/**
 * Stands in for Google: returns the browser to the callback it was given, with a code carrying a fixture identity and the
 * PKCE challenge the sign-in started with. The fake token endpoint honours it only if `/auth/callback` sends the matching verifier.
 */
async function stubProvider(page: Page, identity: string, challengeOf = (challenge: string) => challenge) {
   const callbacks: string[] = [];
   const methods: (string | null)[] = [];
   await page.route(
      (url) => url.origin === FAKE_AUTH_ORIGIN && url.pathname === "/auth/v1/authorize",
      async (route) => {
         const params = new URL(route.request().url()).searchParams;
         const callback = new URL(params.get("redirect_to")!);
         callbacks.push(callback.toString());
         methods.push(params.get("code_challenge_method"));
         callback.searchParams.set("code", `${identity}.${challengeOf(params.get("code_challenge") ?? "")}`);
         await route.fulfill({ status: 302, headers: { location: callback.toString() } });
      }
   );
   return { callbacks, methods };
}

test.describe("on a desktop", () => {
   test.use({ viewport: { width: 1280, height: 900 } });

   test("UJ-1: Browse Tracks, a Track card, Start, then the sidebar to the next Lesson", async ({ page }) => {
      await page.goto("/");
      await hero(page).getByRole("link", { name: "Browse Tracks" }).click();
      await expect(page).toHaveURL("/#tracks");
      await expect(page.locator("#tracks")).toBeInViewport();

      await trackCard(page, SEQUENCE.title).click();
      await expect(page).toHaveURL(canonical(SEQUENCE.id));
      await main(page).getByRole("link", { name: `Start with ${FIRST.title}`, exact: true }).click();
      await expect(page).toHaveURL(canonical(FIRST.id));
      await expect(h1(page)).toHaveText(FIRST.title);

      const sidebar = page.getByRole("navigation", { name: "Track contents" });
      await expect(sidebar.locator('[aria-current="page"]')).toHaveAttribute("href", canonical(FIRST.id));
      await sidebar.getByRole("link", { name: SECOND.title }).click();
      await expect(page).toHaveURL(canonical(SECOND.id));
      await expect(h1(page)).toHaveText(SECOND.title);
      await expect(sidebar.locator('[aria-current="page"]')).toHaveAttribute("href", canonical(SECOND.id));
   });

   test("UJ-7: Knowledge by group and topic, with no curriculum sidebar on the explorer or the entry", async ({ page }) => {
      await page.goto("/");
      await banner(page).getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Knowledge" }).click();
      await expect(page).toHaveURL("/knowledge");
      await page.getByRole("navigation", { name: "Knowledge categories" }).getByRole("link", { name: /^Core Concepts/ }).click();
      await expect(page).toHaveURL("/knowledge?group=core-concepts");
      await noCurriculum(page);

      await main(page).getByRole("button", { name: /^Browse by topic/ }).click();
      await page.getByRole("navigation", { name: "Browse by topic" }).getByRole("link", { name: "attention", exact: true }).click();
      await expect(page).toHaveURL("/knowledge?group=core-concepts&tag=attention");
      await main(page).locator("article").filter({ hasText: TOPIC.title }).getByRole("link").click();
      await expect(page).toHaveURL(canonical(TOPIC.id));
      await expect(h1(page)).toHaveText(TOPIC.title);
      await noCurriculum(page);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(h1(page)).toHaveText(TOPIC.title);
      await noCurriculum(page);
   });

   test("UJ-8: the Behavioral Track offers its levels as choices, and a level switches to another without Next or Previous", async ({ page }) => {
      await page.goto("/");
      await trackCard(page, LEVELS.title).click();
      await expect(page).toHaveURL(canonical(LEVELS.id));
      await expect(page.getByRole("link", { name: /^Start/ })).toHaveCount(0);
      await page.getByRole("region", { name: "Choose your level" }).getByRole("link", { name: LEVEL_TWO.title }).click();

      await expect(page).toHaveURL(canonical(LEVEL_TWO.id));
      await expect(h1(page)).toHaveText(LEVEL_TWO.title);
      await expect(main(page).getByText(`${LEVEL_TWO.title} body marker.`)).toBeVisible();
      await expect(page.getByRole("link", { name: /^(Next|Previous) lesson/ })).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: /^Next in / })).toHaveCount(0);

      await page.getByRole("navigation", { name: "Other levels" }).getByRole("link", { name: LEVEL_FOUR.title }).click();
      await expect(page).toHaveURL(canonical(LEVEL_FOUR.id));
      await expect(h1(page)).toHaveText(LEVEL_FOUR.title);
      await expect(page.getByRole("link", { name: /^(Next|Previous) lesson/ })).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: /^End of / })).toHaveCount(0);
   });
});

test.describe("on a deployment whose catalog publishes the free chapter", () => {
   test.use({ baseURL: JOURNEY_ORIGIN });

   test("UJ-2: Read a free chapter opens that Lesson with its body, nothing locked", async ({ page }) => {
      await page.goto("/");
      await hero(page).getByRole("link", { name: "Read a free chapter" }).click();
      await expect(page).toHaveURL("/lessons/anatomy-of-a-model-request");
      await expect(h1(page)).toHaveText("Anatomy of a Model Request");
      await expect(main(page).getByText("Free chapter body marker.")).toBeVisible();
      await expect(main(page).getByText(/Sign in to read|Paid access is not available/)).toHaveCount(0);
   });
});

// UJ-3 and UJ-4 run the real login page, OAuth start, PKCE verifier storage and /auth/callback; the provider and token
// endpoint are synthetic, so this proves the app sends the verifier its sign-in started with, not Supabase's own PKCE checks.
test.describe("signing in with a stubbed provider", () => {
   test("UJ-3: a returning learner signs in from the header and lands on the Tracks section", async ({ page, baseURL }) => {
      const { callbacks, methods } = await stubProvider(page, "unentitled");
      await page.goto("/");
      await banner(page).getByRole("link", { name: "Sign in" }).click();
      await expect(page).toHaveURL("/login");
      await page.getByRole("button", { name: "Continue with Google" }).click();

      await expect(page).toHaveURL("/#tracks");
      expect(callbacks).toEqual([`${baseURL}/auth/callback`]);
      expect(methods).toEqual(["s256"]);
      await expect(banner(page).getByRole("button", { name: "Account menu" })).toBeVisible();
      await expect(page.locator("#tracks")).toBeInViewport();
   });

   for (const { identity, released } of [
      { identity: "entitled", released: true },
      { identity: "unentitled", released: false },
   ] as const) {
      test(`UJ-4: a signed-out reader of a premium Lesson signs in as ${identity} and returns to it, ${released ? "now readable" : "still locked"}`, async ({ page, traffic, baseURL }) => {
         const target = canonical(PREMIUM.id);
         const { callbacks, methods } = await stubProvider(page, identity);
         await page.goto(target);
         await expect(main(page).getByRole("status")).toContainText("Sign in to read this content.");
         await main(page).getByRole("link", { name: "Sign in" }).click();
         await expect(page).toHaveURL(`/login?redirect=${encodeURIComponent(target)}`);
         await page.getByRole("button", { name: "Continue with Google" }).click();

         await expect(page).toHaveURL(target);
         expect(callbacks).toEqual([`${baseURL}/auth/callback?next=${encodeURIComponent(target)}`]);
         expect(methods).toEqual(["s256"]);
         await expect(banner(page).getByRole("button", { name: "Account menu" })).toBeVisible();
         if (released) {
            await expect(main(page).getByText(CANARY)).toBeVisible();
         } else {
            await expect(main(page).getByRole("status")).toContainText("Paid access is not available yet.");
            await expectNoCanary(page, traffic, target, identity);
         }
      });
   }

   for (const { refused, identity, challengeOf } of [
      { refused: "a code for no known account", identity: "forged-code", challengeOf: undefined },
      { refused: "a code whose challenge does not match the verifier", identity: "entitled", challengeOf: (challenge: string) => `${challenge}x` },
   ]) {
      test(`${refused} signs nobody in: the callback returns to sign-in with its error`, async ({ page }) => {
         await stubProvider(page, identity, challengeOf);
         await page.goto("/login");
         await page.getByRole("button", { name: "Continue with Google" }).click();
         await expect(page).toHaveURL("/login?error=auth_failed");
         await expect(page.getByText("Sign-in failed. Please try again.")).toBeVisible();
         await expect(banner(page).getByRole("link", { name: "Sign in" })).toBeVisible();
      });
   }
});

test("UJ-5: an old /learn chapter link arrives at the Tracks section, one click from a Track", async ({ page }) => {
   await page.goto(`/learn/${legacyCourse.slug}/${legacyCourse.chapters[0].slug}`);
   await expect(page).toHaveURL("/#tracks");
   await trackCard(page, SEQUENCE.title).click();
   await expect(page).toHaveURL(canonical(SEQUENCE.id));
   await expect(h1(page)).toHaveText(SEQUENCE.title);
});

test.describe("on a phone", () => {
   test.use({ viewport: { width: 390, height: 844 } });

   test("UJ-6: the reader opens the Track contents, filters by title and jumps to a Problem", async ({ page }) => {
      await page.goto(canonical(FIRST.id));
      await page.getByRole("button", { name: "Track contents" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("searchbox", { name: "Filter by title" }).fill("Cross");
      await expect(dialog.getByRole("status")).toHaveText("1 match");
      await expect(dialog.getByRole("link", { name: FIRST.title })).toHaveCount(0);
      await dialog.getByRole("link", { name: CROSS.title }).click();

      await expect(page).toHaveURL(canonical(CROSS.id));
      await expect(h1(page)).toHaveText(CROSS.title);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await overflows(page)).toBe(false);
   });
});
