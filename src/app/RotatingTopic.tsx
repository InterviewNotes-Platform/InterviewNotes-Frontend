"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STEP_MS = 1200;

interface RotatingTopicProps {
   topics: readonly string[];
   /** What assistive technology reads in place of the animation. */
   label: string;
}

/**
 * The headline's highlighted subject. It steps through every topic once and comes back to the first, in under
 * five seconds, so it never becomes moving content the reader must be able to pause (WCAG 2.2.2). It stays
 * still for readers who prefer reduced motion. All topics share one grid cell, so the page never shifts.
 */
export function RotatingTopic({ topics, label }: RotatingTopicProps) {
   const [active, setActive] = useState(0);

   useEffect(() => {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return; // optional call: jsdom has no matchMedia
      const timers = topics.map((_, i) => window.setTimeout(() => setActive((i + 1) % topics.length), STEP_MS * (i + 1)));
      return () => timers.forEach(window.clearTimeout);
   }, [topics]);

   return (
      <>
         <span className="sr-only">{label}</span>
         <span
            aria-hidden="true"
            className="inline-grid rounded-xl bg-primary/[0.08] px-3 py-0.5 text-center text-[0.85em] whitespace-nowrap text-primary md:px-4 md:py-1 md:text-[1em]"
         >
            {topics.map((topic, i) => (
               <span
                  key={topic}
                  className={cn(
                     "col-start-1 row-start-1 transition-[opacity,translate] duration-300 ease-standard",
                     i === active ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                  )}
               >
                  {topic}
               </span>
            ))}
         </span>
      </>
   );
}
