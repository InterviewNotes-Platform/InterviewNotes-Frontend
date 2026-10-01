import { describe, expect, it } from "vitest";
import { catalogEntryHref, catalogHref, linkableEntries } from "./routes";

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

describe("catalogEntryHref", () => {
   it("maps an entry whose id agrees with its type and slug", () => {
      expect(catalogEntryHref({ id: "lesson.a", type: "lesson", slug: "a" })).toBe("/lessons/a");
      expect(catalogEntryHref({ id: "track.t", type: "track", slug: "t" })).toBe("/tracks/t");
   });

   it.each([
      ["a type that disagrees with the id", { id: "lesson.a", type: "problem", slug: "a" }],
      ["a slug that disagrees with the id", { id: "lesson.a", type: "lesson", slug: "b" }],
      ["a path-like slug", { id: "lesson.a/../b", type: "lesson", slug: "a/../b" }],
      ["a query-bearing slug", { id: "lesson.a?branch=x", type: "lesson", slug: "a?branch=x" }],
      ["an unknown type", { id: "course.a", type: "course", slug: "a" }],
   ])("fails closed for %s", (_name, entry) => {
      expect(catalogEntryHref(entry)).toBeNull();
   });
});

describe("linkableEntries", () => {
   it("keeps order and drops entries that cannot map to a canonical route", () => {
      const entries = [
         { id: "lesson.z", type: "lesson", slug: "z" },
         { id: "lesson.bad", type: "problem", slug: "bad" },
         { id: "problem.a", type: "problem", slug: "a" },
      ];
      expect(linkableEntries(entries)).toEqual([
         { entry: entries[0], href: "/lessons/z" },
         { entry: entries[2], href: "/problems/a" },
      ]);
   });
});
