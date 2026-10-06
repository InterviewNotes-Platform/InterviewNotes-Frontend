import { describe, expect, it } from "vitest";
import { activeFilterCount, parsePracticeQuery, practiceHref, problemListParams, problemTopics, withKnownTrack, type PracticeQuery } from "./practice";
import type { CatalogMeta } from "./types";

const NONE: PracticeQuery = { tag: null, difficulty: null, level: null, track: null, access: null, cursor: null };
const meta = (over: Partial<CatalogMeta>): CatalogMeta => ({
   id: "problem.a",
   type: "problem",
   slug: "a",
   title: "A",
   summary: "",
   tags: [],
   category: "system_design",
   difficulty: null,
   level: null,
   access: "free",
   ...over,
});

describe("parsePracticeQuery", () => {
   it("reads every supported parameter", () => {
      expect(
         parsePracticeQuery({ tag: "rate-limiting", difficulty: "hard", level: "advanced", track: "ranking", access: "premium", cursor: "problem.next" })
      ).toEqual({ tag: "rate-limiting", difficulty: "hard", level: "advanced", track: "ranking", access: "premium", cursor: "problem.next" });
   });

   it("has no filter for an empty URL, and for the empty values a native form sends for 'All'", () => {
      expect(parsePracticeQuery({})).toEqual(NONE);
      expect(parsePracticeQuery({ tag: "", difficulty: "", level: "", track: "", access: "", cursor: "" })).toEqual(NONE);
   });

   it.each([
      ["an unknown difficulty", { difficulty: "trivial" }],
      ["a differently cased difficulty", { difficulty: "Hard" }],
      ["an unknown level", { level: "expert" }],
      ["an unknown access", { access: "gold" }],
      ["'all' as an access", { access: "all" }],
      ["a repeated parameter", { difficulty: ["easy", "hard"] }],
      ["a tag that is not kebab-case", { tag: "Rate Limiting" }],
      ["a tag with markup", { tag: "<script>" }],
      ["an oversized tag", { tag: "a".repeat(81) }],
      ["a malformed track slug", { track: "../etc" }],
      ["an oversized cursor", { cursor: "x".repeat(201) }],
   ])("ignores %s", (_name, raw) => {
      expect(parsePracticeQuery(raw as Record<string, string | string[]>)).toEqual(NONE);
   });

   it("ignores a parameter it does not know, such as the Module the API supports but Practice does not expose", () => {
      expect(parsePracticeQuery({ module: "retrieval", type: "lesson", category: "system_design", limit: "500" })).toEqual(NONE);
   });
});

describe("withKnownTrack", () => {
   it("keeps a Track the catalog lists and drops one it does not", () => {
      expect(withKnownTrack({ ...NONE, track: "ranking" }, ["ranking", "serving"]).track).toBe("ranking");
      expect(withKnownTrack({ ...NONE, track: "no-such-track" }, ["ranking"]).track).toBeNull();
      expect(withKnownTrack({ ...NONE, track: "ranking" }, []).track).toBeNull();
   });

   it("changes nothing else", () => {
      const query = { ...NONE, track: "nope", tag: "serving", cursor: "problem.c" };
      expect(withKnownTrack(query, ["ranking"])).toEqual({ ...query, track: null });
   });
});

describe("activeFilterCount", () => {
   it("counts the five filters and never the cursor", () => {
      expect(activeFilterCount(NONE)).toBe(0);
      expect(activeFilterCount({ ...NONE, cursor: "problem.c" })).toBe(0);
      expect(activeFilterCount({ tag: "a", difficulty: "easy", level: "advanced", track: "t", access: "free", cursor: "problem.c" })).toBe(5);
      expect(activeFilterCount({ ...NONE, difficulty: "easy", access: "premium" })).toBe(2);
   });
});

describe("practiceHref", () => {
   it("is the bare route with nothing to carry", () => {
      expect(practiceHref()).toBe("/practice");
      expect(practiceHref(NONE)).toBe("/practice");
   });

   it("carries each filter and the cursor in a fixed order, encoded", () => {
      expect(practiceHref({ cursor: "problem.p2-t7-12-x", access: "free", track: "ranking", level: "advanced", difficulty: "hard", tag: "latency" })).toBe(
         "/practice?tag=latency&difficulty=hard&level=advanced&track=ranking&access=free&cursor=problem.p2-t7-12-x"
      );
      expect(practiceHref({ cursor: "a b&c" })).toBe("/practice?cursor=a%20b%26c");
   });

   it("drops what is overridden to null, so a link cannot carry stale state", () => {
      expect(practiceHref({ ...NONE, difficulty: "easy", cursor: null })).toBe("/practice?difficulty=easy");
   });
});

describe("problemListParams", () => {
   it("asks for Problems only, with every active filter and the opaque cursor", () => {
      expect(problemListParams({ tag: "serving", difficulty: "medium", level: "intermediate", track: "serving-track", access: "free", cursor: "problem.c" }, 12)).toEqual({
         type: "problem",
         tag: "serving",
         difficulty: "medium",
         level: "intermediate",
         access: "free",
         track: "serving-track",
         limit: 12,
         cursor: "problem.c",
      });
   });

   it("sends nothing for an absent filter, and never a Module or a category", () => {
      const params = problemListParams(NONE, 12);
      expect(params).toEqual({ type: "problem", limit: 12 });
      expect(Object.keys(params)).not.toContain("module");
      expect(Object.keys(params)).not.toContain("category");
   });
});

describe("problemTopics", () => {
   it("is the distinct tags across Problems, sorted", () => {
      expect(problemTopics([meta({ tags: ["serving", "latency"] }), meta({ tags: ["latency", "ranking"] })])).toEqual(["latency", "ranking", "serving"]);
   });

   it("takes nothing from an item that is not a Problem, and no tag that is not well-formed", () => {
      expect(
         problemTopics([
            meta({ tags: ["ranking", "Bad Tag", "", "UPPER", "kebab-ok"] }),
            meta({ type: "knowledge", tags: ["knowledge-only"] }),
            meta({ type: "lesson", tags: ["lesson-only"] }),
         ])
      ).toEqual(["kebab-ok", "ranking"]);
   });

   it("is empty for no Problems, or Problems with no tags", () => {
      expect(problemTopics([])).toEqual([]);
      expect(problemTopics([meta({ tags: [] })])).toEqual([]);
   });
});
