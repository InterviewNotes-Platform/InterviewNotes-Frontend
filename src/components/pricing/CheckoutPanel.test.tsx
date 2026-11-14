import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutPanel } from "./CheckoutPanel";
import type { BillingClient } from "@/lib/billing/client";
import { CHECKOUT_COPY } from "@/lib/billing/copy";
import type { BillingResult } from "@/lib/billing/types";

type Start = BillingResult<{ checkoutUrl: string }>;
const OK: Start = { status: "ok", data: { checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1" } };

function setup(...replies: (Start | Promise<Start>)[]) {
   const startCheckout = vi.fn();
   for (const reply of replies) startCheckout.mockImplementationOnce(() => Promise.resolve(reply));
   const client = { startCheckout, confirm: vi.fn(), getStatus: vi.fn() } as unknown as BillingClient;
   const navigate = vi.fn();
   render(<CheckoutPanel apiUrl="https://api.example.com" client={client} navigate={navigate} />);
   return { startCheckout, navigate };
}

const buy = (name: RegExp) => screen.getByRole("button", { name });
const status = () => screen.getByRole("status");

beforeEach(() => window.history.replaceState({}, "", "/pricing"));
afterEach(() => vi.restoreAllMocks());

describe("CheckoutPanel", () => {
   it("makes no request until a plan is chosen", () => {
      const { startCheckout, navigate } = setup();
      expect(screen.getAllByRole("button")).toHaveLength(3);
      expect(startCheckout).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(status()).toBeEmptyDOMElement();
   });

   it.each([
      [/Buy Annual/, "annual"],
      [/Buy 3-year/, "three_year"],
      [/Buy Lifetime/, "lifetime"],
   ])("%s requests exactly that plan key and goes to the returned hosted URL", async (name, plan) => {
      const { startCheckout, navigate } = setup(OK);
      fireEvent.click(buy(name));
      await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_1"));
      expect(startCheckout).toHaveBeenCalledExactlyOnceWith(plan);
      expect(status()).toHaveTextContent(CHECKOUT_COPY.redirecting);
   });

   it("ignores repeat clicks while a request is in flight and says it is starting", async () => {
      let release: (value: Start) => void = () => undefined;
      const { startCheckout, navigate } = setup(new Promise<Start>((resolve) => (release = resolve)));
      fireEvent.click(buy(/Buy Annual/));
      fireEvent.click(buy(/Buy Annual/));
      fireEvent.click(buy(/Buy Lifetime/));
      expect(startCheckout).toHaveBeenCalledTimes(1);
      expect(status()).toHaveTextContent(CHECKOUT_COPY.starting);
      for (const button of screen.getAllByRole("button")) expect(button).toHaveAttribute("aria-disabled", "true");
      await act(async () => release(OK));
      expect(navigate).toHaveBeenCalledTimes(1);
   });

   it("keeps the buttons locked after the redirect starts, and unlocks them when the page is restored from history", async () => {
      const { startCheckout, navigate } = setup(OK, OK);
      fireEvent.click(buy(/Buy Annual/));
      await waitFor(() => expect(navigate).toHaveBeenCalled());
      fireEvent.click(buy(/Buy Annual/));
      expect(startCheckout).toHaveBeenCalledTimes(1);
      act(() => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })));
      expect(buy(/Buy Annual/)).toHaveAttribute("aria-disabled", "false");
      expect(status()).toBeEmptyDOMElement();
   });

   it("asks a signed-out reader to sign in and returns to /pricing, without redirecting", async () => {
      const { navigate } = setup({ status: "unauthenticated" });
      fireEvent.click(buy(/Buy Annual/));
      await waitFor(() => expect(status()).toHaveTextContent(CHECKOUT_COPY.signIn));
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?redirect=%2Fpricing");
      expect(navigate).not.toHaveBeenCalled();
   });

   it.each<[string, Start, string, string | null]>([
      ["billing off", { status: "refused", code: "billing_disabled" }, CHECKOUT_COPY.disabled, null],
      ["already entitled", { status: "refused", code: "already_entitled" }, CHECKOUT_COPY.entitled, "/tracks"],
      ["subscription active", { status: "refused", code: "subscription_active" }, CHECKOUT_COPY.subscription, "/tracks"],
      ["a refused request", { status: "refused", code: "validation_error" }, CHECKOUT_COPY.unavailable, null],
      ["an upstream failure", { status: "unavailable", cause: "upstream" }, CHECKOUT_COPY.unavailable, null],
      ["an unsafe URL", { status: "unavailable", cause: "malformed" }, CHECKOUT_COPY.invalid, null],
   ])("%s: shows its message, never redirects, and lets the reader choose again", async (_name, reply, message, href) => {
      const { navigate, startCheckout } = setup(reply, OK);
      fireEvent.click(buy(/Buy Annual/));
      await waitFor(() => expect(status()).toHaveTextContent(message));
      expect(navigate).not.toHaveBeenCalled();
      if (href) expect(screen.getByRole("link", { name: "Browse the Tracks" })).toHaveAttribute("href", href);
      expect(buy(/Buy Annual/)).toHaveAttribute("aria-disabled", "false");
      fireEvent.click(buy(/Buy Annual/));
      await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
      expect(startCheckout).toHaveBeenCalledTimes(2);
   });

   it.each(["timeout", "transport"] as const)("a %s is ambiguous: no automatic retry, no claim that nothing was created, and a way to check status", async (cause) => {
      const { startCheckout, navigate } = setup({ status: "unavailable", cause });
      fireEvent.click(buy(/Buy Annual/));
      await waitFor(() => expect(status()).toHaveTextContent(CHECKOUT_COPY.ambiguous));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(startCheckout).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();
      expect(status().textContent).not.toMatch(/no (checkout|session|charge)|not (been )?charged/i);
      expect(screen.getByRole("link", { name: "Check my Premium status" })).toHaveAttribute("href", "/pricing/return");
   });

   it("shows the cancel wording from the return route, without any claim about being charged, and clears it on the next choice", async () => {
      window.history.replaceState({}, "", "/pricing?checkout=cancelled");
      const { startCheckout } = setup(OK);
      await waitFor(() => expect(status()).toHaveTextContent(CHECKOUT_COPY.cancelled));
      expect(status().textContent).not.toMatch(/charge|paid|refund|money/i);
      expect(startCheckout).not.toHaveBeenCalled();
      fireEvent.click(buy(/Buy Annual/));
      await waitFor(() => expect(status()).not.toHaveTextContent(CHECKOUT_COPY.cancelled));
   });

   it("any other checkout value shows nothing", () => {
      window.history.replaceState({}, "", "/pricing?checkout=success");
      setup();
      expect(status()).toBeEmptyDOMElement();
   });

   it("without a public API URL, says so and makes no request", () => {
      render(<CheckoutPanel apiUrl={null} navigate={vi.fn()} />);
      fireEvent.click(buy(/Buy Annual/));
      expect(status()).toHaveTextContent(CHECKOUT_COPY.notConfigured);
   });

   it("writes nothing to browser storage and carries no promotion, tax, refund or Discord wording", async () => {
      const set = vi.spyOn(Storage.prototype, "setItem");
      setup(OK);
      fireEvent.click(buy(/Buy Annual/));
      await waitFor(() => expect(status()).toHaveTextContent(CHECKOUT_COPY.redirecting));
      expect(set).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toMatch(/discount|coupon|promo|trial|refund|tax|discord|priority|stripe/i);
   });
});
