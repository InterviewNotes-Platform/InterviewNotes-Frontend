"use client";

import { useEffect, useState } from "react";

/** Headings rest this far below the viewport top (header and preview marker; `scroll-mt-28` in CatalogBody). */
export const SCROLL_OFFSET = 112;
// A heading is current once its top is within a few pixels of where a contents jump leaves it.
const LINE = SCROLL_OFFSET + 8;

/** The last heading at or above the line, in document order; none before the first heading. Deterministic however many cross at once. */
export function activeHeading(tops: readonly { id: string; top: number }[], line = LINE): string | null {
   return tops.reduce<string | null>((active, { id, top }) => (top <= line ? id : active), null);
}

/**
 * Which heading the reader is in, from the page's own headings: an IntersectionObserver wakes it when one
 * crosses the line, and it then reads each position once; `scrollend` re-reads once after a long jump. No request. `choose` records a
 * jump at once; the observer takes over as the page settles.
 */
export function useActiveHeading(ids: readonly string[], line = LINE) {
   const [active, choose] = useState<string | null>(null);
   const key = ids.join("\n");

   useEffect(() => {
      if (!("IntersectionObserver" in window)) return;
      const targets = key.split("\n").flatMap((id) => document.getElementById(id) ?? []);
      if (targets.length === 0) return;
      // A heading the page does not render (a Knowledge band hidden by depth) has no box and is never current.
      const shown = () => targets.filter((element) => element.checkVisibility?.() ?? true);
      const read = () => choose(activeHeading(shown().map((element) => ({ id: element.id, top: element.getBoundingClientRect().top })), line));
      const observer = new IntersectionObserver(read, { rootMargin: `-${line}px 0px 0px 0px`, threshold: [0, 1] });
      targets.forEach((element) => observer.observe(element));
      // A long jump can carry headings from below the viewport to above it without any crossing being observed; one read at
      // the end of each scroll (not per frame) settles it.
      window.addEventListener("scrollend", read);
      return () => {
         observer.disconnect();
         window.removeEventListener("scrollend", read);
      };
   }, [key, line]);

   return [active, choose] as const;
}
