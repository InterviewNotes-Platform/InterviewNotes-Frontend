"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { consentInForce, createConsentClient } from "./consentClient";

async function sessionToken(): Promise<string | null> {
   const { data } = await createClient().auth.getSession();
   return data.session?.access_token ?? null;
}

type State = { phase: "hidden" } | { phase: "recorded"; error?: string } | { phase: "withdrawn" };

interface Props {
   /** The API origin the browser calls; null when the environment has none, and the control then draws nothing. */
   apiUrl: string | null;
   getAccessToken?: () => Promise<string | null>;
   fetch?: typeof fetch;
}

/**
 * The "Withdraw AI consent" control for the Privacy & AI Use page (P7-D-046). It draws only for a signed-in user whose consent is recorded and in force:
 * a signed-out visitor, a user who never accepted and an unreachable API all see the page as it was. Withdrawing is recorded by the API and needs no
 * confirmation because it is undone by accepting again; the next AI action asks again.
 */
export function WithdrawConsent({ apiUrl, getAccessToken = sessionToken, fetch: fetchImpl }: Props) {
   const client = useMemo(() => (apiUrl ? createConsentClient({ baseUrl: apiUrl, getAccessToken, fetch: fetchImpl }) : null), [apiUrl, getAccessToken, fetchImpl]);
   const [state, setState] = useState<State>({ phase: "hidden" });
   const sending = useRef(false);
   const done = useRef<HTMLParagraphElement>(null);
   const withdrawn = state.phase === "withdrawn";

   useEffect(() => {
      if (!client) return;
      let current = true;
      void client.status().then((result) => {
         if (current && result.status === "ok" && consentInForce(result.data)) setState({ phase: "recorded" });
      });
      return () => {
         current = false;
      };
   }, [client]);

   // The button the reader pressed is replaced by the result, so focus moves to it.
   useEffect(() => {
      if (withdrawn) done.current?.focus();
   }, [withdrawn]);

   async function withdraw() {
      if (!client || sending.current) return;
      sending.current = true;
      const result = await client.withdraw();
      sending.current = false;
      if (result.status === "ok" && !consentInForce(result.data)) setState({ phase: "withdrawn" });
      else setState({ phase: "recorded", error: result.status === "unauthenticated" ? "Your session has ended. Sign in again to withdraw." : "We couldn't record the withdrawal. Your consent is unchanged. You can try again." });
   }

   if (state.phase === "hidden") return null;
   if (state.phase === "withdrawn") {
      return (
         <p ref={done} role="status" tabIndex={-1} className="mt-3 text-foreground outline-none">
            Your AI consent is withdrawn. The next AI action will ask again.
         </p>
      );
   }
   return (
      <div className="mt-3 space-y-2">
         <Button type="button" variant="outline" onClick={() => void withdraw()}>
            Withdraw AI consent
         </Button>
         {state.error && (
            <p role="alert" className="text-foreground">
               {state.error}
            </p>
         )}
      </div>
   );
}
