"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { ContentsEntry } from "@/lib/catalog/lesson";
import { cn } from "@/lib/utils";
import { useActiveHeading } from "./useActiveHeading";

/** Site header (64) + the shell's top bar (56): where the docked section bar sits. */
export const DOCK_TOP = 120;
/** Headings land clear of the docked bar (lesson-reader.css sets the same scroll margin); a heading is current from here. */
export const LESSON_LINE = 188;

/** An outline entry; one with a `note` is shown but is not a link (an empty Knowledge band, "Nothing yet"). */
export type OutlineEntry = ContentsEntry & { note?: string };

export interface Neighbour {
   href: string;
   title: string;
   premium: boolean;
}

/** Chapter numbers for the h2 entries; h3 entries carry none. */
export function chapterNumbers(entries: readonly ContentsEntry[]): Map<string, number> {
   const numbers = new Map<string, number>();
   entries.filter(({ level }) => level === 2).forEach(({ id }, index) => numbers.set(id, index + 1));
   return numbers;
}

/** The chapter an entry belongs to: itself, or the last h2 before it. */
function chapterOf(entries: readonly ContentsEntry[], id: string | null): ContentsEntry | null {
   let chapter: ContentsEntry | null = null;
   for (const entry of entries) {
      if (entry.level === 2) chapter = entry;
      if (entry.id === id) return chapter;
   }
   return null;
}

/** A real fragment link (history entry, deep link, back/forward); focus follows to the heading without a second scroll. */
function jumpProps(id: string, choose: (id: string) => void, after?: () => void) {
   return {
      href: `#${id}`,
      onClick: (event: MouseEvent) => {
         if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
         choose(id);
         after?.();
         window.requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));
      },
   };
}

function NeighbourLink({ neighbour, direction }: { neighbour: Neighbour | null; direction: "previous" | "next" }) {
   if (!neighbour) return <span className="size-11 shrink-0" aria-hidden="true" />;
   const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
   const label = `${direction === "previous" ? "Previous" : "Next"} in the Track: ${neighbour.title}${neighbour.premium ? ", premium" : ""}`;
   return (
      <Link href={neighbour.href} prefetch={false} aria-label={label} title={label} className="flex size-11 shrink-0 items-center justify-center rounded-md text-[var(--primary-text)] transition-micro hover:bg-muted">
         <Icon aria-hidden="true" className="size-5" />
      </Link>
   );
}

/**
 * The Lesson's full opening contents (§4.4), then, once they scroll out of view, a compact section bar docked under the shell's
 * top bar: the current chapter, the chapter progress and the section list, with the Track's previous and next Lesson at its
 * ends when the page is given them. One IntersectionObserver for docking and one for the current heading; no scroll listener.
 */
export function LessonOutline({ entries, previous, next, title = "In this lesson", label = "Lesson sections", lead, barLead, footer }: {
   entries: OutlineEntry[];
   previous: Neighbour | null;
   next: Neighbour | null;
   /** The opening contents' heading and the docked bar's name; a Knowledge entry (P8-T28) names its own. */
   title?: string;
   label?: string;
   /** Page controls in the opening contents (before the list) and in the docked bar, such as Knowledge's Read at depth. */
   lead?: ReactNode;
   barLead?: ReactNode;
   footer?: ReactNode;
}) {
   const [active, choose] = useActiveHeading(entries.filter(({ note }) => !note).map(({ id }) => id), LESSON_LINE);
   const [docked, setDocked] = useState(false);
   const [open, setOpen] = useState(false);
   const opening = useRef<HTMLElement>(null);
   const numbers = chapterNumbers(entries);
   const chapter = chapterOf(entries, active);
   const current = chapter ? numbers.get(chapter.id) ?? 0 : 0;

   useEffect(() => {
      const element = opening.current;
      if (!element || !("IntersectionObserver" in window)) return;
      const observer = new IntersectionObserver(
         ([entry]) => setDocked(!entry.isIntersecting && entry.boundingClientRect.top < DOCK_TOP),
         { rootMargin: `-${DOCK_TOP}px 0px 0px 0px` }
      );
      observer.observe(element);
      return () => observer.disconnect();
   }, []);

   const list = (after?: () => void, touch = false) => (
      <ol className="m-0 list-none p-0">
         {entries.map((entry) => (
            <li key={entry.id} className={entry.level === 3 ? "pl-8" : undefined}>
               {entry.note ? (
                  <span className={cn("lesson-outline-link flex items-baseline gap-3 py-1.5 text-muted-foreground", touch && "min-h-11 items-center")}>
                     {entry.level === 2 ? <span className="lesson-numeral w-6 shrink-0 text-right">{numbers.get(entry.id)}</span> : null}
                     <span className="min-w-0">
                        {entry.text} <em className="lesson-outline-note">— {entry.note}</em>
                     </span>
                  </span>
               ) : (
                  <a
                     {...jumpProps(entry.id, choose, after)}
                     aria-current={entry.id === active ? "location" : undefined}
                     className={cn("lesson-outline-link flex items-baseline gap-3 py-1.5 text-foreground no-underline", touch && "min-h-11 items-center")}
                  >
                     {entry.level === 2 ? <span className="lesson-numeral w-6 shrink-0 text-right">{numbers.get(entry.id)}</span> : null}
                     <span className="min-w-0">{entry.text}</span>
                  </a>
               )}
            </li>
         ))}
      </ol>
   );

   return (
      <>
         <div className="lesson-dock sticky z-30 h-0" style={{ top: DOCK_TOP }}>
            <div data-docked={docked} inert={!docked} className="lesson-dock-bar">
               <nav aria-label={label} className="mx-auto flex max-w-reading items-center gap-1 px-2">
                  <NeighbourLink neighbour={previous} direction="previous" />
                  {barLead}
                  <button
                     type="button"
                     aria-expanded={open}
                     aria-controls="lesson-dock-list"
                     onClick={() => setOpen(!open)}
                     className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-supporting text-foreground transition-micro hover:bg-muted"
                  >
                     {current ? <span className="lesson-dock-count shrink-0">{current} / {numbers.size}</span> : null}
                     <span className="min-w-0 truncate font-medium">{chapter?.text ?? "Contents"}</span>
                     <ChevronDown aria-hidden="true" className={cn("ml-auto size-4 shrink-0 transition-micro", open && "rotate-180")} />
                  </button>
                  <NeighbourLink neighbour={next} direction="next" />
               </nav>
               <div className="lesson-dock-progress" aria-hidden="true">
                  <span style={{ width: `${numbers.size ? (current / numbers.size) * 100 : 0}%` }} />
               </div>
               {open ? (
                  <div id="lesson-dock-list" className="mx-auto max-h-[60vh] max-w-reading overflow-y-auto px-4 pb-3">
                     {list(() => setOpen(false), true)}
                  </div>
               ) : null}
            </div>
         </div>
         <nav ref={opening} aria-labelledby="lesson-contents-title" className="lesson-contents mb-14">
            <h2 id="lesson-contents-title" className="lesson-contents-title">{title}</h2>
            {lead}
            {list()}
            {footer}
         </nav>
      </>
   );
}
