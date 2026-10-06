import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import {
   FAKE_API_ORIGIN,
   PREVIEW_API_ORIGIN,
   PREVIEW_DIST,
   PREVIEW_ORIGIN,
   PREVIEW_TOKEN,
   PRODUCTION_ORIGIN,
   REJECTED_ORIGIN,
   REJECTED_TOKEN,
   canonical,
   expect,
   exposures,
   inlinedRsc,
   item,
   legacyCourse,
   test,
   track,
} from "./harness";

const FREE_LESSON = item("lesson.catalog-e2e-free");
const PREMIUM_LESSON = item("lesson.catalog-e2e-premium");
const SECTIONED = item("knowledge.catalog-e2e-sections");
const PROBLEM = item("problem.catalog-e2e-related");
const LINKS = item("lesson.catalog-e2e-links");
const HOME = track(PROBLEM.home);

// One page of every catalog type, with its heading and a string that appears only in its authorized content.
const PAGES = [
   { route: canonical(FREE_LESSON.id), heading: FREE_LESSON.title, content: "Free lesson body marker." },
   { route: canonical(PROBLEM.id), heading: PROBLEM.title, content: "Problem prompt marker." },
   { route: canonical(SECTIONED.id), heading: SECTIONED.title, content: "Public section marker." },
   { route: canonical(HOME.id), heading: HOME.title, content: HOME.summary },
];

const CANONICAL_ROUTE = /^\/(lessons|problems|knowledge|tracks)\/[a-z0-9]+(-[a-z0-9]+)*$/;
const MARKER_SENTENCE = "Reviewer view. This is not the live site.";
const MARKER_TEXT = `Preview · ${MARKER_SENTENCE}`;

const marker = (page: Page) => page.getByRole("complementary", { name: "Preview" });
const robots = (page: Page) => page.locator('meta[name="robots"]');
const heading = (page: Page) => page.getByRole("main").getByRole("heading", { level: 1 });
const hrefs = (page: Page, selector: string) =>
   page.locator(selector).evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));

test.describe("preview deployment", () => {
   test.use({ baseURL: PREVIEW_ORIGIN });

   for (const { route, heading: title, content } of PAGES) {
      test(`${route} renders authorized content with a Preview marker and noindex`, async ({ page }) => {
         expect((await page.goto(route))?.status()).toBe(200);
         await expect(heading(page)).toHaveText(title);
         await expect(page.getByRole("main").getByText(content)).toBeVisible();
         await expect(marker(page)).toBeVisible();
         await expect(marker(page)).toHaveText(MARKER_TEXT);
         await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");
      });

      test(`${route} has both in the server HTML and is never publicly cacheable`, async ({ request }) => {
         const response = await request.get(route);
         expect(response.status()).toBe(200);
         const html = await response.text();
         expect(html).toContain('aria-label="Preview"');
         expect(html).toMatch(/>Preview<\/strong>/);
         expect(html).toContain(MARKER_SENTENCE);
         expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"\/?>/);
         expect(response.headers()["cache-control"] ?? "", "a preview page must not be stored by a shared cache").toMatch(
            /no-store|private/
         );
         expect(response.headers()["cache-control"] ?? "").not.toMatch(/public|s-maxage/);
      });
   }

   test.describe("without JavaScript", () => {
      test.use({ javaScriptEnabled: false });

      test("the Preview marker is still on screen", async ({ page }) => {
         await page.goto(PAGES[0].route);
         await expect(marker(page)).toBeVisible();
         await expect(marker(page)).toHaveText(MARKER_TEXT);
         await expect(heading(page)).toHaveText(PAGES[0].heading);
      });
   });

   test("a locked page and an unknown page are still noindex", async ({ page, request }) => {
      await page.goto(canonical(PREMIUM_LESSON.id));
      await expect(page.getByRole("main").getByRole("status")).toContainText("Sign in to read this content.");
      await expect(marker(page)).toBeVisible();
      await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");

      const missing = await request.get("/lessons/no-such-lesson");
      expect(missing.status()).toBe(404);
      expect(await missing.text()).toMatch(/<meta name="robots" content="noindex"\/?>/);
   });

   test("the marker names nothing of the repository, the deployment or the credential", async ({ page }) => {
      await page.goto(PAGES[0].route);
      const text = (await marker(page).innerHTML()) + (await marker(page).textContent());
      expect(text).not.toMatch(/branch|commit|github|git\b|repo|beta|netlify|render|token|secret|localhost|127\.0\.0\.1/i);
   });

   test("every link stays on this deployment, in the canonical catalog routes", async ({ page, traffic }) => {
      for (const { route } of [...PAGES, { route: canonical(PREMIUM_LESSON.id) }]) {
         await page.goto(route);
         await expect(marker(page)).toBeVisible();

         const all = await hrefs(page, "a[href]");
         expect(all.length, `${route}: no links found`).toBeGreaterThan(0);
         for (const href of all) {
            expect(href, `${route}: ${href} leaves the deployment`).toMatch(/^(\/(?!\/)|#)/);
            expect(href).not.toMatch(/localhost:3100|127\.0\.0\.1|^https?:/);
         }
         // `/tracks` is the Learn index (a Lesson's first breadcrumb step); `/knowledge` and `/knowledge?group=<id>` are the
         // Knowledge index and a category group (a topic's breadcrumb); `/practice` is the Practice index (a Problem's breadcrumb);
         // `#id` is a heading anchor on this page.
         for (const href of await hrefs(page, "main a[href]")) {
            expect(href, `${route}: ${href} is not a canonical catalog route`).toMatch(
               /^(\/tracks|\/practice|\/knowledge(\?group=[a-z-]+)?|#[a-z0-9_-]+|\/(lessons|problems|knowledge|tracks)\/[a-z0-9-]+|\/login\?redirect=%2F(lessons|problems|knowledge|tracks)%2F[a-z0-9-]+)$/
            );
         }
      }

      await page.goto(canonical(PROBLEM.id));
      await page.getByRole("main").getByRole("region", { name: /^(Before you start|Related (Knowledge|Lessons|Problems))$/ }).getByRole("link").first().click();
      await page.waitForURL((url) => CANONICAL_ROUTE.test(url.pathname) && url.pathname !== canonical(PROBLEM.id));
      expect(new URL(page.url()).origin).toBe(PREVIEW_ORIGIN);
      await expect(marker(page)).toBeVisible();
      await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");
      expect(traffic.requests.filter((url) => url.startsWith(PRODUCTION_ORIGIN))).toEqual([]);
   });

   test.describe("links authored into a body", () => {
      const route = canonical(LINKS.id);
      const authored = (page: Page, name: string) => page.getByRole("main").getByRole("link", { name, exact: true });

      test("to a production or beta origin resolve to this deployment, never another one", async ({ page, traffic }) => {
         await page.goto(route);
         await expect(heading(page)).toHaveText(LINKS.title);
         for (const [name, href] of [
            ["production problem", canonical(PROBLEM.id)],
            ["beta track", `${canonical(HOME.id)}#top`],
            ["legacy index", "/learn"],
         ]) {
            await expect(authored(page, name)).toHaveAttribute("href", href);
            await expect(authored(page, name)).not.toHaveAttribute("target", /.+/);
         }
         // A genuinely external link is left alone, and opens in its own tab.
         await expect(authored(page, "elsewhere")).toHaveAttribute("href", "https://example.com/lessons/catalog-e2e-free");
         await expect(authored(page, "elsewhere")).toHaveAttribute("target", "_blank");

         const received = await traffic.responses();
         const rendered = received.filter((r) => r.kind !== "other");
         expect(await exposures(page, rendered, "interviewnotes.io"), "a link to another origin was served").toEqual([]);

         await authored(page, "production problem").click();
         await expect(page).toHaveURL(`${PREVIEW_ORIGIN}${canonical(PROBLEM.id)}`);
         await expect(marker(page)).toBeVisible();
         const left = traffic.requests.filter((url) => !url.startsWith(PREVIEW_ORIGIN));
         expect(left, "the preview reached another origin").toEqual([]);
      });
   });

   test("page metadata carries no canonical, alternate or social URL that could name another deployment", async ({ request }) => {
      for (const { route } of [...PAGES, { route: canonical(LINKS.id) }]) {
         const html = await (await request.get(route)).text();
         expect(html, `${route}: canonical or alternate link`).not.toMatch(/<link[^>]+rel="(canonical|alternate)"/);
         expect(html, `${route}: social URL`).not.toMatch(/(property="og:(url|image)"|name="twitter:(url|image)")/);
         expect(html, `${route}: link to another InterviewNotes origin`).not.toMatch(
            /(href|content)="https?:\/\/(?:[\w-]+\.)*interviewnotes\.io/i
         );
      }
   });

   test("the credential reaches no HTML, RSC, network response, DOM or request header", async ({ page, traffic }) => {
      for (const { route, heading: title } of PAGES) {
         await page.goto(route);
         await expect(heading(page)).toHaveText(title); // the credential was accepted, so this is not an error page
      }
      await page.goto(canonical(PROBLEM.id));
      await page.getByRole("main").getByRole("region", { name: /^(Before you start|Related (Knowledge|Lessons|Problems))$/ }).getByRole("link").first().click();
      await page.waitForLoadState("networkidle");

      const received = await traffic.responses();
      const kinds = new Set(received.map((r) => r.kind));
      expect([...kinds].sort(), "expected HTML, a fetched RSC response and other assets").toEqual(["document", "other", "rsc"]);
      expect(received.some((r) => r.kind === "other" && new URL(r.url).pathname.endsWith(".js")), "no client JavaScript captured").toBe(true);
      for (const document of received.filter((r) => r.kind === "document")) {
         expect(inlinedRsc(document.text ?? ""), `${document.url}: no inlined RSC payload decoded`).not.toBe("");
      }
      for (const needle of [PREVIEW_TOKEN, REJECTED_TOKEN]) {
         expect(await exposures(page, received, needle), "a preview credential reached the browser").toEqual([]);
      }
   });

   test("the catalog API saw the credential on every request, and the browser never saw the API", async ({ page, request }) => {
      await page.goto(PAGES[0].route);
      const log: { path: string; presented: string | null }[] = await (await request.get(`${PREVIEW_API_ORIGIN}/__catalog-log`)).json();
      expect(log.filter((entry) => entry.path.includes(FREE_LESSON.slug) && entry.presented === PREVIEW_TOKEN).length).toBeGreaterThan(0);
      expect(log.filter((entry) => entry.presented === null), "a preview request carried no credential").toEqual([]);
      expect(log.filter((entry) => !entry.path.startsWith("/catalog/")), "only /catalog is guarded and logged").toEqual([]);
   });
});

test.describe("production deployment", () => {
   for (const { route, heading: title, content } of PAGES) {
      test(`${route} has no Preview marker and is not noindex`, async ({ page, request }) => {
         expect((await page.goto(route))?.status()).toBe(200);
         await expect(heading(page)).toHaveText(title);
         await expect(page.getByRole("main").getByText(content)).toBeVisible();
         await expect(page.getByRole("complementary")).toHaveCount(0);
         await expect(page.getByText(MARKER_TEXT)).toHaveCount(0);
         await expect(robots(page)).toHaveCount(0);

         const html = await (await request.get(route)).text();
         expect(html).not.toContain('aria-label="Preview"');
         expect(html).not.toMatch(/noindex/i);
      });
   }

   test("authored links are exactly as authored", async ({ page }) => {
      await page.goto(canonical(LINKS.id));
      const authored = (name: string) => page.getByRole("main").getByRole("link", { name, exact: true });
      await expect(authored("production problem")).toHaveAttribute("href", "https://interviewnotes.io/problems/catalog-e2e-related");
      await expect(authored("beta track")).toHaveAttribute("href", "https://dev.interviewnotes.io/tracks/catalog-e2e-home#top");
      await expect(authored("legacy index")).toHaveAttribute("href", "https://www.interviewnotes.io/learn");
      for (const name of ["production problem", "beta track", "legacy index", "elsewhere"]) {
         await expect(authored(name)).toHaveAttribute("target", "_blank");
      }
   });

   test("the catalog API never receives a preview credential from it", async ({ page, request }) => {
      await page.goto(PAGES[0].route);
      const log: { path: string; presented: string | null }[] = await (await request.get(`${FAKE_API_ORIGIN}/__catalog-log`)).json();
      expect(log.filter((entry) => entry.path.includes(FREE_LESSON.slug)).length).toBeGreaterThan(0);
      expect(log.filter((entry) => entry.presented !== null), "production sent a preview credential").toEqual([]);
   });
});

test.describe("a preview the API rejects", () => {
   test.use({ baseURL: REJECTED_ORIGIN });

   for (const { route, heading: title, content } of PAGES) {
      test(`${route} fails safe: marked, noindex, and never another environment's content`, async ({ page, request }) => {
         const production = await (await request.get(`${PRODUCTION_ORIGIN}${route}`)).text();
         expect(production, "production serves this page, so absence below is meaningful").toContain(content);

         const response = await page.goto(route);
         expect(response?.status()).toBe(200);
         const html = await response!.text();
         expect(html).not.toContain(content);
         expect(html).not.toContain(title);
         await expect(heading(page)).toHaveCount(0);
         await expect(page.getByRole("main").getByRole("status")).toHaveText(
            "This content is temporarily unavailable. Please try again later."
         );
         await expect(marker(page)).toBeVisible();
         await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");
         expect(html).not.toContain("Forbidden");
         expect(await page.getByRole("main").innerText()).not.toMatch(/403|forbidden|postgres|traceback|token/i);
      });
   }
});

test.describe("/learn is unchanged", () => {
   const [chapter] = legacyCourse.chapters;

   for (const [name, baseURL] of [
      ["production", PRODUCTION_ORIGIN],
      ["preview", PREVIEW_ORIGIN],
   ] as const) {
      test.describe(name, () => {
         test.use({ baseURL });

         test("the index and a chapter carry no marker and no robots directive", async ({ page }) => {
            for (const path of ["/learn", `/learn/${legacyCourse.slug}`, `/learn/${legacyCourse.slug}/${chapter.slug}`]) {
               expect((await page.goto(path))?.status(), path).toBe(200);
               await expect(page.getByRole("heading").first()).toBeVisible();
               await expect(page.getByRole("complementary", { name: "Preview" }), path).toHaveCount(0);
               await expect(page.getByText(MARKER_TEXT), path).toHaveCount(0);
               await expect(robots(page), path).toHaveCount(0);
            }
         });
      });
   }
});

test.describe("the preview build", () => {
   function allFiles(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
         const path = join(dir, name);
         return statSync(path).isDirectory() ? allFiles(path) : [path];
      });
   }

   test("no client asset, source map, public file or prerendered page contains a preview credential", () => {
      const served = [
         ...allFiles(join(PREVIEW_DIST, "static")),
         ...allFiles("public"),
         ...allFiles(join(PREVIEW_DIST, "server", "app")).filter((path) => /\.(html|rsc)$/.test(path)),
      ];
      expect(served.filter((path) => path.endsWith(".js")).length, "no client JavaScript scanned").toBeGreaterThan(10);
      expect(served.filter((path) => path.endsWith(".html")).length, "no prerendered page scanned").toBeGreaterThan(0);
      const leaks = served.filter((path) => {
         const bytes = readFileSync(path);
         return [PREVIEW_TOKEN, REJECTED_TOKEN].some((token) => bytes.includes(token));
      });
      expect(leaks).toEqual([]);
   });
});
