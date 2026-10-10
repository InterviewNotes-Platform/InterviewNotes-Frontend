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
const section = (id: string, type: string, title: string | null, position: string | null = null, text = `Text of ${id}.`) => ({
   id,
   type,
   title,
   spine_position: position,
   body: { format: "markdown@1", text },
});
const stage = (position: string, withheld = false) => ({ position, kind: "interview_stage", withheld });
const surface = (position: string) => ({ position, kind: "review_surface", withheld: null });

// Authored out of spine order on purpose: the page follows `spine`, then role groups, then authored order.
const ML_SECTIONS = [
   section("reference", "reference_design", "Reference design", "reference_solution"),
   section("prompt", "prompt", "Prompt", "frame"),
   section("clarify", "scope_clarification", "Scope", "frame"),
   section("question", "clarification", "How fresh must features be?", "frame"),
   section("hint-frame", "hint", null, "frame"),
   section("requirements", "functional_requirements", "Functional requirements", "requirements"),
   section("hint-requirements", "hint", null, "requirements"),
   section("objective", "ml_objective", "Objective", "ml_reasoning"),
   section("features", "features", "Features", "ml_reasoning"),
   section("evaluation", "evaluation", "Evaluation", "evaluate_and_scale"),
   section("scaling", "production_scaling", "Scaling", "evaluate_and_scale"),
   section("deep-two", "deep_dive", "Deep dive: caching", "depth_and_trade_offs"),
   section("deep-one", "deep_dive", "Deep dive: skew", "depth_and_trade_offs"),
   section("trade-offs", "trade_offs", null, "depth_and_trade_offs"),
   section("follow-up", "follow_ups", "What if traffic doubles?", "follow_ups"),
   section("alternative", "alternative", "Two-tower retrieval", "reference_solution"),
   section("mistakes", "common_mistakes", "Common mistakes", "self_review"),
   section("levels", "level_expectations", "Expectations by seniority", "self_review"),
   section("rubric", "rubric_dimension", "ML formulation", "self_review"),
   section("extra", "mystery_type", "Extra material"),
];
const ML_SPINE = [
   stage("frame"),
   stage("requirements"),
   stage("ml_reasoning"),
   stage("evaluate_and_scale"),
   stage("depth_and_trade_offs"),
   stage("follow_ups"),
   surface("reference_solution"),
   surface("self_review"),
];
const STAGES = ["Frame", "Requirements", "ML Reasoning", "Evaluate & Scale", "Depth & Trade-offs", "Follow-ups"];
const SURFACES = ["Reference Solution", "Self-review"];
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
   spine: ML_SPINE,
};
const HOME = {
   id: "track.home",
   slug: "home",
   title: "Home Track",
   summary: "",
   modules: [{ key: "m1", title: "First Module", position: 0, items: [entry("lesson.before"), entry("problem.rank"), entry("problem.after", { access: "premium" }), entry("lesson.after", { access: "premium" })] }],
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

const region = (name: string) => main().getByRole("region", { name });
const controls = (scope: HTMLElement) => [...scope.querySelectorAll("summary")].map((summary) => summary.textContent);
const revealOf = (text: string) => main().getByText(text).closest("details");

describe("a readable ML Problem, challenge-first (S-CHL-1, S-AX-1)", () => {
   it("has one h1, then each shown stage and surface as an h2 in spine order, whatever the authored order", async () => {
      await show();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1, name: "Synthetic Ranking" })).toBeInTheDocument();
      expect(headings(2)).toEqual([
         "Before you start",
         "Phases", // the mobile disclosure's own heading, as on a Lesson
         ...STAGES,
         ...SURFACES,
         "More material",
         "Related Knowledge",
         "Related Problems",
         "Related Lessons",
         "In this module: First Module", // the Track navigation, as on a Lesson
      ]);
   });

   it("groups the stages under Interview and the surfaces under Review, each a labelled region", async () => {
      await show();
      const interview = within(region("Interview"));
      for (const name of STAGES) expect(interview.getByRole("region", { name })).toBeInTheDocument();
      for (const name of SURFACES) expect(interview.queryByRole("region", { name })).not.toBeInTheDocument();
      const review = within(region("Review"));
      expect(review.getByText("After the interview: study one strong approach, then review your reasoning.")).toBeInTheDocument();
      for (const name of SURFACES) expect(review.getByRole("region", { name })).toBeInTheDocument();
      expect(main().queryByRole("region", { name: "Design" })).not.toBeInTheDocument();
   });

   it("cues each interview stage, counting only the shown ones, and never a review surface", async () => {
      await show();
      expect(main().getAllByText(/^Step \d of \d$/).map((cue) => cue.textContent)).toEqual(STAGES.map((_, index) => `Step ${index + 1} of 6`));
      for (const [index, name] of STAGES.entries()) expect(within(region(name)).getByText(`Step ${index + 1} of 6`)).toBeInTheDocument();
      for (const name of SURFACES) expect(within(region(name)).queryByText(/^Step/)).not.toBeInTheDocument();
      expect(within(region("Frame")).getByText(/^Understand the situation before you solve it/)).toBeInTheDocument();
      expect(within(region("Self-review")).getByText(/^Compare your reasoning with what interviewers look for/)).toBeInTheDocument();
   });

   it("opens only the challenge, under 'The challenge'; every other released section is in the page behind a closed reveal", async () => {
      await show();
      const frame = within(region("Frame"));
      expect(frame.getByRole("heading", { level: 3, name: "The challenge" })).toBeInTheDocument();
      expect(revealOf("Text of prompt.")).toBeNull();
      expect(document.querySelectorAll("main details[open]")).toHaveLength(0);
      for (const { id } of ML_SECTIONS.filter(({ type }) => type !== "prompt")) {
         const reveal = revealOf(`Text of ${id}.`);
         expect(reveal, id).not.toBeNull();
         expect(reveal, id).not.toHaveAttribute("open");
      }
   });

   it("labels every closed control with what it shows and where, and never with a count", async () => {
      await show();
      expect(controls(region("Frame"))).toEqual([
         "Show a hint for Frame",
         "Compare with a strong candidate's questions",
         "Show the interviewer's answer: How fresh must features be?",
         "Show how the reference frames the problem",
      ]);
      expect(controls(region("Requirements"))).toEqual(["Show a hint for Requirements", "Show reference for Requirements"]);
      expect(controls(region("ML Reasoning"))).toEqual(["Show reference for ML Reasoning"]);
      expect(controls(region("Depth & Trade-offs"))).toEqual([
         "Compare with the topics the reference goes deep on",
         "Show reference: Deep dive: caching",
         "Show reference: Deep dive: skew",
         "Show reference: Trade-offs",
      ]);
      expect(controls(region("Follow-ups"))).toEqual(["Show the follow-up questions", "Show reference: What if traffic doubles?"]);
      expect(controls(region("Reference Solution"))).toEqual(["Show the reference solution", "Show reference: Two-tower retrieval"]);
      expect(controls(region("Self-review"))).toEqual(["Open self-review", "Show reference: ML formulation", "Show common mistakes"]);
      expect([...controls(region("Interview")), ...controls(region("Review"))].join(" ")).not.toMatch(/\d/);
   });

   it("shows a stage's reference together, each section under its own h3, and a hint control quieter, before it", async () => {
      await show();
      const ml = revealOf("Text of objective.")!;
      expect(within(ml).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Objective", "Features"]);
      expect(revealOf("Text of features.")).toBe(ml);
      const [hint, reference] = region("Requirements").querySelectorAll(":scope > details");
      expect(hint).toContainElement(main().getByText("Text of hint-requirements."));
      expect(reference).toContainElement(main().getByText("Text of requirements."));
      expect(hint.querySelector("summary")).toHaveClass("text-muted-foreground");
      expect(reference.querySelector("summary")).not.toHaveClass("text-muted-foreground");
   });

   it("lists units by heading first, in authored order, each heading outside its own closed reveal", async () => {
      await show();
      const list = region("Depth & Trade-offs").querySelector(":scope > details")!;
      expect(within(list as HTMLElement).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Deep dive: caching", "Deep dive: skew", "Trade-offs"]);
      for (const id of ["deep-two", "deep-one", "trade-offs"]) {
         const heading = document.getElementById(id)!;
         expect(heading.tagName).toBe("H3");
         expect(heading.nextElementSibling!.tagName).toBe("DETAILS");
         expect(heading.nextElementSibling).toContainElement(main().getByText(`Text of ${id}.`));
         expect(heading.nextElementSibling).not.toContainElement(heading);
      }
      expect(revealOf("Text of deep-two.")).not.toBe(revealOf("Text of deep-one."));
   });

   it("puts the review material behind each surface's one control, with labelled groups as h3 and their units as h4", async () => {
      await show();
      const solution = region("Reference Solution").querySelector(":scope > details")!;
      expect([...solution.querySelectorAll("h3, h4")].map((h) => `${h.tagName} ${h.textContent}`)).toEqual([
         "H3 Reference design",
         "H3 Alternatives",
         "H4 Two-tower retrieval",
      ]);
      const review = region("Self-review").querySelector(":scope > details")!;
      expect([...review.querySelectorAll("h3, h4")].map((h) => `${h.tagName} ${h.textContent}`)).toEqual([
         "H3 Expectations by seniority",
         "H3 Rubric",
         "H4 ML formulation",
         "H3 Common mistakes",
      ]);
      expect(revealOf("Text of levels.")).toBe(review);
      for (const { id } of ML_SECTIONS) expect(document.querySelectorAll(`main [id="${id}"]`), id).toHaveLength(1); // every released section is an anchor
      expect(revealOf("Text of mistakes.")!.parentElement!.closest("details")).toBe(review);
   });

   it("never puts a heading inside a control, and never skips a heading level", async () => {
      await show();
      expect(document.querySelectorAll("summary :is(h1, h2, h3, h4, h5, h6)")).toHaveLength(0);
      const levels = [...document.querySelectorAll("main :is(h1, h2, h3, h4, h5, h6)")].map((h) => Number(h.tagName[1]));
      levels.forEach((level, index) => expect(level, `heading ${index}`).toBeLessThanOrEqual(index === 0 ? 1 : levels[index - 1] + 1));
   });

   it("puts a section with no position after the review surfaces, closed under 'More material', never counted", async () => {
      await show();
      const more = region("More material");
      expect(controls(more)).toEqual(["Show more material"]);
      expect(within(more).getByRole("heading", { level: 3, name: "Extra material" })).toBeInTheDocument();
      expect(region("Review").compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(more).queryByText(/^Step/)).not.toBeInTheDocument();
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
      const sections = [section("prompt", "prompt", "Prompt", "frame", "See [Embeddings](ref:knowledge.embeddings) and [the lesson](ref:lesson.basics).")];
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, sections, spine: [stage("frame")] } });
      await show();
      const prompt = document.getElementById("prompt")!;
      const [knowledge, lesson] = within(prompt).getAllByRole("link");
      expect(knowledge).toHaveAttribute("data-reference", "knowledge");
      expect(lesson).not.toHaveAttribute("data-reference");
      for (const link of [knowledge, lesson]) expect(link).toHaveAttribute("data-prefetch", "false");
   });

   it("gives a stage-reference section no id or tab stop of its own beyond the section element", async () => {
      await show();
      expect(document.getElementById("clarify")!.querySelectorAll("[id], [tabindex]")).toHaveLength(0);
   });

   it("renders authored headings below the heading that contains them, capped at h6 (S-AX-2)", async () => {
      const sections = [
         section("prompt", "prompt", "Prompt", "frame", "# Context\n\nThe challenge body."),
         section("hld", "high_level_design", "High-level design", "design", "## Request path\n\n### Cache\n\nBody."),
         section("deep", "deep_dive", "Deep dive", "depth_and_trade_offs", "# Inside a unit\n\nBody."),
         section("alt", "alternative", "Alternative", "reference_solution", "## Deep in an alternative\n\nBody."),
      ];
      const spine = [stage("frame"), stage("design"), stage("depth_and_trade_offs"), surface("reference_solution")];
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, sections, spine } });
      await show();
      const level = (name: string) => Number(main().getByText(name).tagName[1]);
      expect(level("Context")).toBe(4); // under h3 "The challenge"
      expect(level("Request path")).toBe(5); // under the h3 section heading
      expect(level("Cache")).toBe(6);
      expect(level("Inside a unit")).toBe(4); // under the h3 unit heading
      expect(level("Deep in an alternative")).toBe(6); // under an h4 unit: 2 + 4, capped
   });
});

describe("a Problem with only today's section types (S-CMP-3, AC-9)", () => {
   const TODAY = [
      section("prompt", "prompt", "Prompt", "frame"),
      section("functional", "functional_requirements", "Functional requirements", "requirements"),
      section("hld", "high_level_design", "High-level design", "design"),
      section("reference", "reference_design", "Reference design", "reference_solution"),
   ];

   it("renders finished: Frame with the challenge, Requirements, Design and Reference Solution, and nothing else", async () => {
      const spine = [stage("frame"), stage("requirements"), stage("design"), surface("reference_solution")];
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, category: "system_design", sections: TODAY, spine } });
      await show();
      expect(within(region("Interview")).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Frame", "Requirements", "Design"]);
      expect(within(region("Review")).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Reference Solution"]);
      expect(main().getAllByText(/^Step \d of \d$/).map((cue) => cue.textContent)).toEqual(["Step 1 of 3", "Step 2 of 3", "Step 3 of 3"]);
      expect(main().queryByRole("region", { name: "More material" })).not.toBeInTheDocument();
      expect(main().queryByRole("region", { name: "Self-review" })).not.toBeInTheDocument();
      expect(main().queryByText(/^(Show a hint|Rubric|Compare with|The challenge is)/)).not.toBeInTheDocument();
      expect(within(region("Frame")).getByRole("heading", { level: 3, name: "The challenge" })).toBeInTheDocument();
      expect([...controls(region("Interview")), ...controls(region("Review"))]).toEqual(["Show reference for Requirements", "Show reference for Design", "Show the reference solution"]);
      expect(main().getByText("System design")).toBeInTheDocument();
   });
});

describe("withheld material (S-ENT-1, S-ENT-1a, S-SPN-12)", () => {
   const sections = [
      section("prompt", "prompt", "Prompt", "frame"),
      section("functional", "functional_requirements", "Functional requirements", "requirements"),
      section("hint-design", "hint", null, "design"),
      section("alternative", "alternative", "Released alternative", "reference_solution"),
   ];
   // Requirements is partly withheld, Design too (only a free hint is released there), Evaluate & Scale and Self-review wholly.
   const spine = [stage("frame"), stage("requirements", true), stage("design", true), stage("evaluate_and_scale", true), surface("reference_solution")];
   const withheld = { ...PROBLEM, category: "system_design", sections, spine, sections_withheld: true };

   it("says so once, before the Interview group, naming nothing that was withheld", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: withheld });
      await show();
      const notes = screen.getAllByRole("note");
      expect(notes).toHaveLength(1);
      expect(notes[0]).toHaveTextContent(/^Some material for this Problem is included with full access\.$/);
      expect(notes[0].compareDocumentPosition(region("Interview")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
   });

   it("keeps a wholly withheld interview stage with only safe metadata, and counts it", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: withheld });
      await show();
      expect(main().getAllByText(/^Step \d of \d$/).map((cue) => cue.textContent)).toEqual(["Step 1 of 4", "Step 2 of 4", "Step 3 of 4", "Step 4 of 4"]);
      const scale = region("Evaluate & Scale");
      expect(scale).toHaveTextContent(/^Step 4 of 4Evaluate & ScaleShow how you would know it works.*PremiumThe material for this stage is included with full access\.$/);
      expect(scale.querySelectorAll("details")).toHaveLength(0);
   });

   it("reads a withheld stage whose only released material is a hint as partly withheld, and keeps the hint (X-1)", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: withheld });
      await show();
      const design = region("Design");
      expect(within(design).getByText("Some material in this stage is included with full access.")).toBeInTheDocument();
      expect(within(design).queryByText("The material for this stage is included with full access.")).not.toBeInTheDocument();
      expect(controls(design)).toEqual(["Show a hint for Design"]);
   });

   it("marks a partly withheld stage after its intent and still offers its released reference", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: withheld });
      await show();
      const requirements = region("Requirements");
      const line = within(requirements).getByText("Some material in this stage is included with full access.");
      expect(within(line.parentElement!).getByText("Premium")).toBeInTheDocument();
      const intent = within(requirements).getByText(/^Say what the system must do/);
      expect(intent.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(controls(requirements)).toEqual(["Show reference for Requirements"]);
      expect(within(region("Frame")).queryByText(/included with full access/)).not.toBeInTheDocument();
   });

   it("shows a partly withheld review surface's released material with no indication, and no wholly withheld surface", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: withheld });
      await show();
      const solution = region("Reference Solution");
      expect(controls(solution)).toEqual(["Show the alternatives", "Show reference: Released alternative"]);
      expect(within(solution).queryByText(/included with full access|Premium/)).not.toBeInTheDocument();
      expect(main().queryByRole("region", { name: "Self-review" })).not.toBeInTheDocument();
   });

   it("shows no note and no indication when nothing was withheld", async () => {
      await show();
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
      expect(main().queryByText(/included with full access/)).not.toBeInTheDocument();
   });

   it("still says so, once, when every section was withheld", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, sections: [], spine: [], sections_withheld: true } });
      await show();
      expect(screen.getAllByRole("note")).toHaveLength(1);
      expect(screen.queryByRole("navigation", { name: "Phases" })).not.toBeInTheDocument();
   });
});

describe("material the frontend cannot place (S-SPN-13)", () => {
   it("reads an unknown type in a known position as closed stage reference, titled or 'Additional material'", async () => {
      const sections = [section("prompt", "prompt", "Prompt", "frame"), section("future", "p4_future_unit", null, "design"), section("named", "p4_future_unit", "Named", "design")];
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, sections, spine: [stage("frame"), stage("design")] } });
      await show();
      const design = region("Design");
      expect(controls(design)).toEqual(["Show reference for Design"]);
      expect(within(design).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Additional material", "Named"]);
      expect(main().queryByRole("region", { name: "More material" })).not.toBeInTheDocument();
   });

   it("puts an unknown position after the review surfaces, drops an unplaceable hint, and lists no unknown spine entry", async () => {
      const sections = [
         section("prompt", "prompt", "Prompt", "frame"),
         section("zone", "p4_future_unit", null, "p4_future_zone"),
         section("hint-zone", "hint", null, "p4_future_zone"),
         section("reference", "reference_design", "Reference design", "reference_solution"),
      ];
      const spine = [stage("frame"), stage("p4_future_zone"), surface("reference_solution")];
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, sections, spine } });
      await show();
      expect(main().getAllByText(/^Step \d of \d$/).map((cue) => cue.textContent)).toEqual(["Step 1 of 1"]);
      const more = region("More material");
      expect(within(more).getByRole("heading", { level: 3, name: "Additional material" })).toBeInTheDocument();
      expect(revealOf("Text of zone.")).not.toHaveAttribute("open");
      expect(main().queryByText("Text of hint-zone.")).not.toBeInTheDocument();
      expect(region("Review").compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
   });

   it("reads a Problem from a backend with no spine as closed 'More material' only: no stage, no step, no open challenge", async () => {
      const sections = ML_SECTIONS.map(({ id, type, title, body }) => ({ id, type, title, body }));
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, sections, spine: undefined } });
      await show();
      expect(main().queryByRole("region", { name: "Interview" })).not.toBeInTheDocument();
      expect(main().queryByText(/^Step/)).not.toBeInTheDocument();
      expect(main().queryByText("The challenge")).not.toBeInTheDocument();
      expect(revealOf("Text of prompt.")).not.toHaveAttribute("open");
      expect(main().queryByText("Text of hint-frame.")).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Phases" })).not.toBeInTheDocument();
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

describe("stage navigation (P2 outline until T12)", () => {
   const desktop = () => screen.getAllByRole("navigation", { name: "Phases" })[1];
   const mobile = () => screen.getAllByRole("navigation", { name: "Phases" })[0];

   it("lists the stages and surfaces that are shown, as links to them, in a labelled navigation on desktop", async () => {
      await show();
      const links = within(desktop()).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual([...STAGES, ...SURFACES, "More material"]);
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
      expect(within(mobile()).getAllByRole("link")).toHaveLength(9);
   });

   it("moves focus to the stage it was asked for", async () => {
      await show();
      fireEvent.click(within(desktop()).getByRole("link", { name: "Evaluate & Scale" }));
      expect(document.getElementById("problem_evaluate_and_scale")).toHaveFocus();
   });

   it("is left out when there is only one stage to show", async () => {
      getCatalogItem.mockResolvedValue({ status: "ok", data: { ...PROBLEM, sections: [section("prompt", "prompt", "Prompt", "frame")], spine: [stage("frame")] } });
      await show();
      expect(screen.queryByRole("navigation", { name: "Phases" })).not.toBeInTheDocument();
      expect(screen.getByText("Text of prompt.")).toBeInTheDocument();
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
      expect(within(steps).getByRole("link", { name: "Previous lesson: Title before" })).toHaveAttribute("href", "/lessons/before");
      expect(within(steps).getByRole("link", { name: "Next lesson: Title after, premium" })).toHaveAttribute("href", "/lessons/after");
      expect(within(steps).getAllByRole("link")).toHaveLength(2);
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
