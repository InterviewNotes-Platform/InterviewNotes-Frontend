"use client";

import { useEffect, useState } from "react";

/** Headings rest this far below the viewport top (header and preview marker; `scroll-mt-28` in CatalogBody). */
export const SCROLL_OFFSET = 112;
// A heading is current once its top is within a few pixels of where a contents jump leaves it.
const LINE = SCROLL_OFFSET + 8;

/** The last heading at or above the line, in document order; none before the first heading. Deterministic however many cross at once. */
export function activeHeading(tops: readonly { id: string; top: number }[]): string | null {
   return tops.reduce<string | null>((active, { id, top }) => (top <= LINE ? id : active), null);
}

/**
 * Which heading the reader is in, from the page's own headings: an IntersectionObserver wakes it when one
 * crosses the line, and it then reads each position once. No scroll listener, no request. `choose` records a
 * jump at once; the observer takes over as the page settles.
 */
export function useActiveHeading(ids: readonly string[]) {
   const [active, choose] = useState<string | null>(null);
   const key = ids.join("\n");

   useEffect(() => {
      if (!("IntersectionObserver" in window)) return;
      const targets = key.split("\n").flatMap((id) => document.getElementById(id) ?? []);
      if (targets.length === 0) return;
      const read = () => choose(activeHeading(targets.map((element) => ({ id: element.id, top: element.getBoundingClientRect().top }))));
      const observer = new IntersectionObserver(read, { rootMargin: `-${LINE}px 0px 0px 0px`, threshold: [0, 1] });
      targets.forEach((element) => observer.observe(element));
      return () => observer.disconnect();
   }, [key]);

   return [active, choose] as const;
}
