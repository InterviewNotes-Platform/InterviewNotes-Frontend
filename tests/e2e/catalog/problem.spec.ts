import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { CANARY, PREVIEW_API_ORIGIN, PREVIEW_ORIGIN, canonical, exposures, expect, expectNoCanary, item, test, track } from "./harness";

// P2-T8 Problem reading: phases, preparation, navigation, technical content, gated and locked states.
const ML = item("problem.catalog-t8-ml-walkthrough");
const SERVICE = item("problem.catalog-t8-sd-walkthrough");
const GATED = item("problem.catalog-t8-gated-walkthrough");
const LOCKED = item("problem.catalog-t8-locked-walkthrough");
const WALKTHROUGHS = track("catalog-t8-walkthrough");
const route = canonical(ML.id);

// What the phase model should produce for the ML fixture, written here and never borrowed from the code under test.
const ML_PHASES: { id: string; label: string; sections: string[] }[] = [
   { id: "problem_frame", label: "Frame", sections: ["Prompt", "Scope"] },
   { id: "problem_requirements", label: "Requirements", sections: ["Functional requirements", "Non-functional requirements", "Constraints"] },
   { id: "problem_design", label: "Design", sections: ["Core entities", "Interfaces", "High-level design"] },
   { id: "problem_ml", label: "ML Reasoning", sections: ["ML objective", "Data", "Features", "Labels", "Model", "Training", "Inference"] },
   { id: "problem_evaluate", label: "Evaluate & Scale", sections: ["Evaluation", "Integration", "Production and scaling"] },
   { id: "problem_depth", label: "Depth & Trade-offs", sections: ["Deep dive: caching", "Deep dive: skew", "Deep dive: fallbacks", "Trade-offs"] },
   { id: "problem_more", label: "More", sections: ["Synthetic extension", "Reference design"] },
];
const LABELS = ML_PHASES.map(({ label }) => label);
const PREPARATION = ["lesson.p2-t5-primer", "knowledge.p2-t6-embedding", "knowledge.p2-t6-attention", "knowledge.p2-t6-feature-store"];

const main = (page: Page) => page.getByRole("main");
const phases = (page: Page) => page.getByRole("navigation", { name: "Phases" });
const toggle = (page: Page) => page.getByRole("button", { name: "Phases" });
const target = (page: Page, id: string) => page.locator(`[id="${id}"]`);
const sectionHeadings = (page: Page, label: string) =>
   main(page).getByRole("region", { name: label, exact: true }).locator(":scope > section > h2");
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const top = (locator: Locator) => locator.evaluate((element) => Math.round(element.getBoundingClientRect().top));
const note = (page: Page) => main(page).getByRole("note");

test.describe("the ML Problem", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("is server-rendered with its title and the first and last of its sections in the HTML", async ({ request }) => {
      const html = await (await request.get(route)).text();
      for (const text of [ML.title, "T8 prompt marker.", "T8 reference marker.", "T8 unknown-type marker."]) expect(html, text).toContain(text);
   });

   test("has one h1, the phases as labelled groups in order with step cues, and the Problem's sections as its h2s", async ({ page }) => {
      await page.goto(route);
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(ML.title);

      const groups = await main(page).locator("section[aria-labelledby$='_title']").evaluateAll((all) => all.map((element) => element.id || element.getAttribute("aria-labelledby")));
      expect(groups).toEqual(ML_PHASES.map(({ id }) => `${id}_title`));
      for (const { id, label, sections } of ML_PHASES) {
         await expect(main(page).getByRole("region", { name: label, exact: true })).toHaveCount(1);
         await expect(sectionHeadings(page, label)).toHaveText(sections);
         await expect(target(page, id)).toHaveAttribute("tabindex", "-1");
         await expect(main(page).getByRole("heading", { name: label, exact: true })).toHaveCount(0); // a title, never a heading
      }
      await expect(main(page).getByText(/^Step \d of 6$/)).toHaveText(LABELS.slice(0, 6).map((_, index) => `Step ${index + 1} of 6`));

      const levels = await main(page).locator("h1, h2, h3, h4").evaluateAll((all) => all.map((element) => Number(element.tagName[1])));
      levels.forEach((level, index) => expect(level, `heading ${index} skips a level`).toBeLessThanOrEqual(index === 0 ? 1 : levels[index - 1] + 1));
   });

   test("leads with difficulty and level, then the category, the Track as context, and quiet topics", async ({ page }) => {
      await page.goto(route);
      const facts = main(page).locator("dl");
      await expect(facts.getByText("Difficulty")).toBeVisible();
      await expect(facts.locator("dd")).toHaveText(["Hard", "Advanced"]);
      const hard = await facts.locator("dd").first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      const category = await main(page).getByText(/^Category: ML system design$/).evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      expect(hard, "difficulty is larger than the category").toBeGreaterThan(category);
      await expect(main(page).getByText("Topics: walkthrough · layout-check")).toBeVisible();
      await expect(main(page).getByText(/^Part of/)).toContainText(`${WALKTHROUGHS.title} / ${WALKTHROUGHS.modules[1].title}`);
      await expect(main(page).getByRole("link", { name: WALKTHROUGHS.title }).first()).toHaveAttribute("href", canonical(WALKTHROUGHS.id));
      await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Practice" })).toHaveAttribute("href", "/practice");
   });

   test("shows a repeated deep dive in the API's order and an unrecognised section under More, last", async ({ page }) => {
      await page.goto(route);
      const more = main(page).getByRole("region", { name: "More", exact: true });
      await expect(more.getByText("T8 unknown-type marker.")).toBeVisible();
      await expect(more.getByText("T8 reference marker.")).toBeVisible();
      await expect(main(page).getByText(/T8 deep-dive-(one|two|three) marker/)).toHaveText([
         "T8 deep-dive-one marker. What may be cached, and for how long.",
         "T8 deep-dive-two marker. Training and serving can disagree; how to notice.",
         "T8 deep-dive-three marker. What to serve when the ranker is unavailable.",
      ]);
   });

   test("renders its callouts as notes, its table, its code and its diagram", async ({ page }) => {
      await page.goto(route);
      await expect(main(page).locator("[data-callout]")).toHaveCount(2);
      await expect(main(page).getByRole("table")).toHaveCount(2);
      await expect(main(page).locator("pre")).toHaveCount(3);
      await expect(main(page).locator("figure svg")).toHaveCount(1);
      expect(await overflows(page)).toBe(false);
   });
});

test.describe("preparation and neighbours", () => {
   test("'Before you start' groups what the API already related, in its order, with premium marked and nothing prefetched", async ({ page, traffic }) => {
      await page.goto(route);
      const prep = main(page).getByRole("region", { name: "Before you start" });
      await expect(prep.getByRole("heading", { level: 3 })).toHaveText(["Prerequisites", "Knowledge applied"]);
      const links = prep.getByRole("link");
      await expect(links).toHaveText(PREPARATION.map((id) => item(id).title));
      for (const [index, id] of PREPARATION.entries()) await expect(links.nth(index)).toHaveAttribute("href", canonical(id));
      await expect(prep.getByText("Premium", { exact: true })).toHaveCount(1);
      await page.waitForLoadState("networkidle");
      const paths = traffic.requests.map((url) => new URL(url).pathname);
      for (const id of PREPARATION) expect(paths, `${id} was prefetched`).not.toContain(canonical(id));
      await links.first().click();
      await expect(page).toHaveURL(canonical("lesson.p2-t5-primer"));
   });

   test("ends with related Knowledge, Problems and Lessons, and no previous or next in a Track with no Lesson", async ({ page }) => {
      await page.goto(route);
      await expect(main(page).getByRole("region", { name: "Related Knowledge" }).getByRole("link")).toHaveAttribute("href", canonical("knowledge.p2-t6-vector-index"));
      await expect(main(page).getByRole("region", { name: "Related Problems" }).getByRole("link")).toHaveAttribute("href", canonical(SERVICE.id));
      await expect(main(page).getByRole("region", { name: "Related Lessons" }).getByRole("link")).toHaveAttribute("href", canonical("lesson.p2-t5-long"));
      await expect(page.getByRole("navigation", { name: `Previous and next in ${WALKTHROUGHS.title}` })).toHaveCount(0);
   });

   test("inside a Track, names the previous and next Lesson and never another Problem (P3 S-CUR-14)", async ({ page }) => {
      await page.goto(canonical("problem.p3-seq-drill-2"));
      const steps = page.getByRole("navigation", { name: `Previous and next in ${track("p3-sequence").title}` });
      const previous = steps.getByRole("link", { name: `Previous lesson: ${item("lesson.p3-seq-three").title}` });
      const next = steps.getByRole("link", { name: `Next lesson: ${item("lesson.p3-seq-four").title}` });
      await expect(previous).toHaveAttribute("href", canonical("lesson.p3-seq-three"));
      await expect(next).toHaveAttribute("href", canonical("lesson.p3-seq-four"));
      await expect(steps.getByRole("link")).toHaveCount(2);
      await next.click();
      await expect(page).toHaveURL(canonical("lesson.p3-seq-four"));
   });

   test("a Problem with no preparation relations shows no empty block, and no ML phase when it has no ML sections", async ({ page }) => {
      await page.goto(canonical(SERVICE.id));
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(SERVICE.title);
      await expect(page.getByText("Before you start")).toHaveCount(0);
      await expect(main(page).getByRole("region", { name: "ML Reasoning", exact: true })).toHaveCount(0);
      await expect(main(page).getByRole("region", { name: "More", exact: true })).toHaveCount(0);
      await expect(main(page).getByText(/^Step \d of 4$/)).toHaveText(["Step 1 of 4", "Step 2 of 4", "Step 3 of 4", "Step 4 of 4"]);
      await expect(main(page).getByText(/^Category: System design$/)).toBeVisible();
   });
});

test.describe("phase navigation on a desktop", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("is a labelled, sticky list of the phases that exist, and the mobile control is not shown", async ({ page }) => {
      await page.goto(route);
      await expect(phases(page)).toHaveCount(1);
      await expect(phases(page).getByRole("link")).toHaveText(LABELS);
      await expect(toggle(page)).toHaveCount(0);
      expect(await phases(page).evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
      const before = (await phases(page).boundingBox())!.y;
      await target(page, "problem_more").scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      expect(Math.abs((await phases(page).boundingBox())!.y - before), "the navigation stayed in view").toBeLessThan(400);
      expect(await phases(page).boundingBox()).not.toBeNull();
   });

   test("a click focuses the phase, lands it under the header, marks it current and updates the URL", async ({ page }) => {
      await page.goto(route);
      await expect(main(page).locator("figure svg")).toHaveCount(1); // the diagram above this phase has been drawn, so nothing moves after the jump
      await phases(page).getByRole("link", { name: "Evaluate & Scale" }).click();
      await expect(target(page, "problem_evaluate")).toBeFocused();
      await expect.poll(() => top(target(page, "problem_evaluate")), { timeout: 5000 }).toBe(112);
      await expect(phases(page).getByRole("link", { name: "Evaluate & Scale" })).toHaveAttribute("aria-current", "location");
      await expect(phases(page).locator("[aria-current]")).toHaveCount(1);
      await expect(page).toHaveURL(`${route}#problem_evaluate`);
   });

   test("is reachable by keyboard alone: Tab to a phase, Enter", async ({ page }) => {
      await page.goto(route);
      const link = phases(page).getByRole("link", { name: "ML Reasoning" });
      for (let stop = 0; stop < 60 && !(await link.evaluate((element) => element === document.activeElement)); stop++) await page.keyboard.press("Tab");
      await expect(link).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(target(page, "problem_ml")).toBeFocused();
   });

   test("follows the reader: the phase being read becomes the current one", async ({ page }) => {
      await page.goto(route);
      await page.evaluate(() => document.getElementById("problem_requirements")!.scrollIntoView({ block: "start" }));
      await expect.poll(() => phases(page).locator("[aria-current]").textContent()).toBe("Requirements");
   });
});

test.describe("on a phone", () => {
   test.use({ viewport: { width: 390, height: 844 } });

   test("keeps the phases in a collapsed disclosure that opens by keyboard, closes on a pick, and focuses the phase", async ({ page }) => {
      await page.goto(route);
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
      expect((await toggle(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await toggle(page).focus();
      await page.keyboard.press("Space");
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
      for (const link of await phases(page).getByRole("link").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press("Tab");
      await expect(phases(page).getByRole("link").first()).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(target(page, "problem_frame")).toBeFocused();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");

      await toggle(page).click();
      await phases(page).getByRole("link", { name: "Depth & Trade-offs" }).click();
      await expect(target(page, "problem_depth")).toBeFocused();
      await expect.poll(() => top(target(page, "problem_depth")), { timeout: 5000 }).toBe(112);
   });

   test("never scrolls the page sideways; wide code and tables scroll inside focusable, named regions", async ({ page }) => {
      await page.goto(route);
      await expect(main(page).locator("figure svg")).toHaveCount(1);
      expect(await overflows(page)).toBe(false);
      await toggle(page).click();
      expect(await overflows(page)).toBe(false);

      const regions = main(page).locator("[data-slot=technical-scroll][data-scrolls=true]");
      await expect(regions.first()).toBeVisible();
      expect(await regions.count()).toBeGreaterThanOrEqual(3);
      for (const region of await regions.all()) {
         await expect(region).toHaveAttribute("tabindex", "0");
         await expect(region).toHaveAttribute("role", "region");
         expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
         expect((await region.boundingBox())!.width).toBeLessThanOrEqual(390);
      }
      await expect(main(page).getByRole("region", { name: "Code" }).first()).toBeVisible();
      await expect(main(page).getByRole("region", { name: "Table" }).first()).toBeVisible();
      const diagram = (await main(page).locator("figure").boundingBox())!;
      expect(diagram.x + diagram.width).toBeLessThanOrEqual(390);
   });

   test("keeps the header readable and the related content whole", async ({ page }) => {
      await page.goto(route);
      await expect(main(page).locator("dl dd")).toHaveText(["Hard", "Advanced"]);
      const title = (await main(page).getByRole("heading", { level: 1 }).boundingBox())!;
      expect(title.x + title.width).toBeLessThanOrEqual(390);
      for (const name of ["Related Knowledge", "Related Problems", "Related Lessons"]) {
         const box = (await main(page).getByRole("region", { name }).boundingBox())!;
         expect(box.x).toBeGreaterThanOrEqual(0);
         expect(box.x + box.width).toBeLessThanOrEqual(390);
      }
      expect(await overflows(page)).toBe(false);
   });
});

test.describe("themes and motion", () => {
   for (const scheme of ["light", "dark"] as const) {
      test(`uses the ${scheme} tokens for the phases and the facts, with no overflow`, async ({ page }) => {
         await page.emulateMedia({ colorScheme: scheme });
         await page.setViewportSize({ width: 1440, height: 900 });
         await page.goto(route);
         await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /dark/ : /^(?!.*dark)/);
         const colours = await page.evaluate(() => {
            const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
            return {
               page: style("body").backgroundColor,
               title: style("#problem_frame_title").color,
               cue: style("#problem_frame > p").color,
               rule: style("section[aria-labelledby='problem_requirements_title']").borderTopColor,
               rail: style("nav[aria-label='Phases'].sticky a").borderLeftColor,
            };
         });
         expect(colours.page).toBe(scheme === "dark" ? "rgb(15, 15, 17)" : "rgb(255, 255, 255)");
         for (const key of ["title", "cue", "rule", "rail"] as const) expect(colours[key], key).not.toBe(colours.page);
         expect(await overflows(page)).toBe(false);
      });
   }

   test.describe("reduced motion", () => {
      test.use({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });

      test("a phase jump lands at once and smooth scrolling is off", async ({ page }) => {
         await page.goto(route);
         await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
         await toggle(page).click();
         await phases(page).getByRole("link", { name: "Requirements" }).click();
         await expect.poll(() => top(target(page, "problem_requirements")), { timeout: 1500 }).toBe(112);
         await expect(target(page, "problem_requirements")).toBeFocused();
      });
   });
});

test.describe("a free Problem with withheld sections", () => {
   const gated = canonical(GATED.id);

   for (const identity of ["signed-out", "unentitled"] as const) {
      test.describe(identity, () => {
         test.use({ identity });

         test("reads in full, ends with exactly one note, and leaks nothing", async ({ page, traffic }) => {
            await page.goto(gated);
            await page.waitForLoadState("networkidle");
            await expectNoCanary(page, traffic, gated, identity);
            await expect(main(page).getByText("T8 gated trade-offs marker.")).toBeVisible();
            await expect(note(page)).toHaveCount(1);
            await expect(note(page)).toContainText("The full library includes more material for this Problem than your current access covers.");
            await expect(main(page).getByRole("region", { name: "More", exact: true })).toHaveCount(0);
            await expect(main(page).getByText(/Reference design|Follow-ups/)).toHaveCount(0);
            const last = await main(page).getByText("T8 gated trade-offs marker.").boundingBox();
            expect((await note(page).boundingBox())!.y).toBeGreaterThan(last!.y);
         });
      });
   }

   test.describe("entitled", () => {
      test.use({ identity: "entitled" });

      test("shows the premium sections under More, and no note", async ({ page, traffic }) => {
         await page.goto(gated);
         await expect(note(page)).toHaveCount(0);
         const more = main(page).getByRole("region", { name: "More", exact: true });
         await expect(more.getByRole("heading", { level: 2 })).toHaveText(["Reference design", "Follow-ups"]);
         await expect(more.getByText(CANARY).first()).toBeVisible();
         expect((await exposures(page, await traffic.responses(), CANARY)).map((found) => found.channel)).toEqual(expect.arrayContaining(["HTML", "RSC", "DOM"]));
      });
   });
});

test.describe("a fully locked Problem", () => {
   const locked = canonical(LOCKED.id);
   const NOTICE = { "signed-out": "Sign in to read this content.", unentitled: "Paid access is not available yet." };

   for (const identity of ["signed-out", "unentitled"] as const) {
      test.describe(identity, () => {
         test.use({ identity });

         test("shows only the public header and a notice, with no body, Track, preparation, phases or related content", async ({ page, traffic }) => {
            expect((await page.goto(locked))?.status()).toBe(200);
            await page.waitForLoadState("networkidle");
            await expectNoCanary(page, traffic, locked, identity);

            await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(LOCKED.title);
            await expect(main(page).locator("dl dd")).toHaveText(["Hard", "Advanced"]);
            await expect(main(page).getByText("ML system design")).toBeVisible();
            await expect(main(page).getByRole("status")).toContainText(NOTICE[identity]);
            for (const absent of [/^Part of/, "Before you start", /^Step \d/, /^Related /]) await expect(main(page).getByText(absent)).toHaveCount(0);
            await expect(phases(page)).toHaveCount(0);
            await expect(page.getByRole("navigation", { name: /Previous and next/ })).toHaveCount(0);
            await expect(note(page)).toHaveCount(0);
         });
      });
   }
});

test.describe("a preview deployment", () => {
   test.use({ baseURL: PREVIEW_ORIGIN });
   const log = async (request: APIRequestContext) => (await (await request.get(`${PREVIEW_API_ORIGIN}/__catalog-log`)).json()) as { path: string }[];

   test("marks and de-indexes a Problem, and every link stays on the deployment", async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole("complementary", { name: "Preview" })).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
      for (const href of await main(page).locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")!))) {
         expect(href, `${href} leaves the deployment`).toMatch(/^(\/(?!\/)|#)/);
      }
   });

   test("a locked Problem reads its own item and metadata only: no relations, no Track", async ({ page, request }) => {
      const since = (await log(request)).length;
      await page.goto(canonical(LOCKED.id));
      await expect(main(page).getByRole("status")).toBeVisible();
      const reads = (await log(request)).slice(since).map(({ path }) => path).filter((path) => path.includes("catalog-t8-"));
      expect(reads.sort()).toEqual([`/catalog/items/problem/${LOCKED.slug}`, `/catalog/items/problem/${LOCKED.slug}/meta`].sort());
   });
});
