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
   return {
      default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) =>
         createElement("a", { "data-prefetch": String(prefetch), ...props }),
   };
});

import { CatalogItemPage } from "./CatalogItemPage";

const entry = (id: string, over = {}) => {
   const [type, slug] = id.split(".");
   return { id, type, slug, title: `Title ${slug}`, access: "free", primary: true, ...over };
};
const meta = (id: string, over = {}) => {
   const [type, slug] = id.split(".");
   return { id, type, slug, title: `Title ${slug}`, summary: `Summary ${slug}`, tags: [], difficulty: null, level: null, access: "free", ...over };
};

const BODY = "Intro prose.\n\n## First section\n\nText with [RAG](ref:knowledge.rag).\n\n### A subsection\n\nMore.\n\n## Second section\n\nEnd.";
const HEADINGS = [
   { id: "first-section", level: 2, text: "First section" },
   { id: "a-subsection", level: 3, text: "A subsection" },
   { id: "second-section", level: 2, text: "Second section" },
];
const LESSON = {
   ...meta("lesson.item", { title: "Synthetic Lesson", summary: "Synthetic summary.", level: "intermediate", difficulty: "easy" }),
   category: null,
   body: { format: "markdown@1", text: BODY },
   headings: HEADINGS,
   sections: [],
   sections_withheld: false,
};
const HOME = {
   id: "track.home",
   slug: "home",
   title: "Home Track",
   summary: "",
   modules: [{ key: "m1", title: "First Module", position: 0, items: [entry("lesson.before"), entry("lesson.item"), entry("lesson.after", { access: "premium" })] }],
};
const RELATIONS = {
   applies: [meta("knowledge.rag", { summary: "RAG summary" })],
   prerequisite: [meta("knowledge.base"), meta("lesson.first")],
   prerequisite_of: [meta("problem.one", { difficulty: "medium" }), meta("problem.two", { access: "premium" }), meta("problem.three")],
   related: [meta("knowledge.rag"), meta("problem.four"), meta("lesson.sibling")],
};
const RELATED = { id: "lesson.item", relations: RELATIONS, placements: [{ track: "home", module: "m1", position: 1, primary: true }] };

const show = async (slug = "item", type: "lesson" | "knowledge" | "problem" = "lesson") => render(await CatalogItemPage({ type, slug }));
const heading = (name: string, level?: number) => screen.getByRole("heading", { name, ...(level ? { level } : {}) });
/** Ids on body headings; the page's own group ids contain `_`, which a heading slug cannot. */
const bodyHeadingIds = () => [...document.querySelectorAll("h1[id], h2[id], h3[id], h4[id]")].map((element) => element.id).filter((id) => !id.includes("_"));
const before = (a: Element, b: Element) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

beforeEach(() => {
   vi.clearAllMocks();
   getCatalogItem.mockResolvedValue({ status: "ok", data: LESSON });
   getCatalogItemMeta.mockResolvedValue({ status: "ok", data: LESSON });
   getCatalogRelated.mockResolvedValue({ status: "ok", data: RELATED });
   getCatalogTrack.mockImplementation(async (slug: string) => (slug === "home" ? { status: "ok", data: HOME } : { status: "notFound" }));
});

describe("a readable Lesson", () => {
   it("has exactly one h1, then ordered h2/h3 headings from the body", async () => {
      await show();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(heading("Synthetic Lesson", 1)).toBeInTheDocument();
      expect(heading("First section", 2)).toHaveAttribute("id", "first-section");
      expect(heading("A subsection", 3)).toHaveAttribute("id", "a-subsection");
      expect(heading("Second section", 2)).toHaveAttribute("id", "second-section");
   });

   it("leads with where it sits, its title, its summary and one quiet metadata line", async () => {
      await show();
      const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
      expect(crumbs).toHaveTextContent(/Learn\s*\/\s*Home Track\s*\/\s*First Module/);
      expect(screen.getByText("Synthetic summary.")).toBeInTheDocument();
      expect(screen.getByText("Intermediate").closest("p")).toHaveTextContent(/Level: Intermediate\s*·\s*Difficulty: Easy/);
      before(crumbs, heading("Synthetic Lesson", 1));
   });

   it("lists headings in contents, linking the API's ids, for both the sticky column and the disclosure", async () => {
      await show();
      for (const nav of screen.getAllByRole("navigation", { name: "Contents" })) {
         expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["#first-section", "#a-subsection", "#second-section"]);
      }
      expect(screen.getByRole("button", { name: "Contents" })).toHaveAttribute("aria-expanded", "false");
   });

   it("reads in the intended order: prerequisites, contents, body, Knowledge, Practice, Problems, steps", async () => {
      await show();
      const sequence = [
         heading("Synthetic Lesson", 1),
         heading("Prerequisites", 2),
         screen.getByRole("button", { name: "Contents" }),
         heading("First section", 2),
         heading("Related Knowledge", 2),
         heading("Ready to apply this?", 2),
         heading("Related Problems", 2),
         screen.getByRole("navigation", { name: "Previous and next in Home Track" }),
         screen.getByRole("navigation", { name: "Module: First Module" }),
      ];
      for (const [a, b] of sequence.slice(1).map((el, i) => [sequence[i], el] as const)) before(a, b);
   });

   it("lays out two columns from lg with contents, in a hidden-below-lg sidebar", async () => {
      const { container } = await show();
      expect(container.querySelector("main > div")).toHaveClass("lg:grid", "lg:justify-center");
      expect(screen.getAllByRole("navigation", { name: "Contents" })[1]).toHaveClass("hidden", "lg:block", "sticky");
   });

   it("renders Knowledge references quietly and canonically inside the body", async () => {
      await show();
      const ref = within(document.body).getAllByRole("link", { name: "RAG" })[0];
      expect(ref).toHaveAttribute("href", "/knowledge/rag");
      expect(ref).toHaveAttribute("data-reference", "knowledge");
   });
});

describe("a Lesson's relations", () => {
   it("shows prerequisites near the top, type-aware, in the API's order", async () => {
      await show();
      const group = screen.getByRole("region", { name: "Prerequisites" });
      expect(within(group).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
         ["Title base", "/knowledge/base"],
         ["Title first", "/lessons/first"],
      ]);
   });

   it("shows Related Knowledge from `applies` and `related`, once each, with no prerequisite repeated", async () => {
      await show();
      const group = screen.getByRole("region", { name: "Related Knowledge" });
      expect(within(group).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/knowledge/rag"]);
      expect(within(group).getByText("RAG summary")).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Related Lessons" })).toHaveTextContent("Title sibling");
   });

   it("makes one strong Practice transition of at most two `prerequisite_of` Problems, in the API's order", async () => {
      await show();
      const practice = screen.getByRole("region", { name: "Ready to apply this?" });
      expect(within(practice).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/problems/one", "/problems/two"]);
      expect(within(practice).getByText("Premium")).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { name: "Ready to apply this?" })).toHaveLength(1);
   });

   it("keeps other Problems quiet, below, and never in both places", async () => {
      await show();
      const quiet = screen.getByRole("region", { name: "Related Problems" });
      expect(within(quiet).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/problems/three", "/problems/four"]);
      const all = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
      for (const href of ["/problems/one", "/problems/two", "/problems/three", "/problems/four"]) {
         expect(all.filter((candidate) => candidate === href), href).toHaveLength(1);
      }
   });

   it("never prefetches a catalog link outside the header, so the page reads nothing it did not render", async () => {
      await show();
      const links = within(document.querySelector("main")!).getAllByRole("link").filter((link) => link.getAttribute("href")!.startsWith("/") && !link.getAttribute("href")!.startsWith("#"));
      expect(links.length).toBeGreaterThan(10);
      for (const link of links) expect(link, link.getAttribute("href")!).toHaveAttribute("data-prefetch", "false");
   });

   it("renders no group, heading or divider for a Lesson with no relations", async () => {
      getCatalogRelated.mockResolvedValue({ status: "ok", data: { ...RELATED, relations: {}, placements: [] } });
      await show();
      for (const name of ["Prerequisites", "Related Knowledge", "Related Lessons", "Ready to apply this?", "Related Problems"]) {
         expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
      }
      expect(heading("First section", 2)).toBeInTheDocument();
      // what remains of an empty zone is a wrapper that hides itself, so no margin or divider shows
      for (const empty of document.querySelectorAll("main div:empty")) expect(empty).toHaveClass("empty:hidden");
   });

   it("renders only the groups it has", async () => {
      getCatalogRelated.mockResolvedValue({ status: "ok", data: { ...RELATED, relations: { related: [meta("problem.only")] } } });
      await show();
      expect(heading("Related Problems", 2)).toBeInTheDocument();
      for (const name of ["Prerequisites", "Related Knowledge", "Ready to apply this?"]) {
         expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
      }
   });
});

describe("a Lesson's curriculum", () => {
   it("keeps previous/next in the home Track's order, ahead of the module list", async () => {
      await show();
      expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute("href", "/lessons/before");
      const next = screen.getByRole("link", { name: /Next/ });
      expect(next).toHaveAttribute("href", "/lessons/after");
      expect(next).toHaveTextContent("Premium");
      expect(within(screen.getByRole("navigation", { name: "Module: First Module" })).getByRole("link", { name: "Title item" })).toHaveAttribute("aria-current", "page");
   });

   it("is a type-based route for every link except the Learn index", async () => {
      await show();
      for (const href of screen.getAllByRole("link").map((link) => link.getAttribute("href")!).filter((href) => !href.startsWith("#") && href !== "/tracks")) {
         expect(href).toMatch(/^\/(lessons|problems|knowledge|tracks)\/[a-z0-9]+(-[a-z0-9]+)*$/);
      }
   });

   it("fetches the item once, its relations once and Tracks only; no other item's body", async () => {
      await show();
      expect(getCatalogItem).toHaveBeenCalledExactlyOnceWith("lesson", "item");
      expect(getCatalogRelated).toHaveBeenCalledExactlyOnceWith("lesson", "item");
      expect(getCatalogItemMeta).not.toHaveBeenCalled();
      expect(getCatalogTrack.mock.calls.map(([slug]) => slug)).toEqual(["home"]);
   });

   it("still reads when relationships are unavailable: body and contents, nothing invented", async () => {
      getCatalogRelated.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      await show();
      expect(heading("First section", 2)).toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Previous|Next/ })).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(/upstream|unavailable/i);
   });
});

describe("contents are only offered when they can work", () => {
   const withHeadings = (text: string, headings: unknown[]) =>
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...LESSON, body: { format: "markdown@1", text }, headings } });

   it("is absent below two h2/h3 headings, and the page is a single reading column", async () => {
      withHeadings("## Only\n\nText.", [{ id: "only", level: 2, text: "Only" }]);
      const { container } = await show();
      expect(screen.queryByRole("navigation", { name: "Contents" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Contents" })).not.toBeInTheDocument();
      expect(container.querySelector("main > div")).toHaveClass("max-w-reading");
      expect(container.querySelector("main > div")).not.toHaveClass("lg:grid");
   });

   it("is absent when the API's headings do not match the rendered ones, so no link points nowhere", async () => {
      withHeadings("## One\n\n## Two", [{ id: "one", level: 2, text: "One" }]);
      await show();
      expect(screen.queryByRole("navigation", { name: "Contents" })).not.toBeInTheDocument();
      expect(bodyHeadingIds()).toEqual([]);
   });

   it("is absent for duplicate ids rather than rewriting them", async () => {
      withHeadings("## A\n\n## B", [{ id: "x", level: 2, text: "A" }, { id: "x", level: 2, text: "B" }]);
      await show();
      expect(screen.queryByRole("navigation", { name: "Contents" })).not.toBeInTheDocument();
      expect(bodyHeadingIds()).toEqual([]);
   });
});

describe("a locked Lesson", () => {
   it.each(["unauthenticated", "unentitled"] as const)("shows only public metadata and a notice to a %s reader", async (status) => {
      getCatalogItem.mockResolvedValue({ status });
      getCatalogItemMeta.mockResolvedValue({ status: "ok", data: { ...LESSON, access: "premium" } });
      await show();

      expect(heading("Synthetic Lesson", 1)).toBeInTheDocument();
      expect(screen.getByText("Synthetic summary.")).toBeInTheDocument();
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByText("Premium")).toBeInTheDocument();

      expect(screen.queryByText(/Intro prose/)).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Contents" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /First section|Prerequisites|Related|Ready to apply/ })).not.toBeInTheDocument();
      expect(document.querySelectorAll("[id]")).toHaveLength(0);
      expect(getCatalogRelated).not.toHaveBeenCalled();
      expect(getCatalogTrack).not.toHaveBeenCalled();
   });
});

describe("other item pages keep their own contract", () => {
   const KNOWLEDGE = { ...meta("knowledge.rag"), category: "concept", body: null, headings: [], sections: [{ id: "definition", type: "definition", title: "Definition", body: { format: "markdown@1", text: "A [Lesson](ref:lesson.x) ref and\n\n## Inner\n\ntext" } }], sections_withheld: false };

   const open = async (type: "knowledge" | "problem", item: typeof KNOWLEDGE) => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: item });
      getCatalogRelated.mockResolvedValue({ status: "ok", data: { id: item.id, relations: RELATIONS, placements: RELATED.placements } });
      getCatalogTrack.mockResolvedValue({ status: "ok", data: { ...HOME, modules: [{ ...HOME.modules[0], items: [entry("lesson.before"), entry(item.id)] }] } });
      await show(item.slug, type);
   };

   it("a problem page has its own Practice breadcrumb and phases, and no Lesson breadcrumb, contents or Practice transition", async () => {
      await open("problem", { ...KNOWLEDGE, ...meta("problem.rag"), category: "system_design" });

      expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Practice");
      expect(screen.getByRole("navigation", { name: "Breadcrumb" })).not.toHaveTextContent("Learn");
      expect(screen.queryByRole("navigation", { name: "Track context" })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Related content" })).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Contents" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Ready to apply this?" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Lesson" })).not.toHaveAttribute("data-reference");
      expect(document.querySelector("section#definition")!.querySelectorAll("[id], [tabindex]")).toHaveLength(0);
   });

   it("a knowledge page has its own Knowledge breadcrumb and no Lesson or Track chrome, Practice transition or reading mode", async () => {
      await open("knowledge", { ...KNOWLEDGE });

      expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Knowledge");
      expect(screen.queryByRole("navigation", { name: "Track context" })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Related content" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Ready to apply this?" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Lesson" })).not.toHaveAttribute("data-reference");
      expect(document.querySelector("section#definition")!.querySelectorAll("[id], [tabindex]")).toHaveLength(0);
   });
});
