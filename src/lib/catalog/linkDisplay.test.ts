import { describe, expect, it } from "vitest";
import { linkDisplay, WITHHELD_LINK, type LinkDisplay } from "./linkDisplay";
import type { CatalogSection } from "./types";

type Target = Pick<CatalogSection, "id" | "type" | "title" | "spine_position">;

// Every row of spec §6.5 (S-LNK-13): the section carrying the link, its target, and what reads.
const target = (type: string, position: string | null, title: string | null = null, id = "target"): Target => ({ id, type, title, spine_position: position });
const other = target("trade_offs", "depth_and_trade_offs", "Other decision", "other");
const released = { target: "target", withheld: false };
const withheld = { target: null, withheld: true };
const line = (text: string | null, isWithheld = false, under: string | null = null): LinkDisplay => ({ text, withheld: isWithheld, under });

const ROWS: [string, string, CatalogSection["link"], Target | null, LinkDisplay][] = [
   // hint: placed by position, the target's name never displayed, nothing displayed about a withheld target
   ["hint, target released", "hint", released, target("functional_requirements", "requirements", "Functional requirements"), line(null)],
   ["hint, target withheld", "hint", withheld, null, line(null)],
   // follow-up -> a stage section in a narrative stage
   ...["frame", "requirements", "design", "ml_reasoning", "evaluate_and_scale"].map((position): [string, string, CatalogSection["link"], Target | null, LinkDisplay] => [
      `follow-up probing a section in ${position}`,
      "follow_ups",
      released,
      target("scope_clarification", position),
      line(`Probes: ${{ frame: "Frame", requirements: "Requirements", design: "Design", ml_reasoning: "ML Reasoning", evaluate_and_scale: "Evaluate & Scale" }[position]}`),
   ]),
   // follow-up -> assumption, deep_dive or trade_offs: the target heading, its title else its type label (S-VOC-7)
   ["follow-up probing an assumption", "follow_ups", released, target("assumption", "frame", "Fan-out is bounded"), line("Probes: Fan-out is bounded")],
   ["follow-up probing a titled deep dive", "follow_ups", released, target("deep_dive", "depth_and_trade_offs", "Ordering"), line("Probes: Ordering")],
   ["follow-up probing an untitled deep dive", "follow_ups", released, target("deep_dive", "depth_and_trade_offs"), line("Probes: Deep dive")],
   ["follow-up probing an untitled decision", "follow_ups", released, target("trade_offs", "depth_and_trade_offs"), line("Probes: Trade-offs")],
   // follow-up -> follow-up: a branch under its parent, no line of its own
   ["follow-up that is a branch", "follow_ups", released, target("follow_ups", "follow_ups", "Parent"), line(null, false, "target")],
   // any follow-up whose target is withheld renders top-level with the generic phrase
   ["follow-up, target withheld", "follow_ups", withheld, null, line(WITHHELD_LINK.follow_ups, true)],
   // assumption
   ["assumption conditioning a decision", "assumption", released, target("trade_offs", "depth_and_trade_offs", "Queue or direct send"), line("Conditions: Queue or direct send")],
   ["assumption conditioning an untitled deep dive", "assumption", released, target("deep_dive", "depth_and_trade_offs"), line("Conditions: Deep dive")],
   ["assumption, target withheld", "assumption", withheld, null, line("Conditions: material included with full access", true)],
   // alternative
   ["alternative to a decision", "alternative", released, target("trade_offs", "depth_and_trade_offs", "Queue or direct send"), line("Alternative to: Queue or direct send")],
   ["alternative to the reference design", "alternative", released, target("reference_design", "reference_solution", "Whatever it is called"), line("Alternative to: the reference solution")],
   ["alternative, target withheld", "alternative", withheld, null, line("Alternative to: material included with full access", true)],
   // rubric dimension
   ["rubric dimension evaluating a stage", "rubric_dimension", released, target("high_level_design", "design", "High-level design"), line("Mostly evaluates: Design")],
   ["rubric dimension evaluating a unit", "rubric_dimension", released, target("deep_dive", "depth_and_trade_offs", "Ordering"), line("Mostly evaluates: Depth & Trade-offs")],
   ["rubric dimension, target withheld", "rubric_dimension", withheld, null, line("Mostly evaluates: material included with full access", true)],
];

describe("linkDisplay: every row of spec §6.5", () => {
   it.each(ROWS)("%s", (_, type, link, linked, expected) => {
      expect(linkDisplay({ type, link }, linked ? [other, linked] : [other])).toEqual(expected);
   });

   it("gives each source one generic withheld phrase, and none names a type", () => {
      expect(WITHHELD_LINK).toEqual({
         follow_ups: "Linked to material included with full access",
         assumption: "Conditions: material included with full access",
         alternative: "Alternative to: material included with full access",
         rubric_dimension: "Mostly evaluates: material included with full access",
      });
      for (const phrase of Object.values(WITHHELD_LINK)) expect(phrase).not.toMatch(/hint|decision|deep|trade|follow-up question|assumption|reference|rubric/i);
   });

   it("shows nothing for no link, for a type no row covers, and for a link no row can read", () => {
      const sections = [target("trade_offs", "depth_and_trade_offs", "Decision")];
      expect(linkDisplay({ type: "assumption", link: null }, sections)).toEqual(line(null));
      expect(linkDisplay({ type: "assumption" }, sections)).toEqual(line(null));
      expect(linkDisplay({ type: "clarification", link: released }, [target("trade_offs", "depth_and_trade_offs", "Decision")])).toEqual(line(null));
      expect(linkDisplay({ type: "clarification", link: withheld }, sections)).toEqual(line(null));
      expect(linkDisplay({ type: "assumption", link: { target: "missing", withheld: false } }, sections)).toEqual(line(null));
      expect(linkDisplay({ type: "follow_ups", link: released }, [target("alternative", "reference_solution", "Alt")])).toEqual(line(null));
      expect(linkDisplay({ type: "follow_ups", link: released }, [target("scope_clarification", null)])).toEqual(line(null));
      expect(linkDisplay({ type: "follow_ups", link: released }, [target("scope_clarification", "unknown_position")])).toEqual(line(null));
      expect(linkDisplay({ type: "assumption", link: released }, [target("mystery_type", "depth_and_trade_offs")])).toEqual(line(null));
   });

   it("reads one hop: a target's own link is never followed", () => {
      const sections: Target[] = [{ ...target("follow_ups", "follow_ups", "Parent"), link: { target: "grand", withheld: true } } as Target];
      expect(linkDisplay({ type: "follow_ups", link: released }, sections)).toEqual(line(null, false, "target"));
   });
});
