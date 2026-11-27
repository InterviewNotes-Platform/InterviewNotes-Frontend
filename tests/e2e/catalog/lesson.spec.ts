import type { APIRequestContext, Locator, Page } from "@playwright/test";
import fixture from "./fixture.json";
import { plainHeading } from "../../../src/lib/catalog/lesson";
import { CANARY, FAKE_API_ORIGIN, PREVIEW_API_ORIGIN, PREVIEW_ORIGIN, canonical, expect, expectNoCanary, item, test, track } from "./harness";

// P2-T5 Lesson reading: layout, contents, headings, relations, technical content, themes, motion and access.
const LONG = item("lesson.p2-t5-long");
const PRIMER = item("lesson.p2-t5-primer");
const PREMIUM = item("lesson.p2-t5-premium");
const READING = track("p2-t5-reading");
const [FOUNDATIONS, DEEPER] = READING.modules;
const route = canonical(LONG.id);

interface Heading {
   id: string;
   level: number;
   text: string;
}
const HEADINGS = (fixture.items.find(({ id }) => id === LONG.id) as unknown as { headings: Heading[] }).headings;
const CONTENTS = HEADINGS.filter(({ level }) => level === 2 || level === 3);

const main = (page: Page) => page.getByRole("main");
// P8-T27: the Lesson's contents are the opening "In this lesson" list at every width, plus a "Lesson sections" bar that docks
// under the shell's top bar once that list scrolls away (it replaces the old sticky "Contents" rail and its narrow disclosure).
const contents = (page: Page) => page.getByRole("navigation", { name: "In this lesson", exact: true });
const dock = (page: Page) => page.getByRole("navigation", { name: "Lesson sections" });
const dockToggle = (page: Page) => dock(page).locator('button[aria-controls="lesson-dock-list"]');
const dockList = (page: Page) => page.locator("#lesson-dock-list");
const trackContents = (page: Page) => page.getByRole("navigation", { name: "Track contents" });
// P8-T26: the reader shell's Track rail (expands to the sidebar from 768 px) and the Lesson's study tools (margin from 1280 px).
const rail = (page: Page) => page.getByRole("complementary", { name: "Track navigation" });
const expandSidebar = (page: Page) => page.getByRole("button", { name: "Expand Track sidebar" });
const folio = (page: Page) => page.getByRole("complementary", { name: "Study tools" });
const toolsButton = (page: Page) => page.getByRole("button", { name: "Study tools" });
const current = (page: Page) => contents(page).locator('[aria-current="location"]');
/** P8-T27: a heading's scroll margin clears the header, the shell's top bar and the docked section bar (lesson-reader.css). */
const LANDING = 180;
/** P8-T27: chapter (h2) entries lead with their number, so an entry's text ends with its heading's. */
const entryText = (text: string) => new RegExp(`${plainHeading(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
const scrollDown = async (page: Page) => {
   await page.evaluate(() => window.scrollTo({ top: 2400, behavior: "instant" }));
   await expect(dock(page)).toBeVisible();
};
const heading = (page: Page, id: string) => page.locator(`[id="${id}"]`);
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const top = (locator: Locator) => locator.evaluate((element) => Math.round(element.getBoundingClientRect().top));
/** Diagrams draw as they near the viewport (Mermaid loads lazily), so each figure is brought on screen first. */
const diagrams = async (page: Page) => {
   for (const figure of await page.locator("figure").all()) await figure.scrollIntoViewIfNeeded();
   await expect(page.locator("figure svg")).toHaveCount(2);
   return page.locator("figure");
};

/** Tab until `target` has focus, so any focus ring comes from real keyboard modality. */
async function tabTo(page: Page, target: Locator) {
   for (let stop = 0; stop < 90; stop++) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((element) => element === document.activeElement)) return;
   }
   throw new Error("focus never reached the target");
}

test.describe("the long Lesson", () => {
   test("is server-rendered with its title, body and canonical heading ids in the HTML", async ({ request }) => {
      const html = await (await request.get(route)).text();
      expect(html).toContain(LONG.title);
      expect(html).toContain("Synthetic long-form lesson marker.");
      for (const { id } of HEADINGS) expect(html, `heading ${id}`).toContain(`id="${id}"`);
   });

   test("has one h1, an ordered heading outline and the Tracks / Track / Module breadcrumb", async ({ page }) => {
      await page.goto(route);
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(LONG.title);

      const levels = await main(page).locator("h1, h2, h3, h4").evaluateAll((all) => all.map((element) => Number(element.tagName[1])));
      levels.forEach((level, index) => expect(level, `heading ${index} skips a level`).toBeLessThanOrEqual(index === 0 ? 1 : levels[index - 1] + 1));

      const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
      await expect(crumbs).toHaveText(new RegExp(`^Tracks\\s*/\\s*${READING.title}\\s*/\\s*${FOUNDATIONS.title}$`));
      await expect(crumbs.getByRole("link", { name: "Tracks" })).toHaveAttribute("href", "/tracks");
      await expect(crumbs.getByRole("link", { name: READING.title })).toHaveAttribute("href", canonical(READING.id));
      await expect(crumbs.getByRole("link", { name: FOUNDATIONS.title })).toHaveAttribute("href", `${canonical(READING.id)}#${FOUNDATIONS.key}`);
      await expect(crumbs.getByRole("link")).toHaveCount(3);
      await expect(page.getByText("Level: Intermediate")).toBeVisible();
   });

   test("renders every h2/h3 with exactly the API's id, once, as a focus target", async ({ page }) => {
      await page.goto(route);
      for (const { id, level } of CONTENTS) {
         const element = heading(page, id);
         await expect(element, id).toHaveCount(1);
         expect(await element.evaluate((node) => node.tagName), id).toBe(`H${level}`);
         await expect(element).toHaveAttribute("tabindex", "-1");
      }
      const ids = await page.evaluate(() => [...document.querySelectorAll("[id]")].map((element) => element.id));
      expect(new Set(ids).size, "an id is repeated on the page").toBe(ids.length);
      expect(await heading(page, "example").count()).toBe(1);
      expect(await heading(page, "example-2").count()).toBe(1);
   });

   test("keeps a heading's accessible name to its text and gives h2/h3 a named, quiet anchor", async ({ page }) => {
      await page.goto(route);
      await expect(main(page).getByRole("heading", { level: 2, name: "Sizing the kv_cache budget" })).toHaveCount(1);
      const anchor = main(page).getByRole("link", { name: "Link to section: Sizing the kv_cache budget" });
      await expect(anchor).toHaveAttribute("href", "#sizing-the-kv-cache-budget");
      await expect(anchor).toHaveCSS("opacity", "0");
      await heading(page, "sizing-the-kv-cache-budget").hover();
      await expect(anchor).toHaveCSS("opacity", "1");
   });

   test("sets Knowledge references apart from ordinary links, canonically", async ({ page }) => {
      await page.goto(route);
      const knowledge = main(page).locator('a[data-reference="knowledge"]').first();
      await expect(knowledge).toHaveAttribute("href", "/knowledge/catalog-e2e-sections");
      await expect(knowledge).toHaveCSS("text-decoration-style", "dotted");
      const ordinary = main(page).getByRole("link", { name: "a design problem" });
      await expect(ordinary).toHaveAttribute("href", canonical("problem.p2-t4-practice"));
      await expect(ordinary).toHaveCSS("text-decoration-style", "solid");
   });
});

test.describe("relations", () => {
   test("Builds on leads the page, with each target's type", async ({ page }) => {
      await page.goto(route);
      const group = page.getByRole("region", { name: "Builds on" });
      await expect(group.getByRole("link")).toHaveText(["Mixed Access Knowledge", PRIMER.title]);
      await expect(group.getByRole("link").first()).toHaveAttribute("href", "/knowledge/catalog-e2e-sections");
      await expect(group.getByRole("link").last()).toHaveAttribute("href", canonical(PRIMER.id));
      await expect(group).toContainText("Knowledge");
      await expect(group).toContainText("Lesson");
   });

   test("reads Next, Related Knowledge, the Practice transition, quiet Related Problems, the Curriculum block, then Related Lessons, after the body", async ({ page }) => {
      await page.goto(route);
      const names = ["Related Knowledge", "Practice", "Related Problems", "Related Lessons"];
      const boxes: ({ y: number } | null)[] = [];
      for (const name of names) boxes.push(await page.getByRole("heading", { level: 2, name }).boundingBox());
      boxes.forEach((box, index) => expect(box, names[index]).not.toBeNull());
      boxes.slice(1).forEach((box, index) => expect(box!.y).toBeGreaterThan(boxes[index]!.y));
      expect((await heading(page, "summary").boundingBox())!.y).toBeLessThan(boxes[0]!.y);
      // P3-T5: Next lesson follows the body and leads the close; the Curriculum block closes its primary groups
      const next = (await page.getByRole("navigation", { name: `Next in ${READING.title}` }).boundingBox())!.y;
      const curriculum = (await page.getByRole("navigation", { name: "Curriculum" }).boundingBox())!.y;
      expect(next).toBeLessThan(boxes[0]!.y);
      expect(curriculum).toBeGreaterThan(boxes[2]!.y);
      expect(curriculum).toBeLessThan(boxes[3]!.y);
   });

   test("the Practice transition holds at most two Problems in the API's order, the premium one marked", async ({ page }) => {
      await page.goto(route);
      const practice = page.getByRole("region", { name: "Practice" });
      await expect(practice.getByRole("link")).toHaveText(["Synthetic Practice Step", "Synthetic Premium Practice Problem"]);
      await expect(practice.getByRole("listitem").nth(1).getByText("Premium", { exact: true })).toBeVisible();
      await expect(practice.getByRole("listitem").first().getByText("Premium", { exact: true })).toHaveCount(0);
   });

   test("other Problems stay quiet and appear once; every catalog link in the page is canonical", async ({ page }) => {
      await page.goto(route);
      const quiet = page.getByRole("region", { name: "Related Problems" });
      await expect(quiet.getByRole("link")).toHaveText(["Related Practice Problem", "T24 Premium Solution Problem"]);
      const hrefs = await main(page).locator('a[href^="/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
      // the breadcrumb's Module location is the one fragment link (S-MOD-4)
      for (const href of hrefs.filter((candidate) => candidate !== "/tracks" && candidate !== `${canonical(READING.id)}#${FOUNDATIONS.key}`)) {
         expect(href).toMatch(/^\/(lessons|problems|knowledge|tracks)\/[a-z0-9]+(-[a-z0-9]+)*$/);
      }
      // an authored inline reference may name a Problem the relations also list; the relation groups may not repeat one
      const listed = [page.getByRole("region", { name: "Practice" }), quiet].map((group) => group.getByRole("link"));
      const problems = (await Promise.all(listed.map((links) => links.evaluateAll((all) => all.map((link) => link.getAttribute("href")!))))).flat();
      expect(problems).toHaveLength(4);
      expect(new Set(problems).size, "a Problem is shown twice").toBe(problems.length);
   });

   test("a Lesson with no relations has no relation groups and no stray gap", async ({ page }) => {
      await page.goto(canonical(PRIMER.id));
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(PRIMER.title);
      for (const name of ["Builds on", "Related Knowledge", "Related Lessons", "Practice", "Related Problems"]) {
         await expect(main(page).getByRole("heading", { name })).toHaveCount(0);
      }
      // P8-T27: the contents are now "In this lesson" and the docking section bar
      await expect(contents(page)).toHaveCount(0); // one heading: no contents
      await expect(page.locator(".lesson-dock-bar")).toHaveCount(0);
   });

   test("following the Practice transition opens the Problem at its own canonical URL", async ({ page }) => {
      await page.goto(route);
      await page.getByRole("region", { name: "Practice" }).getByRole("link", { name: "Synthetic Practice Step" }).click();
      await expect(page).toHaveURL(canonical("problem.p2-t4-practice"));
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("Synthetic Practice Step");
   });
});

test.describe("curriculum", () => {
   test("Next follows the home Track's order across the module boundary; Previous is the quiet card after the Curriculum block", async ({ page }) => {
      await page.goto(route);
      const next = page.getByRole("navigation", { name: `Next in ${READING.title}` }).getByRole("link");
      await expect(next).toHaveAttribute("href", canonical(PREMIUM.id));
      await expect(next).toHaveAccessibleName(`Next lesson: ${PREMIUM.title}, premium`);
      await expect(next.getByText("Premium", { exact: true })).toBeVisible();
      const curriculum = page.getByRole("navigation", { name: "Curriculum" });
      // P8-T27: Previous moved from the Curriculum block to the quiet "Previous in the Track" card that closes the page
      const previous = page.getByRole("navigation", { name: `Previous in ${READING.title}` }).getByRole("link", { name: /^Previous lesson/ });
      await expect(previous).toHaveAttribute("href", canonical(PRIMER.id));
      await expect(previous).toContainText("Previous in the Track");
      await expect(curriculum.getByRole("link", { name: /^Previous lesson/ })).toHaveCount(0);
      await expect(curriculum.getByRole("link", { name: `Back to module: ${FOUNDATIONS.title}` })).toHaveAttribute("href", `${canonical(READING.id)}#${FOUNDATIONS.key}`);
      await expect(page.getByRole("navigation", { name: `Module: ${FOUNDATIONS.title}` })).toHaveCount(0); // the per-Module list is gone from Lessons
      expect(DEEPER.items).toEqual([PREMIUM.id]);
   });
});

test.describe("desktop contents", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("is a three-column layout: the Track sidebar, a reading column of at most 46rem, and the sticky Margin Folio beside it", async ({ page }) => {
      await page.goto(route);
      // P8-T26/T27: the sidebar is open by default at 1440 px; the Margin Folio (study tools) replaces the Contents rail beside the column
      const column = (await page.locator("[data-lesson-reader]").boundingBox())!;
      expect(column.width).toBeGreaterThanOrEqual(640);
      expect(column.width).toBeLessThanOrEqual(736);
      const side = (await folio(page).boundingBox())!;
      expect(side.x).toBeGreaterThan(column.x + column.width);
      expect((await trackContents(page).boundingBox())!.x + 256).toBeLessThanOrEqual(column.x);
      expect(await overflows(page)).toBe(false);

      // P8-T26/T27: the folio sticks at the shell's offset (top-32) and the section bar docks under the top bar as the column scrolls
      await expect(dock(page)).toBeHidden();
      const before = await top(page.locator("[data-lesson-reader]"));
      await scrollDown(page);
      expect(await top(page.locator("[data-lesson-reader]"))).toBeLessThan(before - 2000);
      await expect.poll(() => top(folio(page))).toBe(128);
      expect(await top(dock(page))).toBeGreaterThanOrEqual(115);
      expect(await top(dock(page))).toBeLessThanOrEqual(125);
      const bar = (await dock(page).boundingBox())!;
      expect(bar.x + bar.width).toBeLessThanOrEqual(side.x);
   });

   test("lists the Lesson's h2 and h3 headings, as text, in order, as a labelled navigation", async ({ page }) => {
      await page.goto(route);
      await expect(contents(page)).toHaveCount(1);
      // P8-T27: chapter entries are numbered, so each entry ends with its heading's text
      await expect(contents(page).getByRole("link")).toHaveText(CONTENTS.map(({ text }) => entryText(text)));
      await expect(contents(page).getByRole("link").first()).toHaveAttribute("href", `#${CONTENTS[0].id}`);
      // P8-T27: the docked section bar replaces the old disclosure; it is hidden and inert while the opening list is in view
      await expect(dock(page)).toBeHidden();
      await expect(page.locator(".lesson-dock-bar")).toHaveAttribute("inert", "");
   });

   test("a click moves the heading under the header, focuses it and records the section", async ({ page }) => {
      await page.goto(route);
      await contents(page).getByRole("link", { name: "Sizing the kv_cache budget" }).click();
      const target = heading(page, "sizing-the-kv-cache-budget");
      // P8-T27: headings land clear of the header, the shell's top bar and the docked section bar
      await expect.poll(() => top(target), { timeout: 5000 }).toBe(LANDING);
      await expect(target).toBeFocused();
      await expect(page).toHaveURL(`${route}#sizing-the-kv-cache-budget`);
      await expect(current(page)).toHaveText(entryText("Sizing the kv_cache budget"));
   });

   test("the active entry follows the page as it scrolls, and a duplicate heading finds its own entry", async ({ page }) => {
      await page.goto(route);
      for (const id of ["the-latency-budget", "example", "example-2", "summary"]) {
         // P8-T27: the reading line moved below the docked section bar
         await page.evaluate(([target, line]) => window.scrollTo({ top: document.getElementById(target)!.getBoundingClientRect().top + scrollY - line, behavior: "instant" }), [id, LANDING] as const);
         await expect(current(page)).toHaveAttribute("href", `#${id}`);
         await expect(current(page)).toHaveCount(1);
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await expect(current(page)).toHaveCount(0);
   });

   test("works from the keyboard: Enter on an entry puts focus on the heading, with a visible ring, and Tab carries on from there", async ({ page }) => {
      await page.goto(route);
      const link = contents(page).getByRole("link", { name: "Where the pipeline spends its time" });
      await tabTo(page, link);
      await page.keyboard.press("Enter");
      const target = heading(page, "where-the-pipeline-spends-its-time");
      await expect(target).toBeFocused();
      await expect(target).toHaveCSS("outline-style", "solid");
      await expect(target).toHaveCSS("outline-width", "2px");
      // P8-T27: headings land clear of the docked section bar
      await expect.poll(() => top(target)).toBe(LANDING);

      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Link to section: Where the pipeline spends its time" })).toBeFocused();
      await expect(page.getByRole("link", { name: "Link to section: Where the pipeline spends its time" })).toHaveCSS("opacity", "1");
   });

   test("Tab order reaches the breadcrumb, prerequisites and contents before the body", async ({ page }) => {
      await page.goto(route);
      const order: string[] = [];
      for (let stop = 0; stop < 28; stop++) {
         await page.keyboard.press("Tab");
         order.push(await page.evaluate(() => document.activeElement?.getAttribute("href") ?? document.activeElement?.tagName ?? ""));
      }
      // The breadcrumb's first step is now `/tracks` (P8-T30), so the Track step is searched after it: the shell's rail,
      // before the page, already links the Track overview (P8-T26).
      const at = (href: string, from = 0) => order.indexOf(href, from);
      expect(at("/tracks")).toBeGreaterThan(-1);
      expect(at(canonical(READING.id), at("/tracks"))).toBeGreaterThan(at("/tracks"));
      expect(at("/knowledge/catalog-e2e-sections")).toBeGreaterThan(at(canonical(READING.id)));
      expect(at(`#${CONTENTS[0].id}`)).toBeGreaterThan(at(canonical(PRIMER.id)));
   });
});

test.describe("at 1024px and 768px", () => {
   test("1024: the Track sidebar and a reading column of 640px or more, with the contents above the body, and no page overflow", async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(route);
      const column = page.locator("[data-lesson-reader]");
      // P8-T26: the sidebar starts as the collapsed rail below 1440 px; the column keeps 640 px with it collapsed and expanded
      await expect(rail(page)).toBeVisible();
      await expect(trackContents(page)).toBeHidden();
      expect((await column.boundingBox())!.width).toBeGreaterThanOrEqual(640);
      await expandSidebar(page).click();
      await expect(trackContents(page)).toBeVisible();
      expect((await column.boundingBox())!.width).toBeGreaterThanOrEqual(640);
      // P8-T27: the contents open the Lesson above the body; the study tools are a sheet below 1280 px, not a margin
      await expect(contents(page)).toBeVisible();
      expect((await contents(page).boundingBox())!.y).toBeLessThan((await heading(page, CONTENTS[0].id).boundingBox())!.y);
      await expect(toolsButton(page)).toBeVisible();
      await expect(folio(page)).toHaveCount(0);
      expect(await overflows(page)).toBe(false);
   });

   test("768: one column beside the collapsed rail, the contents above the body, no page overflow", async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(route);
      // P8-T26/T27: the rail (not the sheet) from 768 px, collapsed; the opening contents in place of a disclosure
      await expect(rail(page)).toBeVisible();
      await expect(trackContents(page)).toBeHidden();
      await expect(page.getByRole("button", { name: "Track contents" })).toBeHidden();
      await expect(contents(page)).toBeVisible();
      expect((await contents(page).boundingBox())!.y).toBeLessThan((await heading(page, CONTENTS[0].id).boundingBox())!.y);
      await expect(folio(page)).toHaveCount(0);
      expect(await overflows(page)).toBe(false);
   });
});

test.describe("Track sidebar (A-5, S6-RDR)", () => {
   test.use({ viewport: { width: 1440, height: 900 } });
   const ENTRY_TITLES = [FOUNDATIONS, DEEPER].map((module) => module.items.map((id) => item(id).title));

   test("is server-rendered with every Module's entries, in the Track's order, collapsed Modules included", async ({ request }) => {
      const html = await (await request.get(route)).text();
      expect(html).toContain('aria-label="Track contents"');
      const positions = ENTRY_TITLES.flat().map((title) => html.indexOf(`>${title}`, html.indexOf('aria-label="Track contents"')));
      positions.forEach((position, index) => expect(position, `entry ${index}`).toBeGreaterThan(index === 0 ? 0 : positions[index - 1]));
   });

   test("names the Track, groups Modules with their counts, opens the current Module only and marks the current entry", async ({ page }) => {
      await page.goto(route);
      const nav = trackContents(page);
      await expect(nav.getByRole("link", { name: READING.title })).toHaveAttribute("href", canonical(READING.id));
      const groups = nav.locator("details");
      await expect(groups).toHaveCount(2);
      for (const [index, module] of [FOUNDATIONS, DEEPER].entries()) {
         const summary = groups.nth(index).locator("summary");
         await expect(summary).toContainText(`Module ${index + 1}`);
         await expect(summary).toContainText(module.title);
         await expect(summary).toContainText(`${module.items.length} item`);
      }
      await expect(groups.nth(0)).toHaveJSProperty("open", true);
      await expect(groups.nth(1)).toHaveJSProperty("open", false);
      await expect(nav.locator("[aria-current='page']")).toHaveCount(1);
      await expect(nav.locator("[aria-current='page']")).toContainText(LONG.title);
      await expect(nav.locator("[aria-current='page']")).toHaveAttribute("href", route);
   });

   test("opens and closes a Module from the keyboard, and shows the premium marker on its entry", async ({ page }) => {
      await page.goto(route);
      const summary = trackContents(page).locator("summary").nth(1);
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(trackContents(page).locator("details").nth(1)).toHaveJSProperty("open", true);
      await expect(trackContents(page).getByRole("link", { name: new RegExp(PREMIUM.title) })).toContainText("Premium");
      await page.keyboard.press("Enter");
      await expect(trackContents(page).locator("details").nth(1)).toHaveJSProperty("open", false);
   });

   test("is sticky below the header with its own scroll, and the bottom-of-page outline is not drawn beside it", async ({ page }) => {
      await page.goto(route);
      // P8-T26: the shell's rail is sticky at the header's height (top-16) and scrolls on its own
      await expect(trackContents(page)).toBeVisible();
      const start = await top(rail(page));
      expect(start).toBeGreaterThanOrEqual(64);
      expect(start).toBeLessThanOrEqual(66); // directly under the header
      const before = await top(trackContents(page));
      await page.evaluate(() => window.scrollTo({ top: 2400, behavior: "instant" }));
      await expect.poll(() => top(rail(page))).toBe(64);
      expect(await top(trackContents(page))).toBeLessThanOrEqual(before);
      expect(await top(trackContents(page))).toBeGreaterThan(64); // it stays in the rail, not scrolled away with the page
      await expect(rail(page)).toHaveCSS("overflow-y", "auto");
      await expect(page.getByText(`Full outline of ${READING.title}`)).toBeHidden();
   });

   test("keeps the Margin Folio beside the column at 1280px and above and moves it to a sheet from 1279px down to 1024px, with no overflow at any width", async ({ page }) => {
      // P8-T26/T27: the margin column (study tools) replaces the Contents rail; the sidebar is open by default only from 1440 px
      for (const [width, margin] of [[1440, true], [1280, true], [1279, false], [1024, false]] as const) {
         await page.setViewportSize({ width, height: 900 });
         await page.goto(route);
         await expect(rail(page), `${width}: rail`).toBeVisible();
         if (width >= 1440) await expect(trackContents(page), `${width}: sidebar`).toBeVisible();
         else await expect(trackContents(page), `${width}: collapsed sidebar`).toBeHidden();
         if (margin) await expect(folio(page), `${width}: margin`).toBeVisible();
         else await expect(folio(page), `${width}: no margin`).toHaveCount(0);
         await expect(toolsButton(page), `${width}: tools sheet`).toHaveCount(margin ? 0 : 1);
         expect(await overflows(page), `${width}: overflow`).toBe(false);
      }
   });

   test("below 768px there is no rail or sidebar, and the Track sheet and the Full outline disclosure stay", async ({ page }) => {
      // P8-T26: the rail now reaches down to 768 px (collapsed); below it, the top bar's Track sheet and the Full outline remain
      for (const [width, hasRail] of [[1023, true], [768, true], [767, false], [390, false]] as const) {
         await page.setViewportSize({ width, height: 900 });
         await page.goto(route);
         await expect(trackContents(page), `${width}`).toBeHidden();
         if (hasRail) await expect(rail(page), `${width}: rail`).toBeVisible();
         else await expect(rail(page), `${width}: rail`).toBeHidden();
         await expect(page.getByRole("button", { name: "Track contents" }), `${width}: sheet`).toHaveCount(hasRail ? 0 : 1);
         const outline = page.getByText(`Full outline of ${READING.title}`);
         if (hasRail) await expect(outline, `${width}: outline`).toBeHidden();
         else await expect(outline, `${width}: outline`).toBeVisible();
         expect(await overflows(page), `${width}: overflow`).toBe(false);
      }
   });

   test("a Knowledge page takes no Track sidebar", async ({ page }) => {
      await page.goto(canonical("knowledge.catalog-e2e-sections"));
      await expect(main(page).getByRole("heading", { level: 1 })).toBeVisible();
      await expect(trackContents(page)).toHaveCount(0);
   });
});

test.describe("phone contents", () => {
   test.use({ viewport: { width: 390, height: 844 } });

   test("starts collapsed, opens and closes with the button, and keeps collapsed entries out of the tab order", async ({ page }) => {
      await page.goto(route);
      // P8-T27: the section bar docks (and leaves inert) once the opening contents scroll away; its list is the disclosure
      await expect(page.locator(".lesson-dock-bar")).toHaveAttribute("inert", "");
      await scrollDown(page);
      await expect(page.locator(".lesson-dock-bar")).not.toHaveAttribute("inert", "");
      await expect(dockToggle(page)).toHaveAttribute("aria-expanded", "false");
      await expect(dockList(page)).toHaveCount(0);

      await dockToggle(page).focus();
      await page.keyboard.press("Enter");
      await expect(dockToggle(page)).toHaveAttribute("aria-expanded", "true");
      await expect(dockList(page).getByRole("link")).toHaveCount(CONTENTS.length);
      await page.keyboard.press("Space");
      await expect(dockToggle(page)).toHaveAttribute("aria-expanded", "false");
      await expect(dockList(page)).toHaveCount(0);
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.closest("#lesson-dock-list") !== null)).toBe(false);
   });

   test("picking an entry closes the panel, focuses the heading and lands it under the header", async ({ page }) => {
      await page.goto(route);
      // P8-T27: the docked section bar's list is the phone's contents panel; headings land clear of it
      await scrollDown(page);
      await dockToggle(page).click();
      await dockList(page).getByRole("link", { name: "A back-of-the-envelope estimate" }).click();
      const target = heading(page, "a-back-of-the-envelope-estimate");
      await expect(target).toBeFocused();
      await expect(dockToggle(page)).toHaveAttribute("aria-expanded", "false");
      await expect.poll(() => top(target), { timeout: 5000 }).toBe(LANDING);
      await expect(page).toHaveURL(`${route}#a-back-of-the-envelope-estimate`);
   });

   test("is reachable by keyboard alone: open, Tab to an entry, Enter", async ({ page }) => {
      await page.goto(route);
      // P8-T27: the docked section bar's disclosure; Tab passes its Next-in-Track link on the way to the list
      await scrollDown(page);
      await dockToggle(page).focus();
      await page.keyboard.press("Enter");
      await tabTo(page, dockList(page).getByRole("link").first());
      await page.keyboard.press("Enter");
      await expect(heading(page, CONTENTS[0].id)).toBeFocused();
      await expect(dockToggle(page)).toHaveAttribute("aria-expanded", "false");
   });

   test("has 44px touch targets, a breadcrumb that truncates, and no page-level horizontal overflow, even with Contents open", async ({ page }) => {
      await page.goto(route);
      // P8-T27: the docked section bar's controls and list entries are the phone's contents targets
      await scrollDown(page);
      for (const control of await dock(page).locator("a, button").all()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await dockToggle(page).click();
      for (const link of await dockList(page).getByRole("link").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await overflows(page)).toBe(false);
      const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
      expect((await crumbs.boundingBox())!.width).toBeLessThanOrEqual(358);
      await diagrams(page);
      expect(await overflows(page)).toBe(false);
   });
});

test.describe("technical content", () => {
   test("long code and a wide table scroll inside focusable regions, never the page", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      for (const name of ["Python code", "Table"]) {
         const region = page.getByRole("region", { name }).first();
         await expect(region).toHaveAttribute("tabindex", "0");
         expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      }
      const code = page.getByRole("region", { name: "Python code" }).first();
      await tabTo(page, code);
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollX)).toBe(0);
      expect(await overflows(page)).toBe(false);
   });

   test("a diagram that fits the column stays plain; one that does not is framed, natural size and keyboard-scrollable", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      const [fitting, wide] = await (await diagrams(page)).all();

      await expect(fitting.getByRole("region")).toHaveCount(0);
      await expect(fitting.locator("[data-slot=technical-scroll]")).toHaveAttribute("data-scrolls", "false");
      await expect(fitting.locator("[data-slot=technical-scroll]")).toHaveCSS("border-top-width", "0px");

      const frame = wide.getByRole("region", { name: "Diagram" });
      await expect(frame).toHaveAttribute("tabindex", "0");
      await expect(frame).toHaveCSS("border-top-width", "1px");
      const size = await wide.locator("svg").evaluate((svg) => ({ drawn: svg.getBoundingClientRect().width, natural: Number(svg.getAttribute("viewBox")!.split(/\s+/)[2]) }));
      expect(Math.round(size.drawn), "scaled down instead of scrolling").toBe(Math.round(size.natural));
      expect(await frame.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

      await tabTo(page, frame);
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => frame.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      expect(await overflows(page)).toBe(false);
   });

   test("a diagram too wide for the column expands from its Expand button and Escape returns to it; one that fits has none", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      const [fitting, wide] = await (await diagrams(page)).all();
      await expect(fitting.getByRole("button", { name: "Expand diagram" })).toHaveCount(0);

      const expand = wide.getByRole("button", { name: "Expand diagram" });
      await tabTo(page, expand);
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Diagram" });
      await expect(dialog.getByRole("region", { name: "Diagram" })).toBeFocused();
      await expect(dialog.locator("svg")).toHaveCount(1);

      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(expand).toBeFocused();
   });

   test("on a phone every diagram is natural size, and none stretches the page", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      for (const figure of await (await diagrams(page)).all()) {
         await expect(figure.getByRole("region", { name: "Diagram" })).toHaveAttribute("tabindex", "0");
      }
      expect(await overflows(page)).toBe(false);
   });

   test("callouts are semantic notes with tokens only", async ({ page }) => {
      await page.goto(route);
      await expect(main(page).getByRole("note")).toHaveCount(3);
      await expect(main(page).locator('[data-callout="warning"]')).toContainText("Do not tune the batch size");
   });
});

test.describe("themes", () => {
   for (const scheme of ["light", "dark"] as const) {
      test.describe(scheme, () => {
         test.use({ colorScheme: scheme, viewport: { width: 1440, height: 900 } });

         test("uses the theme's tokens for page, code, callouts, references, contents and diagrams", async ({ page }) => {
            await page.goto(route);
            await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /dark/ : /^(?!.*dark)/);
            const colours = await page.evaluate(() => {
               const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
               return {
                  page: style("body").backgroundColor,
                  text: style("main h1").color,
                  code: style("[data-slot=technical-scroll]:has(pre)").backgroundColor,
                  note: style('[data-callout="tip"] > div').backgroundColor,
                  reference: style('a[data-reference="knowledge"]').textDecorationColor,
                  // P8-T27: the contents' chapter numerals take the reader's accent ink
                  rail: style("nav[aria-labelledby='lesson-contents-title'] .lesson-numeral").color,
               };
            });
            // P8-T26: the reader shell sets the page to the reader paper
            expect(colours.page).toBe(scheme === "dark" ? "rgb(26, 22, 18)" : "rgb(251, 248, 241)");
            expect(colours.text).not.toBe(colours.page);
            expect(colours.code).not.toBe(colours.page);
            expect(colours.note).not.toBe(colours.page);
            expect(colours.reference).not.toBe(colours.page);
            expect(colours.rail).not.toBe(colours.page);
            await diagrams(page);
            expect(await overflows(page)).toBe(false);
         });
      });
   }

   test("the application's theme toggle switches the Lesson, and the choice is the page's, not the system's", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto(route);
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await page.getByRole("banner").getByRole("button", { name: "Toggle theme" }).click();
      await page.getByRole("menuitem", { name: "Dark" }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      // P8-T26: the reader's dark paper
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(26, 22, 18)");
      await diagrams(page);
   });
});

test.describe("reduced motion", () => {
   test.use({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });

   test("a contents jump lands at once, the panel and its chevron change instantly, and smooth scrolling is off", async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
      // P8-T27: the panel is the docked section bar's list; the bar itself and its chevron change without a transition
      await scrollDown(page);
      await expect(page.locator(".lesson-dock-bar")).toHaveCSS("transition-duration", "1e-05s");
      await expect(dockToggle(page).locator("svg")).toHaveCSS("transition-duration", "1e-05s");
      await dockToggle(page).click();
      await dockList(page).getByRole("link", { name: "Summary" }).click();
      const target = heading(page, "summary");
      // no animation to wait for: the heading is already in place a moment after the click
      await expect.poll(() => top(target), { timeout: 1500 }).toBe(LANDING);
      await expect(target).toBeFocused();
      await expect(dockToggle(page)).toHaveAttribute("aria-expanded", "false");
   });

   test("a diagram is drawn the same size as with motion, so its layout does not depend on it", async ({ page, browser }) => {
      await page.goto(route);
      const reduced = await Promise.all((await (await diagrams(page)).all()).map((figure) => figure.locator("svg").getAttribute("viewBox")));
      const context = await browser.newContext({ reducedMotion: "no-preference", viewport: { width: 390, height: 844 } });
      const other = await context.newPage();
      await other.goto(`${new URL(page.url()).origin}${route}`);
      const normal = await Promise.all((await (await diagrams(other)).all()).map((figure) => figure.locator("svg").getAttribute("viewBox")));
      await context.close();
      expect(reduced).toEqual(normal);
   });
});

test.describe("access", () => {
   for (const identity of ["signed-out", "unentitled"] as const) {
      test.describe(identity, () => {
         test.use({ identity });

         test("a premium Lesson shows public metadata and a notice, and no body, contents, breadcrumb, relations or Practice", async ({ page, traffic }) => {
            const path = canonical(PREMIUM.id);
            expect((await page.goto(path))?.status()).toBe(200);
            await page.waitForLoadState("networkidle");
            await expectNoCanary(page, traffic, path, identity);

            await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(PREMIUM.title);
            await expect(page.getByText("Level: Advanced")).toBeVisible();
            await expect(main(page).getByRole("status")).toBeVisible();
            // P8-T26/T27: also none of the new contents, section bar, Previous card, Track rail or study tools
            for (const name of ["Breadcrumb", "Contents", "In this lesson", "Lesson sections", "Track contents", `Next in ${READING.title}`, `Previous in ${READING.title}`, "Curriculum", `Module: ${DEEPER.title}`]) {
               await expect(page.getByRole("navigation", { name }), name).toHaveCount(0);
            }
            await expect(page.getByRole("button", { name: "Contents", exact: true })).toHaveCount(0);
            await expect(page.locator("[data-reader-sidebar], .lesson-dock-bar")).toHaveCount(0);
            await expect(page.getByRole("button", { name: /Track sidebar|Track contents|Study tools/ })).toHaveCount(0);
            await expect(main(page).getByRole("heading", { level: 2 })).toHaveCount(0);
            await expect(page.locator("main [id]")).toHaveCount(0);
            await expect(page.getByRole("heading", { name: "Practice" })).toHaveCount(0);
         });
      });
   }

   test.describe("entitled", () => {
      test.use({ identity: "entitled" });

      test("the same Lesson is read in full, with its own contents, relations and Practice", async ({ page }) => {
         await page.goto(canonical(PREMIUM.id));
         await expect(main(page).getByText(CANARY)).toBeVisible();
         // P8-T27: chapter entries are numbered, so each entry ends with its heading's text
         await expect(contents(page).getByRole("link")).toHaveText(["Premium reading heading", "Premium reading second heading", "Premium reading subsection"].map(entryText));
         await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(DEEPER.title);
         const practice = page.getByRole("region", { name: "Practice" });
         await expect(practice.getByRole("link")).toHaveText(["Synthetic Premium Practice Problem"]);
         await expect(practice.getByText("Premium", { exact: true })).toBeVisible();
      });
   });
});

test.describe("preview deployment", () => {
   test.use({ baseURL: PREVIEW_ORIGIN, viewport: { width: 1440, height: 900 } });
   // A preview never caches, so every render reaches the API double. Other specs share it, so only this task's own
   // records can be attributed from its log; links to shared records are checked from the browser's requests.
   const logged = async (request: APIRequestContext) =>
      ((await (await request.get(`${PREVIEW_API_ORIGIN}/__catalog-log`)).json()) as unknown[]).length;
   const reads = async (request: APIRequestContext, since: number) =>
      ((await (await request.get(`${PREVIEW_API_ORIGIN}/__catalog-log`)).json()) as { path: string }[])
         .slice(since)
         .map(({ path }) => path)
         .filter((path) => path.includes("p2-t5-"))
         .sort();
   const OWN_READS = [
      `/catalog/items/lesson/${LONG.slug}`,
      `/catalog/items/lesson/${LONG.slug}/meta`,
      `/catalog/items/lesson/${LONG.slug}/related`,
      `/catalog/tracks/${READING.slug}`,
      `/catalog/items/lesson/${PREMIUM.slug}/meta`, // the Next lesson's public summary (P3 S-CUR-8): the one read P3-T5 adds
      // P3-T6 (S-PRC-6): the shown premium Practice Problem's own relations, read with the caller's session; this signed-out read is withheld and never cached
      `/catalog/items/problem/p2-t5-premium-practice/related`,
   ].sort();

   test("is marked and noindex, keeps every link on this deployment, and sits its contents and headings below the marker", async ({ page }) => {
      await page.goto(route);
      const marker = page.getByRole("complementary", { name: "Preview" });
      await expect(marker).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      for (const href of await main(page).locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")!))) {
         expect(href, "a link leaves this deployment").toMatch(/^(\/|#)/);
      }
      const bottom = (await marker.boundingBox())!.y + (await marker.boundingBox())!.height;
      await contents(page).getByRole("link", { name: "Summary" }).click();
      await expect.poll(() => top(heading(page, "summary"))).toBeGreaterThanOrEqual(Math.round(bottom));
      // P8-T27: once scrolled, the contents are the docked section bar
      await expect(dock(page)).toBeVisible();
      expect(await top(dock(page))).toBeGreaterThanOrEqual(Math.round(bottom));
   });

   test("rendering reads the item, its relations and its Track once each, plus the Next lesson's public meta and the shown Practice Problems' relations, and nothing else", async ({ page, request }) => {
      const since = await logged(request);
      await page.goto(route);
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(LONG.title);
      expect(await reads(request, since)).toEqual(OWN_READS);
   });

   test("scrolling every link into view, hovering them and using the contents read nothing more", async ({ page, request, traffic }) => {
      const since = await logged(request);
      await page.goto(route);
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += 450) {
         await page.evaluate((offset) => window.scrollTo({ top: offset, behavior: "instant" }), y);
         await page.waitForTimeout(80);
      }
      for (const link of await main(page).locator('a[href^="/"]').filter({ visible: true }).all()) {
         await link.scrollIntoViewIfNeeded();
         await link.hover();
      }
      for (const name of ["Prefill and decode", "Summary", "The latency budget"]) {
         await contents(page).getByRole("link", { name }).click();
         await page.waitForTimeout(150);
      }
      await page.waitForTimeout(1200); // prefetches, if any, are scheduled once links are in view or hovered

      expect(await reads(request, since), "a link made the server read another Lesson").toEqual(OWN_READS);
      const linked = new Set(await main(page).locator('a[href^="/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")!)));
      linked.delete(route); // the module list links the page itself, which is the document that was loaded
      const requested = traffic.requests.map((url) => new URL(url).pathname);
      for (const href of linked) expect(requested, `${href} was prefetched`).not.toContain(href);
   });

   test("following previous/next reads only the page followed to", async ({ page, request }) => {
      await page.goto(route);
      const since = await logged(request);
      // P8-T27: the Previous link is the "Previous in the Track" card now
      await page.getByRole("navigation", { name: `Previous in ${READING.title}` }).getByRole("link", { name: /^Previous lesson/ }).click();
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(PRIMER.title);
      const paths = await reads(request, since);
      // the followed page's own reads, and the public meta of its own Next lesson (P3 S-CUR-8): nothing else
      expect(paths).toEqual(
         [
            `/catalog/items/lesson/${PRIMER.slug}`,
            `/catalog/items/lesson/${PRIMER.slug}/meta`,
            `/catalog/items/lesson/${PRIMER.slug}/related`,
            `/catalog/tracks/${READING.slug}`,
            `/catalog/items/lesson/${LONG.slug}/meta`,
         ].sort()
      );
   });
});

// P6-T10: the Track contents drawer below 1024 px, on a placed Lesson and a placed Problem, with the title filter.
test.describe("Track contents drawer (A-5, S6-RDR-4, S6-RDR-7)", () => {
   const PLACED = [canonical("lesson.p3-seq-one"), canonical("problem.p3-seq-check")];
   const opener = (page: Page) => page.getByRole("button", { name: "Track contents" });

   // P8-T26: the drawer is the top bar's Track sheet below 768 px (the rail starts at 768), so its widest case is 767
   for (const width of [390, 767]) {
      for (const path of PLACED) {
         test(`${width} ${path}: opens, filters, closes with Escape and returns focus, and picking an entry navigates`, async ({ page, request }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(path);
            await expect(trackContents(page)).toBeHidden();
            expect((await opener(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
            await opener(page).click();
            const dialog = page.getByRole("dialog");
            await expect(dialog).toBeVisible();
            await expect(dialog).toHaveAccessibleName("P3 Sequence Track");
            await expect(dialog.locator('a[aria-current="page"]')).toHaveAttribute("href", path);

            const reads = async () => (await (await request.get(`${FAKE_API_ORIGIN}/__catalog-log`)).json()).length;
            const before = await reads();
            const filter = dialog.getByRole("searchbox", { name: "Filter by title" });
            await filter.fill("zzz-no-such-title");
            await expect(dialog.getByRole("status")).toHaveText("No entries match");
            await filter.fill("");
            expect(await reads()).toBe(before);

            expect(await overflows(page)).toBe(false);
            await page.keyboard.press("Escape");
            await expect(dialog).toBeHidden();
            await expect(opener(page)).toBeFocused();

            await opener(page).click();
            const next = page.getByRole("dialog").locator("details[open] ol a:not([aria-current])").first();
            const href = (await next.getAttribute("href"))!;
            await next.click();
            await expect(page).toHaveURL(new RegExp(`${href}$`));
            await expect(page.getByRole("dialog")).toHaveCount(0);
            expect(await overflows(page)).toBe(false);
         });
      }
   }

   test("768 and 1024: the sidebar shows and the drawer control does not", async ({ page }) => {
      // P8-T26: from 768 px the shell's rail replaces the drawer; it starts collapsed and one click shows the sidebar
      for (const width of [768, 1024]) {
         await page.setViewportSize({ width, height: 900 });
         for (const path of PLACED) {
            await page.goto(path);
            await expect(rail(page), `${width} ${path}`).toBeVisible();
            await expect(opener(page)).toBeHidden();
            await expandSidebar(page).click();
            await expect(trackContents(page)).toBeVisible();
            await expect(trackContents(page).locator('a[aria-current="page"]')).toHaveAttribute("href", path);
            expect(await overflows(page)).toBe(false);
         }
      }
   });
});
