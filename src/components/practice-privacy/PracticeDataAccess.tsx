"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SessionOwner } from "@/hooks/use-session-owner";
import { PRACTICE_WITHDRAW_COPY } from "@/lib/practice-terms";
import { SUPPORT_EMAIL } from "@/lib/privacy";
import { useBoundPractice, useKeyedSession } from "@/components/practice-workspace/practiceSession";

interface Props {
   /** The API origin the browser calls; null when the environment has none. */
   apiUrl: string | null;
   /** Tests supply these; the page uses the browser's Supabase session and `fetch`. */
   getAccessToken?: () => Promise<string | null>;
   fetch?: typeof fetch;
   owner?: SessionOwner;
}

type State =
   | { phase: "checking" }
   | { phase: "unknown" }
   | { phase: "notAccepted" }
   | { phase: "accepted"; confirming: boolean; busy: boolean; error?: string }
   | { phase: "withdrawn" };

/**
 * "Your practice data" on the practice data terms page (P9-T17): the privacy-only access path. It is deliberately outside
 * `PracticeGate`: it never asks `capability`, and it offers no practice entry, editing, reference or AI. It carries the
 * withdrawal of the `practice-data` acknowledgement. Export and deletion (all, and per attempt from the lightweight list) are
 * T15's `PracticeDataPrivacyControls`, rendered after this in the same section (T17-INT-1, done in T15 by agreement), so this
 * sentence points below and never to `/practice/history`, which `PracticeGate` closes while practice is off. Whether these calls
 * work while practice admission is off is the backend's (A-11, `PRACTICE_PRIVACY_ACCESS`); when the API says practice is off, the
 * control says so and gives the support address instead of failing silently.
 */
export function PracticeDataAccess({ owner: given, ...props }: Props) {
   const { generation, owner } = useKeyedSession(given);
   if (owner === undefined) return null;
   if (owner === null) {
      return <p className="text-body text-muted-foreground">Sign in to export, delete or withdraw from your practice data.</p>;
   }
   return <Session key={generation} owner={owner} {...props} />;
}

function Session({ apiUrl, getAccessToken, fetch: fetchImpl, owner }: Omit<Props, "owner"> & { owner: string }) {
   const session = useBoundPractice({ apiUrl, getAccessToken, fetch: fetchImpl, owner });
   const [state, setState] = useState<State>({ phase: "checking" });
   const sending = useRef(false);
   const done = useRef<HTMLParagraphElement>(null);
   const withdrawn = state.phase === "withdrawn";

   useEffect(() => {
      if (!session) return;
      let current = true;
      void session.client.getConsent({ signal: session.signal }).then((result) => {
         if (!current || session.signal.aborted) return;
         if (result.status !== "ok") return setState({ phase: "unknown" });
         const document = result.data.practice_data;
         setState(document.state === "accepted" && document.accepted_version !== null ? { phase: "accepted", confirming: false, busy: false } : { phase: "notAccepted" });
      });
      return () => {
         current = false;
      };
   }, [session]);

   useEffect(() => {
      if (withdrawn) done.current?.focus();
   }, [withdrawn]);

   async function withdraw() {
      if (!session || sending.current || state.phase !== "accepted") return;
      sending.current = true;
      setState({ phase: "accepted", confirming: true, busy: true });
      const result = await session.client.withdrawConsent({ document_id: "practice-data" });
      sending.current = false;
      if (session.signal.aborted) return;
      if (result.status === "ok") return setState({ phase: "withdrawn" });
      const error =
         result.status === "unauthenticated"
            ? "Your session has ended. Sign in again to withdraw."
            : result.status === "disabled"
              ? `Practice is switched off right now, so this can't be changed here. Your saved data is unchanged. For help, email ${SUPPORT_EMAIL}.`
              : PRACTICE_WITHDRAW_COPY.failed;
      setState({ phase: "accepted", confirming: false, busy: false, error });
   }

   if (!apiUrl) return <p className="text-body text-muted-foreground">Your practice data controls are not available in this environment.</p>;

   return (
      <div className="space-y-4">
         <p className="text-body text-muted-foreground">Export or delete one attempt, or all of them, below.</p>
         {state.phase === "checking" ? (
            <p role="status" className="text-supporting text-muted-foreground">
               Checking…
            </p>
         ) : state.phase === "unknown" ? (
            <p className="text-body text-muted-foreground">We couldn&apos;t check your practice data acknowledgement. Reload the page to try again.</p>
         ) : state.phase === "notAccepted" ? (
            <p className="text-body text-muted-foreground">{PRACTICE_WITHDRAW_COPY.notAccepted}</p>
         ) : state.phase === "withdrawn" ? (
            <p ref={done} role="status" tabIndex={-1} className="text-body text-foreground outline-none">
               {PRACTICE_WITHDRAW_COPY.done}
            </p>
         ) : state.confirming ? (
            <div role="group" aria-labelledby="practice-withdraw-title" className="space-y-3 rounded-lg border border-border p-4">
               <p id="practice-withdraw-title" className="text-body font-semibold text-foreground">
                  {PRACTICE_WITHDRAW_COPY.title}
               </p>
               <p className="text-body text-muted-foreground">{PRACTICE_WITHDRAW_COPY.body}</p>
               {state.busy ? (
                  <p role="status" className="text-supporting text-muted-foreground">
                     Saving…
                  </p>
               ) : null}
               <div className="flex flex-wrap gap-3">
                  <Button type="button" className="min-h-11" aria-disabled={state.busy || undefined} onClick={() => void withdraw()}>
                     {PRACTICE_WITHDRAW_COPY.confirm}
                  </Button>
                  <Button type="button" variant="outline" className="min-h-11" aria-disabled={state.busy || undefined} onClick={() => !state.busy && setState({ phase: "accepted", confirming: false, busy: false })}>
                     {PRACTICE_WITHDRAW_COPY.cancel}
                  </Button>
               </div>
            </div>
         ) : (
            <div className="space-y-2">
               <Button type="button" variant="outline" className="min-h-11" onClick={() => setState({ phase: "accepted", confirming: true, busy: false })}>
                  {PRACTICE_WITHDRAW_COPY.action}
               </Button>
               {state.error ? (
                  <p role="alert" className="text-body text-foreground">
                     {state.error}
                  </p>
               ) : null}
            </div>
         )}
      </div>
   );
}
