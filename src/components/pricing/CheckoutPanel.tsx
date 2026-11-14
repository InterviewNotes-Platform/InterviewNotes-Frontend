"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { CHECKOUT_COPY } from "@/lib/billing/copy";
import type { BillingClient } from "@/lib/billing/client";
import type { PlanKey } from "@/lib/billing/types";
import { useBillingClient } from "@/lib/billing/useBillingClient";
import { PLANS } from "@/lib/pricing";
import { TRACKS_ENTRY } from "@/lib/primary-navigation";

type View =
   | { kind: "idle" }
   | { kind: "starting" }
   | { kind: "redirecting" }
   | { kind: "failed"; reason: "signIn" | "disabled" | "entitled" | "subscription" | "unavailable" | "ambiguous" | "invalid" | "notConfigured" };

interface Props {
   apiUrl: string | null;
   client?: BillingClient;
   /** Where the browser is sent; a test replaces it. */
   navigate?: (url: string) => void;
}

const defaultNavigate = (url: string) => window.location.assign(url);
const noSubscription = () => () => undefined;
// The cancel route only selects wording; it asserts nothing about payment. The server render never sees it.
const checkoutParam = () => new URLSearchParams(window.location.search).get("checkout");

/** The operative purchase entry (P8-T33), mounted only when `NEXT_PUBLIC_PURCHASE_ENABLED` is on. It asks the API for a hosted URL and never takes a payment. */
export function CheckoutPanel({ apiUrl, client: injected, navigate = defaultNavigate }: Props) {
   const client = useBillingClient(apiUrl, injected);
   const [view, setView] = useState<View>({ kind: "idle" });
   const [dismissed, setDismissed] = useState(false);
   const cancelled = useSyncExternalStore(noSubscription, checkoutParam, () => null) === "cancelled" && !dismissed;
   const busy = useRef(false);

   useEffect(() => {
      // Returning with Back from the hosted page restores this page as it was left, so unlock it.
      const unlock = (event: PageTransitionEvent) => {
         if (event.persisted) {
            busy.current = false;
            setView({ kind: "idle" });
         }
      };
      window.addEventListener("pageshow", unlock);
      return () => window.removeEventListener("pageshow", unlock);
   }, []);

   async function start(plan: PlanKey) {
      if (busy.current) return;
      busy.current = true;
      setDismissed(true);
      if (!client) {
         busy.current = false;
         return setView({ kind: "failed", reason: "notConfigured" });
      }
      setView({ kind: "starting" });
      const result = await client.startCheckout(plan);
      if (result.status === "ok") {
         setView({ kind: "redirecting" });
         return navigate(result.data.checkoutUrl);
      }
      busy.current = false;
      setView({ kind: "failed", reason: reasonOf(result) });
   }

   const locked = view.kind === "starting" || view.kind === "redirecting";
   return (
      <section aria-labelledby="checkout-heading" data-purchase-entry="on" className="flex flex-col gap-4 rounded-lg border border-border bg-surface px-5 py-5">
         <div>
            <h2 id="checkout-heading" className="m-0 text-section">{CHECKOUT_COPY.heading}</h2>
            <p className="mt-2 mb-0 max-w-2xl text-body text-pretty text-muted-foreground">{CHECKOUT_COPY.lead}</p>
         </div>
         <ul aria-label="Buy a plan" className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
            {PLANS.map((plan) => (
               <li key={plan.key}>
                  <Button
                     type="button"
                     aria-disabled={locked}
                     onClick={() => (locked ? undefined : void start(plan.key))}
                     className="min-h-11 w-full whitespace-normal aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                  >
                     Buy {plan.name}, {plan.amount} {plan.unit}
                  </Button>
               </li>
            ))}
         </ul>
         <div role="status" aria-live="polite" className="text-body text-foreground empty:hidden">
            {messageFor(view, cancelled)}
         </div>
         <Actions view={view} />
      </section>
   );
}

function reasonOf(result: Awaited<ReturnType<BillingClient["startCheckout"]>>): Extract<View, { kind: "failed" }>["reason"] {
   switch (result.status) {
      case "unauthenticated":
         return "signIn";
      case "refused":
         return result.code === "billing_disabled" ? "disabled" : result.code === "already_entitled" ? "entitled" : result.code === "subscription_active" ? "subscription" : "unavailable";
      case "unavailable":
         return result.cause === "timeout" || result.cause === "transport" ? "ambiguous" : result.cause === "malformed" ? "invalid" : "unavailable";
      default:
         return "unavailable";
   }
}

function messageFor(view: View, cancelled: boolean): string {
   if (view.kind === "starting") return CHECKOUT_COPY.starting;
   if (view.kind === "redirecting") return CHECKOUT_COPY.redirecting;
   if (view.kind === "failed") return CHECKOUT_COPY[view.reason];
   return cancelled ? CHECKOUT_COPY.cancelled : "";
}

const linkClass = "font-medium text-foreground underline underline-offset-4";

function Actions({ view }: { view: View }) {
   if (view.kind !== "failed") return null;
   if (view.reason === "signIn") return <Link href="/login?redirect=%2Fpricing" className={linkClass}>Sign in</Link>;
   if (view.reason === "entitled" || view.reason === "subscription") return <Link href={TRACKS_ENTRY} className={linkClass}>Browse the Tracks</Link>;
   if (view.reason === "ambiguous") return <Link href="/pricing/return" className={linkClass}>Check my Premium status</Link>;
   return null;
}
