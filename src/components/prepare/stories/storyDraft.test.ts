import { describe, expect, it } from "vitest";
import type { Story } from "@/lib/prep/types";
import { addTags, changesOf, createBodyOf, draftOf, emptyDraft, problemsOf } from "./storyDraft";

const story: Story = {
   id: "s1",
   title: "Migration",
   notes: "",
   year: 2024,
   framework: "star",
   fields: { situation: "Old stack", result: "Done" },
   tags: ["leadership"],
   answer_ids: [],
   created_at: "2026-01-01T00:00:00Z",
   updated_at: "2026-01-01T00:00:00Z",
   version: 3,
};

describe("problemsOf", () => {
   it("needs a title and a four-digit year in range, and treats an empty year as none", () => {
      expect(problemsOf({ ...emptyDraft(), title: "   " }).title).toBeDefined();
      expect(problemsOf({ ...emptyDraft(), title: "A" })).toEqual({});
      for (const year of ["1899", "2101", "24", "abcd", "20.5"]) expect(problemsOf({ ...emptyDraft(), title: "A", year }).year).toBeDefined();
      for (const year of ["1900", "2100", " 2024 "]) expect(problemsOf({ ...emptyDraft(), title: "A", year })).toEqual({});
   });
});

describe("createBodyOf", () => {
   it("sends the trimmed title, the year as a number and only the STAR fields with text", () => {
      const draft = { ...emptyDraft(), title: "  Outage  ", year: "2023", fields: { situation: "S", task: "", action: "", result: "R" }, tags: ["a"] };
      expect(createBodyOf(draft)).toEqual({ title: "Outage", framework: "star", notes: "", year: 2023, fields: { situation: "S", result: "R" }, tags: ["a"] });
      expect(createBodyOf({ ...draft, year: "" }).year).toBeNull();
   });
});

describe("changesOf", () => {
   it("is null for an untouched draft, even though the draft holds empty STAR keys the story lacks", () => {
      expect(changesOf(draftOf(story), story)).toBeNull();
   });

   it("names only what changed, and replaces fields and tags as a whole", () => {
      const draft = draftOf(story);
      expect(changesOf({ ...draft, title: "  Migration  " }, story)).toBeNull();
      expect(changesOf({ ...draft, title: "Cutover" }, story)).toEqual({ title: "Cutover" });
      expect(changesOf({ ...draft, year: "" }, story)).toEqual({ year: null });
      expect(changesOf({ ...draft, fields: { ...draft.fields, action: "Led it" } }, story)).toEqual({ fields: { situation: "Old stack", action: "Led it", result: "Done" } });
      expect(changesOf({ ...draft, fields: { ...draft.fields, situation: "" } }, story)).toEqual({ fields: { result: "Done" } });
      expect(changesOf({ ...draft, tags: ["leadership", "data"] }, story)).toEqual({ tags: ["leadership", "data"] });
      expect(changesOf({ ...draft, framework: "free_form", notes: "Prose" }, story)).toEqual({ framework: "free_form", notes: "Prose" });
   });

   it("keeps a framework this client does not know until the reader switches it", () => {
      const later = { ...story, framework: "car" };
      expect(changesOf(draftOf(later), later)).toBeNull();
   });
});

describe("addTags", () => {
   it("stores a tag as the API will: trimmed, lowercase, split on commas, first occurrence kept", () => {
      expect(addTags(["a"], "  B , a, C ,, ").tags).toEqual(["a", "b", "c"]);
   });

   it("refuses a tag over 40 characters and a twenty-first tag, leaving the tags unchanged", () => {
      const long = addTags(["a"], "x".repeat(41));
      expect(long.tags).toEqual(["a"]);
      expect(long.error).toMatch(/40/);
      const full = Array.from({ length: 20 }, (_, i) => `t${i}`);
      expect(addTags(full, "one more")).toEqual({ tags: full, error: expect.stringMatching(/20/) });
      expect(addTags(full, "t3").error).toBeUndefined();
   });
});
