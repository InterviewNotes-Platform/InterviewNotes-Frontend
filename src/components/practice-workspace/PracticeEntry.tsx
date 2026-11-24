"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SessionOwner } from "@/hooks/use-session-owner";
import { practiceEnabled } from "@/lib/practice-flag";
import type { Seniority } from "@/lib/practice-workspace/types";
import { useBoundPractice, useKeyedSession } from "./practiceSession";
import { StartPracticeDialog } from "./StartPracticeDialog";

export interface PracticeEntryProps {
   /** The Problem's `problem.<slug>` content ID. */
   contentId: string;
   apiUrl: string | null;
   /** The seniorities the Problem targets, from the reader's released sections; none means no entry. */
   seniorities: readonly string[];
   getAccessToken?: () => Promise<string | null>;
   fetch?: typeof fetch;
   owner?: SessionOwner;
}

const KNOWN: readonly Seniority[] = ["mid", "senior", "staff", "principal"];

/**
 * "Practise this Problem" on the reader, for a signed-in learner when, and only when, the backend says practice is available and ready for this
 * Problem. It renders nothing otherwise (signed out, flag off, no API, backend refusal, no targeted seniority, a failed check), makes no
 * request while signed out, and never reads a flag as permission: the frontend flag may hide it, only the backend's answer shows it.
 * Keyed to the signed-in user, so one user's answer is never shown to the next.
 */
export function PracticeEntry({ owner: given, ...props }: PracticeEntryProps) {
   const { generation, owner } = useKeyedSession(given);
   if (!practiceEnabled() || owner === undefined || owner === null) return null;
   return <EntrySession key={generation} owner={owner} {...props} />;
}

function EntrySession({ contentId, apiUrl, seniorities, getAccessToken, fetch: fetchImpl, owner }: Omit<PracticeEntryProps, "owner"> & { owner: string }) {
   const session = useBoundPractice({ apiUrl, getAccessToken, fetch: fetchImpl, owner });
   const [ready, setReady] = useState(false);
   const [resume, setResume] = useState<string | null>(null);
   const targeted = seniorities.filter((value): value is Seniority => (KNOWN as readonly string[]).includes(value));

   useEffect(() => {
      if (!session || targeted.length === 0) return;
      let current = true;
      (async () => {
         const capability = await session.client.capability(contentId, { signal: session.signal });
         if (!current || capability.status !== "ok" || !capability.data.practice_available || !capability.data.practice_ready) return;
         setReady(true);
         // An active attempt on this Problem is offered for resuming; failing to find one changes nothing.
         const active = await session.client.listAttempts({ contentId, status: "active", limit: 1 }, { signal: session.signal });
         if (current && active.status === "ok" && active.data.items[0]) setResume(active.data.items[0].id);
      })();
      return () => {
         current = false;
      };
   }, [session, contentId, targeted.length]);

   if (!session || !ready || targeted.length === 0) return null;
   return (
      <div role="group" aria-label="Practice" data-practice-entry="" className="mt-6 flex flex-wrap items-center gap-3">
         <StartPracticeDialog
            contentId={contentId}
            seniorities={targeted}
            client={session.client}
            signal={session.signal}
            trigger={<Button type="button" className="min-h-11">Practise this Problem</Button>}
         />
         {resume ? (
            <Button asChild variant="outline" className="min-h-11">
               <Link href={`/practice/attempts/${encodeURIComponent(resume)}`} prefetch={false}>
                  Resume your attempt
               </Link>
            </Button>
         ) : null}
      </div>
   );
}
