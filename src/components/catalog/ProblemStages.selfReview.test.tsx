import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));

import { composeProblem } from "@/lib/catalog/problemSpine";
import type { CatalogSection } from "@/lib/catalog/types";
import { ProblemStages } from "./ProblemStages";

const section = (id: string, type: string, position: string, title: string | null, text: string, over: Partial<CatalogSection> = {}): CatalogSection => ({
   id,
   type,
   title,
   spine_position: position,
   body: { format: "markdown@1", text },
   ...over,
});
const part = (name: string, text: string, seniority?: string) => `::: part name=${name}${seniority ? ` seniority=${seniority}` : ""}\n${text}\n:::`;
const parts = (...entries: string[]) => entries.join("\n\n");
const bar = (seniority: string) => part("bar", `CANARY_BAR_${seniority.toUpperCase()}`, seniority);
const dimension = (id: string, title: string, bars: string, over: Partial<CatalogSection> = {}) =>
   section(
      id,
      "rubric_dimension",
      "self_review",
      title,
      parts(part("evaluates", `CANARY_EVAL_${id}`), part("strong_evidence", `CANARY_STRONG_${id}`), part("weak_evidence", `CANARY_WEAK_${id}`), bars),
      over
   );
const expectations = (text: string) => section("levels", "level_expectations", "self_review", "Expectations by seniority", text);
const mistakes = section("mistakes", "common_mistakes", "self_review", "Common mistakes", "CANARY_MISTAKES");
const design = section("design-section", "high_level_design", "design", "High-level design", "CANARY_DESIGN");

const SPINE = [
   { position: "design", kind: "interview_stage" as const, withheld: false },
   { position: "self_review", kind: "review_surface" as const, withheld: null },
];
function show(...sections: CatalogSection[]) {
   render(<ProblemStages composition={composeProblem({ sections, spine: SPINE })} stayOnDeployment={false} />);
}
const review = () => screen.getByRole("region", { name: "Self-review" });
/** Opens the reveal whose control reads `label` (what jsdom would not do on a native click). */
const open = (label: string) => {
   const summary = [...document.querySelectorAll("summary")].find((candidate) => candidate.textContent === label);
   if (!summary) throw new Error(`No control named "${label}"`);
   const details = summary.closest("details")!;
   details.open = true;
   return details;
};
const unit = (id: string) => document.getElementById(id)!.parentElement!;
const labelOf = (node: Element) => node.querySelector(":scope > p")?.textContent;
const labels = (scope: ParentNode) => [...scope.querySelectorAll("[data-part]")].map(labelOf);

describe("Self-review: expectations by seniority (S-SEN-2, S-SEN-4, AC-11)", () => {
   it("presents each bar under its own seniority in Mid to Principal order, whatever the authored order", () => {
      show(expectations(parts(bar("staff"), bar("mid"), bar("principal"), bar("senior"))));
      open("Open self-review");
      expect(labels(review())).toEqual(["Mid bar", "Senior bar", "Staff bar", "Principal bar"]);
      const text = review().textContent!;
      const at = ["MID", "SENIOR", "STAFF", "PRINCIPAL"].map((level) => text.indexOf(`CANARY_BAR_${level}`));
      expect(at).toEqual([...at].sort((a, b) => a - b));
      expect(at.every((index) => index >= 0)).toBe(true);
   });

   it("keeps each bar's text with the seniority it declares, not with its place in the list", () => {
      show(expectations(parts(bar("staff"), bar("mid"))));
      open("Open self-review");
      const byLabel = new Map([...review().querySelectorAll("[data-part]")].map((node) => [labelOf(node), node.textContent]));
      expect(byLabel.get("Staff bar")).toContain("CANARY_BAR_STAFF");
      expect(byLabel.get("Mid bar")).toContain("CANARY_BAR_MID");
   });

   it("states each untargeted seniority and never gives it a bar", () => {
      show(expectations(parts(bar("senior"), bar("staff"))));
      open("Open self-review");
      const stated = [...review().querySelectorAll("[data-untargeted]")].map((node) => [node.getAttribute("data-untargeted"), node.textContent]);
      expect(stated).toEqual([
         ["mid", "This Problem is not written to the Mid bar."],
         ["principal", "This Problem is not written to the Principal bar."],
      ]);
      expect(labels(review())).toEqual(["Senior bar", "Staff bar"]);
      expect(review().textContent).not.toMatch(/CANARY_BAR_(MID|PRINCIPAL)/);
   });

   it("states nothing untargeted when every seniority has a bar", () => {
      show(expectations(parts(bar("mid"), bar("senior"), bar("staff"), bar("principal"))));
      open("Open self-review");
      expect(review().querySelector("[data-untargeted]")).toBeNull();
   });

   it("renders legacy prose as authored, with no bar labels and no untargeted lines", () => {
      show(expectations("CANARY_LEGACY Seniors explain the label bias; staff quantify it."));
      open("Open self-review");
      expect(within(review()).getByText(/^CANARY_LEGACY/)).toBeInTheDocument();
      expect(review().querySelector("[data-part], [data-untargeted]")).toBeNull();
   });

   it("calls seniority a bar under Expectations by seniority, never a level, and offers no lens or selection control", () => {
      show(expectations(parts(bar("senior"))));
      open("Open self-review");
      expect(within(review()).getByRole("heading", { level: 3, name: "Expectations by seniority" })).toBeInTheDocument();
      expect(review().textContent).not.toMatch(/\blevel\b|Reviewing for|Your bar/i);
      expect(review().querySelector("[role=radiogroup], [role=radio], [role=tablist], select, input")).toBeNull();
   });

   it("renders a bar's body through the Markdown renderer with raw HTML disabled", () => {
      show(expectations(part("bar", "CANARY_SAFE <img src=x alt=injected> <script>window.hacked=1</script>", "senior")));
      open("Open self-review");
      expect(review().querySelector("img, script")).toBeNull();
      expect(review().textContent).toContain("CANARY_SAFE");
   });
});

describe("Self-review: rubric dimensions (S-RUB-1, S-RUB-4, S-SEN-3, S-LAY-4, AC-11)", () => {
   const SECTIONS = () => [
      design,
      dimension("rubric-a", "Delivery reasoning", parts(bar("staff"), bar("senior")), { dimension: "architecture", link: { target: "design-section", withheld: false } }),
      dimension("rubric-b", "Driving the stages", part("bar", "CANARY_BAR_ALL"), { dimension: "communication_and_structure" }),
      mistakes,
   ];

   it("lists each dimension's title with its shared dimension label and link line, each on its own closed control", () => {
      show(...SECTIONS());
      open("Open self-review");
      const rubric = within(review()).getByRole("heading", { level: 3, name: "Rubric" }).parentElement!;
      expect(within(rubric).getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual(["Delivery reasoning", "Driving the stages"]);
      expect(unit("rubric-a").textContent).toContain("Dimension: Architecture");
      expect(unit("rubric-a").textContent).toContain("Mostly evaluates: Design");
      expect(unit("rubric-b").textContent).toContain("Dimension: Communication and structure");
      expect(unit("rubric-b").textContent).not.toContain("Mostly evaluates");
      expect([...rubric.querySelectorAll("summary")].map((summary) => summary.textContent)).toEqual([
         "Show rubric: Delivery reasoning",
         "Show rubric: Driving the stages",
      ]);
      expect([...rubric.querySelectorAll("details")].every((details) => !details.open)).toBe(true);
   });

   it("opens one dimension without opening another", () => {
      show(...SECTIONS());
      open("Open self-review");
      const first = open("Show rubric: Delivery reasoning");
      expect(first.open).toBe(true);
      expect(unit("rubric-b").querySelector("details")!.open).toBe(false);
      expect(within(first).getByText("CANARY_EVAL_rubric-a")).toBeInTheDocument();
   });

   it("labels the parts What it evaluates, Strong evidence, Weak evidence, then the bars in seniority order", () => {
      show(...SECTIONS());
      open("Open self-review");
      expect(labels(open("Show rubric: Delivery reasoning"))).toEqual(["What it evaluates", "Strong evidence", "Weak evidence", "Senior bar", "Staff bar"]);
   });

   it("shows a bar that does not differ by seniority once, as the bar for every seniority", () => {
      show(...SECTIONS());
      open("Open self-review");
      const body = open("Show rubric: Driving the stages");
      expect(labels(body).slice(-1)).toEqual(["The bar, for every seniority"]);
      expect(body.textContent!.match(/CANARY_BAR_ALL/g)).toHaveLength(1);
   });

   it("never fabricates a bar for a seniority a dimension does not write one for", () => {
      show(...SECTIONS());
      open("Open self-review");
      const body = open("Show rubric: Delivery reasoning");
      expect(labels(body)).not.toContain("Mid bar");
      expect(labels(body)).not.toContain("Principal bar");
      expect(body.querySelector("[data-untargeted]")).toBeNull();
   });

   it("sets strong and weak evidence in one row, two columns on wide screens and one on phones, apart from What it evaluates", () => {
      show(...SECTIONS());
      open("Open self-review");
      const body = open("Show rubric: Delivery reasoning");
      const row = body.querySelector("[data-part=strong_evidence]")!.parentElement!;
      expect(row).toBe(body.querySelector("[data-part=weak_evidence]")!.parentElement);
      expect(labels(row)).toEqual(["Strong evidence", "Weak evidence"]);
      expect(row.className).toMatch(/\bgrid\b/);
      expect(row.className).toMatch(/\bmd:grid-cols-2\b/);
      expect(row.className).not.toMatch(/(^|\s)grid-cols-/); // one column below the breakpoint
      expect(body.querySelector("[data-part=evaluates]")!.parentElement).not.toBe(row);
   });

   it("shows a withheld link as the one generic premium-marked phrase", () => {
      show(dimension("rubric-w", "Hidden target", bar("senior"), { dimension: "architecture", link: { target: null, withheld: true } }));
      open("Open self-review");
      expect(unit("rubric-w").textContent).toContain("Mostly evaluates: material included with full access");
   });

   it("shows no dimension label for a value outside the shared vocabulary", () => {
      show(dimension("rubric-u", "Unlabelled", bar("senior"), { dimension: "not_a_dimension" }));
      open("Open self-review");
      expect(unit("rubric-u").textContent).not.toContain("Dimension:");
   });
});

describe("Self-review: common mistakes and the mirror-not-a-grade rule (S-RUB-3, S-RUB-4, S-RUB-5)", () => {
   const ALL = () => [design, expectations(parts(bar("senior"))), dimension("rubric-a", "Delivery reasoning", bar("senior"), { dimension: "architecture" }), mistakes];

   it("keeps common mistakes behind a closed control, last in the surface", () => {
      show(...ALL());
      const surface = open("Open self-review");
      const control = [...surface.querySelectorAll("summary")].find((summary) => summary.textContent === "Show common mistakes")!;
      expect(control.closest("details")!.open).toBe(false);
      expect(within(review()).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Expectations by seniority", "Rubric", "Common mistakes"]);
   });

   it("renders no score, mark, checkbox, slider, progress or self-assessment control anywhere in the opened surface", () => {
      show(...ALL());
      open("Open self-review");
      open("Show rubric: Delivery reasoning");
      open("Show common mistakes");
      expect(review().querySelector("input, select, textarea, button, [role=checkbox], [role=switch], [role=slider], [role=progressbar], [role=meter], progress, meter")).toBeNull();
      expect([...review().querySelectorAll("summary")].map((summary) => summary.textContent)).toEqual([
         "Open self-review",
         "Show rubric: Delivery reasoning",
         "Show common mistakes",
      ]);
      expect(review().textContent).not.toMatch(/\bscore\b|\bcovered\b|\bprogress\b|pass mark|\d+\s*(\/|of)\s*\d+|\d+%/i);
   });
});
