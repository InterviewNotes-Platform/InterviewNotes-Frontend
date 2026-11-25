"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SessionOwner } from "@/hooks/use-session-owner";
import type { AttemptListItem, AttemptStatus } from "@/lib/practice-workspace/types";
import { SUPPORT_EMAIL } from "@/lib/privacy";
import { SENIORITY_NAME } from "./HistoryRoute";
import { AttemptDataControls, PracticeDataControls } from "./PracticeDataControls";
import { useBoundPractice, useKeyedSession, type PracticeSession } from "./practiceSession";

interface Props {
   /** The API origin the browser calls; null when the environment has none (the terms page then says the controls are unavailable). */
   apiUrl: string | null;
   /** Tests supply these; the page uses the browser's Supabase session and `fetch`. */
   getAccessToken?: () => Promise<string | null>;
   fetch?: typeof fetch;
   owner?: SessionOwner;
}

const STATUS_NAME: Readonly<Record<AttemptStatus, string>> = {
   active: "In progress",
   submitted: "Submitted",
   evaluating: "Submitted",
   evaluated: "Submitted",
   evaluation_failed: "Submitted",
   ended_by_reveal: "Ended, reference revealed",
   abandoned: "Abandoned",
};

type Load = { kind: "loading" } | { kind: "ready"; items: AttemptListItem[]; next: string | null; more: "idle" | "loading" | "failed" } | { kind: "disabled" } | { kind: "failed"; signedOut: boolean };

/**
 * Export and delete on the practice data terms page (T17-INT-1, done in T15 v2): the privacy-only path, outside `PracticeGate`.
 * It never asks `capability` and links to no practice route, so it still works when ordinary practice is switched off and the
 * backend keeps the privacy routes open (A-11: the attempt list, export and delete). It reuses the T15 controls; there is no
 * second implementation. When the API says practice data access is off, it says so instead of failing silently.
 */
export function PracticeDataPrivacyControls({ owner: given, ...props }: Props) {
   const { generation, owner } = useKeyedSession(given);
   if (!props.apiUrl || !owner) return null; // signed out or no API: the terms page's own notice covers it
   return <Session key={generation} owner={owner} {...props} />;
}

function Session({ apiUrl, getAccessToken, fetch: fetchImpl, owner }: Omit<Props, "owner"> & { owner: string }) {
   const session = useBoundPractice({ apiUrl, getAccessToken, fetch: fetchImpl, owner });
   if (!session) return null;
   return <Attempts session={session} />;
}

function Attempts({ session }: { session: PracticeSession }) {
   const { client, signal } = session;
   const [load, setLoad] = useState<Load>({ kind: "loading" });
   const [tries, setTries] = useState(0);

   useEffect(() => {
      let current = true;
      void client.listAttempts({ limit: 50 }, { signal }).then((result) => {
         if (!current || signal.aborted) return;
         if (result.status === "ok") setLoad({ kind: "ready", items: result.data.items, next: result.data.next_cursor, more: "idle" });
         else if (result.status === "disabled") setLoad({ kind: "disabled" });
         else setLoad({ kind: "failed", signedOut: result.status === "unauthenticated" });
      });
      return () => {
         current = false;
      };
   }, [client, signal, tries]);

   const loadMore = useCallback(async () => {
      if (load.kind !== "ready" || !load.next || load.more === "loading") return;
      const cursor = load.next;
      setLoad({ ...load, more: "loading" });
      const result = await client.listAttempts({ limit: 50, cursor }, { signal });
      if (signal.aborted) return;
      setLoad((now) => {
         if (now.kind !== "ready") return now;
         if (result.status !== "ok") return { ...now, more: "failed" };
         const known = new Set(now.items.map((item) => item.id));
         return { kind: "ready", items: [...now.items, ...result.data.items.filter((item) => !known.has(item.id))], next: result.data.next_cursor, more: "idle" };
      });
   }, [client, load, signal]);

   const removed = useCallback((id: string) => setLoad((now) => (now.kind === "ready" ? { ...now, items: now.items.filter((item) => item.id !== id) } : now)), []);
   const removedAll = useCallback(() => setLoad((now) => (now.kind === "ready" ? { ...now, items: [], next: null } : now)), []);

   if (load.kind === "loading")
      return (
         <p role="status" className="text-supporting text-muted-foreground">
            Loading your practice data…
         </p>
      );
   if (load.kind === "disabled")
      return (
         <p className="text-body text-muted-foreground">
            Export and deletion are switched off with practice right now. Your saved data is unchanged. For help, email {SUPPORT_EMAIL}.
         </p>
      );
   if (load.kind === "failed")
      return (
         <div role="alert" className="space-y-2">
            <p className="text-body text-muted-foreground">{load.signedOut ? "Your session has ended. Sign in again to export or delete your practice data." : "We could not load your practice data. Nothing was changed."}</p>
            {load.signedOut ? null : (
               <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                     setLoad({ kind: "loading" });
                     setTries((n) => n + 1);
                  }}
               >
                  Try again
               </Button>
            )}
         </div>
      );

   return (
      <div className="space-y-6">
         <PracticeDataControls session={session} onDeletedAll={removedAll} />
         <section aria-labelledby="practice-privacy-attempts" className="space-y-3">
            <h3 id="practice-privacy-attempts" className="text-body font-semibold text-foreground">
               Your attempts
            </h3>
            {load.items.length === 0 ? (
               <p className="text-body text-muted-foreground">You have no saved practice attempts.</p>
            ) : (
               <ul className="m-0 grid list-none gap-3 p-0">
                  {load.items.map((item) => {
                     const changed = new Date(item.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
                     return (
                        <li key={item.id} aria-label={`${STATUS_NAME[item.status]} attempt, last changed ${changed}`} className="m-0 grid gap-2 rounded-lg border border-border p-4">
                           <p className="m-0 text-supporting text-muted-foreground">
                              {STATUS_NAME[item.status]} · {SENIORITY_NAME[item.target_seniority]} bar · Last changed <time dateTime={item.updated_at}>{changed}</time>
                           </p>
                           <AttemptDataControls session={session} attemptId={item.id} onDeleted={() => removed(item.id)} />
                        </li>
                     );
                  })}
               </ul>
            )}
            {load.next ? (
               <div className="space-y-2">
                  <Button type="button" variant="outline" className="min-h-11" disabled={load.more === "loading"} onClick={() => void loadMore()}>
                     Show more attempts
                  </Button>
                  {load.more === "failed" ? (
                     <p role="alert" className="text-supporting text-muted-foreground">
                        We could not load more attempts. Try again.
                     </p>
                  ) : null}
               </div>
            ) : null}
         </section>
      </div>
   );
}
