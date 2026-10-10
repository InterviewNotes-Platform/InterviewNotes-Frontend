import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));

import { composeProblem } from "@/lib/catalog/problemSpine";
import type { CatalogSection } from "@/lib/catalog/types";
import { ProblemStages } from "./ProblemStages";

const BRANCHES = "Then, depending on the answer";
const GENERIC = "Linked to material included with full access";
const EXPLANATION = "Hints nudge your thinking without giving the answer. Use as few as you need.";

const section = (id: string, type: string, position: string, title: string | null, over: Partial<CatalogSection> = {}): CatalogSection => ({
   id,
   type,
   title,
   spine_position: position,
   body: { format: "markdown@1", text: `CANARY_${id}` },
   ...over,
});
const to = (target: string) => ({ link: { target, withheld: false } });
const withheld = { link: { target: null, withheld: true } };
const hint = (id: string, position: string, target: string) => section(id, "hint", position, null, to(target));
const decision = (id: string, title: string | null = id) => section(id, "trade_offs", "depth_and_trade_offs", title);
const deepDive = (id: string, title: string | null = id) => section(id, "deep_dive", "depth_and_trade_offs", title);
const followUp = (id: string, title: string | null = id, over: Partial<CatalogSection> = {}) => section(id, "follow_ups", "follow_ups", title, over);
const alternative = (id: string, over: Partial<CatalogSection> = {}) => section(id, "alternative", "reference_solution", id, over);
const reference = section("reference", "reference_design", "reference_solution", "Reference design");

const interview = (position: string) => ({ position, kind: "interview_stage" as const, withheld: false });
const SPINE = [interview("design"), interview("depth_and_trade_offs"), interview("follow_ups"), { position: "reference_solution", kind: "review_surface" as const, withheld: null }];

function show(...sections: CatalogSection[]) {
   render(<ProblemStages composition={composeProblem({ sections, spine: SPINE })} stayOnDeployment={false} />);
}
const band = (name: string) => screen.getByRole("region", { name });
const summaries = (scope: ParentNode) => [...scope.querySelectorAll("summary")].map((summary) => summary.textContent);
/** Opens the reveal whose control reads `label` (what jsdom would not do on a native click). */
const open = (label: string) => {
   const summary = [...document.querySelectorAll("summary")].find((candidate) => candidate.textContent === label);
   if (!summary) throw new Error(`No control named "${label}"`);
   const details = summary.closest("details")!;
   details.open = true;
   return details;
};
const unit = (id: string) => document.getElementById(id)!.parentElement!;
/** A unit's block, child by child: heading, note lines, hint sequences and its own body control, in reading order. */
const anatomy = (id: string) =>
   [...unit(id).children].map((child) => (child.tagName === "DETAILS" ? `details:${child.getAttribute("data-reveal")}` : child.tagName.toLowerCase()));
const ownReveal = (id: string) => unit(id).querySelector<HTMLDetailsElement>(`:scope > details[data-reveal="${id}"]`)!;
const openIds = () => [...document.querySelectorAll<HTMLDetailsElement>("details[open]")].map((details) => details.getAttribute("data-reveal"));

describe("Depth & Trade-offs: decisions and deep dives (S-DEC-1 … 3, AC-8)", () => {
   const SECTIONS = [deepDive("dd-delivery", "Delivery guarantees"), decision("d-queue", "Queue or direct send?"), decision("d-legacy", null), deepDive("dd-order", "Ordering")];

   it("lists decisions and deep dives interleaved in authored order, an untitled decision as Trade-offs", () => {
      show(...SECTIONS);
      open("Compare with the topics the reference goes deep on");
      const depth = band("Depth & Trade-offs");
      expect(within(depth).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
         "Delivery guarantees",
         "Queue or direct send?",
         "Trade-offs",
         "Ordering",
      ]);
   });

   it("gives each unit its own closed body control that opens only itself", () => {
      show(...SECTIONS);
      const list = open("Compare with the topics the reference goes deep on");
      const controls = summaries(list).filter((text) => text?.startsWith("Show reference"));
      expect(controls).toEqual([
         "Show reference: Delivery guarantees",
         "Show reference: Queue or direct send?",
         "Show reference: Trade-offs",
         "Show reference: Ordering",
      ]);
      expect(openIds()).toHaveLength(1); // only the list
      open("Show reference: Queue or direct send?");
      expect(openIds()).toHaveLength(2);
      expect(openIds()).toContain("d-queue");
      expect(ownReveal("dd-delivery").open).toBe(false);
      expect(ownReveal("d-legacy").open).toBe(false);
   });

   it("keeps a unit's hint sequence between its heading and its body control, and opening the body opens no hint", () => {
      show(...SECTIONS, hint("h-queue", "depth_and_trade_offs", "d-queue"));
      open("Compare with the topics the reference goes deep on");
      expect(anatomy("d-queue")).toEqual(["h3", "p", expect.stringMatching(/^details:/), "details:d-queue"]);
      expect(anatomy("dd-order")).toEqual(["h3", "details:dd-order"]);
      expect(unit("d-queue").querySelector("p")).toHaveTextContent(EXPLANATION); // first sequence in presentation order
      open("Show reference: Queue or direct send?");
      expect(document.getElementById("h-queue")!.closest("details")!.open).toBe(false);
   });
});

describe("Follow-ups: probes lines, dimension, order (S-FUP-1 … 3, S-FUP-5, S-LNK-13)", () => {
   const SECTIONS = [
      section("interfaces", "interfaces", "design", "Interfaces"),
      deepDive("dd-order", "Ordering"),
      decision("d-queue", "Queue or direct send?"),
      decision("d-legacy", null),
      followUp("f-stage", "Why this API?", { ...to("interfaces"), dimension: "architecture" }),
      followUp("f-deep", "Two events race. Which wins?", to("dd-order")),
      followUp("f-decision", "Why a queue?", { ...to("d-queue"), dimension: "trade_off_reasoning" }),
      followUp("f-legacy", "What does legacy cost?", to("d-legacy")),
      followUp("f-plain", null),
      followUp("f-unknown", "Anything else?", { dimension: "a_value_the_frontend_has_no_copy_for" }),
   ];

   it("lists the top-level follow-ups in authored order, each with its own closed control, an untitled one as Follow-up", () => {
      show(...SECTIONS);
      open("Show the follow-up questions");
      const followUps = band("Follow-ups");
      expect(within(followUps).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
         "Why this API?",
         "Two events race. Which wins?",
         "Why a queue?",
         "What does legacy cost?",
         "Follow-up",
         "Anything else?",
      ]);
      expect(summaries(followUps).filter((text) => text?.startsWith("Show reference")).length).toBe(6);
      expect(openIds().length).toBe(1);
   });

   it.each([
      ["a section in a narrative stage", "f-stage", "Probes: Design"],
      ["a deep dive", "f-deep", "Probes: Ordering"],
      ["a decision", "f-decision", "Probes: Queue or direct send?"],
      ["an untitled decision", "f-legacy", "Probes: Trade-offs"],
   ])("says what a follow-up probing %s probes", (_name, id, expected) => {
      show(...SECTIONS);
      expect(unit(id).querySelector("p")).toHaveTextContent(expected);
   });

   it("shows the shared dimension label quietly, only when the follow-up has a known one, and no link line when unlinked", () => {
      show(...SECTIONS);
      expect(unit("f-stage")).toHaveTextContent("Dimension: Architecture");
      expect(unit("f-decision")).toHaveTextContent("Dimension: Trade-off reasoning");
      expect(unit("f-deep")).not.toHaveTextContent("Dimension");
      expect(unit("f-unknown")).not.toHaveTextContent("Dimension");
      expect(unit("f-unknown")).not.toHaveTextContent("a_value_the_frontend_has_no_copy_for");
      expect(anatomy("f-plain")).toEqual(["h3", "details:f-plain"]);
      expect(unit("f-stage").querySelector("button, input, select, [role=checkbox]")).toBeNull(); // not a filter, not a score
   });
});

describe("Follow-ups: branches (S-FUP-4, S-FUP-5, S-LNK-9, AC-10)", () => {
   const TREE = [
      decision("d-queue", "Queue or direct send?"),
      followUp("b-late", "Then what is replayed?", to("f-lag")), // a branch authored before its parent
      followUp("f-lag", "A provider stalls. What happens?", to("d-queue")),
      followUp("b-alert", "Who is paged?", to("f-lag")),
      followUp("f-other", "How would you test this?"),
      followUp("b-test", "What about flaky tests?", to("f-other")),
      followUp("b-third", "A third level?", to("b-alert")), // a branch of a branch: never a third level
   ];

   it("nests branches beneath their open parent, under one label, in authored order, each closed", () => {
      show(...TREE);
      open("Show the follow-up questions");
      const parent = ownReveal("f-lag");
      expect(parent.contains(document.getElementById("b-late"))).toBe(true);
      expect(within(parent).getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([BRANCHES]);
      expect(within(parent).getAllByRole("heading", { level: 5 }).map((heading) => heading.textContent)).toEqual(["Then what is replayed?", "Who is paged?"]);
      expect(ownReveal("b-late").open).toBe(false);
      expect(ownReveal("b-alert").open).toBe(false);
      expect(ownReveal("f-other").contains(document.getElementById("b-test"))).toBe(true);
   });

   it("opens a parent without opening its branches, and each branch on its own", () => {
      show(...TREE);
      open("Show the follow-up questions");
      open("Show reference: A provider stalls. What happens?");
      expect(openIds()).toHaveLength(2);
      expect(openIds()).toContain("f-lag");
      open("Show reference: Who is paged?");
      expect(ownReveal("b-alert").open).toBe(true);
      expect(ownReveal("b-late").open).toBe(false);
      expect(ownReveal("f-other").open).toBe(false);
   });

   it("lists a follow-up that would be a third level at the top, and gives a branch no branch label of its own", () => {
      show(...TREE);
      const followUps = band("Follow-ups");
      expect(within(followUps).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
         "A provider stalls. What happens?",
         "How would you test this?",
         "A third level?",
      ]);
      expect(ownReveal("b-alert").querySelector("h4")).toBeNull();
      expect(within(followUps).getAllByText(BRANCHES)).toHaveLength(2); // one per parent that has branches
   });

   it("keeps a branch's hints in its block and opens neither with the parent", () => {
      show(...TREE, hint("h-late", "follow_ups", "b-late"), hint("h-lag", "follow_ups", "f-lag"));
      open("Show the follow-up questions");
      open("Show reference: A provider stalls. What happens?");
      expect(anatomy("b-late")).toEqual(["h5", expect.stringMatching(/^details:/), "details:b-late"]);
      expect(anatomy("f-lag")).toEqual(["h3", "p", "p", expect.stringMatching(/^details:/), "details:f-lag"]); // probes line, the one explanation, hints
      for (const id of ["h-late", "h-lag"]) expect(document.getElementById(id)!.closest("details")!.open).toBe(false);
   });

   it("puts the one explanatory hint line on the first sequence in presentation order: a parent's branch before the next follow-up", () => {
      show(followUp("a"), followUp("c"), followUp("b", "b", to("a")), hint("h-c", "follow_ups", "c"), hint("h-b", "follow_ups", "b"));
      open("Show the follow-up questions");
      expect(within(unit("b")).getByText(EXPLANATION)).toBeInTheDocument();
      expect(within(unit("c")).queryByText(EXPLANATION)).toBeNull();
      expect(screen.getAllByText(EXPLANATION)).toHaveLength(1);
   });
});

describe("Follow-ups: withheld targets (S-FUP-6, S-LNK-13, S-AX-7, AC-13)", () => {
   const LEAK = ["P4_SENTINEL_TARGET_ID", "P4_SENTINEL_TARGET_TITLE", "CANARY_SECRET"];
   // The API names nothing of a withheld target; the section simply is not among the released ones.
   const SECTIONS = [
      followUp("free-parent", "A free parent"),
      followUp("to-withheld", "Linked to a withheld one", withheld),
      followUp("branch-of-withheld", "Under a withheld parent", withheld),
      followUp("branch-of-free", "Under the free parent", to("free-parent")),
   ];

   it("renders every follow-up with a withheld target at the top level with the one generic phrase and the premium mark", () => {
      show(...SECTIONS);
      open("Show the follow-up questions");
      const followUps = band("Follow-ups");
      for (const id of ["to-withheld", "branch-of-withheld"]) {
         const note = unit(id).querySelector("p")!;
         expect(note).toHaveTextContent(GENERIC);
         expect(within(note as HTMLElement).getByText("Premium")).toBeInTheDocument();
         expect(ownReveal("free-parent").contains(unit(id))).toBe(false);
      }
      expect(within(followUps).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
         "A free parent",
         "Linked to a withheld one",
         "Under a withheld parent",
      ]);
      expect(ownReveal("free-parent").contains(document.getElementById("branch-of-free"))).toBe(true);
   });

   it("never names the withheld target's identity or type, whatever it was", () => {
      show(...SECTIONS);
      const html = document.body.innerHTML;
      for (const leak of LEAK) expect(html).not.toContain(leak);
      expect(screen.getAllByText(GENERIC)).toHaveLength(2);
      // The whole line is the mark and the generic phrase: nothing of the target's type or kind.
      for (const id of ["to-withheld", "branch-of-withheld"]) expect(unit(id).querySelector("p")!.textContent).toBe(`Premium${GENERIC}`);
   });
});

describe("Reference Solution: the design and its alternatives (S-ALT-1, S-ALT-2, AC-8)", () => {
   const SECTIONS = [
      decision("d-queue", "Queue or direct send?"),
      reference,
      alternative("alt-log", to("reference")),
      alternative("alt-direct", to("d-queue")),
      alternative("alt-secret", withheld),
   ];

   it("opens the reference design and lists the alternatives after it, each with its own closed control", () => {
      show(...SECTIONS);
      const solution = band("Reference Solution");
      expect(summaries(solution)[0]).toBe("Show the reference solution");
      expect(solution).toHaveTextContent("Other designs can be just as strong");
      open("Show the reference solution");
      const text = solution.textContent!;
      expect(text.indexOf("CANARY_reference")).toBeLessThan(text.indexOf("CANARY_alt-log"));
      expect(within(solution).getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual(["alt-log", "alt-direct", "alt-secret"]);
      for (const id of ["alt-log", "alt-direct", "alt-secret"]) expect(ownReveal(id).open).toBe(false);
      open("Show reference: alt-direct");
      expect(ownReveal("alt-direct").open).toBe(true);
      expect(ownReveal("alt-log").open).toBe(false);
   });

   it("says what each alternative is an alternative to, a withheld target with the generic phrase and the premium mark", () => {
      show(...SECTIONS);
      expect(unit("alt-log").querySelector("p")).toHaveTextContent("Alternative to: the reference solution");
      expect(unit("alt-direct").querySelector("p")).toHaveTextContent("Alternative to: Queue or direct send?");
      const note = unit("alt-secret").querySelector("p") as HTMLElement;
      expect(note).toHaveTextContent("Alternative to: material included with full access");
      expect(within(note).getByText("Premium")).toBeInTheDocument();
   });

   it("is a lightweight unit: no hints, follow-ups or stages of its own", () => {
      show(...SECTIONS);
      expect(anatomy("alt-log")).toEqual(["h4", "p", "details:alt-log"]);
   });

   it("offers Show the alternatives when no reference design is released", () => {
      show(decision("d-queue", "Queue or direct send?"), alternative("alt-direct", to("d-queue")));
      const solution = band("Reference Solution");
      expect(summaries(solution)[0]).toBe("Show the alternatives");
      expect(summaries(solution)).not.toContain("Show the reference solution");
      expect(unit("alt-direct").querySelector("p")).toHaveTextContent("Alternative to: Queue or direct send?");
   });
});
