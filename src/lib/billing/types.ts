import { PLANS } from "@/lib/pricing";

export type PlanKey = (typeof PLANS)[number]["key"];

/** `GET /me/billing/status` (payment-spec §9.1). No Stripe ID, card or amount is ever part of it. */
export interface BillingStatus {
   premium: boolean;
   source: "none" | "manual" | "stripe";
   plan: "manual" | PlanKey | null;
   state: "none" | "pending" | "failed" | "active" | "canceling" | "past_due" | "expired" | "refunded" | "manual";
   active_until: string | null;
   grace_until: string | null;
   renews: boolean;
   purchase_enabled: boolean;
}

/** The 4xx codes `POST /me/billing/checkout` documents (§6.1); anything else is "unknown". */
export type CheckoutRefusal = "billing_disabled" | "already_entitled" | "subscription_active" | "validation_error" | "billing_unavailable" | "unknown";

export type BillingResult<T> =
   | { status: "ok"; data: T }
   | { status: "unauthenticated" }
   | { status: "notFound" }
   | { status: "refused"; code: CheckoutRefusal }
   | { status: "unavailable"; cause: "timeout" | "transport" | "upstream" | "malformed" };
