"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { SessionOwner } from "@/hooks/use-session-owner";
import { availabilityOf, type Availability } from "@/lib/practice-workspace/availability";
import { PracticeSessionContext, useBoundPractice, useKeyedSession } from "./practiceSession";
import { PracticeUnavailable } from "./PracticeUnavailable";

export interface PracticeGateProps {
   /** The API origin the browser calls; null when the environment has none. */
   apiUrl: string | null;
   /** Tests supply these; the page uses the browser's Supabase session and `fetch`. */
   getAccessToken?: () => Promise<string | null>;
   fetch?: typeof fetch;
   /** The signed-in user, when the caller knows it (tests); otherwise it follows the browser's auth events. */
   owner?: SessionOwner;
   /** Rendered only when the backend says practice is available to this caller; it reads the session with `usePracticeSession`. */
   children?: ReactNode;
}

/**
 * The practice route boundary: asks the backend `capability` and shows `children` only on `practice_available: true`.
 * Anything else, including no API configured, is the unavailable notice. The frontend flag cannot open it.
 *
 * It is also the session boundary. Everything below is keyed to the signed-in user: when the user changes (sign-out, sign-in,
 * another account) the keyed part is thrown away, so its requests are aborted, its capability answer, attempt data and unsaved
 * text are gone, and the capability is asked again for the new identity. A token refresh for the same user changes nothing.
 */
export function PracticeGate({ owner: given, ...props }: PracticeGateProps) {
   const { generation, owner } = useKeyedSession(given);
   return <GateSession key={generation} owner={owner ?? null} {...props} />;
}

function GateSession({ apiUrl, getAccessToken, fetch: fetchImpl, owner, children }: Omit<PracticeGateProps, "owner"> & { owner: string | null }) {
   const session = useBoundPractice({ apiUrl, getAccessToken, fetch: fetchImpl, owner });
   const [availability, setAvailability] = useState<Availability | "checking">("checking");

   useEffect(() => {
      if (!session) return;
      let current = true;
      session.client.capability(undefined, { signal: session.signal }).then((result) => {
         if (!current || session.signal.aborted) return;
         setAvailability(result.status === "unavailable" && result.cause === "aborted" ? "checking" : availabilityOf(result));
      });
      return () => {
         current = false;
      };
   }, [session]);

   if (!apiUrl) return <PracticeUnavailable />;
   if (availability === "checking" || !session) {
      return (
         <p role="status" className="py-12 text-center text-body text-muted-foreground">
            Checking…
         </p>
      );
   }
   if (availability.state === "available") return <PracticeSessionContext.Provider value={session}>{children}</PracticeSessionContext.Provider>;
   if (availability.state === "signed_out") {
      return (
         <div role="status" className="rounded-lg bg-surface px-6 py-12 text-center">
            <p className="mb-4 text-body text-muted-foreground last:mb-0">Sign in to use practice.</p>
            <Button asChild className="bg-foreground text-background hover:bg-foreground/90 h-8 text-sm">
               <Link href={`/login?redirect=${encodeURIComponent("/practice")}`} prefetch={false}>
                  Sign in
               </Link>
            </Button>
         </div>
      );
   }
   return <PracticeUnavailable />;
}
