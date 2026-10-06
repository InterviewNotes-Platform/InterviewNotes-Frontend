import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
   return { id, type, slug, title: `Title ${slug}`, summary: `Summary ${slug}`, tags: [], category: null, difficulty: null, level: null, access: "free", ...over };
};
const section = (id: string, type: string, title: string | null, text = `Text of ${id}.`) => ({ id, type, title, body: { format: "markdown@1", text } });

const ML_SECTIONS = [
   section("prompt", "prompt", "Prompt"),
   section("clarify", "scope_clarification", "Scope"),
   section("requirements", "functional_requirements", "Functional requirements"),
   section("objective", "ml_objective", "Objective"),
   section("features", "features", "Features"),
   section("evaluation", "evaluation", "Evaluation"),
   section("scaling", "production_scaling", "Scaling"),
   section("deep-two", "deep_dive", "Deep dive: caching"),
   section("deep-one", "deep_dive", "Deep dive: skew"),
   section("trade-offs", "trade_offs", "Trade-offs"),
   section("extra", "mystery_type", "Extra material"),
];
const PROBLEM = {
   ...meta("problem.rank", {
      title: "Synthetic Ranking",
      summary: "Rank things.",
      difficulty: "hard",
      level: "advanced",
      category: "ml_system_design",
      tags: ["ranking", "evaluation"],
   }),
   body: null,
   headings: [],
   sections: ML_SECTIONS,
   sections_withheld: false,
};
const HOME = {
   id: "track.home",
   slug: "home",
   title: "Home Track",
   summary: "",
   modules: [{ key: "m1", title: "First Module", position: 0, items: [entry("lesson.before"), entry("problem.rank"), entry("problem.after", { access: "premium" })] }],
};
const RELATIONS = {
   prerequisite: [meta("lesson.basics"), meta("knowledge.embeddings", { access: "premium" })],
   applies: [meta("knowledge.attention")],
   related: [meta("problem.sibling"), meta("knowledge.other", { summary: "Other summary" }), meta("lesson.deep")],
};
const RELATED = { id: "problem.rank", relations: RELATIONS, placements: [{ track: "home", module: "m1", position: 1, primary: true }] };

const show = async () => render(await CatalogItemPage({ type: "problem", slug: "rank" }));
const main = () => within(document.querySelector("main")!);
const headings = (level: number) => main().getAllByRole("heading", { level }).map((h) => h.textContent);

beforeEach(() => {
   vi.clearAllMocks();
   getCatalogItem.mockResolvedValue({ status: "ok", data: PROBLEM });
   getCatalogItemMeta.mockResolvedValue({ status: "ok", data: PROBLEM });
   getCatalogRelated.mockResolvedValue({ status: "ok", data: RELATED });
   getCatalogTrack.mockImplementation(async (slug: string) => (slug === "home" ? { status: "ok", data: HOME } : { status: "notFound" }));
   Element.prototype.scrollIntoView = vi.fn();
});

describe("a readable ML Problem", () => {
   it("has one h1, and the Problem's sections as its h2s, with phase titles as text rather than headings", async () => {
      await show();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1, name: "Synthetic Ranking" })).toBeInTheDocument();
      expect(headings(2)).toEqual([
         "Before you start",
         "Phases", // the mobile disclosure's own heading, as on a Lesson
         "Prompt",
         "Scope",
         "Functional requirements",
         "Objective",
         "Features",
         "Evaluation",
         "Scaling",
         "Deep dive: caching",
         "Deep dive: skew",
         "Trade-offs",
         "Extra material",
         "Related Knowledge",
         "Related Problems",
         "Related Lessons",
         "In this module: First Module", // the Track navigation, as on a Lesson
      ]);
      for (const phase of ["Frame", "Requirements", "ML Reasoning", "Evaluate & Scale", "Depth & Trade-offs", "More"]) {
         expect(screen.queryByRole("heading", { name: phase })).not.toBeInTheDocument();
      }
   });

   it("sequences the phases that exist, each a labelled group with a step cue, and no Design phase it has no sections for", async () => {
      await show();
      const names = ["Frame", "Requirements", "ML Reasoning", "Evaluate & Scale", "Depth & Trade-offs", "More"];
      for (const name of names) expect(main().getByRole("region", { name })).toBeInTheDocument();
      expect(main().queryByRole("region", { name: "Design" })).not.toBeInTheDocument();
      expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
      expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
      expect(screen.getByText("Step 5 of 5")).toBeInTheDocument();
      expect(screen.queryByText(/Step \d of 6/)).not.toBeInTheDocument();
      const ml = main().getByRole("region", { name: "ML Reasoning" });
      expect(within(ml).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Objective", "Features"]);
   });

   it("keeps repeated deep_dive sections in the API's order and unknown sections under More, all present", async () => {
      await show();
      const depth = main().getByRole("region", { name: "Depth & Trade-offs" });
      expect(within(depth).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Deep dive: caching", "Deep dive: skew", "Trade-offs"]);
      const more = main().getByRole("region", { name: "More" });
      expect(within(more).getByText("Text of extra.")).toBeInTheDocument();
   });

   it("leads with difficulty and level as the prominent facts, then category, home Track and topics quietly", async () => {
      await show();
      const facts = document.querySelector("main dl")!;
      expect(within(facts as HTMLElement).getByText("Difficulty").nextElementSibling).toHaveTextContent("Hard");
      expect(within(facts as HTMLElement).getByText("Level").nextElementSibling).toHaveTextContent("Advanced");
      expect(main().getByText("ML system design")).toBeInTheDocument();
      expect(main().getByRole("link", { name: "Home Track" })).toHaveAttribute("href", "/tracks/home");
      expect(main().getByText(/ranking · evaluation/)).toBeInTheDocument();
      expect(main().getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Practice");
      expect(main().getByRole("link", { name: "Practice" })).toHaveAttribute("href", "/practice");
   });

   it("never invents a fact the API did not send", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, difficulty: null, level: null, category: null, tags: [] } });
      await show();
      expect(document.querySelector("main dl")).toBeNull();
      expect(main().queryByText(/system design/i)).not.toBeInTheDocument();
      expect(main().queryByText(/Topics/)).not.toBeInTheDocument();
   });
});

describe("technical content", () => {
   it("reads in reading mode: a Knowledge reference is set apart, and no link in a section prefetches", async () => {
      const sections = [section("prompt", "prompt", "Prompt", "See [Embeddings](ref:knowledge.embeddings) and [the lesson](ref:lesson.basics).")];
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, sections } });
      await show();
      const prompt = document.getElementById("prompt")!;
      const [knowledge, lesson] = within(prompt).getAllByRole("link");
      expect(knowledge).toHaveAttribute("data-reference", "knowledge");
      expect(lesson).not.toHaveAttribute("data-reference");
      for (const link of [knowledge, lesson]) expect(link).toHaveAttribute("data-prefetch", "false");
   });

   it("gives a section no id or tab stop of its own beyond the section element", async () => {
      await show();
      expect(document.getElementById("clarify")!.querySelectorAll("[id], [tabindex]")).toHaveLength(0);
   });
});

describe("a non-ML Problem", () => {
   it("has no ML phase and counts only the phases it has", async () => {
      const sections = [section("prompt", "prompt", "Prompt"), section("requirements", "functional_requirements", "Requirements"), section("hld", "high_level_design", "Design")];
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, category: "system_design", sections } });
      await show();
      expect(main().queryByRole("region", { name: "ML Reasoning" })).not.toBeInTheDocument();
      expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
      expect(main().queryByRole("region", { name: "More" })).not.toBeInTheDocument();
      expect(main().getByText("System design")).toBeInTheDocument();
   });
});

describe("Before you start", () => {
   it("groups the prerequisites and the applied Knowledge from the relations the page already has, never prefetched", async () => {
      await show();
      const prep = main().getByRole("region", { name: "Before you start" });
      const groups = within(prep).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
      expect(groups).toEqual(["Prerequisites", "Knowledge applied"]);
      const links = within(prep).getAllByRole("link");
      expect(links.map((link) => link.getAttribute("href"))).toEqual(["/lessons/basics", "/knowledge/embeddings", "/knowledge/attention"]);
      for (const link of links) expect(link).toHaveAttribute("data-prefetch", "false");
      expect(within(prep).getByText("Premium")).toBeInTheDocument();
      expect(getCatalogRelated).toHaveBeenCalledTimes(1);
   });

   it("renders no empty block when there is nothing to prepare with", async () => {
      getCatalogRelated.mockResolvedValue({ status: "ok", data: { ...RELATED, relations: { related: [meta("problem.sibling")] } } });
      await show();
      expect(screen.queryByText("Before you start")).not.toBeInTheDocument();
   });

   it("renders none when relations could not be loaded, and the Problem still reads", async () => {
      getCatalogRelated.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      await show();
      expect(screen.queryByText("Before you start")).not.toBeInTheDocument();
      expect(screen.getByText("Text of prompt.")).toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: /Previous and next/ })).not.toBeInTheDocument();
   });
});

describe("phase navigation", () => {
   const desktop = () => screen.getAllByRole("navigation", { name: "Phases" })[1];
   const mobile = () => screen.getAllByRole("navigation", { name: "Phases" })[0];

   it("lists the phases that exist, as links to those phases, in a labelled navigation on desktop", async () => {
      await show();
      const links = within(desktop()).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(["Frame", "Requirements", "ML Reasoning", "Evaluate & Scale", "Depth & Trade-offs", "More"]);
      for (const link of links) {
         const target = document.getElementById(link.getAttribute("href")!.slice(1))!;
         expect(target, link.textContent!).toBeInTheDocument();
         expect(target).toHaveAttribute("tabindex", "-1");
      }
   });

   it("is a collapsed, keyboard-operable disclosure on mobile", async () => {
      await show();
      const trigger = screen.getByRole("button", { name: "Phases" });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(document.getElementById(trigger.getAttribute("aria-controls")!)).toHaveAttribute("inert");
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(within(mobile()).getAllByRole("link")).toHaveLength(6);
   });

   it("moves focus to the phase it was asked for", async () => {
      await show();
      fireEvent.click(within(desktop()).getByRole("link", { name: "Evaluate & Scale" }));
      expect(document.getElementById("problem_evaluate")).toHaveFocus();
   });

   it("is left out when there is only one phase to show", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, sections: [section("prompt", "prompt", "Prompt")] } });
      await show();
      expect(screen.queryByRole("navigation", { name: "Phases" })).not.toBeInTheDocument();
      expect(screen.getByText("Text of prompt.")).toBeInTheDocument();
   });
});

describe("withheld sections", () => {
   it("shows exactly one note after the readable sections, naming nothing that was withheld", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, sections_withheld: true } });
      await show();
      const notes = screen.getAllByRole("note");
      expect(notes).toHaveLength(1);
      expect(notes[0]).toHaveTextContent("The full library includes more material for this Problem than your current access covers.");
      const last = main().getByText("Text of extra.");
      expect(last.compareDocumentPosition(notes[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(main().queryByText(/locked|reference design|solution/i)).not.toBeInTheDocument();
   });

   it("shows no note when nothing was withheld", async () => {
      await show();
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
   });

   it("still says so, once, when every section was withheld", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, sections: [], sections_withheld: true } });
      await show();
      expect(screen.getAllByRole("note")).toHaveLength(1);
      expect(screen.queryByRole("navigation", { name: "Phases" })).not.toBeInTheDocument();
   });
});

describe("a fully locked Problem", () => {
   it.each(["unauthenticated", "unentitled"] as const)("shows the public header and a notice (%s), and loads nothing else", async (status) => {
      getCatalogItem.mockResolvedValue({ status });
      await show();
      expect(screen.getByRole("heading", { level: 1, name: "Synthetic Ranking" })).toBeInTheDocument();
      expect(document.querySelector("main dl")).toHaveTextContent("Hard");
      expect(main().getByText("ML system design")).toBeInTheDocument();
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(getCatalogRelated).not.toHaveBeenCalled();
      expect(getCatalogTrack).not.toHaveBeenCalled();
      expect(screen.queryByText("Before you start")).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Phases" })).not.toBeInTheDocument();
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
      expect(screen.queryByText("Text of prompt.")).not.toBeInTheDocument();
      expect(screen.queryByText("Part of")).not.toBeInTheDocument();
   });
});

describe("what a Problem connects to", () => {
   it("ends with related Knowledge, Problems and Lessons, each once, then previous/next in the Track", async () => {
      await show();
      const knowledge = main().getByRole("region", { name: "Related Knowledge" });
      expect(within(knowledge).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/knowledge/other"]);
      expect(within(main().getByRole("region", { name: "Related Problems" })).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/problems/sibling"]);
      expect(within(main().getByRole("region", { name: "Related Lessons" })).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/lessons/deep"]);

      const steps = main().getByRole("navigation", { name: "Previous and next in Home Track" });
      expect(within(steps).getByRole("link", { name: /Title before/ })).toHaveAttribute("href", "/lessons/before");
      expect(within(steps).getByRole("link", { name: /Title after/ })).toHaveAttribute("href", "/problems/after");
      const last = main().getByRole("region", { name: "Related Lessons" });
      expect(last.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
   });

   it("does not prefetch an alternate Track either: the Track pages stay unread until a click", async () => {
      const ALT = { ...HOME, id: "track.alt", slug: "alt", title: "Alternate Track" };
      getCatalogRelated.mockResolvedValue({ status: "ok", data: { ...RELATED, placements: [...RELATED.placements, { track: "alt", module: "m1", position: 1, primary: false }] } });
      getCatalogTrack.mockImplementation(async (slug: string) => ({ status: "ok", data: slug === "alt" ? ALT : HOME }));
      await show();
      const alternate = within(main().getByRole("region", { name: "Also in these Tracks" })).getByRole("link", { name: "Alternate Track" });
      expect(alternate).toHaveAttribute("href", "/tracks/alt");
      expect(alternate).toHaveAttribute("data-prefetch", "false");
   });

   it("never prefetches a catalog link, so opening the page reads no neighbour", async () => {
      await show();
      const links = main().getAllByRole("link").filter((link) => /^\/(lessons|problems|knowledge|tracks)\//.test(link.getAttribute("href")!));
      expect(links.length).toBeGreaterThan(8);
      for (const link of links) expect(link, link.getAttribute("href")!).toHaveAttribute("data-prefetch", "false");
   });
});
