import { describe, expect, it } from "vitest";
import { safeCheckoutUrl } from "./checkout-url";

describe("safeCheckoutUrl", () => {
   it("accepts Stripe's hosted origin, with a path and fragment", () => {
      expect(safeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_abc#fidkdWx")).toBe("https://checkout.stripe.com/c/pay/cs_test_abc#fidkdWx");
   });

   it.each([
      "http://checkout.stripe.com/c/pay/x",
      "https://checkout.stripe.com.evil.example/x",
      "https://evil.example/https://checkout.stripe.com/",
      "https://checkout.stripe.com@evil.example/",
      "https://user:pw@checkout.stripe.com/x",
      "https://checkout.stripe.com:8443/x",
      "//checkout.stripe.com/x",
      "/pricing",
      "javascript:alert(1)",
      "data:text/html,x",
      "https://checkout.stripe.com\\@evil.example/",
      "https://checkout.stripe.com/x y",
      "",
      "not a url",
   ])("rejects %j", (value) => {
      expect(safeCheckoutUrl(value)).toBeNull();
   });

   it("rejects anything that is not a string, and an over-long URL", () => {
      for (const value of [null, undefined, 1, {}, ["https://checkout.stripe.com/"]]) expect(safeCheckoutUrl(value)).toBeNull();
      expect(safeCheckoutUrl(`https://checkout.stripe.com/${"a".repeat(5000)}`)).toBeNull();
   });

   it.each([
      "http://127.0.0.1:4100/__test-checkout",
      "http://localhost:4100/pay",
      "http://[::1]:4100/pay",
      "https://localhost/pay",
      "https://api.example.com/pay",
   ])("rejects %j in every environment, whatever the API origin is", (value) => {
      expect(safeCheckoutUrl(value)).toBeNull();
   });
});
