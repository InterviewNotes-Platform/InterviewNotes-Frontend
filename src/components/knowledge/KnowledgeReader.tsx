"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { LessonOutline, type OutlineEntry } from "@/components/lesson/LessonOutline";
import { EXHIBIT_REVEAL } from "@/components/lesson/pins";
import { cn } from "@/lib/utils";

export type Depth = 1 | 2 | 3;
const DEPTHS: readonly Depth[] = [1, 2, 3];
const FULL: Depth = 3;

/** One of the three canonical reading bands, as the outline shows it: only released sections that have a heading. */
export interface DepthBand {
   id: string;
   label: string;
   rank: Depth;
   sections: { id: string; text: string }[];
}

/** The outline at a depth: each band up to it, then its sections; an empty band is listed, not linked, as "Nothing yet". */
export function outlineAt(bands: readonly DepthBand[], depth: Depth): OutlineEntry[] {
   return bands
      .filter(({ rank }) => rank <= depth)
      .flatMap((band) => [
         { id: band.id, level: 2 as const, text: band.label, ...(band.sections.length ? {} : { note: "Nothing yet" }) },
         ...band.sections.map(({ id, text }) => ({ id, level: 3 as const, text })),
      ]);
}

export function depthNote(bands: readonly DepthBand[], depth: Depth): string {
   if (depth === FULL) return "Showing every section.";
   const shown = bands.filter(({ rank }) => rank <= depth).map(({ label }) => label.toLowerCase());
   return `Showing ${shown.join(" and ")} only.`;
}

/** The rank of the band an element sits in; 0 outside every band. */
function rankOf(element: Element | null): number {
   const band = element?.closest<HTMLElement>("[data-knowledge-band]");
   return band ? Number(band.dataset.knowledgeBand) : 0;
}

/** The first shown block below the bars, and where it is, so a depth change can keep the reader's place. */
function readingPlace(root: HTMLElement | null): { element: Element; top: number } | null {
   for (const element of root?.querySelectorAll(":is(h2, h3, p, li, [data-exhibit])") ?? []) {
      if (element.getClientRects().length === 0) continue;
      const top = element.getBoundingClientRect().top;
      if (top >= 180) return { element, top };
   }
   return null;
}

/** Read at depth as a radio group (arrows move and select, like Study/Read and Read's sizes); the number is part of the name. */
function DepthControl({ bands, depth, onChange, label, compact = false }: {
   bands: readonly DepthBand[];
   depth: Depth;
   onChange: (depth: Depth) => void;
   label: string;
   compact?: boolean;
}) {
   function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = DEPTHS[(DEPTHS.indexOf(depth) + step + DEPTHS.length) % DEPTHS.length];
      const group = event.currentTarget;
      onChange(next);
      window.requestAnimationFrame(() => group.querySelector<HTMLElement>(`[data-depth-option="${next}"]`)?.focus({ preventScroll: true }));
   }
   return (
      <div role="radiogroup" aria-label={label} className={cn("knowledge-depth", compact && "is-compact")} onKeyDown={onKeyDown}>
         {bands.map(({ rank, label: band }) => (
            <button
               key={rank}
               type="button"
               role="radio"
               aria-checked={depth === rank}
               tabIndex={depth === rank ? 0 : -1}
               data-depth-option={rank}
               title={band}
               onClick={() => onChange(rank)}
            >
               <span className="knowledge-depth-n">{rank}</span>
               <span className={compact ? "sr-only" : "knowledge-depth-t"}> {band}</span>
            </button>
         ))}
      </div>
   );
}

/**
 * Knowledge read at depth (P8-T28, §4.4): the opening "In this entry" contents and the docked section bar (T27's outline), both
 * with the depth control, over the server-rendered bands. Depth 1–3 shows the canonical bands up to it, in the contents, the bar
 * and the body alike; it lives in memory for this page only. A fragment or a pinned slip that reaches a hidden section shows every
 * band first, so no link lands on nothing.
 */
export function KnowledgeReader({ bands, children }: { bands: DepthBand[]; children: ReactNode }) {
   const [depth, setDepth] = useState<Depth>(FULL);
   const root = useRef<HTMLDivElement>(null);
   const place = useRef<ReturnType<typeof readingPlace>>(null);

   function change(next: Depth) {
      if (next === depth) return;
      place.current = readingPlace(root.current);
      setDepth(next);
   }

   // Keep the block the reader was at; if it is now hidden, return to the contents.
   useLayoutEffect(() => {
      const at = place.current;
      place.current = null;
      if (!at) return;
      if (at.element.getClientRects().length > 0) window.scrollBy({ top: at.element.getBoundingClientRect().top - at.top, behavior: "instant" });
      else document.getElementById("lesson-contents-title")?.scrollIntoView({ block: "start", behavior: "instant" });
   }, [depth]);

   useEffect(() => {
      const element = root.current;
      if (!element) return;
      const reveal = (target: Element | null) => {
         if (!target || rankOf(target) <= depth) return false;
         flushSync(() => setDepth(FULL));
         return true;
      };
      // Deep links, Back and Forward: the browser could not scroll to a hidden target, so it is shown, then reached.
      const onHash = () => {
         const id = decodeURIComponent(window.location.hash.slice(1));
         const target = id ? document.getElementById(id) : null;
         if (!reveal(target)) return;
         target?.scrollIntoView({ block: "start" });
         target?.focus({ preventScroll: true });
      };
      const onReveal = (event: Event) => reveal(event.target as Element);
      window.addEventListener("hashchange", onHash);
      element.addEventListener(EXHIBIT_REVEAL, onReveal);
      return () => {
         window.removeEventListener("hashchange", onHash);
         element.removeEventListener(EXHIBIT_REVEAL, onReveal);
      };
   }, [depth]);

   return (
      <>
         <LessonOutline
            entries={outlineAt(bands, depth)}
            previous={null}
            next={null}
            title="In this entry"
            label="Knowledge sections"
            lead={
               <div className="knowledge-depth-lead">
                  <p className="lesson-kicker">Read at depth</p>
                  <DepthControl bands={bands} depth={depth} onChange={change} label="Read at depth" />
               </div>
            }
            barLead={<DepthControl bands={bands} depth={depth} onChange={change} label="Depth" compact />}
            footer={
               <p className="knowledge-depth-note" aria-live="polite">
                  {depthNote(bands, depth)}
               </p>
            }
         />
         <div ref={root} data-knowledge-depth={depth}>
            {children}
         </div>
      </>
   );
}
