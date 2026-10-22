"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";

const Running = createContext(true);

/** False while the hero is paused or the reader prefers reduced motion: the headline rotation waits on the same control as the ambient loops. */
export function useHeroRunning() {
   return useContext(Running);
}

/**
 * The hero's ambient motion, from the prototype's `Parallax`: pointer position becomes --mx/--my, and CSS turns that into
 * per-layer depth (fine pointers only). The hero's ambient loops and the rotating headline run for good, so one visible
 * control pauses them together (WCAG 2.2.2): it freezes the CSS loops (`data-paused`), the packet's SVG animation and, through
 * `useHeroRunning`, the headline. Reduced motion needs none of it: the CSS is off, the headline stays still, the control is hidden.
 */
export function HeroMotion({ className, children }: { className?: string; children: ReactNode }) {
   const ref = useRef<HTMLDivElement>(null);
   const [paused, setPaused] = useState(false);
   const [reduced, setReduced] = useState(false);
   const hintId = useId();

   useEffect(() => {
      const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)"); // optional call: jsdom has no matchMedia
      if (!mq) return;
      const sync = () => setReduced(mq.matches);
      sync();
      mq.addEventListener?.("change", sync);
      return () => mq.removeEventListener?.("change", sync);
   }, []);

   useEffect(() => {
      const svgs = ref.current?.querySelectorAll("svg") ?? [];
      svgs.forEach((svg) => (paused ? svg.pauseAnimations?.() : svg.unpauseAnimations?.()));
   }, [paused]);

   useEffect(() => {
      const el = ref.current;
      if (!el || !window.matchMedia?.("(pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;
      let raf = 0;
      let x = 0;
      let y = 0;
      const flush = () => {
         raf = 0;
         el.style.setProperty("--mx", x.toFixed(3));
         el.style.setProperty("--my", y.toFixed(3));
      };
      const queue = () => {
         if (!raf) raf = requestAnimationFrame(flush);
      };
      const onMove = (e: PointerEvent) => {
         x = (e.clientX / window.innerWidth) * 2 - 1;
         y = (e.clientY / window.innerHeight) * 2 - 1;
         queue();
      };
      const onLeave = () => {
         x = 0;
         y = 0;
         queue();
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
      return () => {
         el.removeEventListener("pointermove", onMove);
         el.removeEventListener("pointerleave", onLeave);
         cancelAnimationFrame(raf);
      };
   }, []);

   return (
      <div ref={ref} data-paused={paused} className={className}>
         <Running.Provider value={!paused && !reduced}>{children}</Running.Provider>
         <button
            type="button"
            aria-describedby={hintId}
            onClick={() => setPaused((p) => !p)}
            className="absolute top-3 left-1/2 z-40 -translate-x-1/2 inline-flex h-11 items-center gap-2 rounded-full border border-home-line bg-card/85 px-4 text-sm font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground motion-reduce:hidden"
         >
            {paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
            {paused ? "Play animation" : "Pause animation"}
         </button>
         <span id={hintId} className="sr-only">
            {paused ? "Resumes the rotating headline and the hero's motion." : "Stops the rotating headline and the hero's motion."}
         </span>
      </div>
   );
}
