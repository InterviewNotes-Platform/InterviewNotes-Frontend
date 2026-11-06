"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { PREPARE_STORY_NEW_HREF, PREPARE_STORIES_HREF, storyHref } from "@/app/prepare/stories/href";
import { SLOW_NOTICE, useSlow } from "@/app/prepare/data/messages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PREPARE_HREF } from "@/lib/primary-navigation";
import type { Story } from "@/lib/prep/types";
import { BackLink, NOT_CONFIGURED, readFailure, SignIn } from "./notices";
import { useStoryClient, type StoryApiProps } from "./useStoryClient";

const FIRST_PAGE = 100;
const SEARCH_MAX = 200;

type Load =
   | { phase: "loading" }
   | { phase: "ready"; stories: Story[]; total: number }
   | { phase: "signin" }
   | { phase: "failed"; message: string };

type Filter = { q: string; tags: string[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The reader's stories: search by words, filter by tags. Only what the API returns for the signed-in reader is ever listed. */
export function StoryBank(props: StoryApiProps) {
   const client = useStoryClient(props);
   const [load, setLoad] = useState<Load>(props.apiUrl ? { phase: "loading" } : { phase: "failed", message: NOT_CONFIGURED });
   const [typed, setTyped] = useState("");
   const [filter, setFilter] = useState<Filter>({ q: "", tags: [] });
   const [attempt, setAttempt] = useState(0);
   const slow = useSlow(load.phase === "loading");

   useEffect(() => {
      if (!client) return;
      let current = true;
      client.listStories({ q: filter.q, tag: filter.tags, limit: FIRST_PAGE }).then((result) => {
         if (!current) return;
         if (result.status === "ok") setLoad({ phase: "ready", stories: result.data.items, total: result.data.total });
         else if (result.status === "unauthenticated") setLoad({ phase: "signin" });
         else setLoad({ phase: "failed", message: readFailure(result) });
      });
      return () => {
         current = false;
      };
   }, [client, filter, attempt]);

   function apply(next: Filter) {
      setFilter(next);
      setLoad({ phase: "loading" });
   }

   function search(event: FormEvent) {
      event.preventDefault();
      apply({ ...filter, q: typed.trim() });
   }

   const filtered = filter.q !== "" || filter.tags.length > 0;
   const clear = () => {
      setTyped("");
      apply({ q: "", tags: [] });
   };
   const addTag = (tag: string) => !filter.tags.includes(tag) && apply({ ...filter, tags: [...filter.tags, tag] });

   return (
      <div className="space-y-8">
         <header className="space-y-4">
            <BackLink href={PREPARE_HREF}>Back to your workspace</BackLink>
            <h1 className="text-section text-foreground">Your Story Bank</h1>
            <p className="max-w-reading text-body text-muted-foreground">Keep the experiences you draw on in interviews, then tailor them to each question.</p>
            <Button asChild size="lg">
               <Link href={PREPARE_STORY_NEW_HREF} prefetch={false}>
                  New story
               </Link>
            </Button>
         </header>

         <form role="search" onSubmit={search} className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-64 flex-1 gap-1.5">
               <Label htmlFor="story-search">Search stories</Label>
               <Input id="story-search" type="search" value={typed} maxLength={SEARCH_MAX} disabled={!client} onChange={(event) => setTyped(event.target.value)} />
            </div>
            <Button type="submit" size="lg" disabled={!client}>
               Search
            </Button>
            {filtered && (
               <Button type="button" variant="outline" size="lg" onClick={clear}>
                  Clear search and filters
               </Button>
            )}
         </form>

         {filter.tags.length > 0 && (
            <ul aria-label="Tag filters" className="flex flex-wrap gap-2">
               {filter.tags.map((tag) => (
                  <li key={tag}>
                     <Button type="button" variant="secondary" size="sm" aria-label={`Remove filter ${tag}`} onClick={() => apply({ ...filter, tags: filter.tags.filter((other) => other !== tag) })}>
                        {tag} ✕
                     </Button>
                  </li>
               ))}
            </ul>
         )}

         {load.phase === "loading" && (
            <p role="status" className="text-body text-muted-foreground">
               Loading your stories… {slow && SLOW_NOTICE}
            </p>
         )}
         {load.phase === "signin" && <SignIn doing="open your Story Bank" to={PREPARE_STORIES_HREF} />}
         {load.phase === "failed" && (
            <div role="alert" className="space-y-3">
               <p className="text-body text-foreground">{load.message}</p>
               {props.apiUrl && (
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
         {load.phase === "ready" && <Stories stories={load.stories} total={load.total} filtered={filtered} onTag={addTag} onClear={clear} />}
      </div>
   );
}

function Stories({ stories, total, filtered, onTag, onClear }: { stories: Story[]; total: number; filtered: boolean; onTag: (tag: string) => void; onClear: () => void }) {
   if (stories.length === 0) {
      return filtered ? (
         <div role="status" className="space-y-3">
            <p className="text-body text-foreground">No stories match your search or filters.</p>
            <Button variant="outline" onClick={onClear}>
               Clear search and filters
            </Button>
         </div>
      ) : (
         <Card>
            <CardHeader>
               <CardTitle className="text-subsection">No stories yet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
               <p role="status" className="text-body text-muted-foreground">
                  Your Story Bank is empty. Add the first experience you want to reuse.
               </p>
               <Button asChild>
                  <Link href={PREPARE_STORY_NEW_HREF} prefetch={false}>
                     Add your first story
                  </Link>
               </Button>
            </CardContent>
         </Card>
      );
   }
   return (
      <div className="space-y-4">
         <p role="status" className="text-supporting text-muted-foreground">
            {total > stories.length ? `Showing the first ${stories.length} of ${plural(total, "story", "stories")}. Search or filter to narrow them.` : plural(total, "story", "stories")}
            {filtered && " match"}
         </p>
         <ul className="grid gap-4 md:grid-cols-2">
            {stories.map((story) => (
               <li key={story.id}>
                  <Card className="h-full">
                     <CardHeader>
                        <CardTitle className="text-subsection">
                           <Link href={storyHref(story.id)} prefetch={false} className="underline-offset-4 hover:underline">
                              {story.title}
                           </Link>
                        </CardTitle>
                     </CardHeader>
                     <CardContent className="space-y-3 text-supporting text-muted-foreground">
                        <p>
                           {story.year !== null && `${story.year} · `}
                           {story.answer_ids.length === 0 ? "Not linked to an answer" : `Linked to ${plural(story.answer_ids.length, "answer", "answers")}`}
                        </p>
                        {story.tags.length > 0 && (
                           <ul aria-label={`Tags on ${story.title}`} className="flex flex-wrap gap-2">
                              {story.tags.map((tag) => (
                                 <li key={tag}>
                                    <Button type="button" variant="outline" size="sm" aria-label={`Filter by tag ${tag}`} onClick={() => onTag(tag)}>
                                       {tag}
                                    </Button>
                                 </li>
                              ))}
                           </ul>
                        )}
                     </CardContent>
                  </Card>
               </li>
            ))}
         </ul>
      </div>
   );
}
