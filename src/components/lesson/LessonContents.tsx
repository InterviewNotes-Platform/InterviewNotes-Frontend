"use client";

import { useState, type MouseEvent } from "react";
import { Disclosure } from "@/components/ui/disclosure";
import type { ContentsEntry } from "@/lib/catalog/lesson";
import { cn } from "@/lib/utils";
import { useActiveHeading } from "./useActiveHeading";

// Just over Disclosure's 200ms collapse: the page is scrolled only once the panel above the heading has stopped moving.
const COLLAPSE_MS = 220;

/** Focus first, so a keyboard reader never loses their place; then scroll, which follows the page's motion preference. */
function goTo(id: string, delay: number) {
   const target = document.getElementById(id);
   if (!target) return;
   target.focus({ preventScroll: true });
   window.history.replaceState(null, "", `#${id}`);
   window.setTimeout(() => target.scrollIntoView({ block: "start" }), delay);
}

function Links({ entries, active, onJump, touch }: { entries: ContentsEntry[]; active: string | null; onJump: (id: string) => void; touch?: boolean }) {
   return (
      <ol className="m-0 list-none p-0">
         {entries.map(({ id, level, text }) => (
            <li key={id}>
               <a
                  href={`#${id}`}
                  aria-current={id === active ? "location" : undefined}
                  onClick={(event: MouseEvent) => {
                     event.preventDefault();
                     onJump(id);
                  }}
                  className={cn(
                     "block border-l-2 border-border py-1.5 text-supporting text-muted-foreground transition-micro hover:text-foreground aria-[current=location]:border-foreground aria-[current=location]:font-medium aria-[current=location]:text-foreground",
                     level === 3 ? "pl-6" : "pl-3",
                     touch && "flex min-h-11 items-center"
                  )}
               >
                  {text}
               </a>
            </li>
         ))}
      </ol>
   );
}

/**
 * A Lesson's contents from its own headings: a sticky column from `lg`, a collapsed disclosure below it. Both jump
 * with real links; the disclosure closes first, so the page is never scrolled toward a heading that is about to move.
 */
export function LessonContents({ entries, className, trackScroll = true }: { entries: ContentsEntry[]; className?: string; trackScroll?: boolean }) {
   // Off for a short list of bands: the last would never reach the top of a short page, so the wrong entry would stay current.
   const [tracked, choose] = useActiveHeading(trackScroll ? entries.map(({ id }) => id) : []);
   const active = trackScroll ? tracked : null;
   const [open, setOpen] = useState(false);

   const jump = (id: string, delay = 0) => {
      choose(id);
      goTo(id, delay);
   };
   const collapseThenJump = (id: string) => {
      setOpen(false);
      jump(id, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : COLLAPSE_MS);
   };

   return (
      <div className={className}>
         <div className="mb-10 border-y border-border lg:hidden">
            <Disclosure compact title="Contents" open={open} onOpenChange={setOpen}>
               <nav aria-label="Contents" className="pb-3">
                  <Links entries={entries} active={active} onJump={collapseThenJump} touch />
               </nav>
            </Disclosure>
         </div>
         <nav aria-label="Contents" className="sticky top-28 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block">
            <p className="m-0 mb-2 text-supporting font-semibold uppercase tracking-wide text-muted-foreground">Contents</p>
            <Links entries={entries} active={active} onJump={jump} />
         </nav>
      </div>
   );
}
