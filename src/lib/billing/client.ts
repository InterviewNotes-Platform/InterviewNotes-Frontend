import { safeCheckoutUrl } from "./checkout-url";
import type { BillingResult, BillingStatus, CheckoutRefusal, PlanKey } from "./types";

export const BILLING_TIMEOUT_MS = 30_000;

export interface BillingClientConfig {
   /** The API origin as the browser reaches it. */
   baseUrl: string;
   /** The signed-in user's Supabase access token, or null. Called per request, never stored. */
   getAccessToken: () => Promise<string | null>;
   fetch?: typeof fetch;
   timeoutMs?: number;
}

const SOURCES = ["none", "manual", "stripe"];
const PLAN_VALUES = ["manual", "annual", "three_year", "lifetime"];
const STATES = ["none", "pending", "failed", "active", "canceling", "past_due", "expired", "refunded", "manual"];
const REFUSALS = ["billing_disabled", "already_entitled", "subscription_active", "validation_error", "billing_unavailable"];
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === "object" && value !== null && !Array.isArray(value);
}

const nullableText = (value: unknown) => value === null || typeof value === "string";

/** Strict on purpose: an unknown state or a missing field is a malformed answer, never a guess at success. */
export function isBillingStatus(body: unknown): body is BillingStatus {
   return (
      isRecord(body) &&
      typeof body.premium === "boolean" &&
      SOURCES.includes(body.source as string) &&
      (body.plan === null || PLAN_VALUES.includes(body.plan as string)) &&
      STATES.includes(body.state as string) &&
      nullableText(body.active_until) &&
      nullableText(body.grace_until) &&
      typeof body.renews === "boolean" &&
      typeof body.purchase_enabled === "boolean"
   );
}

export function isSessionId(value: string | null | undefined): value is string {
   return typeof value === "string" && value.length <= 255 && SESSION_ID.test(value);
}

/** A typed client for `/me/billing`. It sends the bearer token only, never an amount, price or URL, and stores nothing. */
export function createBillingClient(config: BillingClientConfig) {
   const base = config.baseUrl.replace(/\/$/, "");
   const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
   const timeoutMs = config.timeoutMs ?? BILLING_TIMEOUT_MS;

   async function call<T>(method: "GET" | "POST", path: string, body: unknown, read: (json: unknown) => T | null): Promise<BillingResult<T>> {
      const token = await config.getAccessToken().catch(() => null);
      if (!token) return { status: "unauthenticated" };
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
         timedOut = true;
         controller.abort();
      }, timeoutMs);
      try {
         const response = await doFetch(`${base}/me/billing${path}`, {
            method,
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
            body: body === undefined ? undefined : JSON.stringify(body),
            cache: "no-store",
            credentials: "omit",
            signal: controller.signal,
         });
         return await interpret(response, read);
      } catch {
         return { status: "unavailable", cause: timedOut ? "timeout" : "transport" };
      } finally {
         clearTimeout(timer);
      }
   }

   async function interpret<T>(response: Response, read: (json: unknown) => T | null): Promise<BillingResult<T>> {
      if (response.status === 401) return { status: "unauthenticated" };
      if (response.status === 404) return { status: "notFound" };
      let json: unknown = null;
      try {
         json = await response.json();
      } catch {
         json = null;
      }
      if ([403, 409, 422, 503].includes(response.status)) {
         const code = isRecord(json) && REFUSALS.includes(json.code as string) ? (json.code as CheckoutRefusal) : "unknown";
         return response.status === 503 ? { status: "unavailable", cause: "upstream" } : { status: "refused", code };
      }
      if (!response.ok) return { status: "unavailable", cause: "upstream" };
      const data = read(json);
      return data === null ? { status: "unavailable", cause: "malformed" } : { status: "ok", data };
   }

   const status = (json: unknown) => (isBillingStatus(json) ? json : null);

   return {
      /** Asks the backend to create the hosted session for a plan key. Resolves only a URL that passed `safeCheckoutUrl`. */
      startCheckout: (plan: PlanKey): Promise<BillingResult<{ checkoutUrl: string }>> =>
         call("POST", "/checkout", { plan }, (json) => {
            const url = isRecord(json) ? safeCheckoutUrl(json.checkout_url) : null;
            return url ? { checkoutUrl: url } : null;
         }),
      /** Asks the backend to verify the returned session with Stripe. The id selects what the backend checks; it proves nothing. */
      confirm: (sessionId: string): Promise<BillingResult<BillingStatus>> => call("POST", "/checkout/confirm", { session_id: sessionId }, status),
      getStatus: (): Promise<BillingResult<BillingStatus>> => call("GET", "/status", undefined, status),
   };
}

export type BillingClient = ReturnType<typeof createBillingClient>;
