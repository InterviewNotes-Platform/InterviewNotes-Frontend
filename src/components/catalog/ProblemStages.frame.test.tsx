import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));

import { composeProblem } from "@/lib/catalog/problemSpine";
import type { CatalogSection } from "@/lib/catalog/types";
import { ProblemStages } from "./ProblemStages";

const section = (id: string, type: string, title: string | null, text: string, over: Partial<CatalogSection> = {}): CatalogSection => ({
   id,
   type,
   title,
   spine_position: "frame",
   body: { format: "markdown@1", text },
   ...over,
});
const parts = (...entries: [string, string][]) => entries.map(([name, text]) => `::: part name=${name}\n${text}\n:::`).join("\n\n");
const link = (target: string | null) => ({ link: target === null ? { target: null, withheld: true } : { target, withheld: false } });
const stage = (position: string, withheld = false) => ({ position, kind: "interview_stage" as const, withheld });

const CHALLENGE = "CANARY_CHALLENGE Design a notification system.";
const SECTIONS: CatalogSection[] = [
   section("prompt", "prompt", "Prompt", CHALLENGE),
   section("hint-frame", "hint", null, "A hint about Frame.", link("prompt")),
   section("scope", "scope_clarification", "Scope", "CANARY_SCOPE Delivery only."),
   // Authored out of canonical order on purpose (S-PRT-6).
   section(
      "clarify-rate",
      "clarification",
      "CANARY_Q_RATE How many per second?",
      parts(["if_different", "CANARY_DIFF A hundred times more needs partitions."], ["why_it_matters", "CANARY_WHY Sizing drives the queue."], ["answer", "CANARY_ANSWER Ten thousand."])
   ),
   section("clarify-channels", "clarification", "CANARY_Q_CHANNELS Which channels?", parts(["answer", "CANARY_ANSWER_2 Push and email."], ["why_it_matters", "CANARY_WHY_2 Each fails differently."])),
   section("assume-bounded", "assumption", "Fan-out is bounded", "CANARY_ASSUME_1 Under a thousand users.", link("decision")),
   section("assume-secret", "assumption", "Retries are idempotent", "CANARY_ASSUME_2 Receivers dedupe.", link(null)),
   section("assume-free", "assumption", "Clocks are synced", "CANARY_ASSUME_3 NTP everywhere."),
   section("decision", "trade_offs", "Queue or direct send", "The decision.", { spine_position: "depth_and_trade_offs" }),
];
const SPINE = [stage("frame"), stage("depth_and_trade_offs")];

function show(sections: CatalogSection[] = SECTIONS, spine = SPINE) {
   render(<ProblemStages composition={composeProblem({ sections, spine })} stayOnDeployment={false} />);
   return screen.getByRole("region", { name: "Frame" });
}
const summaries = (scope: HTMLElement) => [...scope.querySelectorAll("summary")].map((summary) => summary.textContent);
/** Opens the reveal whose control reads `label` (its visible text and the text read after it), as a click on a native summary would. */
const open = (label: string) => {
   const summary = [...document.querySelectorAll("summary")].find((candidate) => candidate.textContent === label);
   if (!summary) throw new Error(`No control named "${label}"`);
   const details = summary.closest("details")!;
   details.open = true; // jsdom does not toggle a native disclosure on click
   return details;
};

describe("Frame: your questions first (S-CLR-2, S-CLR-3, AC-7)", () => {
   it("opens with the challenge and the coach's line directly after it, before any control", () => {
      const frame = within(show());
      const challenge = frame.getByRole("heading", { level: 3, name: "The challenge" }).parentElement!;
      const line = challenge.nextElementSibling!;
      expect(line.tagName).toBe("P");
      expect(line).toHaveTextContent("Before reading on, list the questions you would ask the interviewer and the assumptions you would state.");
      // The first hint sequence carries its one explanatory line (S-HNT-8), then its closed control follows.
      expect(line.nextElementSibling).toHaveTextContent("Hints nudge your thinking without giving the answer. Use as few as you need.");
      expect(line.nextElementSibling!.nextElementSibling!.tagName).toBe("DETAILS");
      expect(frame.getByText(CHALLENGE, { exact: false })).toBeVisible();
      expect(line.querySelector("input, button, textarea, [role=timer]")).toBeNull(); // a pause, not a form
   });

   it("lists the controls in the order of spec §9.3, with no count", () => {
      const frame = show();
      expect(summaries(frame)).toEqual([
         "Show a hint, hint 1 for Frame",
         "Compare with a strong candidate's questions",
         "Show the interviewer's answer: CANARY_Q_RATE How many per second?",
         "Show the interviewer's answer: CANARY_Q_CHANNELS Which channels?",
         "Compare with the reference's assumptions",
         "Show reference: Fan-out is bounded",
         "Show reference: Retries are idempotent",
         "Show reference: Clocks are synced",
         "Show how the reference frames the problem",
      ]);
   });

   it("shows no canonical question, answer or assumption on opening Frame", () => {
      show();
      for (const marker of [/CANARY_Q_/, /CANARY_ANSWER/, /CANARY_WHY/, /CANARY_DIFF/, /CANARY_ASSUME/, /CANARY_SCOPE/]) {
         for (const node of screen.getAllByText(marker, { exact: false })) expect(node, String(marker)).not.toBeVisible();
      }
      expect(document.querySelectorAll("details[open]")).toHaveLength(0);
   });

   it("shows the questions as titles only after the deliberate reveal, and no answer with them", () => {
      show();
      open("Compare with a strong candidate's questions");
      expect(screen.getByRole("heading", { level: 3, name: "CANARY_Q_RATE How many per second?" })).toBeVisible();
      expect(screen.getByRole("heading", { level: 3, name: "CANARY_Q_CHANNELS Which channels?" })).toBeVisible();
      expect(screen.getByText("CANARY_ANSWER Ten thousand.")).not.toBeVisible();
      expect(screen.getByText("CANARY_ANSWER_2 Push and email.")).not.toBeVisible();
      expect(screen.getByText(/CANARY_ASSUME_1/)).not.toBeVisible(); // another list is a different reveal
   });

   it("opens each clarification on its own and no other (S-RVL-1)", () => {
      show();
      open("Compare with a strong candidate's questions");
      open("Show the interviewer's answer: CANARY_Q_CHANNELS Which channels?");
      expect(screen.getByText("CANARY_ANSWER_2 Push and email.")).toBeVisible();
      expect(screen.getByText("CANARY_ANSWER Ten thousand.")).not.toBeVisible();
      expect(screen.getByText("CANARY_WHY Sizing drives the queue.")).not.toBeVisible();
   });

   it("presents an answer's parts in canonical order under their eyebrows, whatever the authored order", () => {
      show();
      open("Compare with a strong candidate's questions");
      const reveal = open("Show the interviewer's answer: CANARY_Q_RATE How many per second?");
      const eyebrows = [...reveal.querySelectorAll("[data-part]")].map((node) => [node.getAttribute("data-part"), node.querySelector(":scope > p")?.textContent]);
      expect(eyebrows).toEqual([
         ["answer", "Interviewer's answer"],
         ["why_it_matters", "Why it matters"],
         ["if_different", "If the answer were different"],
      ]);
      expect(reveal.textContent).toMatch(/Interviewer's answerCANARY_ANSWER Ten thousand\..*Why it mattersCANARY_WHY Sizing drives the queue\..*If the answer were differentCANARY_DIFF/);
   });

   it("leaves out the eyebrow of a part the clarification does not have, and keeps the eyebrows as plain text (S-AX-8)", () => {
      show();
      const reveal = open("Show the interviewer's answer: CANARY_Q_CHANNELS Which channels?");
      expect([...reveal.querySelectorAll("[data-part] > p:first-child")].map((node) => node.textContent)).toEqual(["Interviewer's answer", "Why it matters"]);
      for (const eyebrow of reveal.querySelectorAll("[data-part] > p:first-child")) expect(eyebrow.closest("[aria-hidden]")).toBeNull();
      expect(reveal.lastElementChild!.querySelector("img, svg, [role=img]")).toBeNull(); // no avatars or bubbles in the answer (the control keeps its chevron)
   });

   it("keeps a heading authored inside a part below the unit's heading", () => {
      const sections = [section("prompt", "prompt", "Prompt", CHALLENGE), section("q", "clarification", "Q?", parts(["answer", "## Authored\nText."]))];
      show(sections, [stage("frame")]);
      const levels = [...document.querySelectorAll("main :is(h1,h2,h3,h4,h5,h6), :is(h1,h2,h3,h4,h5,h6)")].map((heading) => `${heading.tagName} ${heading.textContent}`);
      expect(levels).toContain("H3 Q?");
      expect(levels).toContain("H5 Authored"); // h3 unit heading, offset 3, authored h2 -> h5
   });

   it("renders a legacy clarification with no parts as it was: prose, with no eyebrow", () => {
      const sections = [section("prompt", "prompt", "Prompt", CHALLENGE), section("q", "clarification", "Legacy?", "Interviewer: yes.\n\nWhy it matters: sizing.")];
      const frame = within(show(sections, [stage("frame")]));
      const reveal = open("Show the interviewer's answer: Legacy?");
      expect(reveal).toHaveTextContent("Interviewer: yes. Why it matters: sizing.");
      expect(reveal.querySelector("[data-part]")).toBeNull();
      expect(frame.getByText(/Before reading on/)).toBeInTheDocument();
   });
});

describe("Frame: assumptions (S-ASM-1, S-LNK-13, AC-8)", () => {
   it("lists each assumption's title with its Conditions line before the assumption opens, and nothing for an unlinked one", () => {
      show();
      open("Compare with the reference's assumptions");
      const unit = (id: string) => document.getElementById(id)!.parentElement!;
      expect(screen.getByRole("heading", { level: 3, name: "Fan-out is bounded" })).toBeVisible();
      const linked = within(unit("assume-bounded"));
      expect(linked.getByText("Conditions: Queue or direct send")).toBeVisible();
      const heading = document.getElementById("assume-bounded")!;
      expect(linked.getByText("Conditions: Queue or direct send").closest("details")).toBe(heading.closest("details")); // not inside the assumption's own reveal
      expect(heading.nextElementSibling).toBe(linked.getByText("Conditions: Queue or direct send").parentElement); // heading, then its line, then its control
      expect(document.getElementById("assume-free")!.nextElementSibling!.tagName).toBe("DETAILS"); // no line between its heading and its control
      expect(screen.getByText(/CANARY_ASSUME_1/)).not.toBeVisible();
   });

   it("says a withheld target only generically, with the premium mark, and names nothing about it", () => {
      show();
      open("Compare with the reference's assumptions");
      const line = screen.getByText("Conditions: material included with full access");
      expect(line).toBeVisible();
      expect(within(line.parentElement!).getByText("Premium")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/Conditions: (?!Queue or direct send|material included)/);
   });

   it("opens each assumption on its own", () => {
      show();
      open("Compare with the reference's assumptions");
      open("Show reference: Retries are idempotent");
      expect(screen.getByText("CANARY_ASSUME_2 Receivers dedupe.")).toBeVisible();
      expect(screen.getByText("CANARY_ASSUME_1 Under a thousand users.")).not.toBeVisible();
      expect(screen.getByText("CANARY_ASSUME_3 NTP everywhere.")).not.toBeVisible();
   });
});

describe("Frame: the scope reasoning and what is absent", () => {
   it("keeps scope_clarification behind 'Show how the reference frames the problem', closed until opened", () => {
      show();
      const text = screen.getByText(/CANARY_SCOPE/);
      expect(text).not.toBeVisible();
      open("Show how the reference frames the problem");
      expect(text).toBeVisible();
      expect(screen.getByRole("heading", { level: 3, name: "Scope" })).toBeVisible();
   });

   it("omits the coach's line when Frame has nothing to compare, even with a hint", () => {
      const frame = show([SECTIONS[0], SECTIONS[1]], [stage("frame")]);
      expect(within(frame).queryByText(/Before reading on/)).not.toBeInTheDocument();
      expect(summaries(frame)).toEqual(["Show a hint, hint 1 for Frame"]);
   });

   it("puts the line first when the challenge is withheld and Frame still has questions", () => {
      const sections = SECTIONS.filter(({ id }) => ["clarify-rate"].includes(id));
      const frame = within(show(sections, [stage("frame", true)]));
      expect(frame.getByText(/Before reading on/)).toBeInTheDocument();
      expect(frame.queryByText("The challenge")).not.toBeInTheDocument();
      expect(frame.getByText("Some material in this stage is included with full access.")).toBeInTheDocument();
   });

   it("shows no questions control and no question, only the access indication, when every clarification is withheld", () => {
      const sections = [SECTIONS[0]]; // the API releases nothing else; a withheld section is simply absent (S-CLR-5)
      const frame = within(show(sections, [stage("frame", true)]));
      expect(frame.queryByText(/Compare with a strong candidate's questions/)).not.toBeInTheDocument();
      expect(frame.queryByText(/Before reading on/)).not.toBeInTheDocument();
      expect(frame.getByText("Some material in this stage is included with full access.")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/CANARY_Q_|CANARY_ANSWER/);
   });
});
