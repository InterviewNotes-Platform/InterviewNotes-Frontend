import { describe, expect, it } from "vitest";
import type { AnswerDraft } from "@/lib/prep/answerDraft";
import type { DraftResult } from "./aiClient";
import { applyDraft, draftRequest, insertDraft, reviewRequest } from "./aiRequest";

const draft = (over: Partial<AnswerDraft> = {}): AnswerDraft => ({
   question_snapshot: "Tell me about a time you were stuck.",
   framework: "star",
   fields: { situation: "", task: "", action: "", result: "" },
   body: "",
   status: "draft",
   tags: [],
   ...over,
});
const star = (fields: DraftResult["fields"]): DraftResult => ({ framework: "star", fields, body: null, questions_to_ask_yourself: [] });
const free = (body: string | null): DraftResult => ({ framework: "free_form", fields: {}, body, questions_to_ask_yourself: [] });

describe("draftRequest", () => {
   it("sends the question, the framework and the typed text as notes, with no stories", () => {
      const request = draftRequest(draft({ fields: { situation: "S text", task: "", action: "A text", result: "" }, body: "extra" }));
      expect(request).toEqual({
         question: "Tell me about a time you were stuck.",
         guidance: null,
         framework: "star",
         notes: "Situation\nS text\n\nAction\nA text\n\nextra",
         stories: [],
      });
   });

   it.each([
      ["there is no text", draft()],
      ["the question is blank", draft({ question_snapshot: "  ", body: "x" })],
      ["the framework is one the contract does not know", draft({ framework: "later", body: "x" })],
   ])("is null when %s", (_name, value) => expect(draftRequest(value)).toBeNull());
});

describe("reviewRequest", () => {
   it("sends only the non-empty fields and a null body when there is none", () => {
      expect(reviewRequest(draft({ fields: { situation: "S", task: "", action: "", result: "" } }))?.answer).toEqual({ body: null, fields: { situation: "S" } });
      expect(reviewRequest(draft({ framework: "free_form", body: "B" }))).toMatchObject({ framework: "free_form", answer: { body: "B", fields: {} } });
   });

   it("is null with no text", () => expect(reviewRequest(draft())).toBeNull());
});

describe("applyDraft", () => {
   it("replaces the fields the draft fills and keeps the text of a field it left empty", () => {
      const current = draft({ fields: { situation: "mine", task: "my task", action: "", result: "" } });
      expect(applyDraft(star({ situation: "theirs", action: "their action" }), current)).toEqual({
         fields: { situation: "theirs", task: "my task", action: "their action", result: "" },
      });
   });

   it("replaces the body of a free-form draft, and changes nothing when the draft has none", () => {
      expect(applyDraft(free("new"), draft({ body: "old" }))).toEqual({ body: "new" });
      expect(applyDraft(free(null), draft({ body: "old" }))).toEqual({});
   });
});

describe("insertDraft", () => {
   it("adds the generated text after the reader's text in each field", () => {
      const current = draft({ fields: { situation: "mine", task: "", action: "keep", result: "" } });
      expect(insertDraft(star({ situation: "theirs", task: "t" }), current)).toEqual({
         fields: { situation: "mine\n\ntheirs", task: "t", action: "keep", result: "" },
      });
   });

   it("appends a free-form body, or fills an empty one", () => {
      expect(insertDraft(free("new"), draft({ body: "old" }))).toEqual({ body: "old\n\nnew" });
      expect(insertDraft(free("new"), draft())).toEqual({ body: "new" });
   });
});
