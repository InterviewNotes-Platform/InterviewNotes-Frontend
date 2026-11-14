import { describe, expect, it, vi } from "vitest";
import { createBillingClient, isBillingStatus, isSessionId } from "./client";
import type { BillingStatus } from "./types";

const STATUS: BillingStatus = { premium: false, source: "none", plan: null, state: "none", active_until: null, grace_until: null, renews: false, purchase_enabled: true };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function setup(reply: () => Response | Promise<Response>, token: string | null = "tok") {
   const fetchMock = vi.fn<typeof fetch>(async () => reply());
   const client = createBillingClient({ baseUrl: "https://api.example.com/", getAccessToken: async () => token, fetch: fetchMock, timeoutMs: 50 });
   return { client, fetchMock };
}

describe("billing client", () => {
   it("posts exactly the plan key with the bearer token and nothing else", async () => {
      const { client, fetchMock } = setup(() => json(200, { checkout_url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
      expect(await client.startCheckout("three_year")).toEqual({ status: "ok", data: { checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1" } });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.example.com/me/billing/checkout");
      expect(init).toMatchObject({ method: "POST", cache: "no-store", credentials: "omit", body: '{"plan":"three_year"}' });
      expect(init?.headers).toEqual({ Authorization: "Bearer tok", Accept: "application/json", "Content-Type": "application/json" });
   });

   it("makes no request without a session", async () => {
      const { client, fetchMock } = setup(() => json(200, STATUS), null);
      expect(await client.startCheckout("annual")).toEqual({ status: "unauthenticated" });
      expect(await client.getStatus()).toEqual({ status: "unauthenticated" });
      expect(fetchMock).not.toHaveBeenCalled();
   });

   it("never resolves an unsafe or missing checkout URL", async () => {
      for (const body of [{ checkout_url: "https://evil.example/pay" }, { checkout_url: "javascript:1" }, { url: "https://checkout.stripe.com/" }, "x", null]) {
         const { client } = setup(() => json(200, body));
         expect(await client.startCheckout("annual")).toEqual({ status: "unavailable", cause: "malformed" });
      }
   });

   it("refuses a loopback checkout URL even when the API itself is on loopback", async () => {
      const client = createBillingClient({ baseUrl: "http://127.0.0.1:4100", getAccessToken: async () => "tok", fetch: async () => json(200, { checkout_url: "http://127.0.0.1:4100/__test-checkout" }) });
      expect(await client.startCheckout("annual")).toEqual({ status: "unavailable", cause: "malformed" });
   });

   it("maps the documented refusals and keeps unknown ones generic", async () => {
      const cases: [number, unknown, unknown][] = [
         [401, { code: "unauthenticated" }, { status: "unauthenticated" }],
         [403, { code: "billing_disabled" }, { status: "refused", code: "billing_disabled" }],
         [409, { code: "already_entitled", current: "lifetime" }, { status: "refused", code: "already_entitled" }],
         [409, { code: "subscription_active" }, { status: "refused", code: "subscription_active" }],
         [422, { code: "validation_error" }, { status: "refused", code: "validation_error" }],
         [409, { code: "something_new" }, { status: "refused", code: "unknown" }],
         [503, { code: "billing_unavailable" }, { status: "unavailable", cause: "upstream" }],
         [500, {}, { status: "unavailable", cause: "upstream" }],
      ];
      for (const [status, body, expected] of cases) expect(await setup(() => json(status, body)).client.startCheckout("annual")).toEqual(expected);
   });

   it("reports a transport failure and a timeout as ambiguous causes, without retrying", async () => {
      const failing = setup(() => Promise.reject(new TypeError("network")));
      expect(await failing.client.startCheckout("annual")).toEqual({ status: "unavailable", cause: "transport" });
      expect(failing.fetchMock).toHaveBeenCalledTimes(1);
      const hanging = setup(() => new Promise<Response>(() => undefined));
      const slow = createBillingClient({
         baseUrl: "https://api.example.com",
         getAccessToken: async () => "tok",
         fetch: ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch,
         timeoutMs: 20,
      });
      expect(await slow.getStatus()).toEqual({ status: "unavailable", cause: "timeout" });
      expect(hanging.fetchMock).not.toHaveBeenCalled();
   });

   it("confirm sends only the session id; status is a GET without a body", async () => {
      const confirm = setup(() => json(200, STATUS));
      expect(await confirm.client.confirm("cs_test_abc")).toEqual({ status: "ok", data: STATUS });
      expect(confirm.fetchMock.mock.calls[0][0]).toBe("https://api.example.com/me/billing/checkout/confirm");
      expect(confirm.fetchMock.mock.calls[0][1]?.body).toBe('{"session_id":"cs_test_abc"}');
      const status = setup(() => json(200, STATUS));
      await status.client.getStatus();
      expect(status.fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", body: undefined });
      expect(await setup(() => json(404, { code: "not_found" })).client.confirm("cs_test_x")).toEqual({ status: "notFound" });
   });

   it("treats an unknown or incomplete status as malformed, never as a state", async () => {
      for (const body of [{ ...STATUS, state: "paid" }, { ...STATUS, premium: "true" }, { ...STATUS, source: "card" }, { ...STATUS, plan: "monthly" }, { premium: true }, [], null]) {
         expect(await setup(() => json(200, body)).client.getStatus()).toEqual({ status: "unavailable", cause: "malformed" });
      }
   });
});

describe("guards", () => {
   it("accepts every documented state and plan", () => {
      for (const state of ["none", "pending", "failed", "active", "canceling", "past_due", "expired", "refunded", "manual"]) expect(isBillingStatus({ ...STATUS, state })).toBe(true);
      for (const plan of [null, "manual", "annual", "three_year", "lifetime"]) expect(isBillingStatus({ ...STATUS, plan })).toBe(true);
   });

   it("matches the session id pattern the backend uses", () => {
      expect(isSessionId("cs_test_a1B2")).toBe(true);
      expect(isSessionId("cs_live_a1B2")).toBe(true);
      for (const value of ["cs_dev_a", "cs_test_", "cs_test_a b", "../cs_test_a", `cs_test_${"a".repeat(260)}`, "", null, undefined]) expect(isSessionId(value)).toBe(false);
   });
});
