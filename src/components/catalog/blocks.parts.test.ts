import { describe, expect, it } from "vitest";
import { canonicalParts, headingIds, parseBlocks, partLabel, untargetedSeniorities, type Block } from "./blocks";
import { knowledgeCoverage } from "./knowledgeRefs";

const md = (text: string): Block => ({ type: "markdown", text });
const part = (name: string, children: Block[], seniority: string | null = null): Block => ({ type: "part", name, seniority, children });

describe("parseBlocks: parts (S-PRT-1 … 3, C-26)", () => {
   it("splits top-level parts, keeping their authored order and the attributes of each", () => {
      const text = "::: part name=why_it_matters\nWhy.\n:::\n\n::: part name=answer\nAnswer.\n:::\n\n::: part name=bar seniority=staff\nBar.\n:::";
      expect(parseBlocks(text)).toEqual([
         part("why_it_matters", [md("Why.")]),
         part("answer", [md("Answer.")]),
         part("bar", [md("Bar.")], "staff"),
      ]);
   });

   it("reads a quoted value and refuses a malformed, unknown or repeated attribute as prose", () => {
      expect(parseBlocks('::: part name="answer"\nA.\n:::')).toEqual([part("answer", [md("A.")])]);
      for (const line of ["::: part", "::: part seniority=senior", "::: part name=answer extra=1", "::: part name=answer name=answer", '::: part name="open', "::: partial name=answer"]) {
         expect(parseBlocks(`${line}\nBody.\n:::`), line).toEqual([md(`${line}\nBody.\n:::`)]); // a stray closer is prose too
      }
   });

   it("keeps a callout inside a part, and the callout's closer does not close the part", () => {
      const text = "::: part name=answer\nBefore.\n::: callout kind=note\nInside.\n:::\nAfter.\n:::\n\n::: part name=why_it_matters\nNext.\n:::";
      expect(parseBlocks(text)).toEqual([
         part("answer", [md("Before."), { type: "callout", kind: "note", children: [md("Inside.")] }, md("After.")]),
         part("why_it_matters", [md("Next.")]),
      ]);
   });

   it("keeps a callout around a part-shaped line as prose, because a part is never nested (S-PRT-2)", () => {
      const nested = parseBlocks("::: callout kind=tip\n::: part name=answer\nText.\n:::\n\nOutside.");
      expect(nested).toEqual([{ type: "callout", kind: "tip", children: [md("::: part name=answer\nText.")] }, md("\nOutside.")]);
      expect(parseBlocks("::: part name=answer\n::: part name=why_it_matters\nText.\n:::")).toEqual([part("answer", [md("::: part name=why_it_matters\nText.")])]);
   });

   it("leaves part syntax inside a code fence literal, in a part and outside one", () => {
      const fenced = "```md\n::: part name=answer\nText.\n:::\n```";
      expect(parseBlocks(fenced)).toEqual([md(fenced)]);
      expect(parseBlocks(`::: part name=answer\n${fenced}\nTail.\n:::`)).toEqual([part("answer", [md(`${fenced}\nTail.`)])]);
      expect(parseBlocks("~~~\n:::\n~~~")).toEqual([md("~~~\n:::\n~~~")]);
   });

   it("closes an unterminated part at the end of the body, as it closes a callout", () => {
      expect(parseBlocks("::: part name=answer\nOpen.")).toEqual([part("answer", [md("Open.")])]);
   });

   it("is unchanged for legacy prose with no parts: markdown and callouts as before", () => {
      const text = "Interviewer: ten thousand per second.\n\nWhy it matters: sizing.\n\n::: callout kind=tip\nTip.\n:::";
      expect(parseBlocks(text)).toEqual([md("Interviewer: ten thousand per second.\n\nWhy it matters: sizing.\n"), { type: "callout", kind: "tip", children: [md("Tip.")] }]);
      expect(canonicalParts(parseBlocks(text))).toEqual(parseBlocks(text));
   });
});

describe("canonicalParts (S-PRT-6)", () => {
   it("presents a clarification's parts as answer, why it matters, then if different, whatever the authored order", () => {
      const blocks = parseBlocks("::: part name=if_different\nC.\n:::\n\n::: part name=answer\nA.\n:::\n\n::: part name=why_it_matters\nB.\n:::");
      expect(canonicalParts(blocks).map((block) => block.type === "part" && block.name)).toEqual(["answer", "why_it_matters", "if_different"]);
   });

   it("keeps authored order among parts of one name and puts an unlisted name after the listed ones", () => {
      const blocks = parseBlocks("::: part name=mystery\nM.\n:::\n\n::: part name=bar seniority=senior\nS.\n:::\n\n::: part name=bar seniority=staff\nT.\n:::\n\n::: part name=answer\nA.\n:::");
      expect(canonicalParts(blocks).map((block) => block.type === "part" && `${block.name}${block.seniority ? `:${block.seniority}` : ""}`)).toEqual([
         "answer",
         "bar:senior",
         "bar:staff",
         "mystery",
      ]);
   });

   it("presents bars in seniority order, mid to principal, whatever their authored order, after the other parts (S-PRT-6)", () => {
      const bars = ["principal", "mid", "staff", "senior"].map((level) => `::: part name=bar seniority=${level}\n${level}.\n:::`).join("\n\n");
      const blocks = parseBlocks(`${bars}\n\n::: part name=evaluates\nE.\n:::`);
      expect(canonicalParts(blocks).map((block) => block.type === "part" && (block.seniority ?? block.name))).toEqual(["evaluates", "mid", "senior", "staff", "principal"]);
   });

   it("puts an unattributed bar before attributed ones and an unlisted seniority after the listed ones", () => {
      const blocks = parseBlocks("::: part name=bar seniority=fellow\nF.\n:::\n\n::: part name=bar seniority=senior\nS.\n:::\n\n::: part name=bar\nU.\n:::");
      expect(canonicalParts(blocks).map((block) => block.type === "part" && block.seniority)).toEqual([null, "senior", "fellow"]);
   });

   it("reorders parts only, leaving anything else where it was, and does not mutate its input", () => {
      const blocks: Block[] = [part("why_it_matters", []), md("Between."), part("answer", [])];
      expect(canonicalParts(blocks)).toEqual([part("answer", []), md("Between."), part("why_it_matters", [])]);
      expect(blocks[0]).toEqual(part("why_it_matters", []));
   });
});

const barsOf = (...levels: (string | null)[]) => parseBlocks(levels.map((level) => `::: part name=bar${level ? ` seniority=${level}` : ""}\nBar.\n:::`).join("\n\n"));

describe("untargetedSeniorities (S-SEN-2)", () => {
   it("names the seniorities with no bar, in presentation order, whatever the authored order", () => {
      expect(untargetedSeniorities(barsOf("staff", "senior"))).toEqual(["mid", "principal"]);
      expect(untargetedSeniorities(barsOf("principal", "mid", "staff", "senior"))).toEqual([]);
   });

   it("names none for legacy prose, whose seniorities are undeclared, and none for an empty body", () => {
      expect(untargetedSeniorities(parseBlocks("Seniors explain the label bias; staff quantify it."))).toEqual([]);
      expect(untargetedSeniorities([])).toEqual([]);
   });

   it("counts a seniority outside the closed set as no target, and names none when a bar names no seniority", () => {
      expect(untargetedSeniorities(barsOf("fellow", "senior"))).toEqual(["mid", "staff", "principal"]);
      expect(untargetedSeniorities(barsOf(null, "senior"))).toEqual([]);
   });

   it("looks at bar parts only", () => {
      expect(untargetedSeniorities(parseBlocks("::: part name=evaluates\nE.\n:::"))).toEqual([]);
   });
});

describe("partLabel (S-RUB-4, S-SEN-3, S-SEN-4)", () => {
   const label = (text: string) => partLabel(parseBlocks(text)[0] as Extract<Block, { type: "part" }>);

   it("labels the rubric's parts in plain words and a bar by its seniority, never as a level", () => {
      expect([
         label("::: part name=evaluates\nE.\n:::"),
         label("::: part name=strong_evidence\nS.\n:::"),
         label("::: part name=weak_evidence\nW.\n:::"),
         label("::: part name=bar seniority=mid\nB.\n:::"),
         label("::: part name=bar seniority=principal\nB.\n:::"),
         label("::: part name=bar\nB.\n:::"),
      ]).toEqual(["What it evaluates", "Strong evidence", "Weak evidence", "Mid bar", "Principal bar", "The bar, for every seniority"]);
   });

   it("keeps a clarification's eyebrows, and has none for a part it does not know", () => {
      expect(label("::: part name=answer\nA.\n:::")).toBe("Interviewer's answer");
      expect(label("::: part name=mystery\nM.\n:::")).toBeUndefined();
   });
});

describe("what still sees a part's text", () => {
   const text = "::: part name=answer\n## One\nSee [x](ref:knowledge.x).\n:::\n\n::: part name=why_it_matters\n::: callout kind=note\n### Two\n:::\n:::";

   it("pairs the API's headings with the headings inside parts and callouts in them, in authored order", () => {
      const ids = headingIds(parseBlocks(text), [
         { id: "one", level: 2, text: "One" },
         { id: "two", level: 3, text: "Two" },
      ]);
      expect(ids).not.toBeNull();
      expect([...ids!.values()].flatMap((lines) => [...lines.values()].map(({ id }) => id))).toEqual(["one", "two"]);
   });

   it("still refuses to pair when the API and the body disagree, so a heading never carries a wrong id", () => {
      expect(headingIds(parseBlocks(text), [{ id: "one", level: 2, text: "One" }])).toBeNull();
   });

   it("finds the Knowledge reference inside a part", () => {
      const { offered } = knowledgeCoverage(parseBlocks(text), new Map([["knowledge.x", {}]]));
      expect(offered).toEqual(["knowledge.x"]);
   });
});
