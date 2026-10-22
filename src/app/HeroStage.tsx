import type { CSSProperties, ReactNode } from "react";
import { Countdown, RoundTimer } from "./HeroMotion";

/*
 * The hero's stage, ported from the prototype (homepage/src/app/page.tsx): paper hills, a reader window that rises in and
 * draws its request-path diagram, and floating cards that follow the pointer. It is decoration (illustrative sample
 * content, not catalog data), so every part is aria-hidden and holds no link or control. Motion is CSS in globals.css
 * (`.home-*`) plus the pointer parallax and clock in HeroMotion. Spec S6-HOME-5.
 */

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const v = (vars: Record<string, string | number>) => vars as CSSProperties;

const INK = "var(--foreground)";

const CHAPTERS: { title: string; time: string; tag?: "FREE" | "PRO"; active?: boolean }[] = [
   { title: "Intro to AI Native Design", time: "15m", tag: "FREE" },
   { title: "LLM Router", time: "20m", tag: "PRO" },
   { title: "Vector DB", time: "25m" },
   { title: "Semantic Search", time: "20m" },
   { title: "RAG", time: "25m", active: true },
   { title: "Agent Design Patterns", time: "30m", tag: "PRO" },
   { title: "Agent Memory: short-term", time: "20m", tag: "PRO" },
   { title: "Agent Memory: long-term", time: "25m", tag: "PRO" },
   { title: "Context Engineering", time: "20m", tag: "PRO" },
];

const mono = "font-mono text-[11px]/3.5 text-muted-foreground";
const caps = `${mono} tracking-[0.06em] uppercase`;

function Pop({
   at,
   r,
   depth,
   delay,
   float = 7,
   slap = false,
   className = "",
   children,
}: {
   at: string;
   r: number;
   depth: number;
   delay: number;
   float?: number;
   slap?: boolean;
   className?: string;
   children: ReactNode;
}) {
   return (
      <div className={`home-pop absolute ${at}`} style={v({ "--depth": depth })}>
         <div className={`home-pop-in ${slap ? "home-slap" : ""}`} style={v({ "--d": `${delay}ms`, "--fdur": `${float}s` })}>
            <div className={`home-pop-card pointer-events-auto ${className}`} style={v({ "--r": `${r}deg` })}>
               {children}
            </div>
         </div>
      </div>
   );
}

function Diagram() {
   const nodes = [
      { x: 0, y: 24, label: "Docs · 50M" },
      { x: 160, y: 24, label: "Chunk + embed" },
      { x: 320, y: 24, label: "Vector index", hot: true },
      { x: 480, y: 24, label: "Answer + cites", dashed: true },
      { x: 0, y: 124, label: "User query" },
      { x: 160, y: 124, label: "ACL filter" },
      { x: 320, y: 124, label: "Retrieve + rerank", hot: true },
      { x: 480, y: 124, label: "LLM" },
   ];
   const arrows = [
      "M114 44.5H156M150 40.5l6 4-6 4",
      "M274 44.5H316M310 40.5l6 4-6 4",
      "M114 144.5H156M150 140.5l6 4-6 4",
      "M274 144.5H316M310 140.5l6 4-6 4",
      "M434 144.5H476M470 140.5l6 4-6 4",
      "M535.5 120V70M531.5 76l4-6 4 6",
   ];
   const label = { className: "font-mono", fontSize: 10, letterSpacing: 1, fill: "var(--muted-foreground)" };
   return (
      <svg viewBox="-1 0 602 176" className="block h-auto w-full font-sans" aria-hidden="true" focusable="false">
         <text x="0" y="12" {...label}>INGEST</text>
         <text x="0" y="112" {...label}>QUERY</text>

         <g fill="none" stroke="var(--muted-foreground)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            {arrows.map((a, i) => (
               <path key={a} className="home-draw" style={d(1500 + i * 120)} pathLength={1} d={a} />
            ))}
         </g>
         <path className="home-march" style={d(2200)} d="M375.5 120V70" fill="none" stroke="var(--home-sky)" strokeWidth="1.2" strokeDasharray="3 3" />
         <path className="home-fade" style={d(2200)} d="M371.5 76l4-6 4 6" fill="none" stroke="var(--home-sky)" strokeWidth="1.2" strokeLinecap="round" />
         <text {...label} className="home-fade font-mono" style={d(2200)} x="384" y="99" letterSpacing={0}>top-k</text>

         {/* packet travels under the boxes, so it shows in the gaps; reduced motion hides it */}
         <circle className="motion-reduce:hidden" r="4" fill="var(--gold)" stroke={INK} strokeWidth="1.2" opacity="0">
            <animateMotion path="M55 144.5 H535 V44.5" dur="4.4s" begin="2.6s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.7;1" calcMode="linear" />
            <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.66;0.7;1" dur="4.4s" begin="2.6s" repeatCount="indefinite" />
         </circle>

         {nodes.map((n, i) => (
            <g key={n.label} className="home-node home-fade-up" style={v({ "--d": `${1250 + i * 60}ms`, "--fy": "8px" })}>
               <rect
                  x={n.x + 0.5}
                  y={n.y + 0.5}
                  width="110"
                  height="40"
                  rx="8"
                  fill="var(--card)"
                  stroke={n.hot ? INK : "var(--home-rule)"}
                  strokeWidth={n.hot ? 1.2 : 1}
                  strokeDasharray={n.dashed ? "3 3" : undefined}
               />
               <text x={n.x + 55} y={n.y + 25} textAnchor="middle" fontSize="12" fill={INK}>
                  {n.label}
               </text>
            </g>
         ))}
      </svg>
   );
}

function Check({ on, delay }: { on: boolean; delay: number }) {
   return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="shrink-0">
         {on ? (
            <>
               <rect x="0.5" y="0.5" width="15" height="15" rx="4" fill={INK} />
               <path className="home-draw" style={d(delay)} pathLength={1} d="M4.5 8.2l2.3 2.3 4.7-5" fill="none" stroke="var(--background)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </>
         ) : (
            <rect x="0.5" y="0.5" width="15" height="15" rx="4" fill="var(--card)" stroke="var(--home-rule)" />
         )}
      </svg>
   );
}

function AppWindow() {
   return (
      <div className="flex flex-col overflow-clip rounded-[20px] border border-home-line bg-card text-left shadow-(--home-window-shadow) lg:h-[640px]">
         <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-home-line px-5">
            <div className="flex min-w-0 items-center gap-4 text-[13px]/4">
               <div className="flex shrink-0 gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#E3C9C2] dark:opacity-60" />
                  <span className="size-2.5 rounded-full bg-[#EBDDB0] dark:opacity-60" />
                  <span className="size-2.5 rounded-full bg-[#C9D6C6] dark:opacity-60" />
               </div>
               <span className="hidden truncate text-muted-foreground sm:inline">Gen AI Native Design</span>
               <span className="hidden text-home-rule sm:inline">/</span>
               <span className="font-medium">RAG</span>
               <span className="text-home-rule">/</span>
               <span className="truncate text-muted-foreground">Mock round</span>
            </div>
            <div className="hidden shrink-0 items-center gap-1 rounded-lg bg-background p-0.75 text-xs/4 sm:flex">
               <span className="rounded-md px-3 py-1.25 text-muted-foreground">Read</span>
               <span className="rounded-md bg-card px-3 py-1.25 font-medium shadow-[0_0_0_1px_var(--home-rule),0_1px_2px_rgb(var(--home-sh)/0.06)] dark:bg-home-raised">Mock round</span>
               <span className="rounded-md px-3 py-1.25 text-muted-foreground">Notes</span>
            </div>
         </div>

         <div className="flex min-h-0 grow">
            <aside className="hidden w-64 shrink-0 flex-col gap-0.5 border-r border-home-line px-3 py-5 lg:flex">
               <div className="flex items-center justify-between px-3 pb-3">
                  <span className={caps}>Chapters</span>
                  <span className={mono}>18 · ~8h</span>
               </div>
               {CHAPTERS.map((c, i) => (
                  <div
                     key={c.title}
                     className={`home-row home-fade-up flex items-center gap-2.5 rounded-lg py-2.25 text-[13px]/4 ${
                        c.active ? "border-l-2 border-foreground bg-foreground/5 pr-3 pl-2.5 font-medium" : "px-3 text-muted-foreground"
                     }`}
                     style={v({ "--d": `${900 + i * 50}ms`, "--fy": "6px" })}
                  >
                     <span className="grow truncate">{c.title}</span>
                     {c.tag === "FREE" ? (
                        <span className="shrink-0 rounded-sm bg-gold px-1.25 py-px font-mono text-[10px]/3 text-gold-foreground">FREE</span>
                     ) : c.tag === "PRO" ? (
                        <span className="shrink-0 rounded-sm border border-home-line px-1.25 py-px font-mono text-[10px]/3 text-muted-foreground">PRO</span>
                     ) : (
                        <span className={`shrink-0 font-mono text-[11px]/3.5 ${c.active ? "text-foreground" : "text-muted-foreground"}`}>{c.time}</span>
                     )}
                  </div>
               ))}
               <div className="home-fade mt-1 flex flex-col gap-1.5 border-t border-home-line px-3 pt-3.5" style={d(1400)}>
                  <span className={caps}>Case studies · PRO</span>
                  <span className="text-xs/4.5 text-muted-foreground">AI Search, Notion Smart Compose, Whispr Flow, Billion-Scale Semantic Search +3</span>
               </div>
            </aside>

            <div className="flex min-w-0 grow flex-col gap-5.5 px-6 pt-7 pb-10 sm:px-8">
               <div className="home-fade-up flex items-center justify-between gap-4" style={d(1000)}>
                  <span className="flex items-center gap-2">
                     <span className="size-5.5 shrink-0 rounded-full border border-home-rule bg-background" />
                     <span className={caps}>Interviewer prompt</span>
                  </span>
                  <span className={`${mono} hidden sm:inline`}>Phase 3 of 4 · Deep dive</span>
               </div>
               <p className="home-fade-up m-0 text-[22px]/7.5 font-light tracking-[-0.01em] sm:text-[26px]/8.5" style={d(1060)}>
                  &ldquo;Design a RAG system for 50M internal docs.&rdquo;
               </p>
               <div className="flex flex-wrap gap-2">
                  {["50M docs", "permission-aware", "daily freshness", "cited answers"].map((t, i) => (
                     <span key={t} className="home-fade-up rounded-md bg-background px-2.5 py-1.25 font-mono text-[11px]/3.5 text-muted-foreground" style={v({ "--d": `${1120 + i * 50}ms`, "--fy": "6px" })}>
                        {t}
                     </span>
                  ))}
               </div>
               <div className="home-fade-up shrink-0 rounded-xl bg-background p-5" style={d(1200)}>
                  <Diagram />
               </div>
               <div className="home-fade-up flex items-start gap-3 rounded-[10px] border border-home-line px-4 py-3.5" style={d(2600)}>
                  <span className={`${caps} shrink-0 pt-0.5`}>You say</span>
                  <p className="m-0 text-[13px]/5 text-muted-foreground">&ldquo;I&rsquo;d apply the ACL filter before retrieval, not after, so top-k never holds a doc the user can&rsquo;t see.&rdquo;</p>
               </div>
            </div>

            <aside className="hidden w-60 shrink-0 flex-col gap-5 border-l border-home-line p-5 xl:flex">
               <div className="home-fade-up flex flex-col gap-3" style={d(1100)}>
                  <span className={caps}>Round clock</span>
                  <span className="flex items-baseline gap-2">
                     <span className="text-[48px]/14 font-light tracking-[-0.02em] tabular-nums">
                        <Countdown />
                     </span>
                     <span className="font-mono text-xs/4 text-muted-foreground">left</span>
                  </span>
                  <div className="flex gap-0.75">
                     <span className="home-grow-x h-1 grow-5 basis-0 rounded-xs bg-foreground" style={d(1300)} />
                     <span className="home-grow-x h-1 grow-10 basis-0 rounded-xs bg-foreground" style={d(1400)} />
                     <span className="home-grow-x home-sheen h-1 grow-20 basis-0 rounded-xs bg-gold" style={d(1500)} />
                     <span className="h-1 grow-10 basis-0 rounded-xs bg-home-line" />
                  </div>
               </div>
               <div className="flex flex-col gap-0.5">
                  <span className={`${caps} pb-2`}>Phases</span>
                  {[
                     ["01", "Clarify", "5m"],
                     ["02", "Sketch", "10m"],
                     ["03", "Deep dive", "20m"],
                     ["04", "Follow-ups", "10m"],
                  ].map(([n, t, m], i) => {
                     const on = n === "03";
                     return (
                        <div
                           key={n}
                           className={`home-fade-up flex items-center gap-2.5 rounded-lg px-2.5 py-1.75 text-[13px]/4 ${on ? "bg-gold/25 font-medium shadow-[inset_0_0_0_1px_var(--gold)]" : "text-muted-foreground"}`}
                           style={v({ "--d": `${1200 + i * 60}ms`, "--fy": "6px" })}
                        >
                           <span className={`w-4.5 shrink-0 font-mono text-[11px]/3.5 ${on ? "text-foreground" : "text-muted-foreground"}`}>{n}</span>
                           <span className="grow">{t}</span>
                           <span className={`font-mono text-[11px]/3.5 ${on ? "text-foreground" : "text-muted-foreground"}`}>{m}</span>
                        </div>
                     );
                  })}
               </div>
               <div className="flex flex-col gap-2.25 border-t border-home-line pt-4">
                  <div className="flex justify-between">
                     <span className={caps}>Covered</span>
                     <span className={mono}>3 / 6</span>
                  </div>
                  {["Scope + latency budget", "Chunking strategy", "Embedding + index choice", "Hybrid retrieval + rerank", "Eval: recall@k, faithfulness", "Cost + caching"].map((t, i) => (
                     <div key={t} className="home-fade-up flex items-center gap-2.5 text-[13px]/4" style={v({ "--d": `${1500 + i * 70}ms`, "--fy": "6px" })}>
                        <Check on={i < 3} delay={1900 + i * 180} />
                        <span className={i < 3 ? "" : "text-muted-foreground"}>{t}</span>
                     </div>
                  ))}
               </div>
            </aside>
         </div>
      </div>
   );
}

/** The hills, the rising reader window and the cards pinned to it, with the page's own colour curving over the window's foot. */
function Stage() {
   return (
      <div data-hero-stage aria-hidden="true" className="pointer-events-none relative px-4 pb-24 lg:h-[640px] lg:pb-0">
         <svg className="absolute top-[60px] left-0 h-[580px] w-full" viewBox="0 0 1440 580" preserveAspectRatio="none" focusable="false">
            <path className="home-layer" style={v({ "--d": "300ms", "--ly": "120px" })} d="M0 210 C 120 140, 250 110, 370 160 C 470 200, 560 130, 700 140 C 860 150, 950 80, 1090 100 C 1230 120, 1330 50, 1440 110 L1440 580 L0 580 Z" fill="var(--home-hill-sky)" />
            <path className="home-layer" style={v({ "--d": "380ms", "--ly": "150px" })} d="M1010 230 C 1090 190, 1170 200, 1250 170 C 1320 145, 1390 170, 1440 150 L1440 580 L960 580 Z" fill="var(--home-hill-sun)" />
            <path className="home-layer" style={v({ "--d": "420ms", "--ly": "150px" })} d="M0 250 C 60 222, 130 244, 210 220 C 270 202, 330 226, 390 212 L390 580 L0 580 Z" fill="var(--home-hill-sun)" />
            <path className="home-layer" style={v({ "--d": "460ms", "--ly": "110px" })} d="M0 310 C 120 260, 220 290, 330 260 C 460 225, 560 300, 720 280 C 880 260, 980 310, 1120 290 C 1260 270, 1360 310, 1440 290 L1440 580 L0 580 Z" fill="var(--home-hill-mist)" />
            <path className="home-layer" style={v({ "--d": "520ms", "--ly": "70px" })} d="M0 400 C 140 370, 260 410, 400 385 C 560 356, 700 420, 880 396 C 1060 372, 1240 410, 1440 380 L1440 580 L0 580 Z" fill="var(--home-hill-top)" />
         </svg>

         <div className="home-pop relative z-10 mx-auto w-full max-w-[1120px]" style={v({ "--depth": 3 })}>
            <div className="home-rise" style={d(450)}>
               <AppWindow />
            </div>
         </div>

         <svg className="absolute bottom-0 left-0 z-20 h-[120px] w-full" viewBox="0 0 1440 120" preserveAspectRatio="none" focusable="false">
            <path d="M0 58 C 180 30, 330 70, 520 52 C 700 34, 860 76, 1040 56 C 1200 40, 1330 64, 1440 46 L1440 120 L0 120 Z" fill="var(--background)" />
         </svg>
         <div className="absolute inset-x-4 top-0 z-30 mx-auto hidden h-full max-w-[1120px] lg:block">
            <Pop at="top-[520px] right-[-24px] min-[1360px]:right-[-120px]" r={3} depth={14} delay={1900} float={8} slap>
               <div className="relative flex w-55 flex-col gap-2.5 rounded-md bg-gold px-5 pt-7 pb-5.5 text-gold-foreground shadow-[0_14px_30px_rgb(var(--home-sh)/0.14),0_1px_2px_rgb(var(--home-sh)/0.08)]">
                  <span className="absolute -top-2.5 left-21 h-5 w-13 -rotate-4 rounded-xs bg-white/60" />
                  <span className="font-mono text-[10px]/3 font-medium tracking-[0.08em] uppercase opacity-70">Interviewer will ask</span>
                  <span className="text-[15px]/5.25 font-medium">How do you evaluate retrieval quality?</span>
               </div>
            </Pop>
            <div className="hidden min-[1360px]:block">
               <Pop at="top-[508px] left-[-124px]" r={-3} depth={18} delay={2200} float={9}>
                  <div className="home-card-shadow flex w-55 flex-col gap-2 rounded-[14px] border border-home-line bg-home-raised px-4 py-3.5">
                     <div className="flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" focusable="false">
                           <path d="M3 1.5h8v11L7 10l-4 2.5v-11z" fill="var(--gold)" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
                        </svg>
                        <span className="text-xs/4 font-semibold">Saved to notes</span>
                     </div>
                     <p className="m-0 font-mono text-[11px]/4.25 text-muted-foreground">
                        chunk size ↔ recall
                        <br />
                        rerank top-50 → top-5
                     </p>
                  </div>
               </Pop>
            </div>
         </div>
      </div>
   );
}

/** The cards around the headline: wide screens only, anchored to a centred 1440 frame that starts at the page's top edge (the header sits above the hero). */
function Headline() {
   return (
      <div aria-hidden="true" className="pointer-events-none absolute -top-[65px] bottom-0 left-1/2 hidden w-[1440px] -translate-x-1/2 min-[1360px]:block">
         <Pop at="top-[176px] left-[96px]" r={-5} depth={22} delay={1150} float={7}>
            <div className="home-card-shadow flex items-center gap-3 rounded-[14px] border border-home-line bg-home-raised py-3 pr-4.5 pl-3">
               <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-gold text-gold-foreground">
                  <svg width="18" height="18" viewBox="0 0 18 18" focusable="false">
                     <path className="home-draw" style={d(1650)} pathLength={1} d="M4 9.5L7.5 13L14 5.5" fill="none" stroke="var(--gold-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
               </span>
               <span className="flex flex-col gap-0.75">
                  <span className="text-sm/4.5 font-semibold">Chapter complete</span>
                  <span className="font-mono text-[11px]/3.5 tracking-[0.02em] text-muted-foreground">Vector DB · 25m</span>
               </span>
            </div>
         </Pop>

         <Pop at="top-[118px] left-[1192px]" r={4} depth={26} delay={1300} float={8}>
            <div className="home-card-shadow flex w-54 flex-col gap-2.5 rounded-[14px] border border-home-line bg-home-raised px-4.5 py-4">
               <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px]/3 font-medium tracking-widest text-muted-foreground uppercase">Next up · 06</span>
                  <span className="rounded-[5px] border border-home-rule px-1.5 py-0.75 font-mono text-[10px]/3">PRO</span>
               </div>
               <span className="text-[15px]/5 font-semibold">Agent Design Patterns</span>
               <div className="flex items-center gap-2">
                  <span className="home-sheen h-1 w-full rounded-xs bg-muted" />
                  <span className="shrink-0 font-mono text-[11px]/3.5 text-muted-foreground">30m</span>
               </div>
            </div>
         </Pop>

         <Pop at="top-[452px] left-[132px]" r={-3} depth={16} delay={1450} float={6.5}>
            <div className="flex items-center gap-2.5 rounded-full bg-foreground py-2.5 pr-4 pl-3 shadow-[0_14px_30px_rgb(var(--home-sh)/0.22)]">
               <RoundTimer />
               <span className="h-3.5 w-px shrink-0 bg-background/20" />
               <span className="text-[13px]/4 text-background/70">Deep dive</span>
            </div>
         </Pop>

         <Pop at="top-[430px] left-[1098px]" r={-2} depth={12} delay={1600} float={7.5}>
            <div className="home-card-shadow flex flex-col gap-2.5 rounded-[14px] border border-home-line bg-home-raised/90 px-4 py-3.5">
               <div className="flex w-55 gap-1">
                  <span className="h-1.5 w-6 shrink-0 rounded-[3px] bg-foreground" />
                  <span className="h-1.5 w-12.25 shrink-0 rounded-[3px] bg-foreground" />
                  <span className="home-sheen h-1.5 w-18.25 shrink-0 rounded-[3px] bg-gold" />
                  <span className="h-1.5 w-12.25 shrink-0 rounded-[3px] bg-home-line" />
                  <span className="h-1.5 w-3.25 shrink-0 rounded-[3px] bg-home-line" />
               </div>
               <div className="flex items-center gap-2 text-xs/4">
                  <span className="text-muted-foreground">Clarify ✓</span>
                  <span className="text-muted-foreground">Sketch ✓</span>
                  <span className="font-semibold">Deep dive</span>
               </div>
            </div>
         </Pop>
      </div>
   );
}

/** Both parts sit inside HeroMotion's relative frame: the cards around the headline, then the stage below the copy. */
export function HeroStage() {
   return (
      <>
         <Headline />
         <Stage />
      </>
   );
}
