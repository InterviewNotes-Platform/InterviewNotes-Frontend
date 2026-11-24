"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AttemptDetailOut } from "@/lib/practice-workspace/types";
import { AttemptWorkspace } from "./AttemptWorkspace";
import { usePracticeSession } from "./practiceSession";

type Load = { kind: "loading" } | { kind: "ready"; detail: AttemptDetailOut } | { kind: "missing" } | { kind: "failed"; signedOut: boolean };

/**
 * The attempt route's body, under the gate: reads the attempt from the canonical saved state and opens the workspace on it. Owner scoping is
 * the server's (another learner's attempt answers 404, which reads as not found here). Nothing from a previous session can show: the gate
 * remounts this for a new identity, and a reply that arrives after the session ended is dropped.
 */
export function AttemptRoute({ attemptId }: { attemptId: string }) {
   const { client, signal } = usePracticeSession();
   const [load, setLoad] = useState<Load>({ kind: "loading" });
   const [tries, setTries] = useState(0);

   useEffect(() => {
      let current = true;
      client.getAttempt(attemptId, { signal }).then((result) => {
         if (!current || signal.aborted) return;
         if (result.status === "ok") setLoad({ kind: "ready", detail: result.data });
         else if (result.status === "notFound" || result.status === "disabled") setLoad({ kind: "missing" });
         else setLoad({ kind: "failed", signedOut: result.status === "unauthenticated" });
      });
      return () => {
         current = false;
      };
   }, [client, signal, attemptId, tries]);

   const retry = useCallback(() => {
      setLoad({ kind: "loading" });
      setTries((count) => count + 1);
   }, []);

   if (load.kind === "ready") return <AttemptWorkspace detail={load.detail} />;
   if (load.kind === "loading") {
      return (
         <p role="status" className="py-12 text-center text-body text-muted-foreground">
            Loading your attempt…
         </p>
      );
   }
   return (
      <div role={load.kind === "missing" ? "status" : "alert"} className="mx-auto my-12 max-w-reading rounded-lg bg-surface px-6 py-12 text-center">
         <p className="mb-4 text-body text-muted-foreground">
            {load.kind === "missing" ? "We could not find that attempt." : load.signedOut ? "Your session has ended. Sign in again to continue." : "We could not load your attempt. Nothing was changed."}
         </p>
         <div className="flex flex-wrap justify-center gap-3">
            {load.kind === "failed" && !load.signedOut ? (
               <Button type="button" onClick={retry} className="min-h-11">
                  Try again
               </Button>
            ) : null}
            <Button asChild variant="outline" className="min-h-11">
               <Link href="/practice/history" prefetch={false}>
                  Your attempts
               </Link>
            </Button>
         </div>
      </div>
   );
}
