import { describe, expect, it } from "vitest";
import { activeArea, PRIMARY_NAV } from "./primary-navigation";

describe("primary navigation", () => {
   it("lists Learn, Practice and Knowledge with their exact destinations", () => {
      expect(PRIMARY_NAV.map(({ label, href }) => [label, href])).toEqual([
         ["Learn", "/tracks"],
         ["Practice", "/practice"],
         ["Knowledge", "/knowledge"],
      ]);
   });
});

describe("activeArea", () => {
   it.each([
      ["/tracks", "learn"],
      ["/tracks/example", "learn"],
      ["/lessons/example", "learn"],
      ["/learn", "learn"],
      ["/learn/example", "learn"],
      ["/learn/example/chapter", "learn"],
      ["/practice", "practice"],
      ["/practice/example", "practice"],
      ["/problems/example", "practice"],
      ["/knowledge", "knowledge"],
      ["/knowledge/example", "knowledge"],
   ])("%s belongs to %s", (pathname, area) => {
      expect(activeArea(pathname)).toBe(area);
   });

   it.each(["/", "/login", "/signup", "/demo", "/auth/callback", "/unknown/tracks", "/not-a-route"])(
      "%s belongs to no area",
      (pathname) => {
         expect(activeArea(pathname)).toBeNull();
      }
   );

   it("matches whole segments, never lookalike prefixes or inherited object keys", () => {
      for (const pathname of ["/tracksfoo", "/learner", "/learn-more", "/lessons.json", "/Tracks", "/constructor", "/__proto__"]) {
         expect(activeArea(pathname), pathname).toBeNull();
      }
   });

   it("ignores a trailing slash and a query or hash on a normalized pathname", () => {
      expect(activeArea("/tracks/")).toBe("learn");
      expect(activeArea("/problems/example?track=x")).toBe("practice");
      expect(activeArea("/knowledge#section")).toBe("knowledge");
   });

   it("never infers an area from a query value or a nested segment", () => {
      expect(activeArea("/login?redirect=/tracks")).toBeNull();
      expect(activeArea("/login?next=/learn/ml-system-design")).toBeNull();
      expect(activeArea("/auth/knowledge")).toBeNull();
   });

   it("has no area without a pathname or a leading slash", () => {
      expect(activeArea(null)).toBeNull();
      expect(activeArea(undefined)).toBeNull();
      expect(activeArea("")).toBeNull();
      expect(activeArea("tracks")).toBeNull();
   });
});
