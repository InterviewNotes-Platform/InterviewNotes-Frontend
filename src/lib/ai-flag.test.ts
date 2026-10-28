import { afterEach, describe, expect, it, vi } from "vitest";
import { aiEnabled } from "./ai-flag";

afterEach(() => vi.unstubAllEnvs());

describe("frontend build-time AI setting", () => {
   it("is off when unset", () => {
      vi.stubEnv("NEXT_PUBLIC_AI_ENABLED", undefined);
      expect(aiEnabled()).toBe(false);
   });

   it.each(["", "false", "0", "1", "TRUE", "on", " true", "true "])("is off for %j", (value) => {
      vi.stubEnv("NEXT_PUBLIC_AI_ENABLED", value);
      expect(aiEnabled()).toBe(false);
   });

   it("is on only for exactly true", () => {
      vi.stubEnv("NEXT_PUBLIC_AI_ENABLED", "true");
      expect(aiEnabled()).toBe(true);
   });
});
