import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCatalogItem, getCatalogItemMeta, getCatalogRelated, getCatalogTrack } = vi.hoisted(() => ({
   getCatalogItem: vi.fn(),
   getCatalogItemMeta: vi.fn(),
   getCatalogRelated: vi.fn(),
   getCatalogTrack: vi.fn(),
}));
vi.mock("@/lib/catalog/client", () => ({ getCatalogItem, getCatalogItemMeta, getCatalogRelated, getCatalogTrack }));
vi.mock("next/navigation", () => ({
   notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
   },
}));
vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

import { CatalogItemPage } from "./CatalogItemPage";

const meta = (id: string, over = {}) => {
   const [type, slug] = id.split(".");
   return { id, type, slug, title: `Title ${slug}`, summary: `Summary ${slug}`, tags: [], category: null, difficulty: null, level: null, access: "free", ...over };
};
const section = (type: string, id = type.replace(/_/g, "-"), title: string | null = `Heading of ${id}`) => ({
   id,
   type,
   title,
   body: { format: "markdown@1", text: `Body of ${id}.` },
});
const knowledge = (over = {}) => ({
   ...meta("knowledge.topic", { title: "Synthetic Topic", summary: "Synthetic summary.", category: "concept" }),
   body: null,
   headings: [],
   sections: [section("definition"), section("how_it_works"), section("trade_offs"), section("failure_modes"), section("example", "example-one"), section("example", "example-two")],
   sections_withheld: false,
   ...over,
});
const related = (relations: Record<string, unknown[]>) => ({ status: "ok", data: { id: "knowledge.topic", relations, placements: [] } });

const show = async () => render(await CatalogItemPage({ type: "knowledge", slug: "topic" }));
const levels = () => [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((element) => Number(element.tagName[1]));
// The mobile contents control is itself an h2 (as on a Lesson); the page's own headings are everything else.
const headings = (level: number) => screen.queryAllByRole("heading", { level }).map((element) => element.textContent).filter((name) => name !== "Contents");
const REF_COUNT = (name: string) => screen.queryAllByRole("navigation", { name }).length;

beforeEach(() => {
   vi.clearAllMocks();
   getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge() });
   getCatalogItemMeta.mockResolvedValue({ status: "ok", data: knowledge() });
   getCatalogRelated.mockResolvedValue(related({}));
});

describe("a readable Knowledge topic", () => {
   it("has one h1, bands as h2 in reading order, and each section's own h3", async () => {
      await show();
      expect(headings(1)).toEqual(["Synthetic Topic"]);
      expect(headings(2)).toEqual(["Fast understanding", "Explanation", "Deeper reference"]);
      expect(headings(3)).toEqual(["Heading of definition", "Heading of how-it-works", "Heading of trade-offs", "Heading of failure-modes", "Heading of example-one", "Heading of example-two"]);
   });

   it("never skips a heading level", async () => {
      await show();
      const outline = levels();
      expect(outline[0]).toBe(1);
      outline.slice(1).forEach((level, index) => expect(level).toBeLessThanOrEqual(outline[index] + 1));
   });

   it("keeps each section in its own band and in the API's order", async () => {
      await show();
      const band = (id: string) => document.getElementById(id)!.parentElement!;
      expect([...band("knowledge_fast").querySelectorAll("section")].map((s) => s.id)).toEqual(["definition"]);
      expect([...band("knowledge_explanation").querySelectorAll("section")].map((s) => s.id)).toEqual(["how-it-works", "trade-offs"]);
      expect([...band("knowledge_reference").querySelectorAll("section")].map((s) => s.id)).toEqual(["failure-modes", "example-one", "example-two"]);
   });

   it("keeps a section type it does not know, under Deeper reference, in API order", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge({ sections: [section("mystery_block"), section("definition"), section("example"), section("another_unknown", "other")] }) });
      await show();
      expect(headings(2)).toEqual(["Fast understanding", "Deeper reference"]);
      const reference = document.getElementById("knowledge_reference")!.parentElement!;
      expect([...reference.querySelectorAll("section")].map((s) => s.id)).toEqual(["mystery-block", "example", "other"]);
   });

   it("names an untitled section after its type, and leaves an untitled unknown one without a heading", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge({ sections: [section("definition", "d", null), section("trade_offs", "t", "  "), section("mystery", "m", null)] }) });
      await show();
      expect(headings(3)).toEqual(["Definition", "Trade-offs"]);
      expect(document.querySelector("section#m h3")).toBeNull();
      expect(screen.getByText("Body of m.")).toBeInTheDocument();
   });

   it("renders only the bands that have content, with no empty heading", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge({ sections: [section("how_it_works")] }) });
      await show();
      expect(headings(2)).toEqual(["Explanation"]);
      for (const heading of screen.getAllByRole("heading")) expect(heading.textContent?.trim()).not.toBe("");
   });

   it("is a reading page, not a stack of cards: bands are plain blocks and sections carry no box", async () => {
      await show();
      for (const element of [...document.querySelectorAll("main section"), document.getElementById("knowledge_fast")!.parentElement!]) {
         expect(element.className).not.toMatch(/rounded|bg-surface|shadow/);
      }
   });

   it("renders a body the API released, ahead of the bands", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge({ body: { format: "markdown@1", text: "Released body." } }) });
      await show();
      const body = screen.getByText("Released body.");
      expect(body.compareDocumentPosition(document.getElementById("knowledge_fast")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
   });
});

describe("the topic header", () => {
   it("shows title, summary, the breadcrumb and a quiet category label", async () => {
      await show();
      expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Knowledge/Core Concepts");
      expect(screen.getByRole("link", { name: "Knowledge" })).toHaveAttribute("href", "/knowledge");
      expect(screen.getByRole("link", { name: "Core Concepts" })).toHaveAttribute("href", "/knowledge?group=core-concepts");
      expect(screen.getByText("Synthetic summary.")).toBeInTheDocument();
      expect(screen.getByText("Concept")).toBeInTheDocument();
      expect(screen.getByText("Category:")).toHaveClass("sr-only");
   });

   it.each([
      ["concept", "Concept", "Core Concepts"],
      ["term", "Term", "Core Concepts"],
      ["technology", "Technology", "Technologies & Research"],
      ["research", "Research", "Technologies & Research"],
      ["pattern", "Pattern", "Patterns"],
      ["quick_reference", "Quick reference", "Quick References"],
   ])("labels %s as %s and links to %s", async (category, label, group) => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge({ category }) });
      await show();
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: group })).toBeInTheDocument();
   });

   it("shows no category label and no group crumb when the item has no category", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge({ category: null }) });
      await show();
      expect(screen.queryByText("Category:")).not.toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(/^Knowledge$/);
   });

   it("shows no label for a category outside the Knowledge vocabulary", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge({ category: "system_design" }) });
      await show();
      expect(screen.queryByText("Category:")).not.toBeInTheDocument();
   });

   it("marks a premium topic the reader is entitled to, and no other", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge({ access: "premium" }) });
      await show();
      expect(screen.getByText("Premium")).toBeInTheDocument();
      expect(screen.getAllByText("Premium")).toHaveLength(1);
   });
});

describe("a quick reference", () => {
   it("renders its quick facts alone, with no empty bands, headings or contents", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge({ category: "quick_reference", sections: [section("quick_facts", "quick-facts", "Quick facts")] }) });
      await show();
      expect(headings(2)).toEqual(["Fast understanding"]);
      expect(headings(3)).toEqual(["Quick facts"]);
      expect(screen.queryByText("Explanation")).not.toBeInTheDocument();
      expect(screen.queryByText("Deeper reference")).not.toBeInTheDocument();
      expect(REF_COUNT("Contents")).toBe(0);
      expect(screen.getByText("Quick reference")).toBeInTheDocument();
   });
});

describe("in-page navigation", () => {
   it("is an anchor list of the bands: a collapsed control below lg and a column from lg", async () => {
      await show();
      const navs = screen.getAllByRole("navigation", { name: "Contents" });
      expect(navs).toHaveLength(2);
      for (const nav of navs) {
         const links = within(nav).getAllByRole("link");
         expect(links.map((link) => link.textContent)).toEqual(["Fast understanding", "Explanation", "Deeper reference"]);
         for (const link of links) expect(document.getElementById(link.getAttribute("href")!.slice(1))).toBeInstanceOf(HTMLHeadingElement);
      }
      expect(screen.getByRole("button", { name: "Contents" })).toHaveAttribute("aria-expanded", "false");
   });

   it("is a plain anchor list: no entry is marked current, so none can be wrong for a short last band", async () => {
      await show();
      expect(within(screen.getAllByRole("navigation", { name: "Contents" })[0]).getAllByRole("link")).toHaveLength(3);
      expect(document.querySelectorAll("nav[aria-label='Contents'] [aria-current]")).toHaveLength(0);
   });

   it("is absent for a single band", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge({ sections: [section("definition"), section("why_it_matters")] }) });
      await show();
      expect(REF_COUNT("Contents")).toBe(0);
   });

   it("points at band ids no section id can equal", async () => {
      await show();
      for (const link of within(screen.getAllByRole("navigation", { name: "Contents" })[0]).getAllByRole("link")) {
         expect(link.getAttribute("href")).toMatch(/^#knowledge_/);
      }
   });
});

describe("withheld sections", () => {
   it("shows the sections it was given and one generic note, naming nothing withheld", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge({ sections: [section("definition"), section("how_it_works")], sections_withheld: true }) });
      await show();
      expect(headings(3)).toEqual(["Heading of definition", "Heading of how-it-works"]);
      expect(screen.getByRole("note")).toHaveTextContent("Some sections of this content are premium and are not included in your access.");
      expect(screen.getByRole("note").textContent).not.toMatch(/failure|trade|example|reference/i);
   });

   it("shows no note when nothing was withheld", async () => {
      await show();
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
   });

   it("keeps the note and header when every section was withheld", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: knowledge({ sections: [], sections_withheld: true }) });
      await show();
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      expect(screen.getByRole("note")).toBeInTheDocument();
      expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
   });
});

describe("relationships", () => {
   const RELATIONS = {
      prerequisite: [meta("knowledge.base", { summary: "Base summary" })],
      applied_in: [meta("lesson.l1", { summary: "Lesson summary" }), meta("problem.p1", { difficulty: "hard", access: "premium" })],
      prerequisite_of: [meta("lesson.l2")],
      related: [meta("knowledge.k2"), meta("problem.p2", { difficulty: "easy" }), meta("lesson.l1")],
   };

   it("groups the targets by their own type: Lessons, then Problems, then Knowledge", async () => {
      getCatalogRelated.mockResolvedValue(related(RELATIONS));
      await show();
      const groups = headings(2).filter((name) => name!.startsWith("Related"));
      expect(groups).toEqual(["Related Lessons", "Related Problems", "Related Knowledge"]);
      const names = (group: string) => within(screen.getByRole("region", { name: group })).getAllByRole("link").map((link) => link.textContent);
      expect(names("Related Lessons")).toEqual(["Title l1", "Title l2"]);
      expect(names("Related Problems")).toEqual(["Title p1", "Title p2"]);
      expect(names("Related Knowledge")).toEqual(["Title base", "Title k2"]);
   });

   it("labels how each target relates, leaving the generic related edge plain", async () => {
      getCatalogRelated.mockResolvedValue(related(RELATIONS));
      await show();
      const lessons = screen.getByRole("region", { name: "Related Lessons" });
      expect(lessons).toHaveTextContent("Applied in");
      expect(lessons).toHaveTextContent("Prerequisite for");
      expect(screen.getByRole("region", { name: "Related Knowledge" })).toHaveTextContent("Read first");
      expect(screen.getByRole("region", { name: "Related Problems" })).toHaveTextContent("Hard · Applied in");
      expect(screen.getByRole("region", { name: "Related Problems" })).toHaveTextContent(/Easy$/);
   });

   it("lists a target once and marks premium targets", async () => {
      getCatalogRelated.mockResolvedValue(related(RELATIONS));
      await show();
      expect(screen.getAllByRole("link", { name: "Title l1" })).toHaveLength(1);
      expect(within(screen.getByRole("region", { name: "Related Problems" })).getByText("Premium")).toBeInTheDocument();
   });

   it("links every target to its canonical route without prefetching it", async () => {
      getCatalogRelated.mockResolvedValue(related(RELATIONS));
      await show();
      const links = within(screen.getByRole("main")).getAllByRole("link").filter((link) => /^Title /.test(link.textContent ?? ""));
      expect(links.map((link) => link.getAttribute("href"))).toEqual(["/lessons/l1", "/lessons/l2", "/problems/p1", "/problems/p2", "/knowledge/base", "/knowledge/k2"]);
      for (const link of links) expect(link).toHaveAttribute("data-prefetch", "false");
   });

   it("hides an empty group, and every group and divider when there is nothing related", async () => {
      getCatalogRelated.mockResolvedValue(related({ related: [meta("lesson.only")] }));
      await show();
      expect(headings(2).filter((name) => name!.startsWith("Related"))).toEqual(["Related Lessons"]);

      document.body.innerHTML = "";
      getCatalogRelated.mockResolvedValue(related({}));
      await show();
      expect(headings(2).filter((name) => name!.startsWith("Related"))).toEqual([]);
      expect(document.querySelector("main .border-t.pt-10")).toHaveClass("empty:hidden");
      expect(document.querySelector("main .border-t.pt-10")?.childElementCount).toBe(0);
   });

   it("still reads when relationships are unavailable, inventing none", async () => {
      getCatalogRelated.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      await show();
      expect(headings(2)).toEqual(["Fast understanding", "Explanation", "Deeper reference"]);
      expect(headings(2).filter((name) => name!.startsWith("Related"))).toEqual([]);
   });

   it("drops relations that name another item or a Track, as the API's contract gives none", async () => {
      getCatalogRelated.mockResolvedValue({ status: "ok", data: { id: "knowledge.other", relations: RELATIONS, placements: [] } });
      await show();
      expect(headings(2).filter((name) => name!.startsWith("Related"))).toEqual([]);
   });

   it("reads the item once and its relations once, and never a Track or another item", async () => {
      getCatalogRelated.mockResolvedValue(related(RELATIONS));
      await show();
      expect(getCatalogItem).toHaveBeenCalledExactlyOnceWith("knowledge", "topic");
      expect(getCatalogRelated).toHaveBeenCalledExactlyOnceWith("knowledge", "topic");
      expect(getCatalogTrack).not.toHaveBeenCalled();
   });
});

describe("a locked Knowledge topic", () => {
   it.each([
      ["unauthenticated", "Sign in to read this content."],
      ["unentitled", "Paid access is not available yet."],
   ] as const)("shows only public metadata and the notice when %s", async (status, notice) => {
      getCatalogItem.mockResolvedValue({ status });
      getCatalogItemMeta.mockResolvedValue({ status: "ok", data: knowledge({ access: "premium" }) });
      await show();

      expect(headings(1)).toEqual(["Synthetic Topic"]);
      expect(screen.getByText("Synthetic summary.")).toBeInTheDocument();
      expect(screen.getByText("Concept")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Core Concepts" })).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(notice);
      expect(headings(2)).toEqual([]);
      expect(screen.queryByRole("navigation", { name: "Contents" })).not.toBeInTheDocument();
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
   });

   it("loads no relationships and no Track, and no body, before access is known", async () => {
      getCatalogItem.mockResolvedValue({ status: "unauthenticated" });
      getCatalogItemMeta.mockResolvedValue({ status: "ok", data: knowledge({ access: "premium" }) });
      await show();
      expect(getCatalogRelated).not.toHaveBeenCalled();
      expect(getCatalogTrack).not.toHaveBeenCalled();
      expect(getCatalogItemMeta).toHaveBeenCalledExactlyOnceWith("knowledge", "topic");
   });

   it("offers sign-in on the same canonical URL, only to a signed-out reader", async () => {
      getCatalogItem.mockResolvedValue({ status: "unauthenticated" });
      getCatalogItemMeta.mockResolvedValue({ status: "ok", data: knowledge({ access: "premium" }) });
      await show();
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?redirect=%2Fknowledge%2Ftopic");
   });

   it("shows no header for a retired or unavailable topic, only the notice", async () => {
      getCatalogItem.mockResolvedValue({ status: "retired" });
      await show();
      expect(screen.getByRole("status")).toHaveTextContent("retired");
      expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
      expect(getCatalogItemMeta).not.toHaveBeenCalled();
   });
});
