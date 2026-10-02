import { describe, expect, it } from "vitest";
import { firstPartyPath } from "./routes";

describe("firstPartyPath", () => {
   it.each([
      ["https://interviewnotes.io/lessons/foo", "/lessons/foo"],
      ["https://www.interviewnotes.io/problems/bar", "/problems/bar"],
      ["https://dev.interviewnotes.io/tracks/baz#intro", "/tracks/baz#intro"],
      ["https://beta.interviewnotes.io/knowledge/qux/", "/knowledge/qux/"],
      ["https://INTERVIEWNOTES.IO/learn/course", "/learn/course"],
      ["https://interviewnotes.io./lessons/foo", "/lessons/foo"],
      ["https://interviewnotes.io:8443/lessons/foo", "/lessons/foo"],
      ["https://interviewnotes.io", "/"],
   ])("maps %s to %s", (url, expected) => {
      expect(firstPartyPath(url)).toBe(expected);
   });

   it("drops the query, so no selector can ride along", () => {
      expect(firstPartyPath("https://interviewnotes.io/lessons/foo?branch=main&commit=abc#x")).toBe("/lessons/foo#x");
   });

   it.each([
      ["https://interviewnotes.io//evil.example/path", "/evil.example/path"],
      ["https://interviewnotes.io///evil.example", "/evil.example"],
      ["https://interviewnotes.io/\\evil.example", "/evil.example"],
   ])("never returns a path that leaves the site: %s", (url, expected) => {
      const path = firstPartyPath(url);
      expect(path).toBe(expected);
      expect(path).not.toMatch(/^\/\//);
   });

   it.each([
      "https://example.com/lessons/foo",
      "https://interviewnotes.io.evil.example/lessons/foo",
      "https://evilinterviewnotes.io/lessons/foo",
      "https://interviewnotes.io@evil.example/lessons/foo",
      "https://evil.example/https://interviewnotes.io/lessons/foo",
      "http://interviewnotes.io/lessons/foo",
      "ftp://interviewnotes.io/lessons/foo",
      "//interviewnotes.io/lessons/foo",
      "/lessons/foo",
      "#anchor",
      "ref:lesson.foo",
      "not a url",
      "",
   ])("leaves %j alone", (url) => {
      expect(firstPartyPath(url)).toBeNull();
   });
});
