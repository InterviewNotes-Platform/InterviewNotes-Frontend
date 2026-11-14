"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { BillingClient } from "@/lib/billing/client";
import { RETURN_COPY } from "@/lib/billing/copy";
import type { BillingResult, BillingStatus } from "@/lib/billing/types";
import { useBillingClient } from "@/lib/billing/useBillingClient";
import { PRICING_HREF, TRACKS_ENTRY } from "@/lib/primary-navigation";

/** How long, and how often, the page asks the backend before it stops and offers "Check again" (a T33 choice; the contract leaves it open). */
export const POLL_INTERVAL_MS = 3_000;
export const POLL_WINDOW_MS = 45_000;

type Kind = keyof Omit<typeof RETURN_COPY, "eyebrow">;

interface Props {
   apiUrl: string | null;
   /** A validated `cs_…` id from the return URL, or null. It selects what the backend verifies; it is never evidence. */
   sessionId: string | null;
   client?: BillingClient;
   pollIntervalMs?: number;
   pollWindowMs?: number;
}

/** Only the authenticated backend status decides. Premium is "active" solely when it says `premium: true`. */
export function classify(status: BillingStatus): Kind {
   if (status.premium) return "active";
   if (status.state === "failed") return "failed";
   if (status.state === "pending" || status.state === "none") return "waiting";
   return "inactive";
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
   return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
   });
}

/** The kind that ends the wait, or null to keep asking. With no checkout session to wait for, "none" is simply not Premium. */
function terminal(result: BillingResult<BillingStatus>, hasSession: boolean): Kind | null {
   if (result.status === "unauthenticated") return "signIn";
   if (result.status === "notFound") return "notFound";
   if (result.status !== "ok") return null;
   const kind = classify(result.data);
   if (kind !== "waiting") return kind;
   return !hasSession && result.data.state === "none" ? "inactive" : null;
}

export function CheckoutReturn({ apiUrl, sessionId, client: injected, pollIntervalMs = POLL_INTERVAL_MS, pollWindowMs = POLL_WINDOW_MS }: Props) {
   const client = useBillingClient(apiUrl, injected);
   const [kind, setKind] = useState<Kind>(client ? "confirming" : "notConfigured");
   const [attempt, setAttempt] = useState(0);
   const heading = useRef<HTMLHeadingElement>(null);

   useEffect(() => {
      if (!client) return;
      const stop = new AbortController();
      void (async () => {
         setKind("confirming");
         // First look: the confirm call (which makes the backend verify with Stripe) when there is a session, else the plain status.
         let result = sessionId ? await client.confirm(sessionId) : await client.getStatus();
         const deadline = Date.now() + pollWindowMs;
         for (;;) {
            if (stop.signal.aborted) return;
            const done = terminal(result, sessionId !== null);
            if (done) return setKind(done);
            if (Date.now() + pollIntervalMs > deadline) break;
            setKind("waiting");
            await sleep(pollIntervalMs, stop.signal);
            if (stop.signal.aborted) return;
            result = await client.getStatus();
         }
         setKind(result.status === "ok" ? "unconfirmed" : "unavailable");
      })();
      return () => stop.abort();
   }, [client, sessionId, attempt, pollIntervalMs, pollWindowMs]);

   useEffect(() => {
      if (kind !== "confirming" && kind !== "waiting") heading.current?.focus();
   }, [kind]);

   const copy = RETURN_COPY[kind];
   const checking = kind === "confirming" || kind === "waiting";
   return (
      <div data-checkout-return={kind} className="flex max-w-2xl flex-col gap-4">
         <header>
            <p className="m-0 text-xs font-semibold tracking-[0.12em] text-premium uppercase">{RETURN_COPY.eyebrow}</p>
            <h1 ref={heading} tabIndex={-1} className="m-0 mt-3 text-title text-balance outline-offset-4">{copy.heading}</h1>
         </header>
         <p role="status" aria-live="polite" className="m-0 text-body text-pretty text-muted-foreground">{copy.body}</p>
         <div className="flex flex-wrap items-center gap-4">
            {kind === "active" && <Link href={TRACKS_ENTRY} className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground">Continue reading</Link>}
            {(kind === "unconfirmed" || kind === "unavailable" || kind === "notFound") && (
               <Button type="button" onClick={() => setAttempt((count) => count + 1)} className="min-h-11 px-5">Check again</Button>
            )}
            {kind === "signIn" && <Link href="/login?redirect=%2Fpricing" className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground">Sign in</Link>}
            {!checking && <Link href={PRICING_HREF} className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4">Back to Pricing</Link>}
         </div>
      </div>
   );
}
