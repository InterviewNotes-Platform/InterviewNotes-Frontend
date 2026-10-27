import { afterEach, describe, expect, it, vi } from "vitest";
import { prepEnabled } from "./prep-flag";

afterEach(() => vi.unstubAllEnvs());

describe("frontend PREP_ENABLED", () => {
   it("is off when unset", () => {
      vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", undefined);
      expect(prepEnabled()).toBe(false);
   });

   it.each(["", "false", "0", "1", "TRUE", "True", "on", " true", "true "])("is off for %j", (value) => {
      vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", value);
      expect(prepEnabled()).toBe(false);
   });

   it("is on only for exactly true", () => {
      vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true");
      expect(prepEnabled()).toBe(true);
   });
});
