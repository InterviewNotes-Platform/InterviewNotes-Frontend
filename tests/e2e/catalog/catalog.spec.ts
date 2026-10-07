import type { Locator, Page } from "@playwright/test";
import {
   CANARY,
   canonical,
   expect,
   expectNoCanary,
   exposures,
   item,
   test,
   track,
   tracksOf,
   type Identity,
} from "./harness";

const FREE_LESSON = item("lesson.catalog-e2e-free");
const PREMIUM_LESSON = item("lesson.catalog-e2e-premium");
const SECTIONED = item("knowledge.catalog-e2e-sections");
const PROBLEM = item("problem.catalog-e2e-related");
const HOME = track(PROBLEM.home);

const LOCKED: { identity: Exclude<Identity, "entitled">; notice: string }[] = [
   { identity: "signed-out", notice: "Sign in to read this content." },
   { identity: "unentitled", notice: "Paid access is not available yet." },
];

const main = (page: Page) => page.getByRole("main");
const title = (page: Page) => main(page).getByRole("heading", { level: 1 });
// What a Problem connects to: its preparation and its related Knowledge, Lessons and Problems (P2-T8; it was one "Related content" region).
const related = (page: Page) => main(page).getByRole("region", { name: /^(Before you start|Related (Knowledge|Lessons|Problems))$/ });
// A Problem's quiet Track context ("Part of Track / Module"); Lessons carry their own breadcrumb (Learn / Track / Module).
const trackContext = (page: Page) => main(page).getByText(/^Part of/);
const breadcrumb = (page: Page) => page.getByRole("navigation", { name: "Breadcrumb" });
const LESSON_RELATED = /^(Builds on|Related Knowledge|Related Lessons|Ready to apply this\?|Related Problems)$/;
const steps = (page: Page) => page.getByRole("navigation", { name: `Previous and next in ${HOME.title}` });
/** Where a neighbour link lives: a Lesson closes with Next, then the Curriculum block; a Problem keeps the paired steps (P3 S-LSN-10, S-LSN-14). */
const neighbours = (page: Page, type: string, label: "Previous lesson" | "Next lesson") =>
   type === "problem" ? steps(page) : page.getByRole("navigation", { name: label === "Next lesson" ? `Next in ${HOME.title}` : "Curriculum" });
const premiumMark = { name: "Premium", exact: true } as const;

test.describe("type-based routes", () => {
   const routes = [
      { route: canonical(FREE_LESSON.id), heading: FREE_LESSON.title, marker: "Free lesson body marker." },
      { route: canonical(PROBLEM.id), heading: PROBLEM.title, marker: "Problem prompt marker." },
      { route: canonical(SECTIONED.id), heading: SECTIONED.title, marker: "Public section marker." },
      { route: canonical(HOME.id), heading: HOME.title, marker: HOME.summary },
   ];

   for (const { route, heading, marker } of routes) {
      test(`${route} is server-rendered at its canonical URL`, async ({ page }) => {
         const response = await page.goto(route);
         expect(response?.status(), route).toBe(200);
         const html = await response!.text();
         expect(html, `${route}: title missing from the server HTML`).toContain(heading);
         expect(html, `${route}: content missing from the server HTML`).toContain(marker);
         await expect(title(page)).toHaveText(heading);
         await expect(main(page).getByText(marker)).toBeVisible();
      });
   }

   test("identity is type + slug: other types and nested Track paths do not resolve", async ({ request }) => {
      for (const path of [
         `/problems/${FREE_LESSON.slug}`,
         `/lessons/${PROBLEM.slug}`,
         `${canonical(HOME.id)}${canonical(FREE_LESSON.id)}`,
      ]) {
         expect((await request.get(path)).status(), path).toBe(404);
      }
   });
});

test.describe("premium lesson", () => {
   const route = canonical(PREMIUM_LESSON.id);

   for (const { identity, notice } of LOCKED) {
      test.describe(identity, () => {
         test.use({ identity });

         test("direct navigation shows public metadata and a notice, never the body", async ({ page, traffic }) => {
            expect((await page.goto(route))?.status()).toBe(200);
            await page.waitForLoadState("networkidle");
            await expectNoCanary(page, traffic, route, identity);

            await expect(title(page)).toHaveText(PREMIUM_LESSON.title);
            await expect(main(page).getByRole("status")).toContainText(notice);
            const signIn = main(page).getByRole("link", { name: "Sign in", exact: true });
            if (identity === "signed-out") {
               await expect(signIn).toHaveAttribute("href", `/login?redirect=${encodeURIComponent(route)}`);
            } else {
               await expect(signIn).toHaveCount(0);
            }
            // Track and related context are loaded only for a body the API released.
            await expect(trackContext(page)).toHaveCount(0);
            await expect(breadcrumb(page)).toHaveCount(0);
            await expect(related(page)).toHaveCount(0);
            await expect(main(page).getByRole("region", { name: LESSON_RELATED })).toHaveCount(0);
         });

         test("client navigation from a related link receives a locked RSC payload", async ({ page, traffic }) => {
            await page.goto(canonical(PROBLEM.id));
            await related(page).getByRole("link", { name: PREMIUM_LESSON.title }).click();
            await expect(page).toHaveURL(route);
            await expectNoCanary(page, traffic, route, identity);

            await expect(main(page).getByRole("status")).toContainText(notice);
            const documents = (await traffic.responses()).filter((r) => r.kind === "document");
            expect(documents.map((r) => new URL(r.url).pathname), "expected a client-side navigation").toEqual([
               canonical(PROBLEM.id),
            ]);
         });
      });
   }

   test.describe("entitled", () => {
      test.use({ identity: "entitled" });

      test("direct navigation renders the body; the canary is detectable in HTML, RSC and DOM", async ({
         page,
         traffic,
      }) => {
         await page.goto(route);
         await expect(main(page).getByText(CANARY)).toBeVisible();
         await expect(breadcrumb(page)).toContainText(HOME.title);
         const channels = (await exposures(page, await traffic.responses(), CANARY)).map((e) => e.channel);
         expect(channels).toEqual(expect.arrayContaining(["HTML", "RSC", "DOM"]));
      });

      test("client navigation renders the body from a fetched RSC response", async ({ page, traffic }) => {
         await page.goto(canonical(PROBLEM.id));
         await related(page).getByRole("link", { name: PREMIUM_LESSON.title }).click();
         await expect(page).toHaveURL(route);
         await expect(main(page).getByText(CANARY)).toBeVisible();
         const found = await exposures(page, await traffic.responses(), CANARY);
         expect(found.filter((e) => e.channel === "RSC" && new URL(e.url).pathname === route)).not.toEqual([]);
      });
   });
});

test.describe("section-level access", () => {
   const route = canonical(SECTIONED.id);
   const publicSection = SECTIONED.sections!.find((section) => section.access === "free")!;
   const premiumSection = SECTIONED.sections!.find((section) => section.access === "premium")!;
   const sectionTitled = (page: Page, name: string) =>
      main(page).locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) });

   for (const { identity } of LOCKED) {
      test.describe(identity, () => {
         test.use({ identity });

         test("receives the public section and a withheld note, never the premium section", async ({
            page,
            traffic,
         }) => {
            await page.goto(route);
            await page.waitForLoadState("networkidle");
            await expectNoCanary(page, traffic, route, identity);

            await expect(sectionTitled(page, publicSection.title)).toContainText(publicSection.text);
            await expect(page.getByRole("heading", { name: premiumSection.title })).toHaveCount(0);
            await expect(main(page).getByRole("note")).toHaveText(
               "Some sections of this content are premium and are not included in your access."
            );
         });
      });
   }

   test.describe("entitled", () => {
      test.use({ identity: "entitled" });

      test("receives every section; the canary renders only inside the premium section", async ({ page }) => {
         await page.goto(route);
         await expect(sectionTitled(page, publicSection.title)).toContainText(publicSection.text);
         await expect(sectionTitled(page, premiumSection.title)).toContainText(CANARY);
         await expect(main(page).locator("section").filter({ hasText: CANARY })).toHaveCount(1);
         await expect(main(page).getByRole("note")).toHaveCount(0);
      });
   });
});

test.describe("related content", () => {
   const ids = (name: string) => PROBLEM.relations?.[name] ?? [];
   const related_of = (type: string) => ids("related").filter((id) => id.startsWith(`${type}.`));

   async function expectRows(region: Locator, wanted: string[]) {
      const rows = region.getByRole("listitem");
      await expect(rows).toHaveCount(wanted.length);
      for (const [index, id] of wanted.entries()) {
         const link = rows.nth(index).getByRole("link");
         await expect(link).toHaveText(item(id).title);
         await expect(link).toHaveAttribute("href", canonical(id));
         await expect(rows.nth(index).getByText(premiumMark.name, premiumMark)).toHaveCount(item(id).access === "premium" ? 1 : 0);
      }
   }

   test("lists the API's relations in order, preparation first and the rest by type, with canonical links and premium markers", async ({ page }) => {
      await page.goto(canonical(PROBLEM.id));
      await expectRows(main(page).getByRole("region", { name: "Before you start" }), ids("prerequisite"));
      await expectRows(main(page).getByRole("region", { name: "Related Knowledge" }), related_of("knowledge"));
      await expectRows(main(page).getByRole("region", { name: "Related Lessons" }), related_of("lesson"));
      await expect(main(page).getByRole("region", { name: "Related Problems" })).toHaveCount(related_of("problem").length ? 1 : 0);

      await main(page).getByRole("region", { name: "Related Knowledge" }).getByRole("link", { name: SECTIONED.title }).click();
      await expect(page).toHaveURL(canonical(SECTIONED.id));
      await expect(title(page)).toHaveText(SECTIONED.title);
   });

   test.describe("prefetch", () => {
      // Tall enough that every link is in view at once, so all of them are scheduled for prefetch together.
      test.use({ viewport: { width: 1280, height: 2400 } });

      test("no catalog link on a Problem is prefetched, free or premium; only a click requests the target", async ({ page, traffic }) => {
         const premium = canonical(PREMIUM_LESSON.id);
         const paths = () => traffic.requests.map((url) => new URL(url).pathname);

         await page.goto(canonical(PROBLEM.id));
         const inView = main(page).locator('a[href^="/"]').filter({ visible: true }); // page content; header links are not under test
         await expect(inView.and(page.locator(`a[href="${premium}"]`))).toHaveCount(3);
         const targets = await inView.evaluateAll((links) => links.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
         await page.waitForLoadState("networkidle");
         for (const path of new Set(targets)) {
            if (path !== canonical(PROBLEM.id)) expect(paths(), `${path} was prefetched`).not.toContain(path);
         }

         await steps(page).getByRole("link", { name: /^Next/ }).click();
         await expect(page).toHaveURL(premium);
         await expect(main(page).getByRole("status")).toContainText(LOCKED[0].notice);
         await expectNoCanary(page, traffic, premium, "signed-out");
      });
   });
});

test.describe("Track navigation", () => {
   const sequence = HOME.modules.flatMap((module) => module.items.map((id) => ({ entry: item(id), module })));
   /** The nearest Lesson in `step` direction: Problems are never Previous or Next (P3 S-CUR-5, S-CUR-6, S-CUR-14). */
   const lessonFrom = (index: number, step: 1 | -1) => {
      for (let at = index + step; at >= 0 && at < sequence.length; at += step) if (sequence[at].entry.type === "lesson") return sequence[at];
      return undefined;
   };

   test("the Track page renders the API outline in its order", async ({ page }) => {
      await page.goto(canonical(HOME.id));
      const outline = page.getByRole("navigation", { name: `${HOME.title} outline` });
      await expect(outline.getByRole("heading", { level: 2 })).toContainText(HOME.modules.map((m) => m.title));

      // Every module is a collapsible section; open each one so that its rows can be read.
      for (const [index, group] of HOME.modules.entries()) {
         const control = outline.getByRole("button", { name: new RegExp(`^Module ${index + 1} ${group.title}`) });
         if ((await control.getAttribute("aria-expanded")) === "false") await control.click();
         const rows = page.locator(`[id="${await control.getAttribute("aria-controls")}"]`).getByRole("listitem");
         await expect(rows.getByRole("link")).toContainText(group.items.map((id) => item(id).title));
         for (const [position, id] of group.items.entries()) {
            await expect(rows.nth(position).getByRole("link")).toHaveAttribute("href", canonical(id));
            await expect(rows.nth(position).getByText(premiumMark.name, premiumMark)).toHaveCount(
               item(id).access === "premium" ? 1 : 0
            );
         }
      }
   });

   async function expectPlacement(page: Page, index: number) {
      const { entry, module } = sequence[index];
      await expect(page).toHaveURL(canonical(entry.id));
      await expect(title(page)).toHaveText(entry.title);
      if (entry.type === "lesson") {
         await expect(breadcrumb(page)).toHaveText(`Learn/${HOME.title}/${module.title}`);
         await expect(breadcrumb(page).getByRole("link", { name: HOME.title })).toHaveAttribute("href", canonical(HOME.id));
         await expect(trackContext(page)).toHaveCount(0);
      } else {
         await expect(trackContext(page)).toHaveText(`Part of ${HOME.title} / ${module.title}`);
         await expect(trackContext(page).getByRole("link")).toHaveAttribute("href", canonical(HOME.id));
      }
      if (entry.type === "lesson") {
         await expect(page.getByRole("navigation", { name: `Module: ${module.title}` })).toHaveCount(0);
         await expect(page.getByRole("navigation", { name: "Curriculum" }).getByRole("link", { name: `Back to module: ${module.title}` })).toHaveAttribute(
            "href",
            `${canonical(HOME.id)}#${module.key}`
         );
      } else {
         await expect(page.getByRole("navigation", { name: `Module: ${module.title}` }).locator('[aria-current="page"]')).toHaveText(entry.title);
      }

      for (const [label, neighbour] of [
         ["Previous lesson", lessonFrom(index, -1)],
         ["Next lesson", lessonFrom(index, 1)],
      ] as const) {
         const link = neighbours(page, entry.type, label).getByRole("link", { name: new RegExp(`^${label}`) });
         if (!neighbour) {
            await expect(link, `${entry.id}: unexpected ${label} link`).toHaveCount(0);
            continue;
         }
         await expect(link, `${entry.id}: ${label} target`).toHaveAttribute("href", canonical(neighbour.entry.id));
         await expect(link).toContainText(neighbour.entry.title);
         await expect(link.getByText(premiumMark.name, premiumMark)).toHaveCount(
            neighbour.entry.access === "premium" ? 1 : 0
         );
      }
   }

   test("previous and next lessons follow the API order across module boundaries, skipping Problems", async ({ page }) => {
      expect(sequence[1].module, "the walk must cross a module boundary").not.toBe(sequence[3].module);
      expect(sequence[2].entry.type, "a Problem must sit between the two Lessons").toBe("problem");

      await page.goto(canonical(sequence[0].entry.id));
      await expectPlacement(page, 0);
      await neighbours(page, "lesson", "Next lesson").getByRole("link", { name: /^Next lesson/ }).click();
      await expectPlacement(page, 1);

      await page.goto(canonical(sequence[2].entry.id));
      await expectPlacement(page, 2);
      await steps(page).getByRole("link", { name: /^Previous lesson/ }).click();
      await expectPlacement(page, 1);
   });

   test("alternate Track placements link to canonical Track routes", async ({ page }) => {
      const alternates = tracksOf(PROBLEM.id).filter((t) => t.slug !== PROBLEM.home);
      await page.goto(canonical(PROBLEM.id));
      await expect(trackContext(page).getByRole("link")).toHaveText(HOME.title);

      const region = page.getByRole("region", { name: "Also in these Tracks" });
      await expect(region.getByRole("link")).toHaveText(alternates.map((t) => t.title));
      for (const [index, alternate] of alternates.entries()) {
         const placedIn = alternate.modules.find((m) => m.items.includes(PROBLEM.id))!;
         await expect(region.getByRole("listitem").nth(index)).toContainText(`/ ${placedIn.title}`);
         await expect(region.getByRole("link").nth(index)).toHaveAttribute("href", canonical(alternate.id));
      }

      const [first] = alternates;
      await region.getByRole("link", { name: first.title }).click();
      await expect(page).toHaveURL(canonical(first.id));
      await expect(title(page)).toHaveText(first.title);
      const outline = page.getByRole("navigation", { name: `${first.title} outline` });
      await expect(outline.getByRole("link")).toContainText(first.modules.flatMap((m) => m.items.map((id) => item(id).title)));
   });
});
