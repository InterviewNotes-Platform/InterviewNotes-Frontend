"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SLOW_AFTER_MS, useBoundedRefresh } from "@/app/TracksRetry";
import { Button } from "@/components/ui/button";
import { TRACKS_INDEX_HREF } from "@/lib/primary-navigation";

export const PENDING = {
   loading: "Loading this page.",
   slow: "Still loading. The server may be starting, which can take up to a minute. This page will appear as soon as it is ready.",
   stalled: "This page is taking longer than usual to load.",
   retry: "Try again",
   browse: "Browse Tracks",
   noscript: "This page is still loading, and it cannot refresh itself without JavaScript. Reload the page in a minute to see it.",
   reload: "Reload this page",
} as const;

/**
 * A catalog page whose API read had not answered by the request's deadline. It says only that the page is loading: no title,
 * no access state and no content, because none has been read. The bounded refresh re-renders the page on the server, where
 * every existence, publication and access check runs again on the answer. Without script it says to reload, and links to
 * this page and the Tracks.
 */
export function CatalogPending({ href }: { href: string }) {
   const { stalled, retry, cycle } = useBoundedRefresh();
   const [slowCycle, setSlowCycle] = useState<number | null>(null);
   const slow = slowCycle === cycle;
   const status = useRef<HTMLParagraphElement>(null);

   useEffect(() => {
      const timer = window.setTimeout(() => setSlowCycle(cycle), SLOW_AFTER_MS);
      return () => window.clearTimeout(timer);
   }, [cycle]);

   return (
      <div data-catalog-pending data-state={stalled ? "stalled" : slow ? "slow" : "loading"} className="rounded-lg bg-surface px-6 py-12 text-center">
         <div data-catalog-pending-js>
            <p ref={status} tabIndex={-1} role="status" className="m-0 text-body text-pretty text-muted-foreground outline-none">
               {stalled ? PENDING.stalled : slow ? PENDING.slow : PENDING.loading}
            </p>
            {stalled ? (
               <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button
                     type="button"
                     onClick={() => {
                        status.current?.focus();
                        retry();
                     }}
                     className="bg-foreground text-background hover:bg-foreground/90 h-8 text-sm"
                  >
                     {PENDING.retry}
                  </Button>
                  <Button asChild variant="outline" className="h-8 text-sm">
                     <Link href={TRACKS_INDEX_HREF}>{PENDING.browse}</Link>
                  </Button>
               </div>
            ) : null}
         </div>
         <noscript>
            <style>{"[data-catalog-pending-js]{display:none}"}</style>
            <p className="m-0 text-body text-pretty text-muted-foreground">{PENDING.noscript}</p>
            <p className="m-0 mt-6 flex flex-wrap justify-center gap-3">
               <a href={href} className="font-medium text-[var(--primary-text)] underline underline-offset-4">
                  {PENDING.reload}
               </a>
               <a href={TRACKS_INDEX_HREF} className="font-medium text-[var(--primary-text)] underline underline-offset-4">
                  {PENDING.browse}
               </a>
            </p>
         </noscript>
      </div>
   );
}
