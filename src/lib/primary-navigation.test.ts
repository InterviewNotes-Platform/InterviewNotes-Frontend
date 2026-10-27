import { afterEach, describe, expect, it, vi } from "vitest";
import { activeArea, PREPARE_HREF, primaryNav, PRIMARY_NAV } from "./primary-navigation";

describe("primary navigation", () => {
   it("lists Tracks, Knowledge, Pricing and FAQ with their exact destinations, and no Practice", () => {
      expect(PRIMARY_NAV.map(({ label, href }) => [label, href])).toEqual([
         ["Tracks", "/#tracks"],
         ["Knowledge", "/knowledge"],
         ["Pricing", "/#pricing"],
         ["FAQ", "/#faq"],
      ]);
   });

   it("gives only the two route entries an area; the section links never read as the current page", () => {
      expect(PRIMARY_NAV.filter(({ area }) => area).map(({ label }) => label)).toEqual(["Tracks", "Knowledge"]);
   });
});

describe("primaryNav", () => {
   afterEach(() => vi.unstubAllEnvs());

   it("is the unchanged primary list while the flag is off, by default and for any value but true", () => {
      expect(primaryNav()).toBe(PRIMARY_NAV);
      for (const value of ["", "false", "1", "TRUE", "yes", " true"]) {
         vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", value);
         expect(primaryNav(), value).toBe(PRIMARY_NAV);
      }
   });

   it("adds Prepare after Knowledge, and nowhere else, when the flag is on", () => {
      vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true");
      expect(primaryNav().map(({ label, href }) => [label, href])).toEqual([
         ["Tracks", "/#tracks"],
         ["Knowledge", "/knowledge"],
         ["Prepare", PREPARE_HREF],
         ["Pricing", "/#pricing"],
         ["FAQ", "/#faq"],
      ]);
      expect(PREPARE_HREF).toBe("/prepare");
   });

   it("takes an explicit switch over the environment", () => {
      expect(primaryNav(true).map(({ label }) => label)).toContain("Prepare");
      vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true");
      expect(primaryNav(false)).toBe(PRIMARY_NAV);
   });
});

describe("activeArea", () => {
   it.each([
      ["/tracks", "learn"],
      ["/tracks/example", "learn"],
      ["/lessons/example", "learn"],
      ["/practice", "learn"],
      ["/practice/example", "learn"],
      ["/problems/example", "learn"],
      ["/knowledge", "knowledge"],
      ["/knowledge/example", "knowledge"],
      ["/prepare", "prepare"],
   ])("%s belongs to %s", (pathname, area) => {
      expect(activeArea(pathname)).toBe(area);
   });

   it.each(["/", "/login", "/signup", "/demo", "/auth/callback", "/unknown/tracks", "/not-a-route", "/learn", "/learn/example", "/learn/example/chapter"])(
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
      expect(activeArea("/problems/example?track=x")).toBe("learn");
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
