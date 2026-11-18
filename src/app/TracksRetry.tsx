"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { PendingLink } from "@/components/navigation/PendingLink";
import { KNOWLEDGE, TRACKS } from "./home-copy";
import { CARD_GRID_CLASS } from "./tracksGrid";

/**
 * Waits between the automatic retries of a pending homepage section, in ms from the previous attempt. Four tries over 80
 * seconds cover a free-tier API's start, then it stops: nothing here polls after the Tracks have arrived or after the last
 * try. Each try re-renders this page on the server (`router.refresh`), which reads the answer the first request left in the
 * cache; it makes no catalog request from the browser. A try made before that first read has finished is a further read of
 * the same public path (a serverless platform cannot join a read in flight in another invocation), which is why the tries
 * are few and spread out.
 */
export const RETRY_DELAYS_MS = [6000, 14000, 24000, 36000] as const;
/** After this long without Tracks the status line explains that the server may be starting. */
export const SLOW_AFTER_MS = 6000;

const ACTION =
   "home-btn inline-flex h-auto rounded-full bg-card px-6 py-3.5 text-[15px]/4.5 font-medium text-foreground shadow-[0_0_0_1px_var(--home-rule)] disabled:opacity-60 aria-disabled:opacity-60";

/**
 * The bounded retry: one server refresh at a time, at the delays above, never for a hidden tab, then it stops. `retry`
 * starts a fresh sequence. Used by whatever is pending on the homepage: only one component runs it at a time, but when the
 * Tracks arrive while the free chapter is still late, the sequence passes from `TracksPending` to `FreeChapterRefresh` and
 * starts again, so a visitor sees at most two sequences (eight refreshes), each bounded.
 */
function useBoundedRefresh() {
   const router = useRouter();
   const [attempt, setAttempt] = useState(0);
   const [cycle, setCycle] = useState(0);
   const [refreshing, startRefresh] = useTransition();
   const stalled = attempt >= RETRY_DELAYS_MS.length && !refreshing;

   useEffect(() => {
      if (attempt >= RETRY_DELAYS_MS.length || refreshing) return;
      let waiting: (() => void) | null = null;
      const run = () => {
         // A hidden tab waits: nothing is read for a page nobody is looking at.
         if (document.visibilityState === "hidden") {
            waiting = run;
            document.addEventListener("visibilitychange", run, { once: true });
            return;
         }
         waiting = null;
         setAttempt((n) => n + 1);
         startRefresh(() => router.refresh());
      };
      const timer = window.setTimeout(run, RETRY_DELAYS_MS[attempt]);
      return () => {
         window.clearTimeout(timer);
         if (waiting) document.removeEventListener("visibilitychange", waiting);
      };
   }, [attempt, refreshing, router]);

   const retry = useCallback(() => {
      setAttempt(0);
      setCycle((n) => n + 1);
      startRefresh(() => router.refresh());
   }, [router]);

   return { stalled, retry, cycle };
}

/** A skeleton Track card: the real card's padding, icon, title and summary lines. Its height is what the published Tracks'
 * cards measure today (328 px at 1280 wide, 350 px at 390), so their arrival moves nothing; a longer summary would make a
 * card taller, and the skeleton holds two cards because that is what the catalog publishes. */
function SkeletonCard() {
   return (
      <li className="flex">
         <div className="flex min-h-[21.875rem] w-full flex-col gap-8 rounded-[20px] border border-home-line bg-card p-7 md:min-h-[20.5rem]">
            <div className="size-12 shrink-0 rounded-[14px] bg-muted motion-safe:animate-pulse" />
            <div className="flex flex-1 flex-col gap-2.5">
               <div className="h-6 w-2/3 rounded bg-muted motion-safe:animate-pulse" />
               <div className="h-[1.375rem] w-full rounded bg-muted motion-safe:animate-pulse" />
               <div className="h-[1.375rem] w-full rounded bg-muted motion-safe:animate-pulse" />
               <div className="h-[1.375rem] w-3/4 rounded bg-muted motion-safe:animate-pulse" />
            </div>
         </div>
      </li>
   );
}

/**
 * The Tracks section while the Track list has not arrived. It says what is happening, in text, and holds the space the
 * cards will take; it never shows a card, a count or a title the catalog did not send. Without script it hides the
 * skeleton and the retry timer's wording and says to reload, because nothing here can retry itself, and links to the
 * Tracks page and to Knowledge (P8-D-074). With script, those two links appear once the bounded retries have stopped;
 * until then the hero's own Browse Tracks action and the header navigation are the way on.
 */
export function TracksPending() {
   const { stalled, retry, cycle } = useBoundedRefresh();
   // `slow` belongs to one sequence: each new one earns the "server may be starting" wording again.
   const [slowCycle, setSlowCycle] = useState<number | null>(null);
   const slow = slowCycle === cycle;
   const status = useRef<HTMLParagraphElement>(null);

   useEffect(() => {
      const timer = window.setTimeout(() => setSlowCycle(cycle), SLOW_AFTER_MS);
      return () => window.clearTimeout(timer);
   }, [cycle]);

   const message = stalled ? TRACKS.stalled : slow ? TRACKS.pendingSlow : TRACKS.pending;

   return (
      <div data-tracks-pending data-state={stalled ? "stalled" : slow ? "slow" : "loading"}>
         <div data-tracks-js className="flex flex-col gap-8">
            <p ref={status} tabIndex={-1} role="status" className="m-0 mx-auto max-w-2xl text-center text-body text-pretty text-muted-foreground outline-none">
               {message}
            </p>
            <ul aria-hidden="true" data-tracks-skeleton className={`m-0 mx-auto grid w-full list-none grid-cols-1 gap-5 p-0 ${CARD_GRID_CLASS}`}>
               <SkeletonCard />
               <SkeletonCard />
            </ul>
            {stalled ? (
               <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                     type="button"
                     className={ACTION}
                     onClick={() => {
                        // The button leaves with the stalled state; focus goes to the status line, which then says what is happening.
                        status.current?.focus();
                        retry();
                     }}
                  >
                     {TRACKS.retry}
                  </button>
                  <PendingLink href={TRACKS.browse.href} className={ACTION}>
                     {TRACKS.browse.label}
                  </PendingLink>
                  <PendingLink href={KNOWLEDGE.action.href} className={ACTION}>
                     {KNOWLEDGE.action.label}
                  </PendingLink>
               </div>
            ) : null}
         </div>
         <noscript>
            <style>{"[data-tracks-js]{display:none}"}</style>
            <p className="m-0 mx-auto max-w-2xl text-center text-body text-pretty text-muted-foreground">{TRACKS.noscript}</p>
            <p className="m-0 mt-4 flex flex-wrap items-center justify-center gap-3">
               <a href={TRACKS.browse.href} className={ACTION}>
                  {TRACKS.browse.label}
               </a>
               <a href={KNOWLEDGE.action.href} className={ACTION}>
                  {KNOWLEDGE.action.label}
               </a>
            </p>
         </noscript>
      </div>
   );
}

/**
 * Renders nothing. Mounted when only the free-chapter read is late (the Tracks arrived), so that the same bounded retry
 * brings the hero's second action in. It is not mounted beside `TracksPending`, which already runs the one sequence.
 */
export function FreeChapterRefresh() {
   useBoundedRefresh();
   return null;
}

/** Retry for a Track list that failed to load: one more server render, not a request from the browser. Hidden without script. */
export function TracksRetryButton() {
   const router = useRouter();
   const [refreshing, startRefresh] = useTransition();
   const [clicked, setClicked] = useState(false);
   // A retry that has ended with this button still on the page failed again: say so, since the page otherwise looks unchanged.
   const failedAgain = clicked && !refreshing;

   return (
      <>
         <span data-retry-js className="inline-flex flex-col items-center gap-2">
            <button
               type="button"
               className={ACTION}
               aria-disabled={refreshing || undefined}
               onClick={() => {
                  if (refreshing) return;
                  setClicked(true);
                  startRefresh(() => router.refresh());
               }}
            >
               {refreshing ? TRACKS.retrying : TRACKS.retry}
            </button>
            <span role="status" className="text-sm text-muted-foreground empty:sr-only">
               {failedAgain ? TRACKS.retryFailed : ""}
            </span>
         </span>
         <noscript>
            <style>{"[data-retry-js]{display:none}"}</style>
            <span className="text-sm text-muted-foreground">{TRACKS.noscriptRetry}</span>
         </noscript>
      </>
   );
}
