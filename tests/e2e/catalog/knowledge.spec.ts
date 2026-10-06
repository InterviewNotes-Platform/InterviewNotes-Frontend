import type { APIRequestContext, Page } from "@playwright/test";
import fixture from "./fixture.json";
import {
   CANARY,
   EMPTY_ORIGIN,
   PREVIEW_API_ORIGIN,
   PREVIEW_ORIGIN,
   REJECTED_ORIGIN,
   canonical,
   expect,
   expectNoCanary,
   item,
   test,
   type Identity,
} from "./harness";

interface Topic {
   id: string;
   slug: string;
   title: string;
   category: string | null;
   tags: string[];
   access: string;
}

// Spec §2.3, written out here on purpose: the test must not borrow the constant it checks.
const GROUPS = [
   { name: "Core Concepts", id: "core-concepts", categories: ["concept", "term"] },
   { name: "Technologies & Research", id: "technologies-research", categories: ["technology", "research"] },
   { name: "Patterns", id: "patterns", categories: ["pattern"] },
   { name: "Quick References", id: "quick-references", categories: ["quick_reference"] },
];
const PAGE_SIZE = 12;
const byId = (a: Topic, b: Topic) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const TOPICS = (fixture.items as unknown as Topic[]).filter((candidate) => candidate.id.startsWith("knowledge.")).sort(byId);
const inGroup = (group: (typeof GROUPS)[number]) => TOPICS.filter((topic) => topic.category !== null && group.categories.includes(topic.category));
const titles = (topics: Topic[]) => topics.map((topic) => topic.title);

const RICH = item("knowledge.p2-t6-attention");
const QUICK = item("knowledge.p2-t6-latency-cheatsheet");
const WITHHELD = item("knowledge.p2-t6-quantization");
const PREMIUM = item("knowledge.p2-t6-feature-store");
const UNLABELLED = item("knowledge.p2-t6-unlabelled");

const main = (page: Page) => page.getByRole("main");
const h1 = (page: Page) => main(page).getByRole("heading", { level: 1 });
const categories = (page: Page) => page.getByRole("navigation", { name: "Knowledge categories" });
const pager = (page: Page) => page.getByRole("navigation", { name: "Pagination" });
const cards = (page: Page) => main(page).locator("article");
const cardTitles = (page: Page) => cards(page).getByRole("heading", { level: 3 }).allTextContents();
const bands = (page: Page) => main(page).locator("h2#knowledge_fast, h2#knowledge_explanation, h2#knowledge_reference");
/** The header's quiet category line; its visually hidden "Category: " prefix is part of its text. */
const categoryLine = (page: Page, label: string) => main(page).locator("header").filter({ hasText: `Category: ${label}` });
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
/** The topic list is collapsed until wanted: open it (once) and return it. */
async function openTopics(page: Page) {
   const toggle = main(page).getByRole("button", { name: /^Browse by topic/ });
   if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
   return page.getByRole("navigation", { name: "Browse by topic" });
}
const marker = (page: Page) => page.getByRole("complementary", { name: "Preview" });
const robots = (page: Page) => page.locator('meta[name="robots"]');

test.describe("the Knowledge explorer", () => {
   test("is server-rendered: proposition, four entry points, then the first page of topics in id order", async ({ page, request }) => {
      const response = await request.get("/knowledge");
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain("Knowledge, ready when you need it.");
      expect(html).toContain(TOPICS[0].title);

      await page.goto("/knowledge");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      const links = categories(page).getByRole("link");
      await expect(links).toHaveCount(4);
      for (const [index, group] of GROUPS.entries()) {
         await expect(links.nth(index)).toHaveAttribute("href", `/knowledge?group=${group.id}`);
         await expect(links.nth(index)).toContainText(group.name);
      }
      expect(await cardTitles(page)).toEqual(titles(TOPICS.slice(0, PAGE_SIZE)));
      await expect(main(page).getByRole("heading", { level: 2, name: "All topics" })).toBeVisible();
   });

   test("is a list of discovery cards, one coherent link each, with the category as a quiet word", async ({ page }) => {
      await page.goto("/knowledge");
      for (const card of await cards(page).all()) await expect(card.getByRole("link")).toHaveCount(1);
      const attention = cards(page).filter({ hasText: RICH.title });
      await expect(attention.getByRole("link")).toHaveAttribute("href", canonical(RICH.id));
      await expect(attention).toContainText("Concept");
      // Quiet topics: plain text under the summary, capped at three, never a link or a control of their own.
      const topicsLine = attention.locator("p").filter({ hasText: /^Topics:/ });
      await expect(topicsLine).toHaveText(`Topics: ${(TOPICS.find((topic) => topic.id === RICH.id)!.tags.slice(0, 3)).join(" · ")}`);
      await expect(topicsLine.locator("a, button")).toHaveCount(0);
      await expect(cards(page).filter({ hasText: item("knowledge.p2-t6-latency-cheatsheet").title }).locator("p").filter({ hasText: /^Topics:/ })).toHaveCount(1);
      await expect(cards(page).filter({ hasText: PREMIUM.title }).getByText("Premium", { exact: true })).toHaveCount(1);
      await expect(cards(page).filter({ hasText: UNLABELLED.title }).getByText(/^(Concept|Term|Technology|Research|Pattern|Quick reference)$/)).toHaveCount(0);
   });

   for (const group of GROUPS) {
      test(`${group.name}: the entry point lists exactly ${group.categories.join(" + ")}`, async ({ page }) => {
         await page.goto("/knowledge");
         await categories(page).getByRole("link", { name: new RegExp(`^${group.name}`) }).click();
         await expect(page).toHaveURL(`/knowledge?group=${group.id}`);
         await expect(main(page).getByRole("heading", { level: 2, name: group.name })).toBeVisible();
         expect(await cardTitles(page)).toEqual(titles(inGroup(group)));
         await expect(categories(page).locator("[aria-current]")).toHaveCount(1);
         await expect(categories(page).getByRole("link", { name: new RegExp(`^${group.name}`) })).toHaveAttribute("aria-current", "page");

         await main(page).getByRole("link", { name: "Show all topics" }).click();
         await expect(page).toHaveURL("/knowledge");
         await expect(categories(page).locator("[aria-current]")).toHaveCount(0);
      });
   }

   test("an item with no category is in the full list and in no group", async ({ page }) => {
      await page.goto("/knowledge");
      await expect(cards(page).filter({ hasText: UNLABELLED.title })).toHaveCount(1);
      for (const group of GROUPS) {
         await page.goto(`/knowledge?group=${group.id}`);
         await expect(cards(page).filter({ hasText: UNLABELLED.title })).toHaveCount(0);
      }
   });

   test("pages through every topic exactly once, in order, by the API's own cursor", async ({ page }) => {
      await page.goto("/knowledge");
      const first = await cardTitles(page);
      expect(first).toHaveLength(PAGE_SIZE);
      await expect(pager(page).getByRole("link", { name: "First page" })).toHaveCount(0);

      await pager(page).getByRole("link", { name: /Next page/ }).click();
      await expect(page).toHaveURL(`/knowledge?cursor=${TOPICS[PAGE_SIZE - 1].id}`);
      const second = await cardTitles(page);
      expect([...first, ...second]).toEqual(titles(TOPICS));
      expect(new Set([...first, ...second]).size).toBe(TOPICS.length);
      await expect(pager(page).getByRole("link", { name: /Next page/ })).toHaveCount(0);

      await pager(page).getByRole("link", { name: "First page" }).click();
      await expect(page).toHaveURL("/knowledge");
      expect(await cardTitles(page)).toEqual(first);
   });

   test("tags are separate topical discovery: choosing one narrows the list, within a group too", async ({ page }) => {
      const tag = "serving";
      await page.goto("/knowledge");
      await (await openTopics(page)).getByRole("link", { name: tag, exact: true }).click();
      await expect(page).toHaveURL(`/knowledge?tag=${tag}`);
      expect(await cardTitles(page)).toEqual(titles(TOPICS.filter((topic) => topic.tags.includes(tag))));
      await expect(page.getByRole("link", { name: tag, exact: true })).toHaveAttribute("aria-current", "page");

      const patterns = GROUPS[2];
      await page.goto(`/knowledge?group=${patterns.id}`);
      await (await openTopics(page)).getByRole("link", { name: tag, exact: true }).click();
      await expect(page).toHaveURL(`/knowledge?group=${patterns.id}&tag=${tag}`);
      expect(await cardTitles(page)).toEqual(titles(inGroup(patterns).filter((topic) => topic.tags.includes(tag))));

      await page.getByRole("link", { name: "Clear topic" }).click();
      await expect(page).toHaveURL(`/knowledge?group=${patterns.id}`);
   });

   test.describe("unsupported UI state", () => {
      for (const query of ["group=gadget", "group=system_design", "group=technology", "tag=", "cursor=", "group=a&group=b", "branch=main&commit=abc"]) {
         test(`?${query} shows all topics rather than an error`, async ({ page }) => {
            const response = await page.goto(`/knowledge?${query}`);
            expect(response?.status()).toBe(200);
            expect(await cardTitles(page)).toEqual(titles(TOPICS.slice(0, PAGE_SIZE)));
            await expect(main(page).getByRole("status")).toHaveCount(0);
         });
      }

      test("a cursor the API refuses is shown as unavailable, never as an empty list", async ({ page }) => {
         expect((await page.goto("/knowledge?cursor=not-an-item-id"))?.status()).toBe(200);
         await expect(main(page).getByRole("status")).toHaveText("This content is temporarily unavailable. Please try again later.");
         await expect(cards(page)).toHaveCount(0);
         await expect(h1(page)).toBeVisible();
      });
   });

   test("has no horizontal page overflow at any width, with the category entry points wrapping cleanly", async ({ page }) => {
      for (const width of [1440, 1024, 768, 390]) {
         await page.setViewportSize({ width, height: 900 });
         for (const route of ["/knowledge", `/knowledge?group=${GROUPS[1].id}`, `/knowledge?cursor=${TOPICS[PAGE_SIZE - 1].id}`]) {
            await page.goto(route);
            await expect(h1(page)).toBeVisible();
            expect(await overflows(page), `${route} overflows at ${width}px`).toBe(false);
         }
      }
   });

   test("keyboard reaches each entry point in order with a visible focus ring, and Enter opens it", async ({ page }) => {
      await page.goto("/knowledge");
      await categories(page).getByRole("link").first().focus();
      for (const [index, group] of GROUPS.entries()) {
         const link = categories(page).getByRole("link").nth(index);
         await expect(link).toBeFocused();
         await expect(link).toHaveCSS("outline-style", "solid");
         await expect(link).toHaveCSS("outline-width", "2px");
         await expect(link).toContainText(group.name);
         if (index < GROUPS.length - 1) await page.keyboard.press("Tab");
      }
      await categories(page).getByRole("link").nth(2).focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(`/knowledge?group=${GROUPS[2].id}`);
      expect(await cardTitles(page)).toEqual(titles(inGroup(GROUPS[2])));
   });

   test("production has neither the marker nor a robots directive", async ({ page }) => {
      await page.goto("/knowledge");
      await expect(marker(page)).toHaveCount(0);
      await expect(robots(page)).toHaveCount(0);
   });
});

test.describe("the explorer in a preview deployment", () => {
   test.use({ baseURL: PREVIEW_ORIGIN });

   test("is marked, never indexed, and every link stays on this deployment", async ({ page }) => {
      await page.goto("/knowledge");
      await expect(marker(page)).toBeVisible();
      await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");
      for (const href of await main(page).locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")))) {
         expect(href, "a link left this deployment").toMatch(/^\/(knowledge|login)/);
      }
   });

   test.describe("request discipline", () => {
      // A preview never caches, so every render reaches the API double and its log shows exactly what was read.
      // Other specs share that double, so only this task's own requests are attributed: list reads of Knowledge, and any path naming p2-t6.
      const log = async (request: APIRequestContext) => (await (await request.get(`${PREVIEW_API_ORIGIN}/__catalog-log`)).json()) as { path: string; query: string }[];
      const mine = async (request: APIRequestContext, since: number) =>
         (await log(request))
            .slice(since)
            .filter((entry) => entry.query.includes("type=knowledge") || entry.path.includes("p2-t6-"))
            .map(({ path, query }) => ({ path, query }));

      test("the topic list is read from list metadata alone: one read, and never an item, its metadata or its relations", async ({ page, request }) => {
         const since = (await log(request)).length;
         await page.goto("/knowledge");
         await expect(cards(page).first()).toBeVisible();
         for (const card of await cards(page).all()) await card.getByRole("link").hover();
         for (const link of await categories(page).getByRole("link").all()) await link.hover();
         await page.waitForTimeout(1000); // prefetches, if any, are scheduled once links are in view or hovered

         expect(await mine(request, since)).toEqual([{ path: "/catalog/items", query: `type=knowledge&limit=${PAGE_SIZE}` }]);
      });

      test("a two-category group is assembled from list pages, each read using the cursor the API issued", async ({ page, request }) => {
         const since = (await log(request)).length;
         await page.goto(`/knowledge?group=${GROUPS[0].id}`);
         await expect(cards(page).first()).toBeVisible();
         expect(await cardTitles(page)).toEqual(titles(inGroup(GROUPS[0])));

         const reads = await mine(request, since);
         expect(reads.every((entry) => entry.path === "/catalog/items"), "a group read something other than the list").toBe(true);
         expect(reads.map((entry) => entry.query)).toEqual([`type=knowledge&limit=${PAGE_SIZE}`, `type=knowledge&limit=${PAGE_SIZE}&cursor=${TOPICS[PAGE_SIZE - 1].id}`]);
         expect(reads.map((entry) => entry.query).join("&")).not.toContain("category=");
      });

      test("paging and choosing a topic read only the list; opening a topic is what reads the item", async ({ page, request }) => {
         const since = (await log(request)).length;
         await page.goto("/knowledge");
         await pager(page).getByRole("link", { name: /Next page/ }).click();
         await pager(page).getByRole("link", { name: "First page" }).click();
         await (await openTopics(page)).getByRole("link", { name: "serving", exact: true }).click();
         await expect(page).toHaveURL("/knowledge?tag=serving");
         expect((await mine(request, since)).every((entry) => entry.path === "/catalog/items")).toBe(true);

         await cards(page).first().getByRole("link").click();
         await expect(page).toHaveURL(canonical("knowledge.p2-t6-batching"));
         await expect(h1(page)).toHaveText(item("knowledge.p2-t6-batching").title);
         expect((await mine(request, since)).some((entry) => entry.path.startsWith("/catalog/items/knowledge/p2-t6-")), "the control read was not logged").toBe(true);
      });
   });
});

test.describe("a catalog with nothing published", () => {
   test.use({ baseURL: EMPTY_ORIGIN });

   test("keeps the proposition and the entry points and says so calmly, with no topic card", async ({ page }) => {
      expect((await page.goto("/knowledge"))?.status()).toBe(200);
      await expect(h1(page)).toHaveText("Knowledge, ready when you need it.");
      await expect(categories(page).getByRole("link")).toHaveCount(4);
      await expect(main(page).getByRole("status")).toHaveText("No Knowledge is published yet. Please check back soon.");
      await expect(cards(page)).toHaveCount(0);
      await expect(marker(page)).toBeVisible();
      expect(await overflows(page)).toBe(false);
   });
});

test.describe("a catalog the API refuses", () => {
   test.use({ baseURL: REJECTED_ORIGIN });

   test("keeps the proposition, shows the unavailable notice and none of another environment's topics", async ({ page }) => {
      const response = await page.goto("/knowledge");
      expect(response?.status()).toBe(200);
      const html = await response!.text();
      for (const topic of TOPICS) expect(html, `${topic.title} leaked into an unavailable page`).not.toContain(topic.title);
      expect(html).not.toContain("Forbidden");
      await expect(h1(page)).toHaveText("Knowledge, ready when you need it.");
      await expect(main(page).getByRole("status")).toHaveText("This content is temporarily unavailable. Please try again later.");
      await expect(cards(page)).toHaveCount(0);
   });
});

test.describe("a Knowledge topic", () => {
   const route = canonical(RICH.id);
   const sectionTitles = (page: Page) => main(page).locator("section h3").allTextContents();

   test("reads in bands: fast understanding, explanation, deeper reference, in the API's order", async ({ page }) => {
      expect((await page.goto(route))?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(h1(page)).toHaveText(RICH.title);
      await expect(bands(page)).toHaveText(["Fast understanding", "Explanation", "Deeper reference"]);
      expect(await sectionTitles(page)).toEqual((RICH.sections ?? []).map((section) => section.title));

      // each section sits under its own band
      const order = await main(page).locator("h2#knowledge_fast, h2#knowledge_explanation, h2#knowledge_reference, section[id]").evaluateAll((nodes) => nodes.map((node) => node.id));
      expect(order).toEqual([
         "knowledge_fast",
         "definition",
         "why-it-matters",
         "knowledge_explanation",
         "how-it-works",
         "building-blocks",
         "when-to-use",
         "when-not-to-use",
         "trade-offs",
         "knowledge_reference",
         "failure-modes",
         "example-scoring",
         "example-masking",
         "interview-considerations",
      ]);
   });

   test("shows a quiet category label and a breadcrumb back to Knowledge and its category group", async ({ page }) => {
      await page.goto(route);
      const crumb = page.getByRole("navigation", { name: "Breadcrumb" });
      await expect(crumb.getByRole("link")).toHaveText(["Knowledge", "Core Concepts"]);
      await expect(crumb.getByRole("link", { name: "Knowledge" })).toHaveAttribute("href", "/knowledge");
      await expect(crumb.getByRole("link", { name: "Core Concepts" })).toHaveAttribute("href", "/knowledge?group=core-concepts");
      await expect(categoryLine(page, "Concept")).toBeVisible();
      await crumb.getByRole("link", { name: "Core Concepts" }).click();
      await expect(page).toHaveURL("/knowledge?group=core-concepts");
      await expect(cards(page).filter({ hasText: RICH.title })).toHaveCount(1);
   });

   test("groups related items by their own type, labels how they relate, and links each canonically", async ({ page }) => {
      await page.goto(route);
      const group = (name: string) => main(page).getByRole("region", { name });
      await expect(main(page).getByRole("heading", { level: 2 }).filter({ hasText: /^Related/ })).toHaveText(["Related Lessons", "Related Problems", "Related Knowledge"]);

      const hrefs = (name: string) => group(name).getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      expect(await hrefs("Related Lessons")).toEqual(["/lessons/catalog-e2e-free", "/lessons/p2-t5-long"]);
      expect(await hrefs("Related Problems")).toEqual(["/problems/catalog-e2e-related", "/problems/p2-t4-practice", "/problems/p2-t5-premium-practice"]);
      expect(await hrefs("Related Knowledge")).toEqual(["/knowledge/p2-t6-embedding", "/knowledge/p2-t6-scaling-laws", "/knowledge/p2-t6-tokenization"]);

      await expect(group("Related Lessons")).toContainText("Applied in");
      await expect(group("Related Lessons")).toContainText("Prerequisite for");
      await expect(group("Related Knowledge")).toContainText("Read first");
      await expect(group("Related Problems").getByText("Premium", { exact: true })).toHaveCount(1);

      await group("Related Knowledge").getByRole("link", { name: item("knowledge.p2-t6-embedding").title }).click();
      await expect(page).toHaveURL(canonical("knowledge.p2-t6-embedding"));
      await expect(h1(page)).toHaveText(item("knowledge.p2-t6-embedding").title);
   });

   test("hides a relation group that is empty, and all of them for an item with none", async ({ page }) => {
      await page.goto(canonical("knowledge.p2-t6-tokenization"));
      await expect(main(page).getByRole("heading", { level: 2 }).filter({ hasText: /^Related/ })).toHaveCount(0);
      await expect(main(page).getByRole("region", { name: /^Related/ })).toHaveCount(0);
   });

   test.describe("in-page navigation", () => {
      test.use({ viewport: { width: 1280, height: 800 } });

      test("a desktop contents column jumps to a band and moves focus there", async ({ page }) => {
         await page.goto(route);
         const contents = page.getByRole("navigation", { name: "Contents" });
         await expect(contents.getByRole("link")).toHaveText(["Fast understanding", "Explanation", "Deeper reference"]);
         await contents.getByRole("link", { name: "Deeper reference" }).click();
         await expect(page).toHaveURL(/#knowledge_reference$/);
         await expect(page.locator("#knowledge_reference")).toBeFocused();
         await expect(page.locator("#knowledge_reference")).toBeInViewport();
         // A plain anchor list: nothing tracks the scroll, so no entry can be marked current wrongly.
         await expect(contents.locator("[aria-current]")).toHaveCount(0);
      });
   });

   test.describe("on a phone", () => {
      test.use({ viewport: { width: 390, height: 844 } });

      test("contents are one collapsed control near the top, and nothing overflows the page", async ({ page }) => {
         await page.goto(route);
         const toggle = main(page).getByRole("button", { name: "Contents" });
         await expect(toggle).toHaveAttribute("aria-expanded", "false");
         await toggle.click();
         await expect(toggle).toHaveAttribute("aria-expanded", "true");
         await main(page).getByRole("navigation", { name: "Contents" }).getByRole("link", { name: "Explanation" }).click();
         await expect(page).toHaveURL(/#knowledge_explanation$/);
         expect(await overflows(page)).toBe(false);
      });

      test("wide code and tables scroll inside their own box, never the page", async ({ page }) => {
         await page.goto(route);
         await expect(main(page).locator("pre")).toBeVisible();
         expect(await overflows(page)).toBe(false);
         expect(await main(page).locator('[data-slot="technical-scroll"]').count()).toBeGreaterThanOrEqual(2);
         // The code line is wider than a phone, so its box (not the page) is what scrolls.
         await expect(main(page).locator('[data-slot="technical-scroll"][data-scrolls="true"]')).not.toHaveCount(0);
      });
   });

   test("a quick reference is its quick facts alone: no empty band, heading or contents", async ({ page }) => {
      await page.goto(canonical(QUICK.id));
      await expect(h1(page)).toHaveText(QUICK.title);
      await expect(bands(page)).toHaveText(["Fast understanding"]);
      expect(await main(page).locator("section h3").allTextContents()).toEqual(["Quick facts"]);
      await expect(page.getByRole("navigation", { name: "Contents" })).toHaveCount(0);
      await expect(categoryLine(page, "Quick reference")).toBeVisible();
      await expect(main(page).locator("table")).toBeVisible();
   });

   test("an item with no category shows no label, and a section type it does not know goes under deeper reference", async ({ page }) => {
      await page.goto(canonical(UNLABELLED.id));
      await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link")).toHaveText(["Knowledge"]);
      await expect(categoryLine(page, "")).toHaveCount(0);
      await expect(bands(page)).toHaveText(["Fast understanding", "Deeper reference"]);
      const reference = main(page).locator("#knowledge_reference").locator("xpath=..");
      await expect(reference.locator("section")).toHaveText([/Field notes/]);
      await expect(reference.locator("section")).toHaveAttribute("id", "field-notes");
   });

   test("the same pages are also marked and kept off search in a preview, with links on the deployment", async ({ page }) => {
      await page.goto(`${PREVIEW_ORIGIN}${route}`);
      await expect(marker(page)).toBeVisible();
      await expect(robots(page)).toHaveAttribute("content", "noindex, nofollow");
      for (const href of await main(page).locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href")))) {
         expect(href, "a link left this deployment").toMatch(/^(\/|#)/);
      }
   });
});

test.describe("premium Knowledge, access decided by the API alone", () => {
   const LOCKED: { identity: Exclude<Identity, "entitled">; notice: string }[] = [
      { identity: "signed-out", notice: "Sign in to read this content." },
      { identity: "unentitled", notice: "Paid access is not available yet." },
   ];
   const withheld = canonical(WITHHELD.id);
   const premium = canonical(PREMIUM.id);
   const free = WITHHELD.sections!.filter((section) => section.access === "free");
   const gated = WITHHELD.sections!.filter((section) => section.access === "premium");

   for (const { identity, notice } of LOCKED) {
      test.describe(identity, () => {
         test.use({ identity });

         test("a free topic with premium sections shows the free ones, one generic note, and never the premium text", async ({ page, traffic }) => {
            await page.goto(withheld);
            await page.waitForLoadState("networkidle");
            await expectNoCanary(page, traffic, withheld, identity);
            expect(await main(page).locator("section h3").allTextContents()).toEqual(free.map((section) => section.title));
            for (const section of gated) await expect(page.getByRole("heading", { name: section.title })).toHaveCount(0);
            await expect(main(page).getByRole("note")).toHaveText("Some sections of this content are premium and are not included in your access.");
            await expect(bands(page)).toHaveText(["Fast understanding", "Explanation"]);
         });

         test("a premium topic shows its public identity and the notice: no band, relation or body", async ({ page, traffic }) => {
            await page.goto(premium);
            await page.waitForLoadState("networkidle");
            await expectNoCanary(page, traffic, premium, identity);
            await expect(h1(page)).toHaveText(PREMIUM.title);
            await expect(categoryLine(page, "Technology")).toBeVisible();
            await expect(main(page).getByRole("status")).toContainText(notice);
            await expect(bands(page)).toHaveCount(0);
            await expect(page.getByRole("navigation", { name: "Contents" })).toHaveCount(0);
            await expect(main(page).getByRole("region", { name: /^Related/ })).toHaveCount(0);
            await expect(main(page).getByRole("note")).toHaveCount(0);
         });
      });
   }

   test.describe("entitled", () => {
      test.use({ identity: "entitled" });

      test("sees every section: the canary renders only inside the premium sections, and no note", async ({ page }) => {
         await page.goto(withheld);
         expect(await main(page).locator("section h3").allTextContents()).toEqual(WITHHELD.sections!.map((section) => section.title));
         await expect(main(page).locator("section").filter({ hasText: CANARY })).toHaveCount(gated.length);
         await expect(main(page).getByRole("note")).toHaveCount(0);
         await expect(bands(page)).toHaveText(["Fast understanding", "Explanation", "Deeper reference"]);
      });

      test("reads a premium topic, with its relations", async ({ page }) => {
         await page.goto(premium);
         await expect(h1(page)).toHaveText(PREMIUM.title);
         await expect(main(page).getByText("Premium", { exact: true })).toBeVisible();
         await expect(main(page).getByText(CANARY).first()).toBeVisible();
         await expect(main(page).getByRole("region", { name: "Related Knowledge" })).toBeVisible();
      });
   });

   test.describe("relations are never requested before access is known", () => {
      test.use({ baseURL: PREVIEW_ORIGIN });

      const reads = async (request: APIRequestContext, since: number, slug: string) =>
         ((await (await request.get(`${PREVIEW_API_ORIGIN}/__catalog-log`)).json()) as { path: string }[])
            .slice(since)
            .map(({ path }) => path)
            .filter((path) => path.includes(slug));
      const logged = async (request: APIRequestContext) => ((await (await request.get(`${PREVIEW_API_ORIGIN}/__catalog-log`)).json()) as unknown[]).length;
      const item_ = (suffix = "") => `/catalog/items/knowledge/${PREMIUM.slug}${suffix}`;

      for (const identity of ["signed-out", "unentitled"] as const) {
         test.describe(identity, () => {
            test.use({ identity });

            test("a locked topic reads its item and public metadata, and never its relations", async ({ page, request }) => {
               const since = await logged(request);
               await page.goto(premium);
               await expect(main(page).getByRole("status")).toBeVisible();
               await page.waitForTimeout(500);
               const paths = await reads(request, since, PREMIUM.slug);
               expect(paths, "the locked item itself was never asked for").toContain(item_());
               expect(paths, "relations were requested before access was known").not.toContain(item_("/related"));
            });
         });
      }

      test.describe("entitled", () => {
         test.use({ identity: "entitled" });

         test("a readable topic reads its item and its relations once each", async ({ page, request }) => {
            const since = await logged(request);
            await page.goto(premium);
            await expect(h1(page)).toBeVisible();
            const paths = await reads(request, since, PREMIUM.slug);
            expect(paths.filter((path) => path === item_())).toHaveLength(1);
            expect(paths.filter((path) => path === item_("/related"))).toHaveLength(1);
         });
      });
   });
});
