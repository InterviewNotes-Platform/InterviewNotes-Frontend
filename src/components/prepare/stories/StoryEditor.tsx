"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PREPARE_STORIES_HREF, storyHref } from "@/app/prepare/stories/href";
import { problem, SLOW_NOTICE, useSlow } from "@/app/prepare/data/messages";
import { Button } from "@/components/ui/button";
import { useLeaveGuard } from "@/components/prepare/editor/useLeaveGuard";
import { SaveStatus, type SaveState } from "@/components/ui/save-status";
import type { PrepClient } from "@/lib/prep/client";
import { newAnswerHref } from "@/lib/prep/links";
import type { FieldIssue, PrepResult, Story } from "@/lib/prep/types";
import { cn } from "@/lib/utils";
import { DeleteStory } from "./DeleteStory";
import { LinkedAnswers } from "./LinkedAnswers";
import { BackLink, NOT_CONFIGURED, readFailure, SignIn, STORY_NOT_FOUND } from "./notices";
import { changesOf, draftOf, problemsOf, type StoryDraft } from "./storyDraft";
import { StoryFields } from "./StoryFields";
import { useStoryClient, type StoryApiProps } from "./useStoryClient";

type Load = { phase: "loading" } | { phase: "ready"; story: Story } | { phase: "signin" } | { phase: "failed"; message: string; retry: boolean };

interface Props extends StoryApiProps {
   storyId: string;
}

function loadFailure(result: Exclude<PrepResult<Story>, { status: "ok" }>): Load {
   if (result.status === "unauthenticated") return { phase: "signin" };
   if (result.status === "notFound") return { phase: "failed", message: STORY_NOT_FOUND, retry: false };
   return { phase: "failed", message: readFailure(result), retry: true };
}

/** One story, read from the API for the signed-in reader. A story that is not theirs reads as not found, never as theirs. */
export function StoryEditor(props: Props) {
   const { storyId } = props;
   const client = useStoryClient(props);
   const [load, setLoad] = useState<Load>(props.apiUrl ? { phase: "loading" } : { phase: "failed", message: NOT_CONFIGURED, retry: false });
   const [attempt, setAttempt] = useState(0);
   const slow = useSlow(load.phase === "loading");

   useEffect(() => {
      if (!client) return;
      let current = true;
      client.getStory(storyId).then((result) => {
         if (current) setLoad(result.status === "ok" ? { phase: "ready", story: result.data } : loadFailure(result));
      });
      return () => {
         current = false;
      };
   }, [client, storyId, attempt]);

   if (load.phase === "ready" && client) return <StoryForm initial={load.story} client={client} />;
   return (
      <div className="space-y-4">
         <BackLink />
         {load.phase === "loading" && (
            <p role="status" className="text-body text-muted-foreground">
               Loading your story… {slow && SLOW_NOTICE}
            </p>
         )}
         {load.phase === "signin" && <SignIn doing="open this story" to={storyHref(storyId)} />}
         {load.phase === "failed" && (
            <div role="alert" className="space-y-3">
               <p className="text-body text-foreground">{load.message}</p>
               {load.retry && (
                  <Button
                     variant="outline"
                     onClick={() => {
                        setLoad({ phase: "loading" });
                        setAttempt((n) => n + 1);
                     }}
                  >
                     Try again
                  </Button>
               )}
            </div>
         )}
      </div>
   );
}

type Write =
   | { phase: "idle" }
   | { phase: "saving" }
   | { phase: "saved" }
   | { phase: "failed"; message: string }
   // The write may have happened (network, timeout, unreadable answer): read the story again before trusting either state.
   | { phase: "unknown"; checking: boolean }
   // Nothing was applied: the story changed elsewhere. The reader chooses (contract §6).
   | { phase: "conflict"; currentVersion: number; busy: boolean }
   | { phase: "signin" }
   | { phase: "gone" };

type Copy = { phase: "idle" } | { phase: "working" } | { phase: "done" } | { phase: "unknown" } | { phase: "failed"; message: string; signin: boolean };

const SAVE_MESSAGES: Partial<Record<Write["phase"], string>> = {
   failed: "Couldn't save",
   unknown: "Couldn't confirm the save",
   conflict: "Not saved: a newer version exists",
   signin: "Couldn't save: signed out",
   gone: "Couldn't save: story not found",
};

const isUnknown = (result: Exclude<PrepResult<unknown>, { status: "ok" }>) => result.status === "unavailable" && result.cause !== "upstream";

function StoryForm({ initial, client }: { initial: Story; client: PrepClient }) {
   const router = useRouter();
   const [saved, setSaved] = useState(initial);
   const [draft, setDraft] = useState<StoryDraft>(() => draftOf(initial));
   const [tried, setTried] = useState(false);
   const [issues, setIssues] = useState<FieldIssue[]>([]);
   const [write, setWrite] = useState<Write>({ phase: "idle" });
   const [copy, setCopy] = useState<Copy>({ phase: "idle" });
   const [deleted, setDeleted] = useState<"deleted" | "missing" | null>(null);
   const heading = useRef<HTMLHeadingElement>(null);
   // The save a leave is waiting on, so leaving while one is open waits for it rather than sending a second.
   const inflight = useRef<Promise<boolean> | null>(null);
   const changes = changesOf(draft, saved);
   const dirty = changes !== null;
   const saving = write.phase === "saving";
   const busy = saving || copy.phase === "working" || (write.phase === "conflict" && write.busy) || (write.phase === "unknown" && write.checking);
   const slow = useSlow(saving);
   const problems = tried ? problemsOf(draft) : {};
   const here = storyHref(saved.id);
   // A deleted story has nothing left to save, so its leftover edits hold nothing back.
   const holding = !deleted && (dirty || saving);

   // Leaving the page by link, Back or sign-out saves first, and asks only when the save fails (as the answer editor does).
   // Closing the tab is the browser's own warning below. Text is never kept in browser storage (P7-D-016).
   const { leaving } = useLeaveGuard({ active: holding, settle });
   useEffect(() => {
      if (!holding) return;
      const ask = (event: BeforeUnloadEvent) => event.preventDefault();
      window.addEventListener("beforeunload", ask);
      return () => window.removeEventListener("beforeunload", ask);
   }, [holding]);

   // The form is replaced when the story is deleted, so focus moves to what replaced it.
   useEffect(() => {
      if (deleted) heading.current?.focus();
   }, [deleted]);

   const edit = (patch: Partial<StoryDraft>) => setDraft((was) => ({ ...was, ...patch }));

   /** True only when the server now holds the draft as it stands. */
   function persist(version: number): Promise<boolean> {
      setTried(true);
      if (Object.keys(problemsOf(draft)).length > 0 || !changes) return Promise.resolve(false);
      const run = persistWrite(version, changes).finally(() => (inflight.current = null));
      inflight.current = run;
      return run;
   }

   async function persistWrite(version: number, body: NonNullable<typeof changes>): Promise<boolean> {
      setIssues([]);
      setWrite({ phase: "saving" });
      const result = await client.updateStory(saved.id, { version, ...body });
      switch (result.status) {
         case "ok":
            setSaved(result.data);
            setDraft(draftOf(result.data));
            setWrite({ phase: "saved" });
            return true;
         case "conflict":
            setWrite({ phase: "conflict", currentVersion: result.currentVersion, busy: false });
            return false;
         case "unauthenticated":
            setWrite({ phase: "signin" });
            return false;
         case "notFound":
            setWrite({ phase: "gone" });
            return false;
         case "invalid":
            setIssues(result.fields);
            setWrite({ phase: "failed", message: "The server did not accept this story. Nothing was saved; your changes are still here." });
            return false;
         default:
            setWrite(isUnknown(result) ? { phase: "unknown", checking: false } : { phase: "failed", message: `${problem(result, "the save")} Nothing was saved; your changes are still here.` });
            return false;
      }
   }

   // A leave never overwrites a newer version or retries a write of unknown outcome: those are the reader's choice, so it asks.
   async function settle(): Promise<boolean> {
      if (inflight.current) return inflight.current;
      if (!changes) return true;
      if (write.phase === "conflict" || write.phase === "unknown" || write.phase === "gone" || write.phase === "signin") return false;
      return persist(saved.version);
   }

   function save(event: FormEvent) {
      event.preventDefault();
      if (!busy && write.phase !== "unknown" && write.phase !== "conflict") void persist(saved.version);
   }

   async function check() {
      setWrite({ phase: "unknown", checking: true });
      const result = await client.getStory(saved.id);
      if (result.status === "unauthenticated") return setWrite({ phase: "signin" });
      if (result.status === "notFound") return setWrite({ phase: "gone" });
      if (result.status !== "ok") return setWrite({ phase: "unknown", checking: false });
      setSaved(result.data);
      setWrite(
         changesOf(draft, result.data) === null
            ? { phase: "saved" }
            : { phase: "failed", message: "The earlier save did not reach the server. Your changes are still here; save again." }
      );
   }

   async function loadServer() {
      if (write.phase !== "conflict") return;
      setWrite({ ...write, busy: true });
      const result = await client.getStory(saved.id);
      if (result.status === "ok") {
         setSaved(result.data);
         setDraft(draftOf(result.data));
         setIssues([]);
         return setWrite({ phase: "idle" });
      }
      if (result.status === "unauthenticated") return setWrite({ phase: "signin" });
      if (result.status === "notFound") return setWrite({ phase: "gone" });
      setWrite({ phase: "failed", message: "We could not load the newer version. Nothing was replaced; your changes are still here." });
   }

   async function duplicate() {
      if (busy || dirty || copy.phase === "unknown") return;
      setCopy({ phase: "working" });
      const result = await client.duplicateStory(saved.id);
      if (result.status === "ok") {
         setCopy({ phase: "done" });
         return router.push(storyHref(result.data.id));
      }
      if (isUnknown(result)) return setCopy({ phase: "unknown" });
      setCopy({ phase: "failed", message: `${problem(result, "the copy")} No copy was made.`, signin: result.status === "unauthenticated" });
   }

   if (deleted) {
      return (
         <div className="space-y-4">
            <h1 ref={heading} tabIndex={-1} className="text-section text-foreground">
               {deleted === "deleted" ? "Story deleted" : "Story not found"}
            </h1>
            <p role="status" className="text-body text-foreground">
               {deleted === "deleted"
                  ? `The server confirmed that “${saved.title}” was deleted.`
                  : "This story was not found in your Story Bank, so this request deleted nothing."}
            </p>
            <BackLink />
         </div>
      );
   }

   const saveState: SaveState = saving
      ? "saving"
      : write.phase in SAVE_MESSAGES
        ? "error"
        : dirty
          ? "unsaved"
          : write.phase === "saved"
            ? "saved"
            : "idle";
   const links = saved.answer_ids.length;
   const canCopy = !busy && !dirty && copy.phase !== "unknown";
   // An answer copies what is saved, so unsaved edits are saved first.
   const canStart = !busy && !dirty;

   return (
      <form onSubmit={save} noValidate className="space-y-8">
         <div className="space-y-3">
            <BackLink />
            <h1 className="text-section text-foreground">Your story</h1>
            <p className="text-supporting text-muted-foreground">{links === 0 ? "Not linked to an answer." : `Linked to ${links} ${links === 1 ? "answer" : "answers"}.`}</p>
         </div>

         <StoryFields draft={draft} onChange={edit} problems={problems} issues={issues} disabled={busy} />

         <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
               <Button type="submit" size="lg" aria-disabled={busy || !dirty} className={cn((busy || !dirty) && "opacity-50")}>
                  Save changes
               </Button>
               <Button type="button" variant="outline" size="lg" aria-disabled={!canCopy} className={cn(!canCopy && "opacity-50")} onClick={() => void duplicate()}>
                  Duplicate
               </Button>
               {canStart ? (
                  <Button asChild variant="outline" size="lg">
                     <Link href={newAnswerHref(null, saved.id)} prefetch={false}>
                        Start an answer from this story
                     </Link>
                  </Button>
               ) : (
                  <Button type="button" variant="outline" size="lg" aria-disabled className="opacity-50">
                     Start an answer from this story
                  </Button>
               )}
               <DeleteStory client={client} story={saved} disabled={busy} onDeleted={setDeleted} />
               <SaveStatus status={saveState} message={leaving && saving ? "Saving before you leave…" : saving && slow ? "Saving… this is taking longer than usual" : SAVE_MESSAGES[write.phase]} />
            </div>
            {dirty && copy.phase !== "working" && (
               <p className="text-supporting text-muted-foreground">Save your changes before duplicating or starting an answer: both use what is saved.</p>
            )}
            <p className="text-supporting text-muted-foreground">Starting an answer copies this story&apos;s text into a new answer once. The two stay separate afterwards.</p>
            {write.phase === "failed" && (
               <p role="alert" className="text-body text-foreground">
                  {write.message}
               </p>
            )}
            {write.phase === "gone" && (
               <p role="alert" className="text-body text-foreground">
                  {STORY_NOT_FOUND} Your text is still here, but it cannot be saved to a story that is not in your Story Bank.
               </p>
            )}
            {write.phase === "signin" && <SignIn doing="save this story" to={here} />}
            {write.phase === "unknown" && (
               <div role="alert" className="space-y-3">
                  <p className="text-body text-foreground">We could not confirm whether your changes were saved. Check the saved story before saving again.</p>
                  <Button type="button" variant="outline" disabled={write.checking} onClick={() => void check()}>
                     {write.checking ? "Checking…" : "Check the saved story"}
                  </Button>
               </div>
            )}
            {write.phase === "conflict" && (
               <div role="group" aria-label="Choose which version to keep" className="space-y-3">
                  <p className="text-supporting text-foreground">A newer version of this story was saved elsewhere. Nothing has been replaced yet; your changes here are unsaved.</p>
                  <div className="flex flex-wrap gap-3">
                     <Button type="button" aria-disabled={write.busy} className={cn(write.busy && "opacity-50")} onClick={() => !write.busy && void persist(write.currentVersion)}>
                        Keep mine
                     </Button>
                     <Button type="button" variant="outline" aria-disabled={write.busy} className={cn(write.busy && "opacity-50")} onClick={() => void loadServer()}>
                        Load server version
                     </Button>
                  </div>
                  <p className="text-supporting text-muted-foreground">
                     {write.busy ? "Checking the latest version…" : "Keep mine saves your changes over the newer version. Load server version replaces what is here with it."}
                  </p>
               </div>
            )}
            <div role="status" className="min-h-5 text-supporting text-foreground">
               {copy.phase === "working" && "Duplicating…"}
               {copy.phase === "done" && "Copy created. Opening it…"}
               {copy.phase === "unknown" && (
                  <>
                     We could not confirm that the copy was made. It may exist, so check{" "}
                     <Link href={PREPARE_STORIES_HREF} prefetch={false} className="underline underline-offset-4">
                        your Story Bank
                     </Link>{" "}
                     before duplicating again.
                  </>
               )}
               {copy.phase === "failed" && (
                  <>
                     {copy.message}
                     {copy.signin && (
                        <>
                           {" "}
                           <Link href={`/login?redirect=${encodeURIComponent(here)}`} className="underline underline-offset-4">
                              Sign in
                           </Link>
                        </>
                     )}
                  </>
               )}
            </div>
            {copy.phase === "unknown" && (
               <Button type="button" variant="outline" onClick={() => setCopy({ phase: "idle" })}>
                  I checked: no copy exists. Allow duplicating again
               </Button>
            )}
         </div>
         <LinkedAnswers client={client} answerIds={saved.answer_ids} />
      </form>
   );
}
