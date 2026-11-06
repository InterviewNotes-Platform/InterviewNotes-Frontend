"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PREPARE_STORIES_HREF, PREPARE_STORY_NEW_HREF, storyHref } from "@/app/prepare/stories/href";
import { problem, SLOW_NOTICE, useSlow } from "@/app/prepare/data/messages";
import { Button } from "@/components/ui/button";
import type { FieldIssue } from "@/lib/prep/types";
import { cn } from "@/lib/utils";
import { BackLink, NOT_CONFIGURED, SignIn } from "./notices";
import { createBodyOf, emptyDraft, problemsOf, type StoryDraft } from "./storyDraft";
import { StoryFields } from "./StoryFields";
import { useStoryClient, type StoryApiProps } from "./useStoryClient";

type Attempt =
   | { phase: "idle" }
   | { phase: "saving" }
   | { phase: "done" }
   | { phase: "failed"; message: string }
   | { phase: "signin" }
   // The create may have happened. A create is not idempotent, so the reader checks before another is sent (contract §6).
   | { phase: "unknown" };

/** A new story. It is saved on the reader's Create, never on a timer, and nothing is shown as saved until the API answered. */
export function NewStory(props: StoryApiProps) {
   const client = useStoryClient(props);
   const router = useRouter();
   const [draft, setDraft] = useState<StoryDraft>(emptyDraft);
   const [tried, setTried] = useState(false);
   const [issues, setIssues] = useState<FieldIssue[]>([]);
   const [attempt, setAttempt] = useState<Attempt>({ phase: "idle" });
   const saving = attempt.phase === "saving";
   const blocked = saving || attempt.phase === "done" || attempt.phase === "unknown";
   const slow = useSlow(saving);
   const problems = tried ? problemsOf(draft) : {};

   async function create(event: FormEvent) {
      event.preventDefault();
      if (!client || blocked) return;
      setTried(true);
      if (Object.keys(problemsOf(draft)).length > 0) return;
      setIssues([]);
      setAttempt({ phase: "saving" });
      const result = await client.createStory(createBodyOf(draft));
      if (result.status === "ok") {
         setAttempt({ phase: "done" });
         router.push(storyHref(result.data.id));
      } else if (result.status === "unauthenticated") {
         setAttempt({ phase: "signin" });
      } else if (result.status === "unavailable" && result.cause !== "upstream") {
         setAttempt({ phase: "unknown" });
      } else {
         if (result.status === "invalid") setIssues(result.fields);
         setAttempt({ phase: "failed", message: `${problem(result, "the story")} Nothing was saved; your text is still here.` });
      }
   }

   return (
      <form onSubmit={create} noValidate className="space-y-8">
         <div className="space-y-3">
            <BackLink />
            <h1 className="text-section text-foreground">New story</h1>
         </div>
         {!client && (
            <p role="alert" className="text-body text-foreground">
               {NOT_CONFIGURED}
            </p>
         )}
         <StoryFields draft={draft} onChange={(patch) => setDraft((was) => ({ ...was, ...patch }))} problems={problems} issues={issues} disabled={blocked} />
         <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
               <Button type="submit" size="lg" aria-disabled={blocked || !client} className={cn((blocked || !client) && "opacity-50")}>
                  {saving ? "Creating…" : "Create story"}
               </Button>
               <Button asChild variant="outline" size="lg">
                  <Link href={PREPARE_STORIES_HREF} prefetch={false}>
                     Cancel
                  </Link>
               </Button>
            </div>
            <div role="status" className="min-h-5 text-supporting text-foreground">
               {saving && <>Creating your story… {slow && SLOW_NOTICE}</>}
               {attempt.phase === "done" && "Story created. Opening it…"}
               {attempt.phase === "unknown" && (
                  <>
                     We could not confirm that the story was saved. It may exist, so check{" "}
                     <Link href={PREPARE_STORIES_HREF} prefetch={false} className="underline underline-offset-4">
                        your Story Bank
                     </Link>{" "}
                     before creating it again.
                  </>
               )}
            </div>
            {attempt.phase === "failed" && (
               <p role="alert" className="text-body text-foreground">
                  {attempt.message}
               </p>
            )}
            {attempt.phase === "signin" && <SignIn doing="save this story" to={PREPARE_STORY_NEW_HREF} />}
            {attempt.phase === "unknown" && (
               <Button type="button" variant="outline" onClick={() => setAttempt({ phase: "idle" })}>
                  I checked: no story was saved. Allow creating again
               </Button>
            )}
         </div>
      </form>
   );
}
