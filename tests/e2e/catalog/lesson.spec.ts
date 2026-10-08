import type { APIRequestContext, Locator, Page } from "@playwright/test";
import fixture from "./fixture.json";
import { plainHeading } from "../../../src/lib/catalog/lesson";
import { CANARY, PREVIEW_API_ORIGIN, PREVIEW_ORIGIN, canonical, expect, expectNoCanary, item, test, track } from "./harness";

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
const contents = (page: Page) => page.getByRole("navigation", { name: "Contents" });
const toggle = (page: Page) => page.getByRole("button", { name: "Contents" });
const current = (page: Page) => contents(page).locator('[aria-current="location"]');
const heading = (page: Page, id: string) => page.locator(`[id="${id}"]`);
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const top = (locator: Locator) => locator.evaluate((element) => Math.round(element.getBoundingClientRect().top));
const diagrams = async (page: Page) => {
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

   test("has one h1, an ordered heading outline and the Learn / Track / Module breadcrumb", async ({ page }) => {
      await page.goto(route);
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(LONG.title);

      const levels = await main(page).locator("h1, h2, h3, h4").evaluateAll((all) => all.map((element) => Number(element.tagName[1])));
      levels.forEach((level, index) => expect(level, `heading ${index} skips a level`).toBeLessThanOrEqual(index === 0 ? 1 : levels[index - 1] + 1));

      const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
      await expect(crumbs).toHaveText(new RegExp(`^Learn\\s*/\\s*${READING.title}\\s*/\\s*${FOUNDATIONS.title}$`));
      await expect(crumbs.getByRole("link", { name: "Learn" })).toHaveAttribute("href", "/tracks");
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
      await expect(page.getByRole("navigation", { name: "Contents" })).toHaveCount(0); // one heading: no contents
   });

   test("following the Practice transition opens the Problem at its own canonical URL", async ({ page }) => {
      await page.goto(route);
      await page.getByRole("region", { name: "Practice" }).getByRole("link", { name: "Synthetic Practice Step" }).click();
      await expect(page).toHaveURL(canonical("problem.p2-t4-practice"));
      await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("Synthetic Practice Step");
   });
});

test.describe("curriculum", () => {
   test("Next follows the home Track's order across the module boundary; Previous is the quiet link in the Curriculum block", async ({ page }) => {
      await page.goto(route);
      const next = page.getByRole("navigation", { name: `Next in ${READING.title}` }).getByRole("link");
      await expect(next).toHaveAttribute("href", canonical(PREMIUM.id));
      await expect(next).toHaveAccessibleName(`Next lesson: ${PREMIUM.title}, premium`);
      await expect(next.getByText("Premium", { exact: true })).toBeVisible();
      const curriculum = page.getByRole("navigation", { name: "Curriculum" });
      await expect(curriculum.getByRole("link", { name: /^Previous lesson/ })).toHaveAttribute("href", canonical(PRIMER.id));
      await expect(curriculum.getByRole("link", { name: `Back to module: ${FOUNDATIONS.title}` })).toHaveAttribute("href", `${canonical(READING.id)}#${FOUNDATIONS.key}`);
      await expect(page.getByRole("navigation", { name: `Module: ${FOUNDATIONS.title}` })).toHaveCount(0); // the per-Module list is gone from Lessons
      expect(DEEPER.items).toEqual([PREMIUM.id]);
   });
});

test.describe("desktop contents", () => {
   test.use({ viewport: { width: 1440, height: 900 } });

   test("is a two-column layout: a ~736px reading column and a sticky Contents beside it", async ({ page }) => {
      await page.goto(route);
      const column = (await page.locator("main > div > div").first().boundingBox())!;
      expect(column.width).toBeGreaterThanOrEqual(720);
      expect(column.width).toBeLessThanOrEqual(760);
      const side = (await contents(page).boundingBox())!;
      expect(side.x).toBeGreaterThan(column.x + column.width);
      expect(await overflows(page)).toBe(false);

      const before = await top(contents(page));
      await page.evaluate(() => window.scrollTo({ top: 2400, behavior: "instant" }));
      await expect.poll(() => top(contents(page))).toBeLessThanOrEqual(115);
      expect(await top(contents(page))).toBeGreaterThanOrEqual(100);
      expect(before).toBeGreaterThan(115); // it started lower and stuck
   });

   test("lists the Lesson's h2 and h3 headings, as text, in order, as a labelled navigation", async ({ page }) => {
      await page.goto(route);
      await expect(contents(page)).toHaveCount(1);
      await expect(contents(page).getByRole("link")).toHaveText(CONTENTS.map(({ text }) => plainHeading(text)));
      await expect(contents(page).getByRole("link").first()).toHaveAttribute("href", `#${CONTENTS[0].id}`);
      await expect(toggle(page)).toHaveCount(0); // the disclosure is for narrow screens
   });

   test("a click moves the heading under the header, focuses it and records the section", async ({ page }) => {
      await page.goto(route);
      await contents(page).getByRole("link", { name: "Sizing the kv_cache budget" }).click();
      const target = heading(page, "sizing-the-kv-cache-budget");
      await expect.poll(() => top(target), { timeout: 5000 }).toBe(112);
      await expect(target).toBeFocused();
      await expect(page).toHaveURL(`${route}#sizing-the-kv-cache-budget`);
      await expect(current(page)).toHaveText("Sizing the kv_cache budget");
   });

   test("the active entry follows the page as it scrolls, and a duplicate heading finds its own entry", async ({ page }) => {
      await page.goto(route);
      for (const id of ["the-latency-budget", "example", "example-2", "summary"]) {
         await page.evaluate((target) => window.scrollTo({ top: document.getElementById(target)!.getBoundingClientRect().top + scrollY - 112, behavior: "instant" }), id);
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
      await expect.poll(() => top(target)).toBe(112);

      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Link to section: Where the pipeline spends its time" })).toBeFocused();
      await expect(page.getByRole("link", { name: "Link to section: Where the pipeline spends its time" })).toHaveCSS("opacity", "1");
   });

   test("Tab order reaches the breadcrumb, prerequisites and contents before the body", async ({ page }) => {
      await page.goto(route);
      const order: string[] = [];
      for (let stop = 0; stop < 18; stop++) {
         await page.keyboard.press("Tab");
         order.push(await page.evaluate(() => document.activeElement?.getAttribute("href") ?? document.activeElement?.tagName ?? ""));
      }
      const at = (href: string) => order.indexOf(href);
      expect(at("/tracks")).toBeGreaterThan(-1);
      expect(at(canonical(READING.id))).toBeGreaterThan(at("/tracks"));
      expect(at("/knowledge/catalog-e2e-sections")).toBeGreaterThan(at(canonical(READING.id)));
      expect(at(`#${CONTENTS[0].id}`)).toBeGreaterThan(at(canonical(PRIMER.id)));
   });
});

test.describe("at 1024px and 768px", () => {
   test("1024: two columns with a reading column of 720px or more, and no page overflow", async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(route);
      const column = (await page.locator("main > div > div").first().boundingBox())!;
      expect(column.width).toBeGreaterThanOrEqual(720);
      await expect(contents(page)).toBeVisible();
      await expect(toggle(page)).toHaveCount(0);
      expect(await overflows(page)).toBe(false);
   });

   test("768: one column, the disclosure in place of the sidebar, no page overflow", async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(route);
      await expect(toggle(page)).toBeVisible();
      await expect(page.locator("nav[aria-label='Contents'].sticky")).toBeHidden();
      expect(await overflows(page)).toBe(false);
   });
});

test.describe("phone contents", () => {
   test.use({ viewport: { width: 390, height: 844 } });

   test("starts collapsed, opens and closes with the button, and keeps collapsed entries out of the tab order", async ({ page }) => {
      await page.goto(route);
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
      await expect(contents(page)).toBeHidden();
      await expect(page.locator("nav[aria-label='Contents'].sticky")).toBeHidden();
      const panel = page.locator(`[id="${await toggle(page).getAttribute("aria-controls")}"]`);
      await expect(panel).toHaveAttribute("inert", "");

      await toggle(page).focus();
      await page.keyboard.press("Enter");
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
      await expect(contents(page).getByRole("link")).toHaveCount(CONTENTS.length);
      await page.keyboard.press("Space");
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.closest("nav[aria-label='Contents']") !== null)).toBe(false);
   });

   test("picking an entry closes the panel, focuses the heading and lands it under the header", async ({ page }) => {
      await page.goto(route);
      await toggle(page).click();
      await contents(page).getByRole("link", { name: "A back-of-the-envelope estimate" }).click();
      const target = heading(page, "a-back-of-the-envelope-estimate");
      await expect(target).toBeFocused();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
      await expect.poll(() => top(target), { timeout: 5000 }).toBe(112);
      await expect(page).toHaveURL(`${route}#a-back-of-the-envelope-estimate`);
   });

   test("is reachable by keyboard alone: open, Tab to an entry, Enter", async ({ page }) => {
      await page.goto(route);
      await toggle(page).focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      await expect(contents(page).getByRole("link").first()).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(heading(page, CONTENTS[0].id)).toBeFocused();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
   });

   test("has 44px touch targets, a breadcrumb that truncates, and no page-level horizontal overflow, even with Contents open", async ({ page }) => {
      await page.goto(route);
      expect((await toggle(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await toggle(page).click();
      for (const link of await contents(page).getByRole("link").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
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
                  rail: style("nav[aria-label='Contents'].sticky a").borderLeftColor,
               };
            });
            expect(colours.page).toBe(scheme === "dark" ? "rgb(15, 15, 17)" : "rgb(255, 255, 255)");
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
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(15, 15, 17)");
      await diagrams(page);
   });
});

test.describe("reduced motion", () => {
   test.use({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });

   test("a contents jump lands at once, the panel and its chevron change instantly, and smooth scrolling is off", async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
      await expect(toggle(page).locator("svg")).toHaveCSS("transition-duration", "1e-05s");
      await toggle(page).click();
      await contents(page).getByRole("link", { name: "Summary" }).click();
      const target = heading(page, "summary");
      // no animation to wait for: the heading is already in place a moment after the click
      await expect.poll(() => top(target), { timeout: 1500 }).toBe(112);
      await expect(target).toBeFocused();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
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
            for (const name of ["Breadcrumb", "Contents", `Next in ${READING.title}`, "Curriculum", `Module: ${DEEPER.title}`]) {
               await expect(page.getByRole("navigation", { name }), name).toHaveCount(0);
            }
            await expect(page.getByRole("button", { name: "Contents" })).toHaveCount(0);
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
         await expect(contents(page).getByRole("link")).toHaveText(["Premium reading heading", "Premium reading second heading", "Premium reading subsection"]);
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
      expect(await top(contents(page))).toBeGreaterThanOrEqual(Math.round(bottom));
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
      await page.getByRole("navigation", { name: "Curriculum" }).getByRole("link", { name: /^Previous lesson/ }).click();
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
