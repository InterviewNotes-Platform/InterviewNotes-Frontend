"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { problem } from "@/app/prepare/data/messages";
import { PREPARE_STORY_NEW_HREF, storyHref } from "@/app/prepare/stories/href";
import { Button } from "@/components/ui/button";
import type { PrepClient } from "@/lib/prep/client";
import type { PrepResult, Story } from "@/lib/prep/types";

type Entry = { phase: "loading" } | { phase: "ready"; title: string } | { phase: "missing" } | { phase: "failed" };
type Choices = { phase: "closed" } | { phase: "loading" } | { phase: "ready"; stories: Story[]; total: number } | { phase: "failed"; message: string };
// `unknown`: the write may have happened. Only `check` (a read) or a repeat of the idempotent write settles it.
type Outcome =
   | { phase: "idle" }
   | { phase: "pending" }
   | { phase: "done"; message: string }
   | { phase: "failed"; message: string }
   | { phase: "unknown"; message: string; checking: boolean };

const SELECT =
   "border-input h-11 w-full max-w-md rounded-md border bg-transparent px-3 text-base shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm dark:bg-input/30";

const entryOf = (result: PrepResult<Story>): Entry =>
   result.status === "ok" ? { phase: "ready", title: result.data.title } : result.status === "notFound" ? { phase: "missing" } : { phase: "failed" };

type Failed = Exclude<PrepResult<unknown>, { status: "ok" }>;

const wording = (result: Failed, doing: string) =>
   result.status === "unauthenticated" ? `Your session has ended, so ${doing} did not happen. Sign in again, then try again.` : problem(result, doing);

/** Any `unavailable` write, an upstream error included, may have been applied before the failure (contract §6). */
const isUnknown = (result: Failed) => result.status === "unavailable";

const unknownWording = (doing: string) => `We could not confirm whether ${doing} worked, so it may or may not have been applied. The list shows only what the server last confirmed.`;

const writeWording = (result: Failed, doing: string, missing: string) =>
   result.status === "notFound" ? missing : isUnknown(result) ? unknownWording(doing) : `${wording(result, doing)} Nothing was changed.`;

interface Props {
   client: PrepClient;
   answerId: string;
   /** The stories linked when the answer was read. After that this component holds only what the API has confirmed. */
   initialStoryIds: string[];
}

/**
 * The editor's story-link mount. A link records which stories an answer drew on; it is not a live view, and linking or
 * unlinking never touches the answer's or the story's text or version. Nothing shows as linked or unlinked before the API said so.
 */
export function LinkedStories({ client, answerId, initialStoryIds }: Props) {
   const ids = useId();
   const [linked, setLinked] = useState(initialStoryIds);
   const [entries, setEntries] = useState<Record<string, Entry>>({});
   const [choices, setChoices] = useState<Choices>({ phase: "closed" });
   const [chosen, setChosen] = useState("");
   const [outcome, setOutcome] = useState<Outcome>({ phase: "idle" });
   const busy = useRef(false);
   const pending = outcome.phase === "pending";
   const key = linked.join(",");

   useEffect(() => {
      let current = true;
      for (const id of linked) {
         if (entries[id]) continue;
         setEntries((was) => ({ ...was, [id]: { phase: "loading" } }));
         client.getStory(id).then((result) => {
            if (current) setEntries((was) => ({ ...was, [id]: entryOf(result) }));
         });
      }
      return () => {
         current = false;
      };
      // Each id is read once; `key` stands for the list, which is a new array on every change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [client, key]);

   /** One write at a time: a second click while one is open does nothing. */
   async function run<T>(send: () => Promise<PrepResult<T>>, onOk: (data: T) => string, doing: string, missing: string) {
      if (busy.current) return;
      busy.current = true;
      setOutcome({ phase: "pending" });
      const result = await send();
      busy.current = false;
      if (result.status === "ok") return setOutcome({ phase: "done", message: onOk(result.data) });
      const message = writeWording(result, doing, missing);
      setOutcome(isUnknown(result) ? { phase: "unknown", message, checking: false } : { phase: "failed", message });
   }

   /** Reads the answer again and shows exactly the links the server holds now. */
   async function check() {
      if (busy.current) return;
      busy.current = true;
      setOutcome((was) => (was.phase === "unknown" ? { ...was, checking: true } : was));
      const result = await client.getAnswer(answerId);
      busy.current = false;
      if (result.status === "ok") {
         setLinked(result.data.story_ids);
         return setOutcome({ phase: "done", message: "Checked: the list now shows the links the server holds." });
      }
      setOutcome((was) =>
         was.phase === "unknown" ? { ...was, checking: false, message: `${was.message} We could not read the answer to check, so the outcome is still unknown.` } : was
      );
   }

   const titleOf = (id: string) => {
      const entry = entries[id];
      return entry?.phase === "ready" ? entry.title : "this story";
   };

   function link() {
      if (!chosen || linked.includes(chosen)) return;
      const id = chosen;
      const name = choices.phase === "ready" ? (choices.stories.find((story) => story.id === id)?.title ?? "the story") : "the story";
      void run(
         () => client.linkStory(answerId, id),
         () => {
            setLinked((was) => (was.includes(id) ? was : [...was, id]));
            setChosen("");
            return `Linked to ${name}. Nothing was copied: the story's text stays in the story.`;
         },
         "linking the story",
         "That story could not be found in your Story Bank, so nothing was linked."
      );
   }

   async function unlink(id: string) {
      const name = titleOf(id);
      // The API says 404 when there is no such link for this reader: then it is not linked, which is what was asked.
      await run(
         async (): Promise<PrepResult<"removed" | "absent">> => {
            const result = await client.unlinkStory(answerId, id);
            if (result.status === "notFound") return { status: "ok", data: "absent" };
            return result.status === "ok" ? { status: "ok", data: "removed" } : result;
         },
         (how) => {
            setLinked((was) => was.filter((other) => other !== id));
            return how === "absent" ? `${name} was not linked any more.` : `Unlinked from ${name}. Neither the story nor this answer was changed.`;
         },
         "unlinking the story",
         ""
      );
   }

   async function openChoices() {
      setChoices({ phase: "loading" });
      const result = await client.listStories({ limit: 100 });
      setChoices(result.status === "ok" ? { phase: "ready", stories: result.data.items, total: result.data.total } : { phase: "failed", message: wording(result, "listing your stories") });
   }

   const available = choices.phase === "ready" ? choices.stories.filter((story) => !linked.includes(story.id)) : [];

   return (
      <section aria-labelledby={`${ids}-stories`} className="mt-8 space-y-4">
         <h2 id={`${ids}-stories`} className="text-subsection text-foreground">
            Linked stories
         </h2>
         <p className="text-supporting text-muted-foreground">
            A link only records which story you drew on. It is not a live view: this answer and the story keep separate text, and changing one never changes the other.
         </p>

         {linked.length === 0 ? (
            <p className="text-body text-muted-foreground">No story is linked to this answer.</p>
         ) : (
            <ul className="space-y-2">
               {linked.map((id) => {
                  const entry = entries[id] ?? { phase: "loading" };
                  return (
                     <li key={id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-foreground">
                        {entry.phase === "ready" ? (
                           <Link href={storyHref(id)} prefetch={false} className="inline-flex min-h-11 items-center underline underline-offset-4">
                              {entry.title}
                           </Link>
                        ) : (
                           <span className="text-muted-foreground">
                              {entry.phase === "loading" ? "Loading a story…" : entry.phase === "missing" ? "A linked story could not be found." : "We could not load a linked story."}
                           </span>
                        )}
                        <Button type="button" variant="outline" size="sm" disabled={pending} aria-label={`Unlink ${entry.phase === "ready" ? entry.title : "a story"}`} onClick={() => void unlink(id)}>
                           Unlink
                        </Button>
                     </li>
                  );
               })}
            </ul>
         )}

         {choices.phase === "closed" || choices.phase === "loading" ? (
            <Button type="button" variant="outline" disabled={choices.phase === "loading" || pending} onClick={() => void openChoices()}>
               {choices.phase === "loading" ? "Loading your stories…" : "Link a story"}
            </Button>
         ) : choices.phase === "failed" ? (
            <div role="alert" className="space-y-3">
               <p className="text-body text-foreground">{choices.message}</p>
               <Button type="button" variant="outline" onClick={() => void openChoices()}>
                  Try again
               </Button>
            </div>
         ) : available.length === 0 ? (
            <p role="status" className="text-body text-muted-foreground">
               {choices.stories.length === 0 ? "Your Story Bank is empty." : "Every story you have is already linked."}{" "}
               <Link href={PREPARE_STORY_NEW_HREF} prefetch={false} className="underline underline-offset-4">
                  Add a story
               </Link>
            </p>
         ) : (
            <div className="space-y-2">
               <label htmlFor={`${ids}-choice`} className="block text-supporting font-semibold text-foreground">
                  Story to link
               </label>
               <div className="flex flex-wrap items-center gap-3">
                  <select id={`${ids}-choice`} value={chosen} disabled={pending} onChange={(event) => setChosen(event.target.value)} className={SELECT}>
                     <option value="">Choose a story</option>
                     {available.map((story) => (
                        <option key={story.id} value={story.id}>
                           {story.title}
                        </option>
                     ))}
                  </select>
                  <Button type="button" disabled={!chosen || pending} onClick={link}>
                     Link story
                  </Button>
               </div>
               {choices.total > choices.stories.length && (
                  <p className="text-supporting text-muted-foreground">Showing your first {choices.stories.length} of {choices.total} stories.</p>
               )}
            </div>
         )}

         <div role="status" className="min-h-5 text-supporting text-foreground">
            {outcome.phase === "pending" && "Working…"}
            {outcome.phase === "done" && outcome.message}
         </div>
         {(outcome.phase === "failed" || outcome.phase === "unknown") && (
            <div role="alert" className="space-y-3">
               <p className="text-body text-foreground">{outcome.message}</p>
               {outcome.phase === "unknown" && (
                  <Button type="button" variant="outline" disabled={outcome.checking} onClick={() => void check()}>
                     {outcome.checking ? "Checking…" : "Check the saved links"}
                  </Button>
               )}
            </div>
         )}
      </section>
   );
}
