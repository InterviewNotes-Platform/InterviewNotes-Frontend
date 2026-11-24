"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { availabilityOf, type Availability } from "@/lib/practice-workspace/availability";
import { createPracticeClient } from "@/lib/practice-workspace/client";
import { createClient } from "@/lib/supabase/client";
import { PracticeUnavailable } from "./PracticeUnavailable";

export interface PracticeGateProps {
   /** The API origin the browser calls; null when the environment has none. */
   apiUrl: string | null;
   /** Tests supply these; the page uses the browser's Supabase session and `fetch`. */
   getAccessToken?: () => Promise<string | null>;
   fetch?: typeof fetch;
   /** Rendered only when the backend says practice is available to this caller (never in P9-T06). */
   children?: ReactNode;
}

async function sessionToken(): Promise<string | null> {
   const { data } = await createClient().auth.getSession();
   return data.session?.access_token ?? null;
}

/**
 * The practice route boundary: asks the backend `capability` and shows `children` only on `practice_available: true`.
 * Anything else, including no API configured, is the unavailable notice. The frontend flag cannot open it.
 */
export function PracticeGate({ apiUrl, getAccessToken = sessionToken, fetch: fetchImpl, children }: PracticeGateProps) {
   const client = useMemo(() => (apiUrl ? createPracticeClient({ baseUrl: apiUrl, getAccessToken, fetch: fetchImpl }) : null), [apiUrl, getAccessToken, fetchImpl]);
   const [availability, setAvailability] = useState<Availability | "checking">("checking");

   useEffect(() => {
      if (!client) return;
      let current = true;
      client.capability().then((result) => {
         if (current) setAvailability(availabilityOf(result));
      });
      return () => {
         current = false;
      };
   }, [client]);

   if (!client) return <PracticeUnavailable />;
   if (availability === "checking") {
      return (
         <p role="status" className="py-12 text-center text-body text-muted-foreground">
            Checking…
         </p>
      );
   }
   if (availability.state === "available") return <>{children}</>;
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
