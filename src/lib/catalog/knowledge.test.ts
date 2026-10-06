import { describe, expect, it } from "vitest";
import {
   KNOWLEDGE_GROUPS,
   bandsOf,
   categoryLabel,
   explorerHref,
   groupOf,
   inGroup,
   knowledgeRelations,
   parseExplorerQuery,
   parseGroup,
   sectionHeading,
   topicsOf,
} from "./knowledge";
import type { CatalogMeta, CatalogSection } from "./types";

const KNOWLEDGE_CATEGORIES = ["concept", "term", "technology", "research", "pattern", "quick_reference"] as const;

const meta = (id: string, overrides: Partial<CatalogMeta> = {}): CatalogMeta => {
   const [type, slug] = id.split(".");
   return { id, type: type as CatalogMeta["type"], slug, title: slug, summary: "", tags: [], category: null, difficulty: null, level: null, access: "free", ...overrides };
};
const section = (type: string, id = type, title: string | null = null): CatalogSection => ({ id, type, title, body: { format: "markdown@1", text: "x" } });

describe("categoryLabel", () => {
   it.each([
      ["concept", "Concept"],
      ["term", "Term"],
      ["technology", "Technology"],
      ["research", "Research"],
      ["pattern", "Pattern"],
      ["quick_reference", "Quick reference"],
   ])("names %s as %s", (category, label) => {
      expect(categoryLabel(category)).toBe(label);
   });

   it.each([null, undefined, "", "system_design", "ml_system_design", "gadget", "constructor", "__proto__"])("shows no label for %s", (category) => {
      expect(categoryLabel(category)).toBeNull();
   });
});

describe("editorial groups (P2 presentation of the canonical category)", () => {
   it("maps the categories exactly as the spec fixes them", () => {
      expect(KNOWLEDGE_GROUPS.map(({ label, categories }) => [label, categories])).toEqual([
         ["Core Concepts", ["concept", "term"]],
         ["Technologies & Research", ["technology", "research"]],
         ["Patterns", ["pattern"]],
         ["Quick References", ["quick_reference"]],
      ]);
   });

   it("places every Knowledge category in exactly one group", () => {
      for (const category of KNOWLEDGE_CATEGORIES) {
         expect(KNOWLEDGE_GROUPS.filter((group) => group.categories.includes(category))).toHaveLength(1);
      }
   });

   it.each([
      ["concept", "Core Concepts"],
      ["term", "Core Concepts"],
      ["technology", "Technologies & Research"],
      ["research", "Technologies & Research"],
      ["pattern", "Patterns"],
      ["quick_reference", "Quick References"],
   ])("groups %s under %s", (category, label) => {
      expect(groupOf(category)?.label).toBe(label);
      expect(inGroup({ category: category as CatalogMeta["category"] }, groupOf(category)!)).toBe(true);
   });

   it("leaves a null category, a Problem category and an unknown value in no group", () => {
      for (const category of [null, undefined, "system_design", "ml_system_design", "gadget"]) expect(groupOf(category)).toBeNull();
      for (const group of KNOWLEDGE_GROUPS) expect(inGroup({ category: null }, group)).toBe(false);
   });

   it("gives each group a unique id, a label and a one-line summary", () => {
      expect(new Set(KNOWLEDGE_GROUPS.map(({ id }) => id)).size).toBe(KNOWLEDGE_GROUPS.length);
      for (const { label, summary } of KNOWLEDGE_GROUPS) expect([label.length > 0, summary.length > 0]).toEqual([true, true]);
   });
});

describe("parseGroup: UI state is sanitised before it can reach a request", () => {
   it("accepts only the ids this page defines", () => {
      for (const { id } of KNOWLEDGE_GROUPS) expect(parseGroup(id)?.id).toBe(id);
   });

   it.each(["gadget", "system_design", "technology", "concept", "", " core-concepts", "CORE-CONCEPTS", undefined, null, 3, ["core-concepts"], {}])(
      "ignores %j",
      (value) => {
         expect(parseGroup(value)).toBeNull();
      }
   );
});

describe("parseExplorerQuery", () => {
   it("reads the group, tag and cursor", () => {
      expect(parseExplorerQuery({ group: "patterns", tag: "serving", cursor: "knowledge.a" })).toEqual({
         group: KNOWLEDGE_GROUPS[2],
         tag: "serving",
         cursor: "knowledge.a",
      });
   });

   it("is empty when nothing, or nothing usable, is given", () => {
      const empty = { group: null, tag: null, cursor: null };
      expect(parseExplorerQuery({})).toEqual(empty);
      expect(parseExplorerQuery({ group: "gadget", tag: "", cursor: "" })).toEqual(empty);
      expect(parseExplorerQuery({ tag: "   " })).toEqual(empty);
   });

   it("treats a repeated parameter as absent rather than choosing one", () => {
      expect(parseExplorerQuery({ group: ["patterns", "core-concepts"], tag: ["a", "b"], cursor: ["x", "y"] })).toEqual({ group: null, tag: null, cursor: null });
   });

   it("drops an oversized tag or cursor instead of forwarding it", () => {
      expect(parseExplorerQuery({ tag: "t".repeat(101) }).tag).toBeNull();
      expect(parseExplorerQuery({ cursor: "c".repeat(201) }).cursor).toBeNull();
      expect(parseExplorerQuery({ tag: "t".repeat(100) }).tag).toHaveLength(100);
   });

   it("ignores every other parameter, including a branch, commit or ref selector and a raw category", () => {
      expect(parseExplorerQuery({ branch: "x", commit: "abc", ref: "main", release: "1", category: "gadget", type: "problem" })).toEqual({ group: null, tag: null, cursor: null });
   });

   it("trims a tag but never rewrites a cursor, which is opaque", () => {
      expect(parseExplorerQuery({ tag: "  rag " }).tag).toBe("rag");
      expect(parseExplorerQuery({ cursor: " a b " }).cursor).toBe(" a b ");
   });
});

describe("explorerHref", () => {
   it("is the bare Knowledge route with no state", () => {
      expect(explorerHref()).toBe("/knowledge");
      expect(explorerHref({ group: null, tag: null, cursor: null })).toBe("/knowledge");
   });

   it("writes group, tag and cursor in that order, encoded", () => {
      expect(explorerHref({ group: KNOWLEDGE_GROUPS[0] })).toBe("/knowledge?group=core-concepts");
      expect(explorerHref({ tag: "a b&c" })).toBe("/knowledge?tag=a%20b%26c");
      expect(explorerHref({ cursor: "knowledge.x", tag: "t", group: KNOWLEDGE_GROUPS[3] })).toBe("/knowledge?group=quick-references&tag=t&cursor=knowledge.x");
   });

   it("round-trips through parseExplorerQuery", () => {
      const href = explorerHref({ group: KNOWLEDGE_GROUPS[1], tag: "vector search", cursor: "knowledge.p2-t6-a" });
      const query = Object.fromEntries(new URL(href, "http://x").searchParams);
      expect(parseExplorerQuery(query)).toEqual({ group: KNOWLEDGE_GROUPS[1], tag: "vector search", cursor: "knowledge.p2-t6-a" });
   });
});

describe("topicsOf", () => {
   it("lists each tag once, sorted", () => {
      expect(topicsOf([meta("knowledge.a", { tags: ["serving", "rag"] }), meta("knowledge.b", { tags: ["rag", "evaluation"] }), meta("knowledge.c")])).toEqual(["evaluation", "rag", "serving"]);
   });
});

describe("bandsOf", () => {
   const labelled = (sections: CatalogSection[]) => bandsOf(sections).map(({ label, sections: members }) => [label, members.map(({ id }) => id)]);

   it.each([
      ["definition", "Fast understanding"],
      ["quick_facts", "Fast understanding"],
      ["why_it_matters", "Fast understanding"],
      ["how_it_works", "Explanation"],
      ["architecture", "Explanation"],
      ["when_to_use", "Explanation"],
      ["when_not_to_use", "Explanation"],
      ["trade_offs", "Explanation"],
      ["failure_modes", "Deeper reference"],
      ["example", "Deeper reference"],
      ["interview_considerations", "Deeper reference"],
   ])("puts %s in %s", (type, band) => {
      expect(labelled([section(type)])).toEqual([[band, [type]]]);
   });

   it("puts a type it does not know in Deeper reference", () => {
      expect(labelled([section("deep_dive"), section("field_notes")])).toEqual([["Deeper reference", ["deep_dive", "field_notes"]]]);
   });

   it("renders only the bands that have content, in reading order", () => {
      expect(labelled([section("trade_offs")])).toEqual([["Explanation", ["trade_offs"]]]);
      expect(labelled([section("failure_modes"), section("definition")]).map(([label]) => label)).toEqual(["Fast understanding", "Deeper reference"]);
      expect(bandsOf([])).toEqual([]);
   });

   it("keeps the API's order inside each band, unknown types included", () => {
      const api = [section("example", "ex-1"), section("how_it_works"), section("mystery"), section("definition"), section("example", "ex-2"), section("quick_facts")];
      expect(labelled(api)).toEqual([
         ["Fast understanding", ["definition", "quick_facts"]],
         ["Explanation", ["how_it_works"]],
         ["Deeper reference", ["ex-1", "mystery", "ex-2"]],
      ]);
   });

   it("gives a quick reference one band and no empty headings", () => {
      expect(labelled([section("quick_facts")])).toEqual([["Fast understanding", ["quick_facts"]]]);
   });

   it("gives band ids a character a section id can never contain", () => {
      for (const { id } of bandsOf([section("definition"), section("how_it_works"), section("example")])) expect(id).toContain("_");
   });
});

describe("sectionHeading", () => {
   it("prefers the section's own title", () => {
      expect(sectionHeading({ type: "definition", title: "Plain words" })).toBe("Plain words");
   });

   it("falls back to the name of a known type when untitled or blank", () => {
      expect(sectionHeading({ type: "trade_offs", title: null })).toBe("Trade-offs");
      expect(sectionHeading({ type: "quick_facts", title: "  " })).toBe("Quick facts");
   });

   it("has no heading for an untitled section of an unknown type", () => {
      expect(sectionHeading({ type: "field_notes", title: null })).toBeNull();
      expect(sectionHeading({ type: "constructor", title: null })).toBeNull();
   });
});

describe("knowledgeRelations", () => {
   const lesson = meta("lesson.l1", { title: "Lesson one" });
   const problem = meta("problem.p1", { title: "Problem one", access: "premium" });
   const other = meta("knowledge.k2", { title: "Other knowledge" });

   it("groups targets by their own type, whatever the relation name", () => {
      const grouped = knowledgeRelations({ related: [lesson, problem, other], applied_in: [meta("lesson.l2")] }, "knowledge.self");
      expect(grouped.lessons.map(({ entry }) => entry.id)).toEqual(["lesson.l2", "lesson.l1"]);
      expect(grouped.problems.map(({ entry }) => entry.id)).toEqual(["problem.p1"]);
      expect(grouped.knowledge.map(({ entry }) => entry.id)).toEqual(["knowledge.k2"]);
   });

   it("labels each row by how it relates, and leaves the generic related edge unlabelled", () => {
      const grouped = knowledgeRelations(
         { prerequisite: [other], applied_in: [lesson], prerequisite_of: [meta("lesson.l3")], related: [meta("lesson.l4")] },
         "knowledge.self"
      );
      expect(grouped.knowledge.map(({ relation }) => relation)).toEqual(["Read first"]);
      expect(grouped.lessons.map(({ relation }) => relation)).toEqual(["Applied in", "Prerequisite for", null]);
   });

   it("lists a target once, under the first relation in reading order that names it", () => {
      const grouped = knowledgeRelations({ related: [lesson], applied_in: [lesson] }, "knowledge.self");
      expect(grouped.lessons).toHaveLength(1);
      expect(grouped.lessons[0].relation).toBe("Applied in");
   });

   it("keeps the API's order within a relation and links each row to its canonical route", () => {
      const grouped = knowledgeRelations({ related: [meta("lesson.b"), meta("lesson.a")] }, "knowledge.self");
      expect(grouped.lessons.map(({ href }) => href)).toEqual(["/lessons/b", "/lessons/a"]);
   });

   it("drops itself, an unlinkable target and an unknown relation name", () => {
      const grouped = knowledgeRelations(
         { related: [meta("knowledge.self"), { ...lesson, slug: "mismatch" }], mentions: [lesson], mentioned_in: [lesson] },
         "knowledge.self"
      );
      expect(grouped).toEqual({ lessons: [], problems: [], knowledge: [] });
   });

   it("is empty for an item with no relations", () => {
      expect(knowledgeRelations({}, "knowledge.self")).toEqual({ lessons: [], problems: [], knowledge: [] });
   });
});
