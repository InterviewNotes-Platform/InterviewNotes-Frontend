import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listCatalogItems, getCatalogItem, getCatalogItemMeta, getCatalogRelated, getCatalogTrack } = vi.hoisted(() => ({
   listCatalogItems: vi.fn(),
   getCatalogItem: vi.fn(),
   getCatalogItemMeta: vi.fn(),
   getCatalogRelated: vi.fn(),
   getCatalogTrack: vi.fn(),
}));
vi.mock("@/lib/catalog/client", () => ({ listCatalogItems, getCatalogItem, getCatalogItemMeta, getCatalogRelated, getCatalogTrack }));
vi.mock("next/navigation", () => ({
   notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
   },
}));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

import KnowledgeExplorerPage, * as explorerModule from "./page";

const TOKEN = "unit-synthetic-preview-token-0123456789abcdef";
const topic = (slug: string, category: string | null, over = {}) => ({
   id: `knowledge.${slug}`,
   type: "knowledge",
   slug,
   title: `Topic ${slug}`,
   summary: `Summary of ${slug}.`,
   tags: [],
   category,
   difficulty: null,
   level: null,
   access: "free",
   ...over,
});
const TOPICS = [
   topic("attention", "concept", { tags: ["transformers", "deep-learning"] }),
   topic("batching", "pattern", { tags: ["serving"] }),
   topic("embedding", "term", { tags: ["retrieval"] }),
   topic("feature-store", "technology", { access: "premium", tags: ["serving"] }),
   topic("latency", "quick_reference"),
   topic("scaling", "research"),
   topic("uncategorised", null, { tags: ["serving"] }),
];
const page = (items: unknown[], next_cursor: string | null = null) => ({ status: "ok", data: { items, next_cursor } });

const view = async (params: Record<string, string | string[] | undefined> = {}) =>
   render(await KnowledgeExplorerPage({ searchParams: Promise.resolve(params) }));
const main = () => within(screen.getByRole("main"));
const cardTitles = () => main().queryAllByRole("heading", { level: 3 }).map((h) => h.textContent).filter((name) => !/Browse by topic/.test(name ?? ""));
const entryPoints = () => within(screen.getByRole("navigation", { name: "Knowledge categories" })).getAllByRole("link");

beforeEach(() => {
   vi.clearAllMocks();
   listCatalogItems.mockResolvedValue(page(TOPICS));
});

afterEach(() => {
   vi.unstubAllEnvs();
});

describe("/knowledge populated", () => {
   it("opens with the Knowledge proposition, the category entry points, then every topic", async () => {
      await view();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Knowledge, ready when you need it.");
      expect(main().getByRole("heading", { level: 2, name: "All topics" })).toBeInTheDocument();
      expect(cardTitles()).toEqual(TOPICS.map((t) => t.title));
   });

   it("keeps the heading outline whole: h1, one h2, then h3 only", async () => {
      await view();
      expect([...document.querySelectorAll("h1,h2,h3")].map((h) => h.tagName)).toEqual(["H1", "H2", "H3", ...TOPICS.map(() => "H3")]);
   });

   it("offers the four editorial entry points, in order, as links to their group", async () => {
      await view();
      expect(entryPoints().map((link) => [link.querySelector("span")!.textContent, link.getAttribute("href")])).toEqual([
         ["Core Concepts", "/knowledge?group=core-concepts"],
         ["Technologies & Research", "/knowledge?group=technologies-research"],
         ["Patterns", "/knowledge?group=patterns"],
         ["Quick References", "/knowledge?group=quick-references"],
      ]);
      for (const link of entryPoints()) expect(link).not.toHaveAttribute("aria-current");
   });

   it("is a list of discovery cards with exactly one link each, in a one, two, then three column grid", async () => {
      await view();
      const cards = document.querySelectorAll("main article");
      expect(cards).toHaveLength(TOPICS.length);
      for (const card of cards) expect(within(card as HTMLElement).getAllByRole("link")).toHaveLength(1);
      expect([...document.querySelectorAll("main ul")].some((ul) => /md:grid-cols-2.*lg:grid-cols-3/.test(ul.className))).toBe(true);
   });

   it("shows each topic's category as a quiet word, the Premium mark where it applies, and nothing for no category", async () => {
      await view();
      const card = (title: string) => within(screen.getByRole("heading", { name: title }).closest("article")!);
      expect(card("Topic attention").getByText("Concept")).toBeInTheDocument();
      expect(card("Topic embedding").getByText("Term")).toBeInTheDocument();
      expect(card("Topic feature-store").getByText("Technology")).toBeInTheDocument();
      expect(card("Topic feature-store").getByText("Premium")).toBeInTheDocument();
      expect(card("Topic scaling").getByText("Research")).toBeInTheDocument();
      expect(card("Topic batching").getByText("Pattern")).toBeInTheDocument();
      expect(card("Topic latency").getByText("Quick reference")).toBeInTheDocument();
      expect(card("Topic uncategorised").queryByText(/^(Concept|Term|Technology|Research|Pattern|Quick reference|Premium)$/)).not.toBeInTheDocument();
      expect(screen.getAllByText("Premium")).toHaveLength(1);
   });

   it("reserves the same eyebrow line on every card, so titles align across a row whatever the category", async () => {
      await view();
      const eyebrows = [...document.querySelectorAll("main article")].map((card) => card.firstElementChild as HTMLElement);
      expect(eyebrows).toHaveLength(TOPICS.length);
      for (const eyebrow of eyebrows) expect(eyebrow.tagName === "P" && eyebrow.className).toContain("min-h-6");
   });

   it("links each topic to its canonical route, and no link on the page prefetches", async () => {
      await view();
      const links = within(screen.getByRole("main")).getAllByRole("link");
      expect(links.filter((link) => /^Topic /.test(link.textContent ?? "")).map((link) => link.getAttribute("href"))).toEqual(
         TOPICS.map((t) => `/knowledge/${t.slug}`)
      );
      for (const link of links) expect(link).toHaveAttribute("data-prefetch", "false");
   });

   it("lists the topics' tags, sorted and once, as links that narrow the list", async () => {
      await view();
      const topics = within(screen.getByRole("navigation", { name: "Browse by topic" })).getAllByRole("link");
      expect(topics.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
         ["deep-learning", "/knowledge?tag=deep-learning"],
         ["retrieval", "/knowledge?tag=retrieval"],
         ["serving", "/knowledge?tag=serving"],
         ["transformers", "/knowledge?tag=transformers"],
      ]);
   });

   it("keeps topics quiet: a collapsed control with a count, open only when a topic is in use", async () => {
      await view();
      const toggle = screen.getByRole("button", { name: /^Browse by topic/ });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(toggle).toHaveTextContent("4");
      expect(toggle.closest("h3")).not.toBeNull();

      document.body.innerHTML = "";
      await view({ tag: "serving" });
      expect(screen.getByRole("button", { name: /^Browse by topic/ })).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("button", { name: /^Browse by topic/ })).toHaveTextContent("serving");
   });

   it("shows no topic navigation when no topic has a tag", async () => {
      listCatalogItems.mockResolvedValue(page([topic("a", "concept")]));
      await view();
      expect(screen.queryByRole("navigation", { name: "Browse by topic" })).not.toBeInTheDocument();
   });

   it("reads the topic list once and never an item, its relations, its metadata or a Track", async () => {
      await view();
      expect(listCatalogItems).toHaveBeenCalledExactlyOnceWith({ type: "knowledge", tag: undefined, limit: 12, cursor: undefined });
      for (const spy of [getCatalogItem, getCatalogItemMeta, getCatalogRelated, getCatalogTrack]) expect(spy).not.toHaveBeenCalled();
   });

   it("drops a topic whose id disagrees with its slug instead of linking it", async () => {
      listCatalogItems.mockResolvedValue(page([...TOPICS, { ...topic("other", "concept"), id: "knowledge.mismatch", title: "Mismatched" }]));
      await view();
      expect(screen.queryByText("Mismatched")).not.toBeInTheDocument();
   });

   it("has no Preview marker or noindex in production", async () => {
      await view();
      expect(screen.queryByRole("complementary", { name: "Preview" })).not.toBeInTheDocument();
      expect(explorerModule.generateMetadata()).not.toHaveProperty("robots");
   });
});

describe("/knowledge by category", () => {
   it("shows only a group's own categories, marks its entry point, and names it", async () => {
      await view({ group: "technologies-research" });
      expect(main().getByRole("heading", { level: 2, name: "Technologies & Research" })).toBeInTheDocument();
      expect(cardTitles()).toEqual(["Topic feature-store", "Topic scaling"]);
      expect(screen.getByRole("link", { name: /Technologies & Research/ })).toHaveAttribute("aria-current", "page");
      expect(entryPoints().filter((link) => link.hasAttribute("aria-current"))).toHaveLength(1);
      expect(screen.getAllByText("The tools, systems and papers worth knowing.")).toHaveLength(1);
   });

   it.each([
      ["core-concepts", ["Topic attention", "Topic embedding"]],
      ["patterns", ["Topic batching"]],
      ["quick-references", ["Topic latency"]],
   ])("assembles %s from list metadata", async (group, titles) => {
      await view({ group });
      expect(cardTitles()).toEqual(titles);
   });

   it("keeps an item with no category in the full list and in no group", async () => {
      await view();
      expect(cardTitles()).toContain("Topic uncategorised");
      for (const group of ["core-concepts", "technologies-research", "patterns", "quick-references"]) {
         document.body.innerHTML = "";
         await view({ group });
         expect(cardTitles()).not.toContain("Topic uncategorised");
      }
   });

   it.each(["gadget", "system_design", "technology", "concept", "", ["patterns", "core-concepts"]])(
      "treats an unsupported group (%j) as all topics and sends no category to the API",
      async (group) => {
         await view({ group });
         expect(main().getByRole("heading", { level: 2, name: "All topics" })).toBeInTheDocument();
         expect(cardTitles()).toEqual(TOPICS.map((t) => t.title));
         for (const [params] of listCatalogItems.mock.calls) expect(params).not.toHaveProperty("category");
      }
   );

   it("sends the tag with the list read and marks it, with a way to clear it that keeps the group", async () => {
      listCatalogItems.mockResolvedValue(page([TOPICS[3], TOPICS[1]]));
      await view({ group: "technologies-research", tag: "serving" });
      expect(listCatalogItems).toHaveBeenCalledWith(expect.objectContaining({ type: "knowledge", tag: "serving" }));
      const nav = within(screen.getByRole("navigation", { name: "Browse by topic" }));
      expect(nav.getByRole("link", { name: "serving" })).toHaveAttribute("aria-current", "page");
      expect(nav.getByRole("link", { name: "Clear topic" })).toHaveAttribute("href", "/knowledge?group=technologies-research");
      expect(screen.getByRole("link", { name: "Show all topics" })).toHaveAttribute("href", "/knowledge");
   });

   it("keeps the group when a topic is chosen", async () => {
      await view({ group: "patterns" });
      expect(within(screen.getByRole("navigation", { name: "Browse by topic" })).getByRole("link", { name: "serving" })).toHaveAttribute(
         "href",
         "/knowledge?group=patterns&tag=serving"
      );
   });

   it("offers no way back to all topics when nothing is narrowed", async () => {
      await view();
      expect(screen.queryByRole("link", { name: "Show all topics" })).not.toBeInTheDocument();
   });
});

describe("/knowledge pagination", () => {
   it("offers the API's cursor as the way onward, and nothing when there is no next page", async () => {
      listCatalogItems.mockResolvedValue(page(TOPICS, "knowledge.uncategorised"));
      await view();
      const pager = within(screen.getByRole("navigation", { name: "Pagination" }));
      expect(pager.getByRole("link", { name: /Next page/ })).toHaveAttribute("href", "/knowledge?cursor=knowledge.uncategorised");
      expect(pager.getByRole("link", { name: /Next page/ })).toHaveAttribute("rel", "next");
      expect(pager.queryByRole("link", { name: "First page" })).not.toBeInTheDocument();

      document.body.innerHTML = "";
      listCatalogItems.mockResolvedValue(page(TOPICS));
      await view();
      expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
   });

   it("passes the cursor from the URL to the API untouched and offers a way back to the first page", async () => {
      await view({ cursor: "knowledge.attention" });
      expect(listCatalogItems).toHaveBeenCalledWith(expect.objectContaining({ cursor: "knowledge.attention" }));
      const pager = within(screen.getByRole("navigation", { name: "Pagination" }));
      expect(pager.getByRole("link", { name: "First page" })).toHaveAttribute("href", "/knowledge");
      expect(pager.queryByRole("link", { name: /Next page/ })).not.toBeInTheDocument();
   });

   it("keeps the group and topic across pages, and drops the cursor on the way back", async () => {
      listCatalogItems.mockResolvedValue(page(TOPICS.slice(0, 2), "knowledge.batching"));
      await view({ group: "patterns", tag: "serving", cursor: "knowledge.a" });
      const pager = within(screen.getByRole("navigation", { name: "Pagination" }));
      expect(pager.getByRole("link", { name: /Next page/ })).toHaveAttribute("href", "/knowledge?group=patterns&tag=serving&cursor=knowledge.batching");
      expect(pager.getByRole("link", { name: "First page" })).toHaveAttribute("href", "/knowledge?group=patterns&tag=serving");
   });

   it("ignores a repeated or oversized cursor rather than forwarding it", async () => {
      await view({ cursor: ["knowledge.a", "knowledge.b"] });
      await view({ cursor: "c".repeat(300) });
      for (const [params] of listCatalogItems.mock.calls) expect(params.cursor).toBeUndefined();
   });
});

describe("/knowledge empty", () => {
   it("keeps the proposition and the entry points and says calmly that nothing is published", async () => {
      listCatalogItems.mockResolvedValue(page([]));
      await view();
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      expect(entryPoints()).toHaveLength(4);
      expect(screen.getByRole("status")).toHaveTextContent("No Knowledge is published yet.");
      expect(main().queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
      expect(document.querySelectorAll("main article")).toHaveLength(0);
   });

   it("says nothing matches a selection that is empty, and offers all topics", async () => {
      listCatalogItems.mockResolvedValue(page([TOPICS[0]]));
      await view({ group: "quick-references" });
      expect(screen.getByRole("status")).toHaveTextContent("No topics match this selection.");
      expect(screen.getByRole("link", { name: "Show all topics" })).toBeInTheDocument();
      expect(document.querySelectorAll("main article")).toHaveLength(0);
   });
});

describe("/knowledge unavailable", () => {
   it.each(["transport", "upstream", "malformed"])("keeps the proposition and shows the P1 notice for %s", async (cause) => {
      listCatalogItems.mockResolvedValue({ status: "unavailable", cause });
      await view();
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      expect(entryPoints()).toHaveLength(4);
      expect(screen.getByRole("status")).toHaveTextContent("This content is temporarily unavailable. Please try again later.");
      expect(document.querySelectorAll("main article")).toHaveLength(0);
      expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Browse by topic" })).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/transport|upstream|malformed|403|postgres/i);
   });

   it("is a 404 when the catalog is disabled, as every other catalog route is", async () => {
      listCatalogItems.mockResolvedValue({ status: "notFound" });
      await expect(view()).rejects.toThrow("NEXT_NOT_FOUND");
   });
});

describe("/knowledge in a preview deployment", () => {
   it("shows the Preview marker, is never indexed, and keeps every link on this deployment", async () => {
      vi.stubEnv("CATALOG_PREVIEW_TOKEN", TOKEN);
      listCatalogItems.mockResolvedValue(page(TOPICS, "knowledge.uncategorised"));
      await view({ group: "patterns" });
      expect(screen.getByRole("complementary", { name: "Preview" })).toBeInTheDocument();
      expect(explorerModule.generateMetadata()).toMatchObject({ robots: { index: false, follow: false } });
      for (const link of screen.getByRole("main").querySelectorAll("a")) expect(link.getAttribute("href")).toMatch(/^\/knowledge/);
   });
});

describe("/knowledge route configuration", () => {
   it("is rendered per request, never built or cached statically", () => {
      expect(explorerModule.dynamic).toBe("force-dynamic");
   });

   it("titles itself Knowledge", () => {
      expect(explorerModule.generateMetadata()).toMatchObject({ title: "Knowledge | InterviewNotes" });
   });
});
