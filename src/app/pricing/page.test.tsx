import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PricingPage from "./page";
import { PLANS, PREMIUM_BASELINE, PRICING_COPY } from "@/lib/pricing";

afterEach(() => vi.unstubAllEnvs());

// Words the launch offer must not carry (P8-D-026, D-031, D-033, P8-PREM-01, claims list 13–16, 19–20, 24).
const FORBIDDEN = /discord|priority|coupon|promo|discount|trial|refund|guarantee|tax|unlimited|gpt|openai|groq|accura|offer letter|stripe|best value|save \d/i;

describe("/pricing", () => {
   it("shows the three plans with the accepted amounts, currency and billing terms", () => {
      render(<PricingPage />);
      const plans = within(screen.getByRole("list", { name: "Premium plans" })).getAllByRole("listitem", { name: "" }).filter((li) => li.hasAttribute("data-plan"));
      expect(plans.map((li) => li.getAttribute("data-plan"))).toEqual(["annual", "three_year", "lifetime"]);
      expect(plans.map((li) => li.textContent)).toEqual([
         "Annual$50USD per yearRenews automatically every year.Access lasts to the end of the period you have paid for.",
         "3-year$100USD, one paymentOne-time payment. It does not renew.Access lasts 36 months.",
         "Lifetime$150USD, one paymentOne-time payment. It does not renew.Permanent access.",
      ]);
      expect(PLANS.map((p) => p.amount)).toEqual(["$50", "$100", "$150"]);
   });

   it("with purchase off has no operative control and says purchase is not available", () => {
      render(<PricingPage />);
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      expect(screen.getByText(PRICING_COPY.unavailable)).toBeInTheDocument();
      const main = screen.getByRole("main");
      expect(within(main).queryAllByRole("button")).toEqual([]);
      expect(main.querySelector("form, input, select, textarea")).toBeNull();
      expect(within(main).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/tracks"]);
      expect(main.querySelector('[data-purchase-entry="off"]')).not.toBeNull();
   });

   it("with purchase on shows one plan-specific buy action per accepted plan, in the plan order", () => {
      vi.stubEnv("NEXT_PUBLIC_PURCHASE_ENABLED", "true");
      render(<PricingPage />);
      const main = screen.getByRole("main");
      expect(main.querySelector('[data-purchase-entry="on"]')).not.toBeNull();
      expect(screen.queryByText(PRICING_COPY.unavailable)).toBeNull();
      expect(within(main).getAllByRole("button").map((b) => b.textContent)).toEqual([
         "Buy Annual, $50 USD per year",
         "Buy 3-year, $100 USD, one payment",
         "Buy Lifetime, $150 USD, one payment",
      ]);
      expect(main.querySelector("form")).toBeNull();
      expect(within(main).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/tracks"]);
   });

   it("treats only the exact string true as on", () => {
      vi.stubEnv("NEXT_PUBLIC_PURCHASE_ENABLED", "1");
      render(<PricingPage />);
      expect(document.querySelector('[data-purchase-entry="off"]')).not.toBeNull();
   });

   it("lists only what Premium includes today, in a table with column and row headers", () => {
      render(<PricingPage />);
      const table = screen.getByRole("table", { name: PRICING_COPY.comparisonCaption });
      expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Content", "Free", "Premium, any plan"]);
      expect(within(table).getAllByRole("rowheader")).toHaveLength(2);
      expect(within(table).getAllByRole("row")).toHaveLength(3);
      expect(screen.getByText(new RegExp(`As of ${PREMIUM_BASELINE.asOf}`))).toBeInTheDocument();
   });

   it("has a scope of its own and is not a reader route (P8-D-072)", () => {
      const { container } = render(<PricingPage />);
      expect(container.querySelector("[data-pricing]")).not.toBeNull();
      expect(container.querySelector("[data-reader]")).toBeNull();
   });

   it("carries no unsupported claim", () => {
      const { container } = render(<PricingPage />);
      expect(container.textContent).not.toMatch(FORBIDDEN);
      expect(JSON.stringify([PLANS, PRICING_COPY])).not.toMatch(FORBIDDEN);
   });
});
