"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { PendingLink } from "@/components/navigation/PendingLink";
import { KNOWLEDGE, TRACKS } from "./home-copy";
import { CARD_GRID_CLASS } from "./tracksGrid";

/**
 * Waits between the automatic retries of a pending Tracks section, in ms from the previous attempt. Six tries over about
 * 80 seconds cover a free-tier API's start, then it stops: nothing here polls after the Tracks have arrived or after the
 * last try. Each try re-renders this page on the server (`router.refresh`), which reads the answer the first request
 * left in the cache; it makes no catalog request from the browser.
 */
export const RETRY_DELAYS_MS = [4000, 8000, 16000, 24000, 28000] as const;
/** After this long without Tracks the status line explains that the server may be starting. */
export const SLOW_AFTER_MS = 6000;

const ACTION =
   "home-btn inline-flex h-auto rounded-full bg-card px-6 py-3.5 text-[15px]/4.5 font-medium text-foreground shadow-[0_0_0_1px_var(--home-rule)] disabled:opacity-60";

/**
 * A skeleton Track card: the real card's padding, icon, title and summary lines. Its height is what the published Tracks' cards
 * measure today (328 px at 1280 wide, 350 px at 390), so their arrival moves nothing; a longer summary would make a card taller.
 */
function SkeletonCard() {
   return (
      <li className="flex">
         <div className="flex min-h-[21.875rem] md:min-h-[20.5rem] w-full flex-col gap-8 rounded-[20px] border border-home-line bg-card p-7">
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
 * skeleton and the retry timer's wording and says to reload, because nothing here can retry itself.
 */
export function TracksPending() {
   const router = useRouter();
   const [attempt, setAttempt] = useState(0);
   const [slow, setSlow] = useState(false);
   const [refreshing, startRefresh] = useTransition();
   const stalled = attempt >= RETRY_DELAYS_MS.length && !refreshing;

   useEffect(() => {
      const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
      return () => window.clearTimeout(timer);
   }, []);

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

   const message = stalled
      ? TRACKS.stalled
      : slow
        ? TRACKS.pendingSlow
        : TRACKS.pending;

   return (
      <div data-tracks-pending data-state={stalled ? "stalled" : slow ? "slow" : "loading"}>
         <div data-tracks-js className="flex flex-col gap-8">
            <p role="status" className="m-0 mx-auto max-w-2xl text-center text-body text-pretty text-muted-foreground">
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
                        setSlow(false);
                        setAttempt(0);
                        startRefresh(() => router.refresh());
                     }}
                  >
                     {TRACKS.retry}
                  </button>
                  <PendingLink href={KNOWLEDGE.action.href} className={ACTION}>
                     {KNOWLEDGE.action.label}
                  </PendingLink>
               </div>
            ) : null}
         </div>
         <noscript>
            <style>{"[data-tracks-js]{display:none}"}</style>
            <p className="m-0 mx-auto max-w-2xl text-center text-body text-pretty text-muted-foreground">{TRACKS.noscript}</p>
            <p className="m-0 mt-4 text-center">
               <a href={KNOWLEDGE.action.href} className={ACTION}>
                  {KNOWLEDGE.action.label}
               </a>
            </p>
         </noscript>
      </div>
   );
}

/** Retry for a Track list that failed to load: one more server render, not a request from the browser. */
export function TracksRetryButton() {
   const router = useRouter();
   const [refreshing, startRefresh] = useTransition();
   return (
      <>
         <button type="button" className={ACTION} disabled={refreshing} aria-disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}>
            {refreshing ? TRACKS.retrying : TRACKS.retry}
         </button>
         <noscript>
            <span className="text-sm text-muted-foreground">{TRACKS.noscriptRetry}</span>
         </noscript>
      </>
   );
}
