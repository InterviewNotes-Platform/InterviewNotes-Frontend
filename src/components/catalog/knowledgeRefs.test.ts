import { describe, expect, it } from "vitest";
import { parseBlocks } from "./blocks";
import { knowledgeCoverage } from "./knowledgeRefs";

const eligible = (...ids: string[]) => new Map(ids.map((id) => [id, {}]));

/** The pre-pass over a body: the ids offered, and the source text each marked link starts with, in document order. */
function cover(text: string, ...ids: string[]) {
   const { at, offered } = knowledgeCoverage(parseBlocks(text), eligible(...ids));
   const marks = [...at].flatMap(([block, offsets]) => [...offsets].map(([offset, id]) => ({ id, source: block.text.slice(offset).match(/^\[[^\]]*\]\([^)]*\)/)?.[0] })));
   return { offered, marks };
}

describe("knowledgeCoverage (S-KNW-2)", () => {
   it("marks only the first reference to a related target", () => {
      const { offered, marks } = cover("See [a](ref:knowledge.x) then [b](ref:knowledge.x) and [c](ref:knowledge.x).", "knowledge.x");
      expect(offered).toEqual(["knowledge.x"]);
      expect(marks).toEqual([{ id: "knowledge.x", source: "[a](ref:knowledge.x)" }]);
   });

   it("does not mark a repeat in a later paragraph or a later block", () => {
      const { marks } = cover("First [a](ref:knowledge.x).\n\n::: callout kind=tip\nAgain [b](ref:knowledge.x).\n:::\n\nAnd [c](ref:knowledge.x).", "knowledge.x");
      expect(marks.map(({ source }) => source)).toEqual(["[a](ref:knowledge.x)"]);
   });

   it.each([
      ["a Knowledge target outside the related set", "A [y](ref:knowledge.y)."],
      ["a Lesson reference", "A [l](ref:lesson.x)."],
      ["a Problem reference", "A [p](ref:problem.x)."],
      ["an external link", "A [e](https://example.com/knowledge.x)."],
      ["a reference in inline code", "Write `[a](ref:knowledge.x)` literally."],
      ["a reference in a fenced code block", "```md\n[a](ref:knowledge.x)\n```"],
   ])("ignores %s", (_, text) => {
      expect(cover(text, "knowledge.x")).toEqual({ offered: [], marks: [] });
   });

   it("ignores a reference inside a heading, at any level, and it does not use up the first reference", () => {
      const { offered, marks } = cover("# T [a](ref:knowledge.x)\n\n## H [b](ref:knowledge.x)\n\n### H3 [c](ref:knowledge.x)\n\nBody [d](ref:knowledge.x).", "knowledge.x");
      expect(offered).toEqual(["knowledge.x"]);
      expect(marks).toEqual([{ id: "knowledge.x", source: "[d](ref:knowledge.x)" }]);
   });

   it("offers nothing when the only reference is in a heading", () => {
      expect(cover("## [b](ref:knowledge.x)\n\nNo link here.", "knowledge.x")).toEqual({ offered: [], marks: [] });
   });

   it("finds references in lists, quotes, tables and callouts", () => {
      const text = "- item [a](ref:knowledge.a)\n\n> quote [b](ref:knowledge.b)\n\n| h |\n|---|\n| [c](ref:knowledge.c) |\n\n::: callout kind=note\nin [d](ref:knowledge.d)\n:::";
      expect(cover(text, "knowledge.a", "knowledge.b", "knowledge.c", "knowledge.d").offered).toEqual(["knowledge.a", "knowledge.b", "knowledge.c", "knowledge.d"]);
   });

   it("works in document order, whatever order the targets were supplied in", () => {
      const text = "One [b](ref:knowledge.b).\n\nTwo [a](ref:knowledge.a).\n\n::: callout kind=tip\nThree [c](ref:knowledge.c).\n:::";
      expect(cover(text, "knowledge.c", "knowledge.a", "knowledge.b").offered).toEqual(["knowledge.b", "knowledge.a", "knowledge.c"]);
   });

   it("marks each of several targets independently, with no id twice", () => {
      const { offered, marks } = cover("[a](ref:knowledge.a) [b](ref:knowledge.b) [a2](ref:knowledge.a) [b2](ref:knowledge.b) [a3](ref:knowledge.a)", "knowledge.a", "knowledge.b");
      expect(offered).toEqual(["knowledge.a", "knowledge.b"]);
      expect(new Set(marks.map(({ id }) => id)).size).toBe(marks.length);
   });

   it("is a pure function of the body and the targets: the same input gives the same marks, with no render involved", () => {
      const text = "Hi [a](ref:knowledge.a) and [b](ref:knowledge.b).";
      expect(cover(text, "knowledge.a", "knowledge.b")).toEqual(cover(text, "knowledge.a", "knowledge.b"));
   });

   it("keys each mark by the source offset of its link, within the block that holds it", () => {
      const blocks = parseBlocks("Lead.\n\nSee [a](ref:knowledge.a).");
      const { at } = knowledgeCoverage(blocks, eligible("knowledge.a"));
      const [[block, offsets]] = [...at];
      expect(block.type === "markdown" && block.text.startsWith("Lead.")).toBe(true);
      expect([...offsets.keys()].map((offset) => block.type === "markdown" && block.text.slice(offset, offset + 3))).toEqual(["[a]"]);
   });

   it("offers nothing for a body with no targets", () => {
      expect(cover("[a](ref:knowledge.a)")).toEqual({ offered: [], marks: [] });
   });
});
