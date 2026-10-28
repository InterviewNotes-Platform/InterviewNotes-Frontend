"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PrepClient } from "@/lib/prep/client";
import { answerHref } from "@/lib/prep/links";

interface Props {
   client: PrepClient;
   answerId: string;
   storyId: string;
   /** The API confirmed the link, so opening the answer is now the normal path. */
   onLinked: () => void;
}

/**
 * The answer exists with its copy of the story, but the link was not confirmed: it may or may not exist (contract §6). Only the
 * link is retried (a PUT that is safe to repeat) or read back; the copy is never made again from here.
 */
export function StartLinkNotice({ client, answerId, storyId, onLinked }: Props) {
   const [attempt, setAttempt] = useState<{ phase: "idle" } | { phase: "pending" } | { phase: "failed"; message: string }>({ phase: "idle" });
   const [absent, setAbsent] = useState(false);
   const inflight = useRef(false);

   async function retry() {
      if (inflight.current) return;
      inflight.current = true;
      setAttempt({ phase: "pending" });
      const result = await client.linkStory(answerId, storyId);
      inflight.current = false;
      if (result.status === "ok") return onLinked();
      setAbsent(false);
      setAttempt({
         phase: "failed",
         message:
            result.status === "unauthenticated"
               ? "Your session has ended. Sign in again to link the story."
               : result.status === "notFound"
                 ? "That story could not be found in your Story Bank, so it was not linked."
                 : "We still could not confirm whether the link exists.",
      });
   }

   /** A read settles it either way: linked, or confirmed not linked. */
   async function check() {
      if (inflight.current) return;
      inflight.current = true;
      setAttempt({ phase: "pending" });
      const result = await client.getAnswer(answerId);
      inflight.current = false;
      if (result.status === "ok" && result.data.story_ids.includes(storyId)) return onLinked();
      if (result.status === "ok") {
         setAbsent(true);
         return setAttempt({ phase: "idle" });
      }
      setAbsent(false);
      setAttempt({ phase: "failed", message: "We could not read the answer to check, so whether it is linked is still unknown." });
   }

   return (
      <div role="alert" className="space-y-3">
         <p className="text-body text-foreground">
            Your answer was created with a copy of the story&apos;s text, but we could not confirm that it is linked to the story. The link may or may not exist. Starting again would
            make a second answer.
         </p>
         {absent && <p className="text-body text-foreground">Checked: the answer is not linked to the story yet.</p>}
         {attempt.phase === "failed" && <p className="text-body text-foreground">{attempt.message}</p>}
         <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Button type="button" disabled={attempt.phase === "pending"} onClick={() => void retry()}>
               {attempt.phase === "pending" ? "Working…" : "Try linking again"}
            </Button>
            <Button type="button" variant="outline" disabled={attempt.phase === "pending"} onClick={() => void check()}>
               Check whether it is linked
            </Button>
            <Link href={answerHref(answerId)} prefetch={false} className="text-supporting text-primary underline underline-offset-4">
               Open the answer without the link
            </Link>
         </div>
      </div>
   );
}
