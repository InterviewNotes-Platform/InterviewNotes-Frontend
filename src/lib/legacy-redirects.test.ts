import { describe, expect, it } from "vitest";
import { compatibilityRedirects, LEGACY_REDIRECTS } from "./legacy-redirects";

describe("compatibilityRedirects", () => {
   it("starts with no approved legacy mapping", () => {
      expect(LEGACY_REDIRECTS).toEqual({});
   });

   it("sends every /learn path to the /tracks page with a temporary (307) redirect and leaves /tracks itself alone (P8 spec §5)", () => {
      expect(compatibilityRedirects()).toEqual([{ source: "/learn/:path*", destination: "/tracks", permanent: false }]);
   });

   it("lists an approved entry before the fallback, most specific first, and keeps it temporary", () => {
      const rules = compatibilityRedirects({ "a-course": "/tracks/a", "a-course/ch": "/lessons/b" });
      expect(rules.map((r) => r.source)).toEqual([
         "/learn/a-course/ch/:path*",
         "/learn/a-course/:path*",
         "/learn/:path*",
      ]);
      expect(rules.every((r) => r.permanent === false)).toBe(true);
      expect(rules[0].destination).toBe("/lessons/b");
   });
});
