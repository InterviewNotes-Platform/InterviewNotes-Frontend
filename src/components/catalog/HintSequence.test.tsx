import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));

import { composeProblem } from "@/lib/catalog/problemSpine";
import type { CatalogSection } from "@/lib/catalog/types";
import { ProblemStages } from "./ProblemStages";

const EXPLANATION = "Hints nudge your thinking without giving the answer. Use as few as you need.";
const section = (id: string, type: string, position: string, title: string | null = null, link?: CatalogSection["link"]): CatalogSection => ({
   id,
   type,
   title,
   spine_position: position,
   body: { format: "markdown@1", text: `CANARY ${id}` },
   ...(link === undefined ? {} : { link }),
});
const hint = (id: string, position: string, target: string | null) =>
   section(id, "hint", position, null, target === null ? { target: null, withheld: true } : { target, withheld: false });
const stage = (position: string) => ({ position, kind: "interview_stage" as const, withheld: false });
const SPINE = ["frame", "requirements", "design", "depth_and_trade_offs", "follow_ups"].map(stage);

const SECTIONS: CatalogSection[] = [
   section("prompt", "prompt", "frame"),
   // Authored out of presentation order on purpose: the follow-up hint comes first in the document.
   hint("h-follow", "follow_ups", "follow-lag"),
   hint("h-design-1", "design", "interfaces"),
   section("interfaces", "interfaces", "design"),
   hint("h-design-2", "design", "entities"),
   section("entities", "core_entities", "design"),
   hint("h-design-3", "design", "high-level"),
   section("deep-a", "deep_dive", "depth_and_trade_offs", "Delivery guarantees"),
   section("deep-b", "deep_dive", "depth_and_trade_offs", "Ordering"),
   hint("h-b", "depth_and_trade_offs", "deep-b"),
   hint("h-a-1", "depth_and_trade_offs", "deep-a"),
   hint("h-a-2", "depth_and_trade_offs", "deep-a"),
   hint("h-secret", "depth_and_trade_offs", null),
   section("follow-lag", "follow_ups", "follow_ups", "A region lags"),
];

function show(sections = SECTIONS, spine = SPINE) {
   return render(<ProblemStages composition={composeProblem({ sections, spine })} stayOnDeployment={false} />);
}
const band = (name: string) => screen.getByRole("region", { name });
const summary = (label: string) => {
   const found = [...document.querySelectorAll("summary")].find((candidate) => candidate.textContent === label);
   if (!found) throw new Error(`No control named "${label}"`);
   return found;
};
/** Opens the disclosure a native click on `label` would open (jsdom does not toggle one itself). */
const open = (label: string) => {
   const details = summary(label).closest("details")!;
   details.open = true;
   return details;
};
const openCount = () => document.querySelectorAll("details[open]").length;

const hintControls = (scope: ParentNode) =>
   [...scope.querySelectorAll("summary")].map((control) => control.textContent).filter((text) => / hint/.test(text ?? ""));

describe("one sequence, one hint at a time (S-HNT-5, S-HNT-6, S-RVL-12b)", () => {
   it("makes one stage sequence of three hints over different sections, all closed in the first paint", () => {
      show();
      const design = band("Design");
      expect(hintControls(design)).toEqual([
         "Show a hint, hint 1 for Design",
         "Show the next hint, hint 2 for Design",
         "Show the next hint, hint 3 for Design",
      ]);
      expect(document.querySelectorAll("details[open]")).toHaveLength(0);
   });

   it("nests each next control inside the previous hint's panel, so it exists only once that hint is shown", () => {
      show();
      const first = summary("Show a hint, hint 1 for Design").closest("details")!;
      const second = summary("Show the next hint, hint 2 for Design").closest("details")!;
      const third = summary("Show the next hint, hint 3 for Design").closest("details")!;
      expect(first.querySelector(":scope > div")!.contains(second)).toBe(true);
      expect(second.querySelector(":scope > div")!.contains(third)).toBe(true);
      expect(first.querySelectorAll(":scope > div > summary, :scope > summary")).toHaveLength(1);
      // The first panel holds its hint and the next control only: hint 3 is two panels deep.
      expect(first.querySelector(":scope > div > section")).toHaveTextContent("CANARY h-design-1");
      expect([...first.querySelectorAll("section[id^=h-design]")].map(({ id }) => id)).toEqual(["h-design-1", "h-design-2", "h-design-3"]);
   });

   it("gives hints over separate units separate sequences, and a released follow-up its own", () => {
      show();
      expect(hintControls(band("Depth & Trade-offs"))).toEqual([
         "Show a hint, hint 1 for Depth & Trade-offs",
         "Show a hint, hint 1 for Delivery guarantees",
         "Show the next hint, hint 2 for Delivery guarantees",
         "Show a hint, hint 1 for Ordering",
      ]);
      expect(hintControls(band("Follow-ups"))).toEqual(["Show a hint, hint 1 for A region lags"]);
   });

   it("collects hints over a withheld target into one stage-level sequence with nothing of the target", () => {
      show();
      const stageLevel = summary("Show a hint, hint 1 for Depth & Trade-offs").closest("details")!;
      expect(stageLevel).toHaveTextContent("CANARY h-secret");
      expect(stageLevel.querySelectorAll("summary")).toHaveLength(1);
      expect(document.body.innerHTML).not.toMatch(/withheld|null|premium/i);
   });

   it("renders a hint with no usable position or target in no sequence", () => {
      show([
         ...SECTIONS,
         { ...hint("h-null", "design", "entities"), spine_position: null },
         section("h-nolink", "hint", "depth_and_trade_offs"),
         hint("h-elsewhere", "depth_and_trade_offs", "not-released"),
      ]);
      for (const id of ["h-null", "h-nolink", "h-elsewhere"]) expect(screen.queryByText(`CANARY ${id}`)).toBeNull();
   });

   it("opens one sequence without touching another, and each next hint only on its own control", () => {
      show();
      open("Show a hint, hint 1 for Design");
      expect(openCount()).toBe(1);
      open("Show the next hint, hint 2 for Design");
      expect(openCount()).toBe(2);
      for (const other of ["Show reference for Design", "Show a hint, hint 1 for Ordering", "Show a hint, hint 1 for A region lags"]) {
         expect(summary(other).closest("details")!.open, other).toBe(false);
      }
   });

   it("keeps nothing of what was shown: no storage, cookie or fragment", () => {
      show();
      open("Show a hint, hint 1 for Design");
      expect([window.localStorage.length, window.sessionStorage.length, document.cookie, window.location.hash]).toEqual([0, 0, "", ""]);
   });
});

describe("the cue, the closing line and the explanation (S-HNT-6, S-HNT-8, S-HNT-9)", () => {
   it("shows 'Hint n of N' only inside a hint's panel, never on a closed control or as a counter", () => {
      show();
      const cues = screen.getAllByText(/^Hint \d of \d$/);
      expect(cues.map((cue) => cue.textContent)).toEqual(["Hint 1 of 3", "Hint 2 of 3", "Hint 3 of 3", "Hint 1 of 1", "Hint 1 of 2", "Hint 2 of 2", "Hint 1 of 1", "Hint 1 of 1"]);
      for (const cue of cues) expect(cue.closest("details"), cue.textContent!).not.toBeNull();
      for (const control of document.querySelectorAll("summary")) expect(control.textContent).not.toMatch(/\d+ of \d+|\(\d+\)|hints? used|score|streak/i);
   });

   it("closes after the last hint where the next control would be, pointing to the reference only when one is released", () => {
      show();
      const last = summary("Show the next hint, hint 3 for Design").closest("details")!;
      expect(last.querySelectorAll("summary")).toHaveLength(1);
      expect(last.lastElementChild!.lastElementChild).toHaveTextContent("No more hints for Design. Open the reference when you're ready.");
      // A unit always has its body to open; the stage-level sequence over withheld units has no reference of its own.
      expect(screen.getByText("No more hints for Delivery guarantees. Open the reference when you're ready.")).toBeInTheDocument();
      expect(screen.getByText("No more hints for Depth & Trade-offs.")).toBeInTheDocument();
   });

   it("leaves the reference out of the closing line for a stage with no released reference", () => {
      show([section("prompt", "prompt", "frame"), hint("h-req", "requirements", "functional")]);
      expect(screen.getByText("No more hints for Requirements.")).toBeInTheDocument();
      expect(screen.queryByText(/Open the reference/)).toBeNull();
   });

   it("carries the explanation once, on the first sequence in presentation order rather than the document's", () => {
      show();
      expect(screen.getAllByText(EXPLANATION)).toHaveLength(1);
      // h-follow is first in the document; Design comes first in the spine.
      const line = screen.getByText(EXPLANATION);
      expect(band("Design").contains(line)).toBe(true);
      expect(line.nextElementSibling!.tagName).toBe("DETAILS");
      expect(line.nextElementSibling).toHaveTextContent(/^Show a hint, hint 1 for Design/);
   });

   it("gives the explanation to the first unit in unit order when no earlier stage has a hint", () => {
      show(SECTIONS.filter(({ id }) => !id.startsWith("h-design")));
      expect(screen.getAllByText(EXPLANATION)).toHaveLength(1);
      // The stage-level sequence comes before the units'.
      expect(band("Depth & Trade-offs").querySelector(":scope > details")!.previousElementSibling).toHaveTextContent(EXPLANATION);
   });

   it("shows no hint control, region or explanation for a Problem without hints", () => {
      show(SECTIONS.filter(({ type }) => type !== "hint"));
      expect(screen.queryByText(EXPLANATION)).toBeNull();
      expect(hintControls(document.body)).toEqual([]);
      expect(screen.queryByText(/hint/i)).toBeNull();
   });
});

describe("placement (S-HNT-7)", () => {
   it("puts a narrative stage's sequence after the intent and before the reference control", () => {
      show();
      const stageSections = band("Design");
      const kinds = [...stageSections.children].map((child) => child.tagName);
      expect(kinds).toEqual(["DIV", "P", "P", "DETAILS", "DETAILS"]);
      expect(stageSections.children[3]).toHaveTextContent(/^Show a hint/);
      expect(stageSections.children[4]).toHaveTextContent(/^Show reference for Design/);
   });

   it("puts a unit's sequence between its heading and the control that opens its body", () => {
      show();
      const block = screen.getByRole("heading", { name: "Delivery guarantees", level: 3 }).parentElement!;
      const order = [...block.children].map((child) => (child.tagName === "H3" ? "heading" : child.querySelector("summary")!.textContent));
      expect(order).toEqual(["heading", "Show a hint, hint 1 for Delivery guarantees", "Show reference: Delivery guarantees"]);
   });

   it("keeps a unit's hints independent of its body: opening the body opens no hint", () => {
      show();
      open("Show reference: Delivery guarantees");
      expect(summary("Show a hint, hint 1 for Delivery guarantees").closest("details")!.open).toBe(false);
   });

   it("puts a unit stage's stage-level sequence after the intent and before the list control", () => {
      show();
      const kinds = [...band("Depth & Trade-offs").children].map((child) => child.textContent);
      const list = kinds.findIndex((text) => text?.startsWith("Compare with the topics"));
      const stageLevel = kinds.findIndex((text) => text?.startsWith("Show a hint"));
      expect(stageLevel).toBeGreaterThan(0);
      expect(stageLevel).toBeLessThan(list);
   });
});
