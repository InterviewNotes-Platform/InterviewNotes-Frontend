"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";

const Running = createContext(true);

/**
 * The hero's ambient motion, from the prototype's `Parallax`: pointer position becomes --mx/--my, and CSS turns that into
 * per-layer depth (fine pointers only). The hero's ambient loops run for good, so a visible control pauses them (WCAG
 * 2.2.2): it freezes the CSS loops (`data-paused`), the packet's SVG animation and the round clock. Reduced motion needs
 * none of it: the CSS is off, the clock stops and the control is hidden.
 */
export function HeroMotion({ className, children }: { className?: string; children: ReactNode }) {
   const ref = useRef<HTMLDivElement>(null);
   const [paused, setPaused] = useState(false);
   const [reduced, setReduced] = useState(false);

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
            onClick={() => setPaused((p) => !p)}
            className="absolute top-3 left-1/2 z-40 -translate-x-1/2 inline-flex h-11 items-center gap-2 rounded-full border border-home-line bg-card/85 px-4 text-sm font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground motion-reduce:hidden"
         >
            {paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
            {paused ? "Play animation" : "Pause animation"}
         </button>
      </div>
   );
}

const ROUND = 45 * 60;
const START = 27 * 60 + 40;

/** Both clocks mount together on hydration, so separate intervals stay in step; they stop while the hero is paused. */
function useCountdown(start: number) {
   const running = useContext(Running);
   const [left, setLeft] = useState(start);
   useEffect(() => {
      if (!running) return;
      const id = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : ROUND)), 1000);
      return () => window.clearInterval(id);
   }, [running]);
   return { left, label: `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}` };
}

export function Countdown({ start = START }: { start?: number }) {
   return <>{useCountdown(start).label}</>;
}

export function RoundTimer({ start = START }: { start?: number }) {
   const { left, label } = useCountdown(start);
   return (
      <>
         <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0 -rotate-90">
            <circle cx="9" cy="9" r="7" fill="none" stroke="var(--background)" strokeOpacity="0.25" strokeWidth="2" />
            <circle
               cx="9"
               cy="9"
               r="7"
               fill="none"
               stroke="var(--home-ring)"
               strokeWidth="2"
               strokeLinecap="round"
               pathLength={1}
               strokeDasharray={`${(1 - left / ROUND).toFixed(4)} 1`}
               style={{ transition: "stroke-dasharray 1s linear" }}
            />
         </svg>
         <span className="font-mono text-[13px]/4 font-medium tracking-[0.02em] text-background tabular-nums">{label}</span>
      </>
   );
}
