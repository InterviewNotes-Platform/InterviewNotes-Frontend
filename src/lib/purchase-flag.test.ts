import { afterEach, expect, it, vi } from "vitest";
import { purchaseEnabled } from "./purchase-flag";

afterEach(() => vi.unstubAllEnvs());

it("is off unless the build sets exactly true, and is not an entitlement check", () => {
   expect(purchaseEnabled()).toBe(false);
   for (const value of ["", "TRUE", "1", "yes"]) {
      vi.stubEnv("NEXT_PUBLIC_PURCHASE_ENABLED", value);
      expect(purchaseEnabled()).toBe(false);
   }
   vi.stubEnv("NEXT_PUBLIC_PURCHASE_ENABLED", "true");
   expect(purchaseEnabled()).toBe(true);
});
