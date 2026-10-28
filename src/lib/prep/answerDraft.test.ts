import { describe, expect, it } from "vitest";
import { changesOf, draftOf, hasStarText, starText } from "./answerDraft";
import type { Answer } from "./types";

const answer = (over: Partial<Answer> = {}): Answer => ({
   id: "00000000-0000-4000-8000-000000000001",
   source: "catalog",
   content_id: "lesson.behavioral-prep-sde-1",
   question_id: "being-stuck",
   question_snapshot: "Tell me about a time you were stuck.",
   snapshot_fallback: false,
   framework: "star",
   fields: {},
   body: null,
   status: "draft",
   tags: ["kept"],
   story_ids: [],
   created_at: "2026-01-01T00:00:00.000Z",
   updated_at: "2026-01-01T00:00:00.000Z",
   version: 1,
   ...over,
});

describe("draftOf", () => {
   it("gives every STAR key a string and turns a null body into an empty one", () => {
      expect(draftOf(answer({ fields: { action: "I wrote it." } }))).toEqual({
         question_snapshot: "Tell me about a time you were stuck.",
         framework: "star",
         fields: { situation: "", task: "", action: "I wrote it.", result: "" },
         body: "",
         status: "draft",
      });
   });
});

describe("changesOf", () => {
   it("is null for an untouched draft, so nothing is sent", () => {
      const saved = answer({ fields: { situation: "S" }, body: "B" });
      expect(changesOf(draftOf(saved), saved)).toBeNull();
   });

   it("sends only what differs", () => {
      const saved = answer({ fields: { situation: "S" }, body: "B" });
      const draft = draftOf(saved);
      expect(changesOf({ ...draft, status: "ready" }, saved)).toEqual({ status: "ready" });
      expect(changesOf({ ...draft, framework: "free_form" }, saved)).toEqual({ framework: "free_form" });
      expect(changesOf({ ...draft, body: "B2" }, saved)).toEqual({ body: "B2" });
   });

   it("sends the whole fields object when one field changes, without the empty keys", () => {
      const saved = answer({ fields: { situation: "S", task: "T" } });
      const draft = draftOf(saved);
      expect(changesOf({ ...draft, fields: { ...draft.fields, result: "R" } }, saved)).toEqual({ fields: { situation: "S", task: "T", result: "R" } });
   });

   it("clears a field by leaving its key out, and an emptied body by sending null", () => {
      const saved = answer({ fields: { situation: "S", task: "T" }, body: "B" });
      const draft = draftOf(saved);
      expect(changesOf({ ...draft, fields: { ...draft.fields, task: "" }, body: "" }, saved)).toEqual({ fields: { situation: "S" }, body: null });
   });

   it("treats an absent key and an empty one as the same", () => {
      const saved = answer({ fields: {}, body: "" });
      expect(changesOf(draftOf(saved), saved)).toBeNull();
   });

   it("never sends the question of a catalog answer, but does for a custom one", () => {
      const catalog = answer();
      expect(changesOf({ ...draftOf(catalog), question_snapshot: "Changed" }, catalog)).toBeNull();
      const custom = answer({ source: "custom", content_id: null, question_id: null });
      expect(changesOf({ ...draftOf(custom), question_snapshot: "My question" }, custom)).toEqual({ question_snapshot: "My question" });
   });

   it("keeps a framework this editor does not know until the reader switches", () => {
      const saved = answer({ framework: "car" });
      expect(changesOf(draftOf(saved), saved)).toBeNull();
      expect(changesOf({ ...draftOf(saved), framework: "star" }, saved)).toEqual({ framework: "star" });
   });
});

describe("starText", () => {
   it("labels the filled fields in STAR order and skips the empty ones", () => {
      const fields = { situation: "S text", task: "", action: "A text", result: "R text" };
      expect(starText(fields)).toBe("Situation\nS text\n\nAction\nA text\n\nResult\nR text");
      expect(hasStarText(fields)).toBe(true);
      expect(hasStarText({ situation: "", task: "", action: "", result: "" })).toBe(false);
   });
});
