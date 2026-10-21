import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/*
 * The hero's illustration (spec S6-HOME-5): layered paper hills and a reader window that sketches the real reading
 * layout (modules sidebar, reading column, contents). It is decoration, so the whole stage is aria-hidden. Its only
 * text is generic labels: no chapter or Track names, no access badges, no counts, no clock or timer, which would imply
 * interactive practice. The shapes are skeleton bars, not content. Motion is CSS only (globals.css, `.home-rise`).
 */

const caps = "font-mono text-[11px]/4 tracking-[0.06em] text-muted-foreground uppercase";

/** Skeleton bars standing in for text; widths are decorative. */
function Lines({ widths, className }: { widths: readonly string[]; className?: string }) {
   return (
      <div className={cn("flex flex-col gap-2.5", className)}>
         {widths.map((width, i) => (
            <span key={i} className="block h-2 rounded-full bg-foreground/10" style={{ width }} />
         ))}
      </div>
   );
}

function Hills() {
   return (
      <svg className="absolute inset-x-0 bottom-0 -z-10 h-[88%] w-full" viewBox="0 0 1440 520" preserveAspectRatio="none" aria-hidden="true" focusable="false">
         <path className="home-hill" style={{ "--home-hill-shift": "-28px" } as CSSProperties} fill="var(--home-hill-sky)" d="M0 150 C 120 80, 250 50, 370 100 C 470 140, 560 70, 700 80 C 860 90, 950 20, 1090 40 C 1230 60, 1330 -10, 1440 50 L1440 520 L0 520 Z" />
         <path className="home-hill" style={{ "--home-hill-shift": "-20px" } as CSSProperties} fill="var(--home-hill-sun)" d="M1010 170 C 1090 130, 1170 140, 1250 110 C 1320 85, 1390 110, 1440 90 L1440 520 L960 520 Z" />
         <path className="home-hill" style={{ "--home-hill-shift": "-20px" } as CSSProperties} fill="var(--home-hill-sun)" d="M0 190 C 60 162, 130 184, 210 160 C 270 142, 330 166, 390 152 L390 520 L0 520 Z" />
         <path className="home-hill" style={{ "--home-hill-shift": "-12px" } as CSSProperties} fill="var(--home-hill-mist)" d="M0 250 C 120 200, 220 230, 330 200 C 460 165, 560 240, 720 220 C 880 200, 980 250, 1120 230 C 1260 210, 1360 250, 1440 230 L1440 520 L0 520 Z" />
         <path fill="var(--home-hill-top)" d="M0 340 C 140 310, 260 350, 400 325 C 560 296, 700 360, 880 336 C 1060 312, 1240 350, 1440 320 L1440 520 L0 520 Z" />
      </svg>
   );
}

function Diagram() {
   const boxes = ["Input", "Process", "Output"];
   return (
      <div className="flex items-center justify-between gap-2 rounded-xl bg-muted p-4 sm:gap-4 sm:p-5">
         {boxes.map((label, i) => (
            <div key={label} className="contents">
               <span className={cn("flex h-10 flex-1 items-center justify-center rounded-lg border bg-card text-[13px] text-foreground sm:h-11", i === 1 ? "border-foreground/60" : "border-border")}>{label}</span>
               {i < boxes.length - 1 ? <span className="h-px w-4 shrink-0 bg-foreground/40 sm:w-8" /> : null}
            </div>
         ))}
      </div>
   );
}

function Window() {
   return (
      <div className="flex h-[400px] flex-col overflow-clip rounded-[20px] border border-border bg-card text-left shadow-(--home-window-shadow) lg:h-[560px]">
         <div className="flex h-12 shrink-0 items-center gap-4 border-b border-border px-5">
            <div className="flex shrink-0 gap-1.5">
               <span className="size-2.5 rounded-full bg-foreground/15" />
               <span className="size-2.5 rounded-full bg-foreground/15" />
               <span className="size-2.5 rounded-full bg-foreground/15" />
            </div>
            <div className="flex min-w-0 items-center gap-2 text-[13px]/4 text-muted-foreground">
               <span className="truncate">Track</span>
               <span className="text-muted-foreground">/</span>
               <span className="truncate">Module</span>
               <span className="text-muted-foreground">/</span>
               <span className="truncate font-medium text-foreground">Lesson</span>
            </div>
         </div>

         <div className="flex min-h-0 grow">
            <aside className="hidden w-60 shrink-0 flex-col gap-3 border-r border-border px-5 py-5 lg:flex">
               <span className={caps}>Modules</span>
               <Lines widths={["78%", "64%", "86%", "58%"]} />
               <span className="mt-2 flex items-center gap-2 rounded-lg border-l-2 border-foreground bg-foreground/5 px-3 py-2.5">
                  <span className="block h-2 w-3/5 rounded-full bg-foreground/60" />
               </span>
               <Lines widths={["70%", "82%", "52%"]} />
            </aside>

            <div className="flex min-w-0 grow flex-col gap-5 px-6 pt-7 sm:px-8">
               <span className={caps}>Lesson</span>
               <span className="block h-5 w-3/4 rounded-full bg-foreground/70" />
               <Lines widths={["100%", "94%", "98%", "62%"]} />
               <Diagram />
               <Lines widths={["96%", "88%", "100%"]} />
               <div className="flex items-start gap-3 rounded-[10px] border border-border border-l-[3px] border-l-gold px-4 py-3.5">
                  <span className={cn(caps, "shrink-0")}>Key idea</span>
                  <Lines className="grow" widths={["100%", "70%"]} />
               </div>
            </div>

            <aside className="hidden w-52 shrink-0 flex-col gap-3 border-l border-border p-5 xl:flex">
               <span className={caps}>On this page</span>
               <Lines widths={["80%", "66%"]} />
               <span className="flex items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full bg-gold ring-1 ring-foreground/30" />
                  <span className="block h-2 w-3/5 rounded-full bg-foreground/60" />
               </span>
               <Lines widths={["72%", "58%", "76%"]} />
            </aside>
         </div>
      </div>
   );
}

/** Sits at the bottom of the hero: the hills behind, the window above them, and the page's own colour curving over the window's foot. */
export function HeroStage() {
   return (
      <div data-hero-stage aria-hidden="true" className="pointer-events-none relative mt-12 w-full px-4 sm:px-6 lg:mt-16">
         <Hills />
         <div className="home-rise relative mx-auto w-full max-w-[1120px]">
            <Window />
         </div>
         <svg className="absolute inset-x-0 bottom-0 z-20 h-[72px] w-full" viewBox="0 0 1440 72" preserveAspectRatio="none" focusable="false">
            <path fill="var(--background)" d="M0 38 C 180 14, 330 48, 520 34 C 700 20, 860 52, 1040 36 C 1200 24, 1330 42, 1440 28 L1440 72 L0 72 Z" />
         </svg>
      </div>
   );
}
