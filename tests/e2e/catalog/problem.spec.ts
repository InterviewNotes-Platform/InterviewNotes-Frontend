import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { CANARY, PREVIEW_API_ORIGIN, PREVIEW_ORIGIN, canonical, exposures, expect, expectNoCanary, item, test, track } from "./harness";

// P4-T11 challenge-first Problem (P4 fixtures, served with `spine`) and the P2/P3 page frame it keeps (P2-T8 fixtures,
// served as a backend that predates P4, so all their sections sit closed under "More material").
const ML = item("problem.p4-ml-complete");
const SD = item("problem.p4-sd-complete");
const ORDER = item("problem.p4-out-of-order");
const TODAY = item("problem.p4-today-only");
const STAGES = item("problem.p4-premium-stages");
const UNKNOWN = item("problem.p4-unknown-values");
const RICH = item("problem.catalog-t8-ml-walkthrough");
const SERVICE = item("problem.catalog-t8-sd-walkthrough");
const GATED = item("problem.catalog-t8-gated-walkthrough");
const LOCKED = item("problem.catalog-t8-locked-walkthrough");
const WALKTHROUGHS = track("catalog-t8-walkthrough");
const route = canonical(ML.id);
const rich = canonical(RICH.id);

// What the spine should produce, written here and never borrowed from the code under test.
const ML_STAGES = ["Frame", "Requirements", "Design", "ML Reasoning", "Evaluate & Scale", "Depth & Trade-offs", "Follow-ups"];
const SD_STAGES = ["Frame", "Requirements", "Design", "Evaluate & Scale", "Depth & Trade-offs", "Follow-ups"];
const SURFACES = ["Reference Solution", "Self-review"];
const ML_IDS = ["frame", "requirements", "design", "ml_reasoning", "evaluate_and_scale", "depth_and_trade_offs", "follow_ups", "reference_solution", "self_review"].map(
   (position) => `problem_${position}`
);
const PREPARATION = ["lesson.p2-t5-primer", "knowledge.p2-t6-embedding", "knowledge.p2-t6-attention", "knowledge.p2-t6-feature-store"];

const main = (page: Page) => page.getByRole("main");
const group = (page: Page, name: "Interview" | "Review") => main(page).getByRole("region", { name, exact: true });
const band = (page: Page, name: string) => main(page).getByRole("region", { name, exact: true });
const control = (scope: Locator, name: string) => scope.locator("summary").filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
const stageNames = (page: Page, name: "Interview" | "Review") => group(page, name).locator(":scope section > div > h2");
const cues = (page: Page) => main(page).getByText(/^Step \d of \d$/);
const reveals = (page: Page) => main(page).locator("details[data-reveal]");
const openCount = (page: Page) => main(page).locator("details[data-reveal][open]").count();
const visibleBodies = (page: Page) => main(page).locator("[data-catalog-body]").filter({ visible: true });
const outline = (page: Page) => page.getByRole("navigation", { name: "Outline" });
// The phone outline is the one native disclosure that is not a reveal.
const phoneOutline = (page: Page) => main(page).locator("details:not([data-reveal])");
const toggle = (page: Page) => phoneOutline(page).locator("> summary");
const opened = (page: Page) => phoneOutline(page).evaluate((element) => (element as HTMLDetailsElement).open);
const target = (page: Page, id: string) => page.locator(`[id="${id}"]`);
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const top = (locator: Locator) => locator.evaluate((element) => Math.round(element.getBoundingClientRect().top));
// The item-level note; a callout is also a note, so it is told apart by its marker.
const note = (page: Page) => main(page).locator("[role=note]:not([data-callout])");
const textOf = (id: string, section: string) => item(id).sections!.find((candidate) => candidate.id === section)!.text;
const more = (page: Page) => band(page, "More material");

test.describe("the challenge-first initial view (AC-1, S-CHL-1, S-CHL-2)", () => {
   for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
   ]) {
      test.describe(`at ${viewport.width} px`, () => {
         test.use({ viewport });

         test("shows the header, the challenge open under 'The challenge', every stage band, and nothing else expanded", async ({ page }) => {
            await page.goto(route);
            await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(ML.title);
            await expect(band(page, "Frame").getByRole("heading", { level: 3, name: "The challenge" })).toBeVisible();
            await expect(main(page).getByText(textOf(ML.id, "prompt"))).toBeVisible();
            await expect(visibleBodies(page)).toHaveCount(1); // the challenge is the only open authored content
            expect(await openCount(page)).toBe(0);

            await expect(stageNames(page, "Interview")).toHaveText(ML_STAGES);
            await expect(stageNames(page, "Review")).toHaveText(SURFACES);
            for (const name of [...ML_STAGES, ...SURFACES]) {
               const stage = band(page, name);
               await expect(stage.getByRole("heading", { level: 2, name })).toBeVisible();
               await expect(stage.locator(":scope > details > summary").first()).toBeVisible();
            }
            await expect(group(page, "Review").getByText("After the interview: study one strong approach, then review your reasoning.")).toBeVisible();
            for (const section of ML.sections!.filter(({ id }) => id !== "prompt")) {
               await expect(main(page).getByText(section.text.split("\n").find((line) => line && !line.startsWith(":::"))!).first(), section.id).toBeHidden();
            }
            expect(await overflows(page)).toBe(false);
         });
      });
   }

   test("is server-rendered: every released section is in the HTML, inside a reveal that is closed", async ({ request }) => {
      const html = await (await request.get(route)).text();
      for (const section of ML.sections!) expect(html, section.id).toContain(`id="${section.id}"`);
      expect(html).toContain(textOf(ML.id, "reference-design"));
      expect(html).toContain("<details");
      expect(html).not.toMatch(/<details[^>]*\sopen/);
   });
});

test.describe("the spine (AC-2, AC-3)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("an ML Problem shows its seven interview stages counted in order, then its two surfaces uncounted", async ({ page }) => {
      await page.goto(route);
      await expect(cues(page)).toHaveText(ML_STAGES.map((_, index) => `Step ${index + 1} of 7`));
      for (const [index, name] of ML_STAGES.entries()) await expect(band(page, name).getByText(`Step ${index + 1} of 7`)).toBeVisible();
      for (const name of SURFACES) await expect(band(page, name).getByText(/^Step/)).toHaveCount(0);
      const anchors = await main(page).locator("section > div[tabindex='-1']").evaluateAll((all) => all.map((element) => element.id));
      expect(anchors).toEqual(ML_IDS);
      const levels = await main(page).locator("h1, h2, h3, h4, h5, h6").evaluateAll((all) => all.map((element) => Number(element.tagName[1])));
      levels.forEach((level, index) => expect(level, `heading ${index} skips a level`).toBeLessThanOrEqual(index === 0 ? 1 : levels[index - 1] + 1));
      await expect(main(page).locator("summary :is(h1, h2, h3, h4, h5, h6)")).toHaveCount(0);
   });

   test("a system design Problem has no ML Reasoning stage, and six steps", async ({ page }) => {
      await page.goto(canonical(SD.id));
      await expect(stageNames(page, "Interview")).toHaveText(SD_STAGES);
      await expect(cues(page)).toHaveText(SD_STAGES.map((_, index) => `Step ${index + 1} of 6`));
      await expect(band(page, "ML Reasoning")).toHaveCount(0);
   });

   test("authored out of spine order, it still reads in spine order", async ({ page }) => {
      await page.goto(canonical(ORDER.id));
      await expect(stageNames(page, "Interview")).toHaveText(["Frame", "Requirements", "Design", "Depth & Trade-offs", "Follow-ups"]);
      await expect(stageNames(page, "Review")).toHaveText(SURFACES);
      await expect(cues(page)).toHaveText(["Step 1 of 5", "Step 2 of 5", "Step 3 of 5", "Step 4 of 5", "Step 5 of 5"]);
   });
});

test.describe("one reveal opens one thing (AC-4, S-RVL-1)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("a stage reference opens that stage's reference only, and nothing inside it closes another", async ({ page }) => {
      await page.goto(route);
      await control(band(page, "Design"), "Show reference for Design").click();
      for (const id of ["entities", "interfaces", "high-level-design"]) await expect(main(page).getByText(textOf(ML.id, id))).toBeVisible();
      expect(await openCount(page)).toBe(1);
      await expect(main(page).getByText(textOf(ML.id, "functional"))).toBeHidden();

      await control(band(page, "Requirements"), "Show reference for Requirements").click();
      expect(await openCount(page)).toBe(2);
      await expect(main(page).getByText(textOf(ML.id, "high-level-design"))).toBeVisible();
      await expect(main(page).getByText(textOf(ML.id, "hint-model"))).toBeHidden(); // no reveal opens a hint
   });

   test("a list shows unit headings only; each unit then opens on its own", async ({ page }) => {
      await page.goto(route);
      const depth = band(page, "Depth & Trade-offs");
      await control(depth, "Compare with the topics the reference goes deep on").click();
      await expect(depth.getByRole("heading", { level: 3 })).toHaveText(["Label noise", "Which model family?"]);
      await expect(main(page).getByText(textOf(ML.id, "deep-dive-labels"))).toBeHidden();
      await expect(main(page).getByText(textOf(ML.id, "decision-model"))).toBeHidden();

      await control(depth, "Show reference").first().click();
      await expect(main(page).getByText(textOf(ML.id, "deep-dive-labels"))).toBeVisible();
      await expect(main(page).getByText(textOf(ML.id, "decision-model"))).toBeHidden();
      expect(await openCount(page)).toBe(2);
   });

   test("a review surface opens behind its one control, and its units and common mistakes stay closed", async ({ page }) => {
      await page.goto(route);
      const review = band(page, "Self-review");
      await control(review, "Open self-review").click();
      await expect(review.getByRole("heading", { level: 3 })).toHaveText(["Expectations by seniority", "Rubric", "Common mistakes"]);
      await expect(review.getByRole("heading", { level: 4 })).toHaveText(["ML formulation"]);
      await expect(main(page).getByText(textOf(ML.id, "level-expectations"))).toBeVisible();
      await expect(main(page).getByText(textOf(ML.id, "common-mistakes"))).toBeHidden();
      await expect(main(page).getByText(textOf(ML.id, "reference-design"))).toBeHidden();
      expect(await openCount(page)).toBe(1);
   });
});

test.describe("without JavaScript (AC-22, S-RVL-12)", () => {
   test.use({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });

   test("starts challenge-first with every disclosure closed, and every one opens from the keyboard", async ({ page }) => {
      await page.goto(route);
      await expect(main(page).getByText(textOf(ML.id, "prompt"))).toBeVisible();
      await expect(visibleBodies(page)).toHaveCount(1);
      const total = await reveals(page).count();
      expect(await openCount(page)).toBe(0);

      // Tab reaches the first stage control, and Enter opens it.
      const first = control(band(page, "Frame"), "Show a hint");
      for (let stop = 0; stop < 80 && !(await first.evaluate((element) => element === document.activeElement)); stop++) await page.keyboard.press("Tab");
      await expect(first).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(main(page).getByText(textOf(ML.id, "hint-frame"))).toBeVisible();

      // Then every other control, outer before inner, by Space on its focused summary.
      for (let opened = 1; opened < total; opened++) {
         const next = main(page).locator("details[data-reveal]:not([open]) > summary").filter({ visible: true }).first();
         await next.focus();
         await page.keyboard.press("Space");
      }
      expect(await openCount(page)).toBe(total);
      for (const section of ML.sections!) {
         await expect(main(page).locator(`[id="${section.id}"]`), section.id).toBeVisible();
      }
      await expect(main(page).getByText(textOf(ML.id, "common-mistakes"))).toBeVisible();
   });
});

test.describe("withheld material (AC-20, S-ENT-1, S-ENT-1a)", () => {
   const stages = canonical(STAGES.id);

   for (const identity of ["signed-out", "unentitled"] as const) {
      test.describe(identity, () => {
         test.use({ identity, viewport: { width: 1440, height: 900 } });

         test("one note before the Interview group, the withheld Design stage kept and counted, with its free hints", async ({ page }) => {
            await page.goto(stages);
            await expect(note(page)).toHaveCount(1);
            await expect(note(page)).toHaveText("Some material for this Problem is included with full access.");
            expect((await note(page).boundingBox())!.y).toBeLessThan((await group(page, "Interview").boundingBox())!.y);

            await expect(stageNames(page, "Interview")).toHaveText(["Frame", "Requirements", "Design", "Evaluate & Scale", "Follow-ups"]);
            await expect(cues(page)).toHaveText(["Step 1 of 5", "Step 2 of 5", "Step 3 of 5", "Step 4 of 5", "Step 5 of 5"]);
            const design = band(page, "Design");
            await expect(design.getByText("Some material in this stage is included with full access.")).toBeVisible(); // its free hints are released
            await expect(design.getByText("Premium", { exact: true })).toBeVisible();
            await expect(design.locator("summary")).toHaveText(["Show a hint, hint 1 for Design", "Show the next hint, hint 2 for Design"]);
            await expect(band(page, "Requirements").getByText("Some material in this stage is included with full access.")).toBeVisible();
            await expect(band(page, "Follow-ups").getByText("Some material in this stage is included with full access.")).toBeVisible();
            await expect(band(page, "Frame").getByText(/included with full access/)).toHaveCount(0);

            // Evaluate & Scale holds only withheld material and no hint: safe metadata alone, counted (S-SPN-12, S-ENT-1b).
            const scale = band(page, "Evaluate & Scale");
            await expect(scale).toHaveText(/^Step 4 of 5Evaluate & ScaleShow how you would know it works[^]*PremiumThe material for this stage is included with full access\.$/);
            await expect(scale.locator("details, section[id]")).toHaveCount(0);
            const html = await (await page.request.get(stages)).text();
            const rsc = await (await page.request.get(stages, { headers: { RSC: "1" } })).text();
            for (const text of [html, rsc]) {
               expect(text).not.toMatch(/["']evaluation["']|[>"]Evaluation[<"]/); // its id, type and title
               expect(text).not.toContain("premium evaluation body");
            }

            await expect(stageNames(page, "Review")).toHaveText(["Self-review"]); // Reference Solution is wholly withheld
            await expect(band(page, "Self-review").getByText(/included with full access|^Premium$/)).toHaveCount(0);
         });
      });
   }

   test.describe("entitled", () => {
      test.use({ identity: "entitled", viewport: { width: 1440, height: 900 } });

      test("no note and no indication; the full stage and both surfaces", async ({ page }) => {
         await page.goto(stages);
         await expect(note(page)).toHaveCount(0);
         await expect(main(page).getByText(/included with full access/)).toHaveCount(0);
         await expect(band(page, "Design").locator(":scope > details > summary")).toHaveText(["Show a hint, hint 1 for Design", "Show reference for Design"]);
         expect(await (await page.request.get(stages)).text(), "the matcher the unentitled check relies on").toMatch(/["']evaluation["']|[>"]Evaluation[<"]/);
         await expect(stageNames(page, "Review")).toHaveText(SURFACES);
      });
   });
});

test.describe("compatibility and unknowns (AC-9, S-CMP-3, S-SPN-13)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("a Problem with only today's types renders finished, with authored headings set below their section", async ({ page }) => {
      await page.goto(canonical(TODAY.id));
      await expect(stageNames(page, "Interview")).toHaveText(["Frame", "Requirements", "Design"]);
      await expect(stageNames(page, "Review")).toHaveText(["Reference Solution"]);
      await expect(cues(page)).toHaveText(["Step 1 of 3", "Step 2 of 3", "Step 3 of 3"]);
      await expect(more(page)).toHaveCount(0);
      await expect(reveals(page).locator("> summary")).toHaveText(["Show reference for Requirements", "Show reference for Design", "Show the reference solution"]);

      await control(band(page, "Design"), "Show reference for Design").click();
      await expect(band(page, "Design").getByRole("heading", { level: 3, name: "High-level design" })).toBeVisible();
      await expect(band(page, "Design").getByRole("heading", { level: 5, name: "Request path" })).toBeVisible();
      await expect(band(page, "Design").getByRole("heading", { level: 6, name: "Cache" })).toBeVisible();
   });

   test("unknown material: in a known position as 'Additional material', else closed under 'More material', and no unplaceable hint", async ({ page }) => {
      await page.goto(canonical(UNKNOWN.id));
      await expect(stageNames(page, "Interview")).toHaveText(["Frame", "Design", "Follow-ups"]);
      await control(band(page, "Design"), "Show reference for Design").click();
      await expect(band(page, "Design").getByRole("heading", { level: 3 })).toHaveText(["Future unit", "Additional material"]);

      await expect(more(page).getByRole("heading", { level: 2, name: "More material" })).toBeVisible();
      await expect(more(page).getByText(textOf(UNKNOWN.id, "future-zone"))).toBeHidden();
      await control(more(page), "Show more material").click();
      await expect(more(page).getByText(textOf(UNKNOWN.id, "future-zone"))).toBeVisible();
      await expect(more(page).getByText(textOf(UNKNOWN.id, "no-position"))).toBeVisible();
      await expect(main(page).getByText(textOf(UNKNOWN.id, "hint-future"))).toHaveCount(0);
      await expect(more(page).getByText(/^Step/)).toHaveCount(0);
   });
});

test.describe("the P2 frame of a Problem (S-CMP-5)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("is server-rendered with its title and the first and last of its sections in the HTML", async ({ request }) => {
      const html = await (await request.get(rich)).text();
      for (const text of [RICH.title, "T8 prompt marker.", "T8 reference marker.", "T8 unknown-type marker."]) expect(html, text).toContain(text);
   });

   test("leads with difficulty and level, then the category, the Track as context, and quiet topics", async ({ page }) => {
      await page.goto(rich);
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

   test("from a backend with no spine, reads every section closed under 'More material', in the API's order", async ({ page }) => {
      await page.goto(rich);
      await expect(group(page, "Interview")).toHaveCount(0);
      await expect(cues(page)).toHaveCount(0);
      await expect(main(page).getByText("T8 prompt marker.", { exact: false })).toBeHidden();
      await control(more(page), "Show more material").click();
      await expect(more(page).getByRole("heading", { level: 3 })).toHaveText(RICH.sections!.map(({ title }) => title!));
      await expect(main(page).getByText(/T8 deep-dive-(one|two|three) marker/)).toHaveText([
         "T8 deep-dive-one marker. What may be cached, and for how long.",
         "T8 deep-dive-two marker. Training and serving can disagree; how to notice.",
         "T8 deep-dive-three marker. What to serve when the ranker is unavailable.",
      ]);
   });

   test("renders its callouts as notes, its table, its code and its diagram once opened", async ({ page }) => {
      await page.goto(rich);
      await control(more(page), "Show more material").click();
      await expect(main(page).locator("[data-callout]")).toHaveCount(2);
      await expect(main(page).getByRole("table")).toHaveCount(2);
      await expect(main(page).locator("pre")).toHaveCount(3);
      await expect(main(page).locator("figure svg")).toHaveCount(1);
      expect(await overflows(page)).toBe(false);
   });
});

test.describe("preparation and neighbours", () => {
   test("'Before you start' groups what the API already related, in its order, with premium marked and nothing prefetched", async ({ page, traffic }) => {
      await page.goto(rich);
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
      await page.goto(rich);
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

   test("a Problem with no preparation relations shows no empty block", async ({ page }) => {
      await page.goto(canonical(SERVICE.id));
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(SERVICE.title);
      await expect(page.getByText("Before you start")).toHaveCount(0);
      await expect(main(page).getByText(/^Category: System design$/)).toBeVisible();
   });
});

test.describe("the outline on a desktop (S-LAY-2, S-AX-1)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("is a labelled, sticky list of the stages and surfaces shown, and the mobile control is not shown", async ({ page }) => {
      await page.goto(route);
      await expect(outline(page)).toHaveCount(1);
      await expect(outline(page).getByRole("link")).toHaveText([...ML_STAGES, ...SURFACES]);
      await expect(toggle(page)).toBeHidden();
      expect(await outline(page).evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
      const before = (await outline(page).boundingBox())!.y;
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      expect(Math.abs((await outline(page).boundingBox())!.y - before), "the navigation stayed in view").toBeLessThan(400);
   });

   test("a click focuses the stage, lands it under the header, marks it current and updates the URL", async ({ page }) => {
      await page.goto(route);
      await outline(page).getByRole("link", { name: "Evaluate & Scale" }).click();
      await expect(target(page, "problem_evaluate_and_scale")).toBeFocused();
      await expect.poll(() => top(target(page, "problem_evaluate_and_scale")), { timeout: 5000 }).toBe(112);
      await expect(outline(page).getByRole("link", { name: "Evaluate & Scale" })).toHaveAttribute("aria-current", "location");
      await expect(outline(page).locator("[aria-current]")).toHaveCount(1);
      await expect(page).toHaveURL(`${route}#problem_evaluate_and_scale`);
      expect(await openCount(page), "navigating opens no reveal").toBe(0);
   });

   test("is reachable by keyboard alone: Tab to a stage, Enter", async ({ page }) => {
      await page.goto(route);
      const link = outline(page).getByRole("link", { name: "ML Reasoning" });
      for (let stop = 0; stop < 80 && !(await link.evaluate((element) => element === document.activeElement)); stop++) await page.keyboard.press("Tab");
      await expect(link).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(target(page, "problem_ml_reasoning")).toBeFocused();
   });

   test("follows the reader: the stage being read becomes the current one", async ({ page }) => {
      await page.goto(route);
      await page.evaluate(() => document.getElementById("problem_requirements")!.scrollIntoView({ block: "start" }));
      await expect.poll(() => outline(page).locator("[aria-current]").textContent()).toBe("Requirements");
   });
});

test.describe("the outline on a phone", () => {
   test.use({ viewport: { width: 390, height: 844 } });

   test("keeps the stages in a collapsed disclosure that opens by keyboard, closes on a pick, and focuses the stage", async ({ page }) => {
      await page.goto(route);
      expect(await opened(page)).toBe(false);
      expect((await toggle(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await toggle(page).focus();
      await page.keyboard.press("Space");
      expect(await opened(page)).toBe(true);
      for (const link of await outline(page).getByRole("link").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press("Tab");
      await expect(outline(page).getByRole("button", { name: "Show everything" })).toBeFocused(); // first inside the disclosure (S-LAY-2)
      await page.keyboard.press("Tab");
      await expect(outline(page).getByRole("link").first()).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(target(page, "problem_frame")).toBeFocused();
      expect(await opened(page)).toBe(false);

      await toggle(page).click();
      await outline(page).getByRole("link", { name: "Depth & Trade-offs" }).click();
      await expect(target(page, "problem_depth_and_trade_offs")).toBeFocused();
      await expect.poll(() => top(target(page, "problem_depth_and_trade_offs")), { timeout: 5000 }).toBe(112);
   });

   test("gives every reveal control a full-width row of at least 44 px", async ({ page }) => {
      await page.goto(route);
      const width = (await group(page, "Interview").boundingBox())!.width;
      for (const summary of await main(page).locator("section > details > summary").filter({ visible: true }).all()) {
         const box = (await summary.boundingBox())!;
         expect(box.height).toBeGreaterThanOrEqual(44);
         expect(box.width).toBeGreaterThan(width * 0.9);
      }
   });

   test("never scrolls the page sideways; wide code and tables scroll inside focusable, named regions", async ({ page }) => {
      await page.goto(rich);
      await control(more(page), "Show more material").click();
      await expect(main(page).locator("figure svg")).toHaveCount(1);
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
      await expect(main(page).getByRole("region", { name: /^(JSON|Python) code$/ }).first()).toBeVisible();
      await expect(main(page).getByRole("region", { name: "Table" }).first()).toBeVisible();
      const diagram = (await main(page).locator("figure").boundingBox())!;
      expect(diagram.x + diagram.width).toBeLessThanOrEqual(390);
   });

   test("keeps the header readable and the related content whole", async ({ page }) => {
      await page.goto(rich);
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
      test(`uses the ${scheme} tokens for the stages and the facts, with no overflow`, async ({ page }) => {
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
               control: style("section[aria-labelledby='problem_requirements_title'] summary").color,
               rail: style("nav[aria-label='Outline'].sticky a").borderLeftColor,
            };
         });
         expect(colours.page).toBe(scheme === "dark" ? "rgb(15, 15, 17)" : "rgb(255, 255, 255)");
         for (const key of ["title", "cue", "rule", "control", "rail"] as const) expect(colours[key], key).not.toBe(colours.page);
         expect(await overflows(page)).toBe(false);
      });
   }

   test.describe("reduced motion", () => {
      test.use({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });

      test("a stage jump lands at once and smooth scrolling is off", async ({ page }) => {
         await page.goto(route);
         await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
         await toggle(page).click();
         await outline(page).getByRole("link", { name: "Requirements" }).click();
         await expect.poll(() => top(target(page, "problem_requirements")), { timeout: 1500 }).toBe(112);
         await expect(target(page, "problem_requirements")).toBeFocused();
      });
   });
});

test.describe("a free Problem with withheld sections, from a backend with no spine", () => {
   const gated = canonical(GATED.id);

   for (const identity of ["signed-out", "unentitled"] as const) {
      test.describe(identity, () => {
         test.use({ identity });

         test("says so once before its material, which reads in full once opened, and leaks nothing", async ({ page, traffic }) => {
            await page.goto(gated);
            await page.waitForLoadState("networkidle");
            await expectNoCanary(page, traffic, gated, identity);
            await expect(note(page)).toHaveCount(1);
            await expect(note(page)).toHaveText("Some material for this Problem is included with full access.");
            expect((await note(page).boundingBox())!.y).toBeLessThan((await more(page).boundingBox())!.y);
            await control(more(page), "Show more material").click();
            await expect(main(page).getByText("T8 gated trade-offs marker.")).toBeVisible();
            await expect(more(page).getByRole("heading", { level: 3 })).toHaveText(["Prompt", "Functional requirements", "High-level design", "Trade-offs"]);
            await expect(main(page).getByText(/Reference design|Follow-ups/)).toHaveCount(0);
         });
      });
   }

   test.describe("entitled", () => {
      test.use({ identity: "entitled" });

      test("reads the premium sections too, and no note", async ({ page, traffic }) => {
         await page.goto(gated);
         await expect(note(page)).toHaveCount(0);
         await control(more(page), "Show more material").click();
         await expect(more(page).getByRole("heading", { level: 3 })).toHaveText(GATED.sections!.map(({ title }) => title!));
         await expect(more(page).getByText(CANARY).first()).toBeVisible();
         expect((await exposures(page, await traffic.responses(), CANARY)).map((found) => found.channel)).toEqual(expect.arrayContaining(["HTML", "RSC", "DOM"]));
      });
   });
});

test.describe("a fully locked Problem (AC-14)", () => {
   const locked = canonical(LOCKED.id);
   const NOTICE = { "signed-out": "Sign in to read this content.", unentitled: "Paid access is not available yet." };

   for (const identity of ["signed-out", "unentitled"] as const) {
      test.describe(identity, () => {
         test.use({ identity });

         test("shows only the public header and a notice, with no body, Track, preparation, stages or related content", async ({ page, traffic }) => {
            expect((await page.goto(locked))?.status()).toBe(200);
            await page.waitForLoadState("networkidle");
            await expectNoCanary(page, traffic, locked, identity);

            await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(LOCKED.title);
            await expect(main(page).locator("dl dd")).toHaveText(["Hard", "Advanced"]);
            await expect(main(page).getByText("ML system design")).toBeVisible();
            await expect(main(page).getByRole("status")).toContainText(NOTICE[identity]);
            for (const absent of [/^Part of/, "Before you start", /^Step \d/, /^Related /, "The challenge", "More material"]) {
               await expect(main(page).getByText(absent)).toHaveCount(0);
            }
            await expect(main(page).locator("details")).toHaveCount(0);
            await expect(outline(page)).toHaveCount(0);
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
      await page.goto(rich);
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

// P4-T12: one ephemeral owner of reveal state (S-RVL-7) over the native disclosures, Show / Hide everything, fragments, the outline.
const SECTIONS = ML.sections!.map(({ id }) => id);
const everything = (page: Page, name: "Show everything" | "Hide everything") => page.getByRole("button", { name });
const status = (page: Page) => page.getByRole("status");
const hasText = (page: Page, id: string, section: string) => main(page).getByText(textOf(id, section));
const inView = (page: Page, id: string) => expect(target(page, id)).toBeInViewport();
/** Everything a reveal could use to remember itself: cookies, storage, the query and the fragment. */
const remembered = (page: Page) =>
   page.evaluate(async () => ({
      cookie: document.cookie,
      local: Object.keys(localStorage).sort(),
      session: Object.keys(sessionStorage).sort(),
      databases: ((await indexedDB.databases?.()) ?? []).map(({ name }) => name),
      search: location.search,
      hash: location.hash,
   }));

test.describe("Show everything and Hide everything (CHL-7, S-RVL-6, S-AX-5)", () => {
   test.describe("on a desktop", () => {
      test.use({ viewport: { width: 1440, height: 900 } });

      test("lives in the outline below a hairline, never beside the challenge", async ({ page }) => {
         await page.goto(route);
         const button = everything(page, "Show everything");
         await expect(button).toHaveCount(1);
         await expect(outline(page).getByRole("button")).toHaveText("Show everything");
         expect(await button.evaluate((element) => getComputedStyle(element.parentElement!).borderTopWidth)).toBe("1px");
         await expect(main(page).getByRole("button")).toHaveCount(1); // the only button on the page
         await expect(band(page, "Frame").getByRole("button")).toHaveCount(0);
      });

      test("opens every released reveal and every unit, then reads Hide everything, and moves no focus", async ({ page }) => {
         await page.goto(route);
         const total = await reveals(page).count();
         await everything(page, "Show everything").click();
         expect(await openCount(page)).toBe(total);
         for (const id of SECTIONS) await expect(target(page, id), id).toBeVisible();
         await expect(everything(page, "Hide everything")).toBeFocused();
         await expect(everything(page, "Show everything")).toHaveCount(0);
      });

      test("returns to the challenge-first view, whatever the reader had opened", async ({ page }) => {
         await page.goto(route);
         await control(band(page, "Design"), "Show reference for Design").click();
         await everything(page, "Show everything").click();
         await everything(page, "Hide everything").click();
         expect(await openCount(page)).toBe(0);
         await expect(visibleBodies(page)).toHaveCount(1);
         await expect(main(page).getByText(textOf(ML.id, "prompt"))).toBeVisible();
         await expect(everything(page, "Show everything")).toBeFocused();
      });

      test("announces each press once, politely, and not at load", async ({ page }) => {
         await page.goto(route);
         await expect(status(page)).toHaveCount(1);
         await expect(status(page)).toHaveText("");
         const box = (await status(page).boundingBox())!;
         expect(box.width * box.height, "visually hidden, read by assistive technology").toBeLessThanOrEqual(1);
         await everything(page, "Show everything").click();
         await expect(status(page)).toHaveText("Everything is shown.");
         await everything(page, "Hide everything").click();
         await expect(status(page)).toHaveText("Everything is hidden.");
      });

      test("keeps native toggling in step: closing one reveal leaves the others shown", async ({ page }) => {
         await page.goto(route);
         const total = await reveals(page).count();
         await everything(page, "Show everything").click();
         await control(band(page, "Design"), "Show reference for Design").click();
         expect(await openCount(page)).toBe(total - 1);
         await expect(main(page).getByText(textOf(ML.id, "high-level-design"))).toBeHidden();
         await expect(main(page).getByText(textOf(ML.id, "functional"))).toBeVisible();
      });

      test("is reachable by keyboard: Tab to it, Space shows, Space hides", async ({ page }) => {
         await page.goto(route);
         const button = everything(page, "Show everything");
         for (let stop = 0; stop < 80 && !(await button.evaluate((element) => element === document.activeElement)); stop++) await page.keyboard.press("Tab");
         await expect(button).toBeFocused();
         expect(await button.evaluate((element) => element.matches(":focus-visible") && getComputedStyle(element).outlineStyle !== "none")).toBe(true);
         await page.keyboard.press("Space");
         await expect(everything(page, "Hide everything")).toBeFocused();
         expect(await openCount(page)).toBeGreaterThan(10);
         await page.keyboard.press("Enter");
         expect(await openCount(page)).toBe(0);
      });
   });

   test.describe("on a phone", () => {
      test.use({ viewport: { width: 390, height: 844 } });

      test("is at the top of the collapsed outline, and the outline stays open for it", async ({ page }) => {
         await page.goto(route);
         await expect(everything(page, "Show everything")).toBeHidden(); // inside the closed disclosure
         await toggle(page).click();
         const button = everything(page, "Show everything");
         await expect(button).toBeVisible();
         expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
         const before = (await button.boundingBox())!.y;
         expect(before, "above the first group").toBeLessThan((await outline(page).getByRole("list", { name: "Interview" }).boundingBox())!.y);
         await button.click();
         expect(await openCount(page)).toBe(await reveals(page).count());
         expect(await opened(page)).toBe(true);
         await expect(status(page)).toHaveText("Everything is shown.");
         await everything(page, "Hide everything").click();
         expect(await openCount(page)).toBe(0);
         expect(await overflows(page)).toBe(false);
      });
   });

   test.describe("without JavaScript (S-RVL-12c)", () => {
      test.use({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });

      test("is absent, and the outline's links still lead to every band", async ({ page }) => {
         await page.goto(route);
         await expect(page.getByRole("button", { name: /everything/ })).toHaveCount(0);
         await expect(outline(page).getByRole("link")).toHaveCount(9);
         await expect(outline(page).getByRole("link", { name: "Design" })).toHaveAttribute("href", "#problem_design");
         expect(await openCount(page)).toBe(0);
      });
   });
});

test.describe("deep links and reload (CHL-8, S-RVL-8 … S-RVL-10, AC-4)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("a released unit opens its list and itself, takes focus, and is brought into view; nothing else opens", async ({ page }) => {
      await page.goto(`${route}#deep-dive-labels`);
      await expect(target(page, "deep-dive-labels")).toBeFocused();
      await expect(hasText(page, ML.id, "deep-dive-labels")).toBeVisible();
      await expect(hasText(page, ML.id, "decision-model")).toBeHidden(); // the other unit stays closed
      expect(await openCount(page)).toBe(2);
      await inView(page, "deep-dive-labels");
      expect(await page.evaluate(() => location.hash)).toBe("#deep-dive-labels");
   });

   test("the browser's own scroll to the fragment is instant, so it and the page's own scroll land in the same place", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(`${route}#deep-dive-labels`);
      await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
      await expect(hasText(page, ML.id, "deep-dive-labels")).toBeVisible();
      await expect.poll(() => top(target(page, "deep-dive-labels"))).toBe(112);
      await page.waitForTimeout(500);
      expect(await top(target(page, "deep-dive-labels")), "nothing scrolls it away afterwards").toBe(112);
   });

   test("a clarification opens the same way, and Tab then reaches the unit's own open control", async ({ page }) => {
      await page.goto(`${route}#clarify-freshness`);
      await expect(target(page, "clarify-freshness")).toBeFocused();
      // The browser focuses the fragment and opens its list at once; the unit opens once the page is interactive (S-RVL-8).
      await expect(page.locator('details[data-reveal="clarify-freshness"]')).toHaveAttribute("open", "");
      expect(await openCount(page)).toBe(2);
      await page.keyboard.press("Tab");
      await expect(page.locator('details[data-reveal="clarify-freshness"] > summary')).toBeFocused();
   });

   for (const [name, id, expected] of [
      ["a stage-reference section", "entities", 1],
      ["a hint", "hint-model", 1],
      ["reference_design", "reference-design", 1],
      ["level_expectations", "level-expectations", 1],
      ["common_mistakes", "common-mistakes", 2],
   ] as const) {
      test(`${name} (#${id}) opens the reveal around it, moves no focus, and scrolls to it`, async ({ page }) => {
         await page.goto(`${route}#${id}`);
         await expect(target(page, id)).toBeVisible();
         await inView(page, id);
         expect(await openCount(page)).toBe(expected);
         await expect(target(page, id)).not.toBeFocused();
         expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
      });
   }

   test("the challenge and a position (page id) only scroll: nothing opens", async ({ page }) => {
      for (const id of ["prompt", "problem_design"]) {
         await page.goto(`${route}#${id}`);
         await inView(page, id);
         expect(await openCount(page), id).toBe(0);
      }
   });

   test("an absent id does nothing and raises no error", async ({ page }) => {
      await page.goto(`${route}#not-in-this-problem`);
      await page.waitForTimeout(300);
      expect(await openCount(page)).toBe(0);
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
   });

   test("following an in-page link or changing the hash later opens the same way", async ({ page }) => {
      await page.goto(route);
      expect(await openCount(page)).toBe(0);
      await page.evaluate(() => (location.hash = "#decision-model"));
      await expect(target(page, "decision-model")).toBeFocused();
      expect(await openCount(page)).toBe(2);
      await page.evaluate(() => (location.hash = "#model"));
      await expect(hasText(page, ML.id, "model")).toBeVisible();
      expect(await openCount(page), "opening one thing never closes another").toBe(3);
   });

   // `window.next.router` is the App Router instance behind every <Link>; the marker proves the document was never reloaded.
   test.describe("through the client router, not a page load", () => {
      const push = (page: Page, href: string) => page.evaluate((to) => (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push(to), href);

      test("from another page to a released unit: its path and the unit open, and it takes focus", async ({ page }) => {
         await page.goto(canonical(SD.id));
         await page.evaluate(() => ((window as unknown as { __sameDocument: boolean }).__sameDocument = true));
         const documents: string[] = [];
         page.on("request", (request) => void (request.resourceType() === "document" && documents.push(request.url())));
         await push(page, `${route}#deep-dive-labels`);
         await expect(page).toHaveURL(`${route}#deep-dive-labels`);
         await expect(target(page, "deep-dive-labels")).toBeFocused();
         await expect(hasText(page, ML.id, "deep-dive-labels")).toBeVisible();
         await expect(hasText(page, ML.id, "decision-model")).toBeHidden();
         expect(await openCount(page)).toBe(2);
         expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument), "the document survived").toBe(true);
         expect(documents, "no document request").toEqual([]);
      });

      test("to a unit of the page already open, which fires no hashchange", async ({ page }) => {
         await page.goto(route);
         expect(await openCount(page)).toBe(0);
         await push(page, `${route}#decision-model`);
         await expect(target(page, "decision-model")).toBeFocused();
         expect(await openCount(page)).toBe(2);
         await push(page, `${route}#clarify-freshness`);
         await expect(target(page, "clarify-freshness")).toBeFocused();
         expect(await openCount(page), "opening one thing never closes another").toBe(4);
      });
   });

   test("a normal reload returns to the challenge-first view", async ({ page }) => {
      await page.goto(route);
      await control(band(page, "Design"), "Show reference for Design").click();
      await control(band(page, "Frame"), "Show a hint").click();
      expect(await openCount(page)).toBe(2);
      await page.reload();
      expect(await openCount(page)).toBe(0);
      await expect(visibleBodies(page)).toHaveCount(1);
   });

   test("a reload after Show everything is challenge-first too", async ({ page }) => {
      await page.goto(route);
      await everything(page, "Show everything").click();
      await page.reload();
      expect(await openCount(page)).toBe(0);
      await expect(everything(page, "Show everything")).toBeVisible();
   });

   test("a reload that still carries a valid unit fragment reopens that unit and only the path to it", async ({ page }) => {
      await page.goto(`${route}#deep-dive-labels`);
      await control(band(page, "Design"), "Show reference for Design").click(); // the reader's own reveal is not remembered
      await page.reload();
      await expect(target(page, "deep-dive-labels")).toBeFocused();
      await expect(hasText(page, ML.id, "deep-dive-labels")).toBeVisible();
      expect(await openCount(page)).toBe(2);
      await expect(hasText(page, ML.id, "high-level-design")).toBeHidden();
   });

   test("after outline navigation the fragment names a position, so a reload opens nothing", async ({ page }) => {
      await page.goto(`${route}#deep-dive-labels`);
      await outline(page).getByRole("link", { name: "Design" }).click();
      await expect(page).toHaveURL(`${route}#problem_design`);
      await page.reload();
      expect(await openCount(page)).toBe(0);
   });

   test("a followed fragment is not the lens or learner state: no request is made", async ({ page }) => {
      const sent: string[] = [];
      page.on("request", (request) => void sent.push(`${request.method()} ${request.url()}`));
      await page.goto(`${route}#deep-dive-labels`);
      await page.waitForLoadState("load");
      const before = sent.length;
      await everything(page, "Show everything").click();
      await everything(page, "Hide everything").click();
      await page.evaluate(() => (location.hash = "#decision-model"));
      await page.waitForTimeout(300);
      expect(sent.slice(before).filter((request) => !/_rsc|\/_next\/static\//.test(request)), "interactions made no data request").toEqual([]);
   });
});

test.describe("withheld and premium ids (S-RVL-9, S-ENT-1, SEC-3)", () => {
   const stages = canonical(STAGES.id);
   const WITHHELD = ["non-functional", "entities", "interfaces", "high-level-design", "evaluation", "follow-up-secret", "reference-design", "level-expectations"];

   for (const identity of ["signed-out", "unentitled"] as const) {
      test.describe(identity, () => {
         test.use({ identity, viewport: { width: 1440, height: 900 } });

         test("a guessed premium id does nothing, raises no error and adds nothing to the page", async ({ page, traffic }) => {
            for (const id of WITHHELD) {
               await page.goto(`${stages}#${id}`);
               await page.waitForTimeout(150);
               expect(await openCount(page), id).toBe(0);
               await expect(target(page, id), id).toHaveCount(0);
               expect(await page.evaluate(() => document.activeElement === document.body), id).toBe(true);
            }
            await expectNoCanary(page, traffic, stages, identity);
            const html = await page.content();
            expect(html).not.toContain("P4_SENTINEL");
            expect(html).not.toContain("premium evaluation body");
         });

         test("a released id on the same Problem still opens its reveal", async ({ page }) => {
            await page.goto(`${stages}#hint-design-1`);
            await expect(main(page).getByText(textOf(STAGES.id, "hint-design-1"))).toBeVisible();
            expect(await openCount(page)).toBe(1);
         });

         test("Show everything opens only what was released", async ({ page, traffic }) => {
            await page.goto(stages);
            await everything(page, "Show everything").click();
            expect(await openCount(page)).toBe(await reveals(page).count());
            await expectNoCanary(page, traffic, stages, identity);
            expect(await page.content()).not.toContain("P4_SENTINEL");
         });
      });
   }

   test.describe("entitled", () => {
      test.use({ identity: "entitled", viewport: { width: 1440, height: 900 } });

      test("the same ids open their reveals", async ({ page }) => {
         await page.goto(`${stages}#entities`);
         await expect(target(page, "entities")).toBeVisible();
         expect(await openCount(page)).toBe(1);
         await page.goto(`${stages}#level-expectations`);
         await expect(target(page, "level-expectations")).toBeVisible();
      });
   });
});

test.describe("nothing is remembered (S-PST-1 … S-PST-3, S-TST-6)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("no cookie, storage, database, query or fragment is written by any reveal interaction", async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("load");
      const before = await remembered(page);
      expect(before.hash).toBe("");

      await control(band(page, "Design"), "Show reference for Design").click(); // a native toggle
      await control(band(page, "Depth & Trade-offs"), "Compare with the topics the reference goes deep on").click();
      await everything(page, "Show everything").click();
      await everything(page, "Hide everything").click();
      await everything(page, "Show everything").click();
      expect(await remembered(page)).toEqual(before);
   });

   test("following a fragment adds no storage, query or second fragment; only outline navigation writes one, naming a position", async ({ page }) => {
      await page.goto(route);
      const before = await remembered(page);
      await page.goto(`${route}#deep-dive-labels`);
      const arrived = await remembered(page);
      expect(arrived).toEqual({ ...before, hash: "#deep-dive-labels" });
      await outline(page).getByRole("link", { name: "Follow-ups" }).click();
      expect(await remembered(page)).toEqual({ ...before, hash: "#problem_follow_ups" });
   });
});

test.describe("the outline, grouped (S-LAY-2, S-AX-1)", () => {
   test.describe("on a desktop", () => {
      test.use({ viewport: { width: 1440, height: 900 } });

      test("lists Interview numbered in spine order and Review unnumbered, as two labelled lists", async ({ page }) => {
         await page.goto(route);
         const interview = outline(page).getByRole("list", { name: "Interview" });
         const review = outline(page).getByRole("list", { name: "Review" });
         await expect(interview.getByRole("link")).toHaveText(ML_STAGES);
         await expect(review.getByRole("link")).toHaveText(SURFACES);
         expect(await interview.evaluate((element) => element.tagName + getComputedStyle(element).listStyleType)).toBe("OLdecimal");
         expect(await review.evaluate((element) => getComputedStyle(element).listStyleType)).toBe("none");
         await expect(outline(page).locator("h1, h2, h3, h4, h5, h6")).toHaveCount(0); // the page's own h2s stay the spine
         // The numbers are the cues' numbers.
         await expect(cues(page)).toHaveText(ML_STAGES.map((_, index) => `Step ${index + 1} of 7`));
      });

      test("keeps the order of its links equal to the order of the bands", async ({ page }) => {
         await page.goto(route);
         const hrefs = await outline(page).getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")!.slice(1)));
         expect(hrefs).toEqual(ML_IDS);
         const positions = await page.evaluate((ids) => ids.map((id) => document.getElementById(id)!.getBoundingClientRect().top), hrefs);
         expect(positions).toEqual([...positions].sort((a, b) => a - b));
      });
   });

   test("is a rail from 1024 px and a collapsed disclosure below it", async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.goto(route);
      await expect(toggle(page)).toBeHidden();
      await expect(outline(page)).toBeVisible();
      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(toggle(page)).toBeVisible();
      expect(await opened(page)).toBe(false);
      await expect(outline(page)).toHaveCount(0);
      expect(await overflows(page)).toBe(false);
   });

   test.describe("on a phone without JavaScript", () => {
      test.use({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });

      test("is complete: the disclosure opens natively, its links are anchors, and there is no Show everything", async ({ page }) => {
         await page.goto(route);
         await toggle(page).click();
         expect(await opened(page)).toBe(true);
         await expect(outline(page).getByRole("link")).toHaveCount(9);
         await expect(page.getByRole("button", { name: /everything/ })).toHaveCount(0);
      });
   });
});

test.describe("Frame: your questions first, and the assumptions (AC-7, AC-8, S-CLR-2, S-CLR-3, S-ASM-1)", () => {
   const sd = canonical(SD.id);
   const QUESTIONS = "Compare with a strong candidate's questions";
   const RATE = "How many notifications per second must it handle?";
   const CHANNELS = "Which channels are in scope?";
   const frame = (page: Page) => band(page, "Frame");

   test("opens with the coach's line and no canonical question; the questions are titles only after their own reveal", async ({ page }) => {
      await page.goto(sd);
      await expect(frame(page).getByText("Before reading on, list the questions you would ask the interviewer and the assumptions you would state.")).toBeVisible();
      for (const title of [RATE, CHANNELS]) await expect(page.getByRole("heading", { name: title })).toBeHidden();
      for (const hidden of ["P4 sd answer marker", "Sizing drives the queue"]) await expect(page.getByText(hidden, { exact: false })).toBeHidden();
      expect(await openCount(page)).toBe(0);

      await control(frame(page), QUESTIONS).click();
      await expect(frame(page).getByRole("heading", { name: RATE })).toBeVisible();
      await expect(frame(page).getByRole("heading", { name: CHANNELS })).toBeVisible();
      await expect(page.getByText("P4 sd answer marker", { exact: false })).toBeHidden(); // titles are not answers
      expect(await openCount(page)).toBe(1);
   });

   test("opens each answer on its own, with its parts in canonical order under their eyebrows", async ({ page }) => {
      await page.goto(sd);
      await control(frame(page), QUESTIONS).click();
      await control(frame(page), `Show the interviewer's answer: ${RATE}`).click();
      const answer = page.locator('details[data-reveal="clarify-rate"]');
      await expect(answer.locator("[data-part]")).toHaveCount(3);
      expect(await answer.locator("[data-part] > p:first-child").allTextContents()).toEqual(["Interviewer's answer", "Why it matters", "If the answer were different"]);
      await expect(answer.getByText("P4 sd answer marker", { exact: false })).toBeVisible();
      await expect(page.getByText("P4 sd channels answer marker", { exact: false })).toBeHidden(); // opening one opens no other
      expect(await openCount(page)).toBe(2);
   });

   test("lists each assumption with its Conditions line, and opens each on its own", async ({ page }) => {
      await page.goto(sd);
      await control(frame(page), "Compare with the reference's assumptions").click();
      const unit = page.locator("#assume-fanout");
      await expect(unit).toBeVisible();
      await expect(unit.locator("xpath=following-sibling::p[1]")).toHaveText("Conditions: Queue or direct send?");
      await expect(page.getByText("P4 sd assumption marker", { exact: false })).toBeHidden();
      await control(frame(page), "Show reference: Fan-out is bounded per event").click();
      await expect(page.getByText("P4 sd assumption marker", { exact: false })).toBeVisible();
      expect(await openCount(page)).toBe(2);
   });

   test("reveals the scope reasoning only from its own control", async ({ page }) => {
      await page.goto(sd);
      await expect(page.getByText("P4 sd scope marker", { exact: false })).toBeHidden();
      await control(frame(page), "Show how the reference frames the problem").click();
      await expect(page.getByText("P4 sd scope marker", { exact: false })).toBeVisible();
   });

   test("a withheld clarification offers no questions control, no coach's line and no trace of the question", async ({ page }) => {
      await page.goto(canonical(item("problem.p4-premium-units").id));
      await expect(frame(page).getByText("Some material in this stage is included with full access.")).toBeVisible();
      await expect(control(frame(page), QUESTIONS)).toHaveCount(0);
      await expect(frame(page).getByText("Before reading on")).toHaveCount(0);
      expect(await page.content()).not.toContain("P4_SENTINEL_CLARIFICATION");
   });
});
