import { describe, expect, it } from "vitest";
import { catalogHref } from "./routes";

describe("catalogHref", () => {
   it.each([
      ["lesson.dynamic-batching", "/lessons/dynamic-batching"],
      ["problem.llm-inference-platform", "/problems/llm-inference-platform"],
      ["knowledge.rag", "/knowledge/rag"],
      ["track.synthetic-track", "/tracks/synthetic-track"],
   ])("maps %s to %s", (id, href) => {
      expect(catalogHref(id)).toBe(href);
   });

   it.each([
      "",
      "rag",
      "course.rag",
      "lesson.",
      "lesson.Upper",
      "lesson.a/b",
      "lesson.a..b",
      "lesson.rag?branch=main",
      "https://evil.example",
      "lesson.rag\n/evil",
   ])("rejects %j", (id) => {
      expect(catalogHref(id)).toBeNull();
   });
});
