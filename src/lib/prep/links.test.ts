import { describe, expect, it } from "vitest";
import { ANSWER_ID, answerHref, newAnswerHref, questionRefFromParams, sameQuestion } from "./links";

const LESSON = "lesson.behavioral-prep-sde-2";

describe("newAnswerHref", () => {
   it("carries a story id beside, or without, a question", () => {
      const story = "11111111-1111-4111-8111-111111111111";
      expect(newAnswerHref(null, story)).toBe(`/prepare/new?story=${story}`);
      expect(newAnswerHref({ content_id: LESSON, question_id: "being-stuck" }, story)).toBe(`/prepare/new?content=${LESSON}&question=being-stuck&story=${story}`);
   });

   it("is the bare picker without a question", () => {
      expect(newAnswerHref()).toBe("/prepare/new");
      expect(newAnswerHref(null)).toBe("/prepare/new");
   });

   it("names the exact pair, and round-trips through the parser", () => {
      const href = newAnswerHref({ content_id: LESSON, question_id: "being-stuck" });
      expect(href).toBe(`/prepare/new?content=${LESSON}&question=being-stuck`);
      const params = Object.fromEntries(new URL(href, "http://x.test").searchParams);
      expect(questionRefFromParams(params)).toEqual({ content_id: LESSON, question_id: "being-stuck" });
   });
});

describe("questionRefFromParams", () => {
   it.each([
      [{}],
      [{ content: LESSON }],
      [{ question: "a" }],
      [{ content: [LESSON, LESSON], question: "a" }],
      [{ content: LESSON, question: "Being Stuck" }],
      [{ content: LESSON, question: "a".repeat(49) }],
      [{ content: "x".repeat(81), question: "a" }],
      [{ content: "../etc", question: "a" }],
      [{ content: LESSON, question: "a/b" }],
      [{ content: `${LESSON}\n`, question: "a" }],
   ])("rejects %j", (params) => {
      expect(questionRefFromParams(params)).toBeNull();
   });

   it("accepts a 48-character identifier", () => {
      const question = `${"a".repeat(47)}b`;
      expect(questionRefFromParams({ content: LESSON, question })).toEqual({ content_id: LESSON, question_id: question });
   });
});

describe("sameQuestion", () => {
   it("needs both parts to match", () => {
      const a = { content_id: LESSON, question_id: "q" };
      expect(sameQuestion(a, { ...a })).toBe(true);
      expect(sameQuestion(a, { ...a, question_id: "r" })).toBe(false);
      expect(sameQuestion(a, { ...a, content_id: "lesson.other" })).toBe(false);
   });
});

describe("answerHref", () => {
   it("is the editor route for an answer's id", () => {
      expect(answerHref("00000000-0000-4000-8000-000000000001")).toBe("/prepare/answers/00000000-0000-4000-8000-000000000001");
   });

   it("accepts only a UUID as an answer id", () => {
      expect(ANSWER_ID.test("00000000-0000-4000-8000-000000000001")).toBe(true);
      for (const bad of ["", "new", "../x", "00000000-0000-4000-8000-00000000000", "00000000-0000-4000-8000-0000000000012", "g0000000-0000-4000-8000-000000000001"]) {
        expect(ANSWER_ID.test(bad)).toBe(false);
      }
   });
});
