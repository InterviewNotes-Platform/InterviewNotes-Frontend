"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useHeroRunning } from "./HeroMotion";

export const TOPIC_STEP_MS = 2400;

interface RotatingTopicProps {
   topics: readonly string[];
   /** What assistive technology reads in place of the animation. */
   label: string;
}

/**
 * The headline's highlighted subject. It steps through every topic in order and wraps from the last back to the first,
 * for as long as the hero runs; the hero's Pause control (HeroMotion) stops it, and it stays on the first topic for readers
 * who prefer reduced motion. All topics share one grid cell, so the page never shifts. Assistive technology reads `label`.
 */
export function RotatingTopic({ topics, label }: RotatingTopicProps) {
   const [active, setActive] = useState(0);
   const running = useHeroRunning();

   useEffect(() => {
      if (!running || topics.length < 2) return;
      const id = window.setInterval(() => setActive((i) => (i + 1) % topics.length), TOPIC_STEP_MS);
      return () => window.clearInterval(id);
   }, [running, topics.length]);

   return (
      <>
         <span className="sr-only">{label}</span>
         <span
            aria-hidden="true"
            className="inline-grid rounded-2xl border border-(--home-edge) bg-gold px-3 py-0.5 text-center text-[0.85em] whitespace-nowrap text-gold-foreground md:px-4 md:py-1 md:text-[1em]"
         >
            {topics.map((topic, i) => (
               <span
                  key={topic}
                  className={cn(
                     "col-start-1 row-start-1 transition-[opacity,translate,filter] duration-300 ease-standard",
                     i === active ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0 blur-[6px]",
                  )}
               >
                  {topic}
               </span>
            ))}
         </span>
      </>
   );
}
