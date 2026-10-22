import type { CSSProperties, ReactNode } from "react";
import type { HomeProblem, HomeTracks } from "@/lib/catalog/home";
import { KNOWLEDGE, STAGE, TRACKS } from "./home-copy";

/*
 * The hero's stage, ported from the prototype (homepage/src/app/page.tsx): paper hills, a reader window that rises in and
 * draws its diagram, and floating cards that follow the pointer. Its words are the product's own (P6-D-40): the Track and
 * Problem shown are the first the catalog returned, the Knowledge words are the explorer's own groups, and nothing counts,
 * times, grades or prices anything. It is decoration, so every part is aria-hidden and holds no link or control, and the
 * cards never take the pointer. Motion is CSS in globals.css (`.home-*`) plus the pointer parallax in HeroMotion. Spec S6-HOME-5.
 */

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const v = (vars: Record<string, string | number>) => vars as CSSProperties;

const INK = "var(--foreground)";

interface StageData {
   /** The Tracks as listed, or none when the list is empty or unavailable. */
   tracks: { title: string; summary: string }[];
   problem: HomeProblem;
}

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
            <div className={`home-pop-card ${className}`} style={v({ "--r": `${r}deg` })}>
               {children}
            </div>
         </div>
      </div>
   );
}

function Diagram() {
   const { follow, nodes: top, lookup, lookupNodes, link } = STAGE.diagram;
   const nodes = [
      ...top.map((label, i) => ({ x: i * 160, y: 24, label, hot: i === 2, dashed: i === 3 })),
      ...lookupNodes.map((label, i) => ({ x: i * 160, y: 124, label, hot: i === 2, dashed: false })),
   ];
   const arrows = ["M114 44.5H156M150 40.5l6 4-6 4", "M274 44.5H316M310 40.5l6 4-6 4", "M434 44.5H476M470 40.5l6 4-6 4"];
   const label = { className: "font-mono", fontSize: 10, letterSpacing: 1, fill: "var(--muted-foreground)" };
   return (
      <svg viewBox="-1 0 602 176" className="block h-auto w-full font-sans" aria-hidden="true" focusable="false">
         <text x="0" y="12" {...label}>{follow}</text>
         <text x="0" y="112" {...label}>{lookup}</text>

         <g fill="none" stroke="var(--muted-foreground)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            {arrows.map((a, i) => (
               <path key={a} className="home-draw" style={d(1500 + i * 120)} pathLength={1} d={a} />
            ))}
         </g>
         <path className="home-march" style={d(2200)} d="M375.5 120V70" fill="none" stroke="var(--home-sky)" strokeWidth="1.2" strokeDasharray="3 3" />
         <path className="home-fade" style={d(2200)} d="M371.5 76l4-6 4 6" fill="none" stroke="var(--home-sky)" strokeWidth="1.2" strokeLinecap="round" />
         <text {...label} className="home-fade font-mono" style={d(2200)} x="384" y="99" letterSpacing={0}>{link}</text>

         {/* the packet runs along the Track row, under the boxes so it shows in the gaps; reduced motion hides it */}
         <circle className="motion-reduce:hidden" r="4" fill="var(--gold)" stroke={INK} strokeWidth="1.2" opacity="0">
            <animateMotion path="M55 44.5 H535" dur="4.4s" begin="2.6s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.7;1" calcMode="linear" />
            <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.66;0.7;1" dur="4.4s" begin="2.6s" repeatCount="indefinite" />
         </circle>

         {nodes.map((n, i) => (
            <g key={`${n.y}-${n.label}`} className="home-node home-fade-up" style={v({ "--d": `${1250 + i * 60}ms`, "--fy": "8px" })}>
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

const clamp = (lines: 2 | 3) => (lines === 2 ? "line-clamp-2" : "line-clamp-3");

/** A Track, Knowledge or Problem row of the window's side panels. */
function Row({ children, active = false, delay }: { children: ReactNode; active?: boolean; delay: number }) {
   return (
      <div
         className={`home-row home-fade-up flex items-center gap-2.5 rounded-lg py-2.25 text-[13px]/4 ${
            active ? "border-l-2 border-foreground bg-foreground/5 pr-3 pl-2.5 font-medium" : "px-3 text-muted-foreground"
         }`}
         style={v({ "--d": `${delay}ms`, "--fy": "6px" })}
      >
         {children}
      </div>
   );
}

function AppWindow({ tracks, problem }: StageData) {
   const lead = tracks[0] ?? STAGE.trackFallback;
   const groups = KNOWLEDGE.groups;
   return (
      <div className="flex flex-col overflow-clip rounded-[20px] border border-home-line bg-card text-left shadow-(--home-window-shadow) lg:h-[640px]">
         <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-home-line px-5">
            <div className="flex min-w-0 items-center gap-4 text-[13px]/4">
               <div className="flex shrink-0 gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#E3C9C2] dark:opacity-60" />
                  <span className="size-2.5 rounded-full bg-[#EBDDB0] dark:opacity-60" />
                  <span className="size-2.5 rounded-full bg-[#C9D6C6] dark:opacity-60" />
               </div>
               <span className="hidden text-muted-foreground sm:inline">{TRACKS.label}</span>
               <span className="hidden text-home-rule sm:inline">/</span>
               <span className="truncate font-medium">{lead.title}</span>
            </div>
            <div className="hidden shrink-0 items-center gap-1 rounded-lg bg-background p-0.75 text-xs/4 sm:flex">
               {STAGE.windowTabs.map((tab, i) => (
                  <span
                     key={tab}
                     className={i === 0 ? "rounded-md bg-card px-3 py-1.25 font-medium shadow-[0_0_0_1px_var(--home-rule),0_1px_2px_rgb(var(--home-sh)/0.06)] dark:bg-home-raised" : "rounded-md px-3 py-1.25 text-muted-foreground"}
                  >
                     {tab}
                  </span>
               ))}
            </div>
         </div>

         <div className="flex min-h-0 grow">
            <aside className="hidden w-64 shrink-0 flex-col gap-0.5 border-r border-home-line px-3 py-5 lg:flex">
               <div className="px-3 pb-3">
                  <span className={caps}>{TRACKS.label}</span>
               </div>
               {(tracks.length > 0 ? tracks.slice(0, 5) : [STAGE.trackFallback]).map((t, i) => (
                  <Row key={`${i}-${t.title}`} active={i === 0} delay={900 + i * 50}>
                     <span className="grow truncate">{t.title}</span>
                  </Row>
               ))}
               <div className="home-fade mt-3 flex flex-col gap-2.5 border-t border-home-line px-3 pt-4" style={d(1300)}>
                  <span className={caps}>{STAGE.library}</span>
                  {TRACKS.steps.map((step, i) => (
                     <span key={step} className="flex items-start gap-2.5 text-xs/4.5 text-muted-foreground">
                        <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-gold font-mono text-[10px] text-gold-foreground">{i + 1}</span>
                        {step}
                     </span>
                  ))}
               </div>
            </aside>

            <div className="flex min-w-0 grow flex-col gap-5.5 px-6 pt-7 pb-10 sm:px-8">
               <div className="home-fade-up flex items-center gap-2" style={d(1000)}>
                  <span className="size-5.5 shrink-0 rounded-full border border-home-rule bg-background" />
                  <span className={caps}>{STAGE.trackLabel}</span>
               </div>
               <p className="home-fade-up m-0 text-[22px]/7.5 font-light tracking-[-0.01em] sm:text-[26px]/8.5" style={d(1060)}>
                  {lead.title}
               </p>
               {lead.summary ? (
                  <p className="home-fade-up m-0 -mt-2 max-w-xl text-[13px]/5 text-muted-foreground" style={d(1100)}>
                     {lead.summary}
                  </p>
               ) : null}
               <div className="flex flex-wrap gap-2">
                  {STAGE.chips.map((t, i) => (
                     <span key={t} className="home-fade-up rounded-md bg-background px-2.5 py-1.25 font-mono text-[11px]/3.5 text-muted-foreground" style={v({ "--d": `${1120 + i * 50}ms`, "--fy": "6px" })}>
                        {t}
                     </span>
                  ))}
               </div>
               <div className="home-fade-up shrink-0 rounded-xl bg-background p-5" style={d(1200)}>
                  <Diagram />
               </div>
               <div className="home-fade-up flex items-start gap-3 rounded-[10px] border border-home-line px-4 py-3.5" style={d(2600)}>
                  <span className={`${caps} shrink-0 pt-0.5`}>{STAGE.knowledgeLabel}</span>
                  <p className="m-0 text-[13px]/5 text-muted-foreground">{groups[0].description}</p>
               </div>
            </div>

            <aside className="hidden w-60 shrink-0 flex-col gap-5 border-l border-home-line p-5 xl:flex">
               <div className="home-fade-up flex flex-col gap-3" style={d(1100)}>
                  <span className={caps}>{STAGE.problemLabel}</span>
                  <div className="flex flex-col gap-2 rounded-xl bg-gold/25 p-4 shadow-[inset_0_0_0_1px_var(--gold)]">
                     <span className="text-sm/5 font-medium">{problem.title}</span>
                     {problem.summary ? <span className={`${clamp(3)} text-xs/4.5 text-muted-foreground`}>{problem.summary}</span> : null}
                  </div>
               </div>
               <div className="flex flex-col gap-3 border-t border-home-line pt-4">
                  <span className={caps}>{STAGE.knowledgeLabel}</span>
                  {groups.slice(0, 2).map((g, i) => (
                     <div key={g.key} className="home-fade-up flex flex-col gap-0.5" style={v({ "--d": `${1300 + i * 70}ms`, "--fy": "6px" })}>
                        <span className="text-[13px]/4 font-medium">{g.title}</span>
                        <span className={`${clamp(2)} text-xs/4.5 text-muted-foreground`}>{g.description}</span>
                     </div>
                  ))}
               </div>
            </aside>
         </div>
      </div>
   );
}

/** The hills, the rising reader window and the cards pinned to it, with the page's own colour curving over the window's foot. */
function Stage({ tracks, problem }: StageData) {
   const note = KNOWLEDGE.groups[2];
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
               <AppWindow tracks={tracks} problem={problem} />
            </div>
         </div>

         <svg className="absolute bottom-0 left-0 z-20 h-[120px] w-full" viewBox="0 0 1440 120" preserveAspectRatio="none" focusable="false">
            <path d="M0 58 C 180 30, 330 70, 520 52 C 700 34, 860 76, 1040 56 C 1200 40, 1330 64, 1440 46 L1440 120 L0 120 Z" fill="var(--background)" />
         </svg>
         <Pop at="right-5 bottom-5 z-30 sm:right-8 lg:hidden" r={-2} depth={14} delay={1900} float={8}>
            <div className="home-card-shadow flex max-w-60 items-center gap-2.5 rounded-[14px] border border-home-line bg-home-raised px-3.5 py-2.5">
               <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" focusable="false">
                  <path d="M3 1.5h8v11L7 10l-4 2.5v-11z" fill="var(--gold)" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
               </svg>
               <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-[10px]/3 tracking-widest text-muted-foreground uppercase">{STAGE.problemLabel}</span>
                  <span className="truncate text-[13px]/4.5 font-medium">{problem.title}</span>
               </span>
            </div>
         </Pop>
         <div className="absolute inset-0 z-30 hidden lg:block">
            <Pop at="top-[470px] right-[max(1.5rem,calc(50%_-_680px))] max-[1280px]:hidden" r={3} depth={14} delay={1900} float={8} slap>
               <div className="relative flex w-55 flex-col gap-2.5 rounded-md bg-gold px-5 pt-7 pb-5.5 text-gold-foreground shadow-[0_14px_30px_rgb(var(--home-sh)/0.14),0_1px_2px_rgb(var(--home-sh)/0.08)]">
                  <span className="absolute -top-2.5 left-21 h-5 w-13 -rotate-4 rounded-xs bg-white/60" />
                  <span className="font-mono text-[10px]/3 font-medium tracking-[0.08em] uppercase opacity-70">{`${STAGE.knowledgeLabel} · ${note.title}`}</span>
                  <span className={`${clamp(3)} text-[15px]/5.25 font-medium`}>{note.description}</span>
               </div>
            </Pop>
            <Pop at="top-[500px] left-[max(1.5rem,calc(50%_-_684px))]" r={-3} depth={18} delay={2200} float={9}>
               <div className="home-card-shadow flex w-55 flex-col gap-2 rounded-[14px] border border-home-line bg-home-raised px-4 py-3.5">
                  <div className="flex items-center gap-2">
                     <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" focusable="false">
                        <path d="M3 1.5h8v11L7 10l-4 2.5v-11z" fill="var(--gold)" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
                     </svg>
                     <span className="text-xs/4 font-semibold">{STAGE.problemLabel}</span>
                  </div>
                  <p className="m-0 text-[13px]/4.5 font-medium">{problem.title}</p>
                  {problem.summary ? <p className={`m-0 ${clamp(2)} text-xs/4.5 text-muted-foreground`}>{problem.summary}</p> : null}
               </div>
            </Pop>
         </div>
      </div>
   );
}

/** The cards around the headline, from 1024 px: each hangs from the nearer page edge, in step with the centred content, so none clips; below 1200 px the two lower cards would meet the intro text and are left out; the stage's Knowledge note needs the window's right panel (1280 px) or it would cover the page text. Coordinates start at the page's top edge (the header sits above the hero). */
function Headline({ tracks }: { tracks: StageData["tracks"] }) {
   const lead = tracks[0] ?? STAGE.trackFallback;
   const core = KNOWLEDGE.groups[0];
   return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-[65px] bottom-0 hidden min-[1024px]:block">
         <Pop at="top-[176px] left-[max(1rem,calc(50%_-_624px))]" r={-5} depth={22} delay={1150} float={7}>
            <div className="home-card-shadow flex items-center gap-3 rounded-[14px] border border-home-line bg-home-raised py-3 pr-4.5 pl-3">
               <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-gold text-gold-foreground">
                  <svg width="18" height="18" viewBox="0 0 18 18" focusable="false">
                     <path className="home-draw" style={d(1650)} pathLength={1} d="M4 9.5L7.5 13L14 5.5" fill="none" stroke="var(--gold-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
               </span>
               <span className="flex flex-col gap-0.75">
                  <span className="text-sm/4.5 font-semibold">{STAGE.chooseTrack.title}</span>
                  <span className="font-mono text-[11px]/3.5 tracking-[0.02em] text-muted-foreground">{STAGE.chooseTrack.note}</span>
               </span>
            </div>
         </Pop>

         <Pop at="top-[118px] right-[max(1rem,calc(50%_-_688px))]" r={4} depth={26} delay={1300} float={8}>
            <div className="home-card-shadow flex w-54 flex-col gap-2.5 rounded-[14px] border border-home-line bg-home-raised px-4.5 py-4">
               <span className="font-mono text-[10px]/3 font-medium tracking-widest text-muted-foreground uppercase">{STAGE.trackLabel}</span>
               <span className={`${clamp(2)} text-[15px]/5 font-semibold`}>{lead.title}</span>
               {lead.summary ? <span className={`${clamp(2)} text-xs/4.5 text-muted-foreground`}>{lead.summary}</span> : null}
            </div>
         </Pop>

         <Pop at="top-[452px] left-[max(1rem,calc(50%_-_588px))] max-[1200px]:hidden" r={-3} depth={16} delay={1450} float={6.5}>
            <div className="flex items-center gap-2.5 rounded-full bg-foreground py-2.5 pr-4 pl-3 shadow-[0_14px_30px_rgb(var(--home-sh)/0.22)]">
               <span className="font-mono text-[11px]/4 font-medium tracking-[0.06em] text-background uppercase">{STAGE.knowledgeLabel}</span>
               <span className="h-3.5 w-px shrink-0 bg-background/20" />
               <span className="text-[13px]/4 text-background/70">{core.title}</span>
            </div>
         </Pop>

         <Pop at="top-[430px] right-[max(1rem,calc(50%_-_626px))] max-[1200px]:hidden" r={-2} depth={12} delay={1600} float={7.5}>
            <div className="home-card-shadow flex w-56 flex-col gap-2.5 rounded-[14px] min-[1360px]:w-62 border border-home-line bg-home-raised/90 px-4 py-3.5">
               <div className="grid grid-cols-3 gap-1">
                  {STAGE.path.map((step, i) => (
                     <span key={step} className={`h-1.5 rounded-[3px] ${i === 1 ? "home-sheen bg-gold" : "bg-foreground"}`} />
                  ))}
               </div>
               <div className="grid grid-cols-3 gap-1 text-[11px]/4 font-semibold">
                  {STAGE.path.map((step) => (
                     <span key={step}>{step}</span>
                  ))}
               </div>
            </div>
         </Pop>
      </div>
   );
}

/** Both parts sit inside HeroMotion's relative frame: the cards around the headline, then the stage below the copy. */
export function HeroStage({ tracks, problem }: { tracks: HomeTracks; problem: HomeProblem | null }) {
   const data: StageData = {
      tracks: tracks.status === "ok" ? tracks.cards.map(({ title, summary }) => ({ title, summary })) : [],
      problem: problem ?? STAGE.problemFallback,
   };
   return (
      <>
         <Headline tracks={data.tracks} />
         <Stage {...data} />
      </>
   );
}
