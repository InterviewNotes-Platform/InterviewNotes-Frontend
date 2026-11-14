import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckoutReturn, classify } from "./CheckoutReturn";
import type { BillingClient } from "@/lib/billing/client";
import { RETURN_COPY } from "@/lib/billing/copy";
import type { BillingResult, BillingStatus } from "@/lib/billing/types";

const base: BillingStatus = { premium: false, source: "none", plan: null, state: "none", active_until: null, grace_until: null, renews: false, purchase_enabled: true };
const status = (state: BillingStatus["state"], premium = false): BillingResult<BillingStatus> => ({ status: "ok", data: { ...base, state, premium, source: "stripe" } });
const SESSION = "cs_test_a1B2c3";

function setup(first: BillingResult<BillingStatus>, ...later: BillingResult<BillingStatus>[]) {
   const confirm = vi.fn(async () => first);
   const getStatus = vi.fn();
   for (const reply of later) getStatus.mockImplementationOnce(async () => reply);
   getStatus.mockImplementation(async () => later.at(-1) ?? first);
   const client = { confirm, getStatus, startCheckout: vi.fn() } as unknown as BillingClient;
   const view = render(<CheckoutReturn apiUrl="https://api.example.com" sessionId={SESSION} client={client} pollIntervalMs={5} pollWindowMs={60} />);
   return { confirm, getStatus, client, ...view };
}

const heading = () => screen.getByRole("heading", { level: 1 });
afterEach(() => vi.restoreAllMocks());

describe("classify", () => {
   it("calls it active only when the backend says premium", () => {
      expect(classify({ ...base, premium: true, state: "active" })).toBe("active");
      expect(classify({ ...base, premium: true, state: "past_due" })).toBe("active");
      expect(classify({ ...base, premium: false, state: "active" })).toBe("inactive");
      expect(classify({ ...base, state: "failed" })).toBe("failed");
      expect(classify({ ...base, state: "pending" })).toBe("waiting");
      expect(classify({ ...base, state: "none" })).toBe("waiting");
      expect(classify({ ...base, state: "expired" })).toBe("inactive");
      expect(classify({ ...base, state: "refunded" })).toBe("inactive");
   });
});

describe("CheckoutReturn", () => {
   it("starts as 'confirming' and, with the session, confirms exactly once", async () => {
      const { confirm } = setup(status("active", true));
      expect(heading()).toHaveTextContent(RETURN_COPY.confirming.heading);
      await waitFor(() => expect(heading()).toHaveTextContent(RETURN_COPY.active.heading));
      expect(confirm).toHaveBeenCalledExactlyOnceWith(SESSION);
      expect(screen.getByRole("link", { name: "Continue reading" })).toHaveAttribute("href", "/tracks");
   });

   it("moves focus to the result heading", async () => {
      setup(status("active", true));
      await waitFor(() => expect(heading()).toHaveFocus());
   });

   it("shows pending, then active once the backend confirms", async () => {
      const { getStatus } = setup(status("pending"), status("pending"), status("active", true));
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(RETURN_COPY.waiting.body));
      expect(screen.queryByText(RETURN_COPY.active.heading)).toBeNull();
      await waitFor(() => expect(heading()).toHaveTextContent(RETURN_COPY.active.heading));
      expect(getStatus).toHaveBeenCalledTimes(2);
   });

   it("never shows Premium from the URL: a session id with no payment ends unconfirmed, with a way to check again", async () => {
      const { getStatus } = setup(status("none"));
      await waitFor(() => expect(heading()).toHaveTextContent(RETURN_COPY.unconfirmed.heading));
      expect(getStatus).toHaveBeenCalled();
      expect(document.body.textContent).not.toMatch(/premium is active/i);
      expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Back to Pricing" })).toHaveAttribute("href", "/pricing");
   });

   it("stops polling inside the window and does not poll again once finished", async () => {
      const { getStatus } = setup(status("pending"));
      await waitFor(() => expect(heading()).toHaveTextContent(RETURN_COPY.unconfirmed.heading));
      const calls = getStatus.mock.calls.length;
      expect(calls).toBeLessThanOrEqual(13);
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(getStatus).toHaveBeenCalledTimes(calls);
   });

   it("Check again asks the backend to verify again and can then show active", async () => {
      const { confirm } = setup(status("pending"));
      await waitFor(() => expect(heading()).toHaveTextContent(RETURN_COPY.unconfirmed.heading));
      confirm.mockImplementationOnce(async () => status("active", true));
      fireEvent.click(screen.getByRole("button", { name: "Check again" }));
      await waitFor(() => expect(heading()).toHaveTextContent(RETURN_COPY.active.heading));
      expect(confirm).toHaveBeenCalledTimes(2);
   });

   it("shows a backend-confirmed failure without saying whether anything was charged", async () => {
      setup(status("failed"));
      await waitFor(() => expect(heading()).toHaveTextContent(RETURN_COPY.failed.heading));
      expect(document.body.textContent).not.toMatch(/charge|refund|money/i);
      expect(screen.getByRole("link", { name: "Back to Pricing" })).toHaveAttribute("href", "/pricing");
   });

   it.each<[string, BillingResult<BillingStatus>, keyof typeof RETURN_COPY]>([
      ["expired", status("expired"), "inactive"],
      ["refunded", status("refunded"), "inactive"],
      ["a signed-out reader", { status: "unauthenticated" }, "signIn"],
      ["another user's session", { status: "notFound" }, "notFound"],
   ])("%s", async (_name, reply, key) => {
      setup(reply);
      await waitFor(() => expect(heading()).toHaveTextContent((RETURN_COPY[key] as { heading: string }).heading));
   });

   it("keeps its words for an unreadable status: not success, not failure", async () => {
      setup({ status: "unavailable", cause: "malformed" });
      await waitFor(() => expect(heading()).toHaveTextContent(RETURN_COPY.unavailable.heading));
      expect(document.body.textContent).not.toMatch(/premium is active|did not complete/i);
      expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
   });

   it("without a usable session id it never calls confirm, and a plain 'none' is simply not Premium", async () => {
      const confirm = vi.fn();
      const getStatus = vi.fn(async () => status("none"));
      render(<CheckoutReturn apiUrl="https://api.example.com" sessionId={null} client={{ confirm, getStatus } as unknown as BillingClient} pollIntervalMs={5} pollWindowMs={60} />);
      await waitFor(() => expect(heading()).toHaveTextContent(RETURN_COPY.inactive.heading));
      expect(confirm).not.toHaveBeenCalled();
      expect(getStatus).toHaveBeenCalledTimes(1);
   });

   it("without a public API URL, says status is not available and makes no request", () => {
      render(<CheckoutReturn apiUrl={null} sessionId={SESSION} />);
      expect(heading()).toHaveTextContent(RETURN_COPY.notConfigured.heading);
   });

   it("stops polling when it unmounts", async () => {
      const { getStatus, unmount } = setup(status("pending"));
      await waitFor(() => expect(getStatus).toHaveBeenCalled());
      unmount();
      const calls = getStatus.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(getStatus).toHaveBeenCalledTimes(calls);
   });

   it("writes nothing to browser storage", async () => {
      const set = vi.spyOn(Storage.prototype, "setItem");
      setup(status("active", true));
      await waitFor(() => expect(heading()).toHaveTextContent(RETURN_COPY.active.heading));
      expect(set).not.toHaveBeenCalled();
   });
});
