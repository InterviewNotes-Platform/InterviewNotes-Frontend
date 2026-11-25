"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AttemptDataControls, PracticeDataControls } from "./PracticeDataControls";
import type { AttemptListItem, AttemptStatus, Seniority } from "@/lib/practice-workspace/types";
import { usePracticeSession } from "./practiceSession";

export const SENIORITY_NAME: Readonly<Record<Seniority, string>> = { mid: "Mid", senior: "Senior", staff: "Staff", principal: "Principal" };

const STATUS_NAME: Readonly<Record<AttemptStatus, string>> = {
   active: "In progress",
   submitted: "Submitted",
   evaluating: "Submitted",
   evaluated: "Submitted",
   evaluation_failed: "Submitted",
   ended_by_reveal: "Ended, reference revealed",
   abandoned: "Abandoned",
};

/** The list carries no title (the contract keeps it light): the public catalog's title, or a neutral name when the Problem is no longer listed. */
export const UNLISTED_PROBLEM = "A Problem that is no longer listed";
const problemName = (contentId: string, titles: Readonly<Record<string, string>>) => titles[contentId] ?? UNLISTED_PROBLEM;

const readerHref = (contentId: string) => (/^problem\.[a-z0-9][a-z0-9._-]*$/.test(contentId) ? `/problems/${contentId.slice("problem.".length)}` : null);

type Load = { kind: "loading" } | { kind: "ready"; items: AttemptListItem[]; next: string | null; more: "idle" | "loading" | "failed" } | { kind: "failed"; signedOut: boolean };

function Row({ item, titles, onDeleted }: { item: AttemptListItem; titles: Readonly<Record<string, string>>; onDeleted: (id: string) => void }) {
   const session = usePracticeSession();
   const href = titles[item.content_id] ? readerHref(item.content_id) : null;
   const name = problemName(item.content_id, titles);
   const active = item.status === "active";
   return (
      <li className="m-0 grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[1fr_auto] md:items-center">
         <div className="min-w-0">
            <p className="m-0 text-body font-semibold text-balance">{name}</p>
            <p className="m-0 mt-1 text-supporting text-muted-foreground">
               {STATUS_NAME[item.status]} · {SENIORITY_NAME[item.target_seniority]} bar · {item.stages_done} of {item.stages_total} stages done · Last changed{" "}
               <time dateTime={item.updated_at}>{new Date(item.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</time>
            </p>
         </div>
         <div className="flex flex-wrap gap-3">
            <Button asChild className="min-h-11" variant={active ? "default" : "outline"}>
               <Link href={`/practice/attempts/${encodeURIComponent(item.id)}`} prefetch={false}>
                  {active ? "Resume" : "Open"}
                  <span className="sr-only"> {name}</span>
               </Link>
            </Button>
            {href ? (
               <Button asChild variant="ghost" className="min-h-11">
                  <Link href={href} prefetch={false}>
                     The Problem
                     <span className="sr-only">: {name}</span>
                  </Link>
               </Button>
            ) : null}
         </div>
         <details className="md:col-span-2">
            <summary className="min-h-11 cursor-pointer content-center text-supporting text-muted-foreground">
               Export or delete<span className="sr-only">: {name}</span>
            </summary>
            <div className="pt-2">
               <AttemptDataControls session={session} attemptId={item.id} onDeleted={() => onDeleted(item.id)} />
            </div>
         </details>
      </li>
   );
}

/**
 * The learner's attempts, under the gate: a light list from the server (the contract keeps it light, so it holds no stage text), resume for an
 * active attempt, open for an ended one, and a way back to the reader. The full read-only review of an ended attempt is T15's.
 */
export function HistoryRoute({ titles = {} }: { titles?: Readonly<Record<string, string>> }) {
   const session = usePracticeSession();
   const { client, signal } = session;
   const [load, setLoad] = useState<Load>({ kind: "loading" });
   const [tries, setTries] = useState(0);

   useEffect(() => {
      let current = true;
      client.listAttempts({ limit: 50 }, { signal }).then((result) => {
         if (!current || signal.aborted) return;
         if (result.status === "ok") setLoad({ kind: "ready", items: result.data.items, next: result.data.next_cursor, more: "idle" });
         else setLoad({ kind: "failed", signedOut: result.status === "unauthenticated" });
      });
      return () => {
         current = false;
      };
   }, [client, signal, tries]);

   const retry = useCallback(() => {
      setLoad({ kind: "loading" });
      setTries((count) => count + 1);
   }, []);

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

   const heading = (
      <h1 className="m-0 font-[family-name:Iowan_Old_Style,Palatino_Linotype,Palatino,Book_Antiqua,Georgia,serif] text-title text-balance">Your practice attempts</h1>
   );

   if (load.kind === "loading") {
      return (
         <div className="mx-auto w-full max-w-reading px-4 py-10 md:px-6">
            {heading}
            <p role="status" className="mt-8 text-body text-muted-foreground">
               Loading your attempts…
            </p>
         </div>
      );
   }
   if (load.kind === "failed") {
      return (
         <div className="mx-auto w-full max-w-reading px-4 py-10 md:px-6">
            {heading}
            <div role="alert" className="mt-8 rounded-lg bg-surface px-6 py-8">
               <p className="m-0 mb-4 text-body text-muted-foreground">{load.signedOut ? "Your session has ended. Sign in again to see your attempts." : "We could not load your attempts. Nothing was changed."}</p>
               {load.signedOut ? null : (
                  <Button type="button" className="min-h-11" onClick={retry}>
                     Try again
                  </Button>
               )}
            </div>
         </div>
      );
   }
   const active = load.items.filter((item) => item.status === "active");
   const earlier = load.items.filter((item) => item.status !== "active");
   return (
      <div className="mx-auto w-full max-w-reading px-4 py-10 md:px-6">
         {heading}
         {load.items.length === 0 ? (
            <div className="mt-8 rounded-lg bg-surface px-6 py-10 text-center">
               <p className="m-0 mb-4 text-body text-muted-foreground">You have not started a practice attempt yet. Open a Problem and choose Practise this Problem.</p>
               <Button asChild className="min-h-11">
                  <Link href="/practice" prefetch={false}>
                     Browse Problems
                  </Link>
               </Button>
            </div>
         ) : (
            <div className="mt-8 grid gap-8">
               {active.length > 0 ? (
                  <section aria-labelledby="history-active">
                     <h2 id="history-active" className="m-0 mb-3 text-subsection">
                        In progress
                     </h2>
                     <ul className="m-0 grid list-none gap-3 p-0">
                        {active.map((item) => (
                           <Row key={item.id} item={item} titles={titles} onDeleted={removed} />
                        ))}
                     </ul>
                  </section>
               ) : null}
               {earlier.length > 0 ? (
                  <section aria-labelledby="history-earlier">
                     <h2 id="history-earlier" className="m-0 mb-3 text-subsection">
                        Earlier attempts
                     </h2>
                     <ul className="m-0 grid list-none gap-3 p-0">
                        {earlier.map((item) => (
                           <Row key={item.id} item={item} titles={titles} onDeleted={removed} />
                        ))}
                     </ul>
                  </section>
               ) : null}
               {load.next ? (
                  <div>
                     <Button type="button" variant="outline" className="min-h-11" aria-busy={load.more === "loading" || undefined} onClick={() => void loadMore()}>
                        {load.more === "loading" ? "Loading…" : "Show more"}
                     </Button>
                     {load.more === "failed" ? (
                        <p role="alert" className="m-0 mt-2 text-supporting text-muted-foreground">
                           We could not load more. Try again.
                        </p>
                     ) : null}
                  </div>
               ) : null}
            </div>
         )}
         <div className="mt-12 border-t border-border pt-8">
            <PracticeDataControls session={session} onDeletedAll={removedAll} />
         </div>
      </div>
   );
}
