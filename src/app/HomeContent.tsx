import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, FlaskConical, Layers, Lightbulb, Sparkles, Star, type LucideIcon } from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { HomeTracks } from "@/lib/catalog/home";
import { PREFETCH_PRIMARY } from "@/lib/primary-navigation";
import { cn } from "@/lib/utils";
import { CLOSING, FAQ, HERO, HERO_AREAS, HERO_TOPICS, KNOWLEDGE, PRICING, STATS, STATS_DISCLOSURE, TRACKS } from "./home-copy";
import { HeroMotion } from "./HeroMotion";
import { HomeSmoothScroll } from "./HomeSmoothScroll";
import { HeroStage } from "./HeroStage";
import { HOME_FONT_VARIABLES } from "./home-font";
import { RotatingTopic } from "./RotatingTopic";
import { SectionIntro } from "./SectionIntro";
import { Testimonials } from "./Testimonials";

const KNOWLEDGE_ICONS: Record<(typeof KNOWLEDGE.groups)[number]["key"], LucideIcon> = {
   "core-concepts": Lightbulb,
   "technologies-research": FlaskConical,
   patterns: Layers,
   "quick-references": BookOpen,
};

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/** The prototype's headline motion: each word blurs and rises in, one after another. */
function Words({ text, from }: { text: string; from: number }) {
   return text.split(" ").map((word, i) => (
      <Fragment key={i}>
         <span className="home-word" style={delay(from + i * 45)}>
            {word}
         </span>{" "}
      </Fragment>
   ));
}

const BUTTON = "home-btn inline-flex h-auto rounded-full px-6 py-3.5 text-[15px]/4.5 font-medium";

/** The gold tick chip used by the pricing lists. */
function Tick() {
   return (
      <span aria-hidden="true" className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-gold/20">
         <CheckCircle2 className="size-3.5 text-premium" />
      </span>
   );
}

/**
 * The hero keeps the prototype's composition (homepage/): the pill, the serif headline whose subject rotates, the two
 * actions, then the rising reader window. The free-chapter action appears only when the API confirmed the Lesson is
 * free (S6-HOME-4).
 */
function Hero({ freeChapterHref }: { freeChapterHref: string | null }) {
   return (
      <section aria-labelledby="home-heading">
         <HeroMotion className="relative overflow-clip bg-gradient-to-b from-(--home-sky-a) to-(--home-sky-b) pt-[21px]">
            <PageContainer className="relative z-10 flex flex-col items-center gap-7 pt-18 pb-16 text-center lg:pt-26">
               <p
                  className="home-fade-up m-0 flex items-center gap-2.5 rounded-full border border-white/80 bg-white/55 px-4 py-2 text-[13px]/4 font-medium dark:border-white/10 dark:bg-white/5"
                  style={delay(80)}
               >
                  <Sparkles aria-hidden="true" className="size-4 text-primary" />
                  {HERO.eyebrow}
               </p>

               <h1 id="home-heading" className="m-0 max-w-235 font-home-heading text-[clamp(40px,4.4vw+8px,68px)] leading-[1.09] font-normal tracking-[-0.02em] text-balance">
                  <Words text={HERO.lead} from={160} /> <br className="hidden md:block" />
                  <span className="home-word" style={delay(160 + HERO.lead.split(" ").length * 45)}>
                     <RotatingTopic topics={HERO_TOPICS} label={HERO.subject} />
                  </span>{" "}
                  <Words text={HERO.tail} from={160 + (HERO.lead.split(" ").length + 1) * 45} />
               </h1>

               <p className="home-fade-up m-0 max-w-[680px] text-base/7 text-pretty text-muted-foreground sm:text-lg/7" style={delay(560)}>
                  {HERO.intro.before}
                  <strong className="font-semibold text-foreground">{HERO.intro.emphasis}</strong>
                  {HERO.intro.after}
               </p>

               <div className="home-fade-up flex flex-wrap justify-center gap-3 pt-2" style={delay(660)}>
                  <Link href={HERO.primaryAction.href} prefetch={PREFETCH_PRIMARY} className={`${BUTTON} bg-foreground text-background hover:bg-foreground/90`}>
                     {HERO.primaryAction.label}
                     <ArrowRight aria-hidden="true" className="ml-2 size-4" />
                  </Link>
                  {freeChapterHref ? (
                     <Link
                        href={freeChapterHref}
                        prefetch={false}
                        className={`${BUTTON} bg-card text-foreground shadow-[0_1px_2px_rgb(var(--home-sh)/0.08)] dark:bg-home-raised dark:shadow-[inset_0_0_0_1px_var(--home-line)]`}
                     >
                        {HERO.freeChapterLabel}
                     </Link>
                  ) : null}
               </div>

               <ul className="home-fade-up m-0 flex max-w-5xl list-none flex-wrap justify-center gap-2.5 p-0" style={delay(760)}>
                  {HERO_AREAS.map((area) => (
                     <li key={area} className="cursor-default rounded-full border border-home-line bg-card/70 px-3 py-1.5 text-[13px]/4 font-medium text-muted-foreground">
                        {area}
                     </li>
                  ))}
               </ul>
            </PageContainer>

            <HeroStage />
         </HeroMotion>
      </section>
   );
}

/**
 * One statistic. Assistive technology reads the stable final value; the visible digits count up from 0 as the band scrolls into
 * view (the prototype's `Count`: a CSS counter driven by a scroll timeline, so no script and no intermediate frame is exposed).
 * Without scroll-timeline support, without CSS, or under reduced motion, the final value is simply shown.
 */
function Figure({ value }: { value: string }) {
   const [, prefix, digits, suffix] = /^(\D*)(\d+)(.*)$/.exec(value) ?? ["", "", "", value];
   return (
      <span className="text-[32px]/10 tracking-[-0.03em] tabular-nums sm:text-[40px]/12">
         <span className="sr-only">{value}</span>
         <span aria-hidden="true">
            {prefix}
            {digits ? <span className="home-count" style={{ "--to": digits } as CSSProperties} /> : null}
            {suffix}
         </span>
      </span>
   );
}

/** The four existing stats, in their own band after the Tracks (spec S6-HOME-1); wording is unchanged and the band says they are samples. */
function StatsBand() {
   return (
      <div className="bg-background pt-12 pb-6 md:pt-16">
         <PageContainer>
            <p className="m-0 mb-8 flex flex-wrap items-center justify-center gap-2 text-center text-sm font-medium text-muted-foreground">
               <span className="rounded-full border border-gold/60 bg-gold/15 px-2.5 py-0.5 text-xs font-bold text-foreground">{STATS_DISCLOSURE.label}</span>
               {STATS_DISCLOSURE.text}
            </p>
            <ul className="m-0 mx-auto grid max-w-4xl list-none grid-cols-2 gap-y-8 p-0 md:grid-cols-4">
               {STATS.map(({ key, value, label }) => (
                  <li key={key} className="flex cursor-default flex-col items-center gap-1.5 py-2 text-center md:border-l md:border-home-mist md:first:border-l-0">
                     <Figure value={value} />
                     <span className="font-mono text-[11px]/3.5 tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
                  </li>
               ))}
            </ul>
         </PageContainer>
      </div>
   );
}

/** One card per published Track; a lone Track or a pair is centred rather than left in a wider grid. */
const CARD_GRID = (count: number) => (count === 1 ? "max-w-xl" : count === 2 ? "max-w-4xl md:grid-cols-2" : "max-w-6xl md:grid-cols-2 lg:grid-cols-3");

/** The prototype's track icons, cycled by position: decoration only, they say nothing about a Track. */
function TrackIcon({ index }: { index: number }) {
   const line = { fill: "none", stroke: "var(--foreground)", strokeWidth: 1.2 } as const;
   const accent = { className: "home-accent", fill: "none", stroke: "var(--home-sky)", strokeWidth: 1.2 } as const;
   const glyphs: ReactNode[] = [
      <>
         <rect x="12" y="13" width="18" height="24" rx="3" {...line} />
         <path d="M16 20h10M16 25h10M16 30h6" {...accent} strokeLinecap="round" />
         <circle cx="35" cy="35" r="7" fill="var(--card)" stroke="var(--foreground)" strokeWidth="1.2" />
         <path d="M40 40l5 5" {...line} strokeLinecap="round" />
      </>,
      <>
         {[13, 24, 35].map((y) => (
            <rect key={y} x="13" y={y} width="30" height="8" rx="2.5" {...line} />
         ))}
         {[17, 28, 39].map((cy) => (
            <circle key={cy} cx="18" cy={cy} r="1.3" fill="var(--foreground)" />
         ))}
         <path d="M24 17h14M24 28h14M24 39h8" {...accent} strokeLinecap="round" />
      </>,
      <>
         <rect x="10" y="22" width="11" height="11" rx="3" {...line} />
         <rect x="35" y="12" width="11" height="11" rx="3" {...line} />
         <rect x="35" y="33" width="11" height="11" rx="3" {...line} />
         <path d="M21 27.5H28V17.5H35M28 27.5V38.5H35" {...accent} />
         <circle cx="28" cy="27.5" r="2" fill="var(--card)" stroke="var(--foreground)" strokeWidth="1.2" />
      </>,
      <>
         <path d="M12 14H44L33 28V40L23 44V28L12 14Z" {...line} strokeLinejoin="round" />
         <path d="M18 20H38" {...accent} strokeLinecap="round" />
      </>,
   ];
   return (
      <svg width="48" height="48" viewBox="0 0 56 56" aria-hidden="true" focusable="false" className="shrink-0">
         <rect x="0.6" y="0.6" width="54.8" height="54.8" rx="14" fill="none" stroke="var(--home-mist)" strokeWidth="1.2" />
         {glyphs[index % glyphs.length]}
      </svg>
   );
}

/** The published catalog Tracks, or one truthful sentence in their place; never a made-up card (S6-HOME-2, -3). */
function TrackCards({ tracks }: { tracks: HomeTracks }) {
   if (tracks.status === "ok") {
      return (
         <ul className={cn("m-0 mx-auto grid list-none grid-cols-1 gap-5 p-0", CARD_GRID(tracks.cards.length))}>
            {tracks.cards.map(({ id, title, summary, href }, i) => (
               <li key={id} className="flex">
                  <Link
                     href={href}
                     prefetch={false}
                     style={{ "--s": `${(i % 3) * 4}%` } as CSSProperties}
                     className="home-lift home-reveal group flex w-full flex-col gap-8 wrap-anywhere rounded-[20px] border border-home-line bg-card p-7"
                  >
                     <TrackIcon index={i} />
                     <span className="flex flex-1 flex-col gap-2.5">
                        <h3 className="m-0 text-xl/6 font-semibold tracking-[-0.02em]">{title}</h3>
                        {summary ? <p className="m-0 text-sm/5.5 text-pretty text-muted-foreground">{summary}</p> : null}
                        <span className="mt-auto flex items-center justify-end gap-2 pt-4 text-sm font-semibold text-foreground">
                           {TRACKS.cardAction}
                           <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                     </span>
                  </Link>
               </li>
            ))}
         </ul>
      );
   }

   return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 rounded-[20px] border border-home-line bg-card px-6 py-10 text-center">
         <p className="m-0 text-body text-pretty text-muted-foreground">{tracks.status === "empty" ? TRACKS.empty : TRACKS.unavailable}</p>
         {tracks.status === "unavailable" ? (
            <Link href={KNOWLEDGE.action.href} prefetch={false} className={`${BUTTON} bg-card text-foreground shadow-[0_0_0_1px_var(--home-rule)]`}>
               {KNOWLEDGE.action.label}
            </Link>
         ) : null}
      </div>
   );
}

/** Tracks are the primary product and the one place they are discovered: `/#tracks` (S6-NAV-1). */
function Tracks({ tracks }: { tracks: HomeTracks }) {
   return (
      <section id="tracks" aria-labelledby="home-tracks-heading" className="scroll-mt-28 py-16 md:py-24">
         <PageContainer>
            <div className="home-reveal mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
               <div className="flex flex-col gap-4">
                  <p className="m-0 font-mono text-[11px]/3.5 tracking-[0.08em] text-muted-foreground uppercase">{TRACKS.label}</p>
                  <h2 id="home-tracks-heading" className="m-0 max-w-140 text-[32px]/10 font-medium tracking-[-0.03em] text-balance sm:text-[40px]/11.5">
                     {TRACKS.heading}
                  </h2>
               </div>
               <p className="m-0 max-w-96 shrink-0 text-[15px]/6 text-pretty text-muted-foreground">{TRACKS.lead}</p>
            </div>

            <ol className="m-0 mx-auto mb-8 flex max-w-4xl list-none flex-col gap-3 p-0 text-center sm:flex-row sm:justify-center sm:gap-4">
               {TRACKS.steps.map((step, i) => (
                  <li key={step} className="flex items-center justify-center gap-3 text-sm font-medium text-foreground">
                     <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gold font-mono text-xs font-medium text-gold-foreground">
                        {i + 1}
                     </span>
                     {step}
                  </li>
               ))}
            </ol>

            <TrackCards tracks={tracks} />
         </PageContainer>
      </section>
   );
}

/** Knowledge supports the Tracks: its four editorial groups, each opening the explorer on that group. No catalog read. */
function Knowledge() {
   return (
      <section id="knowledge" aria-labelledby="home-knowledge-heading" className="scroll-mt-20 border-t border-border/50 bg-surface py-20 md:py-28">
         <PageContainer>
            <SectionIntro id="home-knowledge-heading" label={KNOWLEDGE.label} title={KNOWLEDGE.heading} lead={KNOWLEDGE.lead} />
            <ul className="m-0 mx-auto grid max-w-6xl list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
               {KNOWLEDGE.groups.map(({ key, href, title, description }, i) => {
                  const Icon = KNOWLEDGE_ICONS[key];
                  return (
                     <li key={key} className="flex">
                        <Link
                           href={href}
                           prefetch={false}
                           style={{ "--s": `${i * 3}%` } as CSSProperties}
                           className="home-reveal group flex w-full flex-col rounded-2xl border border-border/60 bg-background p-6 text-left transition-[color,background-color,border-color,box-shadow] duration-300 hover:border-gold/50 hover:shadow-xl hover:shadow-gold/10"
                        >
                           <span aria-hidden="true" className="mb-4 flex size-12 items-center justify-center rounded-xl border border-primary/10 bg-primary/10 text-primary">
                              <Icon className="size-6" />
                           </span>
                           <h3 className="m-0 mb-2 text-lg font-bold transition-micro group-hover:text-premium">{title}</h3>
                           <p className="m-0 text-supporting text-pretty text-muted-foreground">{description}</p>
                        </Link>
                     </li>
                  );
               })}
            </ul>
            <div className="mt-14 text-center">
               <Button asChild size="lg" variant="outline" className="h-12 rounded-xl border-2 border-foreground/20 px-8 font-bold hover:border-foreground/40 hover:bg-muted/60 hover:text-foreground">
                  <Link href={KNOWLEDGE.action.href} prefetch={PREFETCH_PRIMARY}>
                     {KNOWLEDGE.action.label}
                     <ArrowRight aria-hidden="true" className="size-5" />
                  </Link>
               </Button>
            </div>
         </PageContainer>
      </section>
   );
}

/** Pricing for information: three parallel plans that differ only in price and period, a shared list, and no purchase action. */
function Pricing() {
   return (
      <section id="pricing" aria-labelledby="home-pricing-heading" className="scroll-mt-20 border-t border-border/50 bg-surface py-20 md:py-28">
         <PageContainer>
            <SectionIntro id="home-pricing-heading" label={PRICING.label} title={PRICING.heading} lead={PRICING.lead} gold />

            <ul aria-label={PRICING.listLabel} className="m-0 mx-auto grid max-w-5xl list-none gap-5 p-0 md:grid-cols-3">
               {PRICING.plans.map(({ name, amount, unit }, i) => (
                  <li
                     key={name}
                     style={{ "--s": `${i * 4}%` } as CSSProperties}
                     className="home-reveal relative flex flex-col items-center overflow-hidden rounded-2xl border-2 border-gold/40 bg-gradient-to-b from-gold/10 to-transparent px-6 py-8 text-center shadow-2xl ring-1 shadow-gold/10 ring-gold/20"
                  >
                     <span className="flex items-center gap-2 text-sm font-bold tracking-wider text-premium uppercase">
                        <Star aria-hidden="true" className="size-4 fill-gold text-gold" />
                        {name}
                     </span>
                     <span className="mt-4 flex items-baseline gap-1.5">
                        <span className="text-5xl font-extrabold tracking-tight tabular-nums">{amount}</span>
                        <span className="text-supporting font-semibold text-muted-foreground">{unit}</span>
                     </span>
                  </li>
               ))}
            </ul>
            <p className="mx-auto mt-5 mb-0 max-w-5xl text-center text-supporting font-medium text-pretty text-muted-foreground">{PRICING.note}</p>

            <div className="mx-auto mt-8 grid max-w-5xl gap-6 rounded-2xl border border-border/60 bg-background/70 p-6 backdrop-blur-md md:p-8 lg:grid-cols-[auto_1fr] lg:items-start lg:gap-10">
               <p className="m-0 text-sm font-bold tracking-wider text-premium uppercase">{PRICING.included.label}</p>
               <ul className="m-0 grid list-none gap-3 p-0 text-supporting font-medium md:grid-cols-3">
                  {PRICING.included.points.map((point) => (
                     <li key={point} className="flex items-start gap-3">
                        <Tick />
                        {point}
                     </li>
                  ))}
               </ul>
            </div>

            <div className="mx-auto mt-5 flex max-w-5xl flex-col gap-5 rounded-2xl border border-border/60 bg-background/70 p-6 text-left backdrop-blur-md md:flex-row md:items-center md:justify-between md:p-8">
               <div>
                  <p className="m-0 text-sm font-bold tracking-wider text-muted-foreground uppercase">{PRICING.free.label}</p>
                  <h3 className="mt-1 mb-1 text-lg font-bold">{PRICING.free.title}</h3>
                  <p className="m-0 max-w-2xl text-supporting text-pretty text-muted-foreground">{PRICING.free.body}</p>
               </div>
               <Button asChild variant="outline" size="lg" className="h-11 shrink-0 rounded-xl border-2 border-foreground/20 font-bold hover:bg-muted/60 hover:text-foreground">
                  <Link href={PRICING.free.action.href} prefetch={PREFETCH_PRIMARY}>
                     {PRICING.free.action.label}
                  </Link>
               </Button>
            </div>
         </PageContainer>
      </section>
   );
}

/** Native `details`: Enter and Space work, the state is exposed, and every answer opens with JavaScript off. */
function Faq() {
   return (
      <section id="faq" aria-labelledby="home-faq-heading" className="scroll-mt-20 border-t border-border/50 py-20 md:py-28">
         <PageContainer>
            <SectionIntro id="home-faq-heading" label={FAQ.label} title={FAQ.heading} />
            <div className="home-reveal mx-auto flex max-w-2xl flex-col gap-3">
               {FAQ.items.map(({ q, a }) => (
                  <details key={q} className="group rounded-xl border border-border/60 bg-card px-5">
                     <summary className="flex min-h-11 cursor-pointer list-none items-center gap-4 rounded-md py-3 text-left transition-micro -outline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                        <h3 className="m-0 min-w-0 flex-1 text-body font-semibold text-balance">{q}</h3>
                        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="shrink-0">
                           <path d="M5 10h10" fill="none" stroke="var(--foreground)" strokeWidth="1.4" strokeLinecap="round" />
                           <path className="home-faq-v" d="M10 5v10" fill="none" stroke="var(--foreground)" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                     </summary>
                     <p className="m-0 pb-4 text-supporting leading-relaxed text-pretty text-muted-foreground">{a}</p>
                  </details>
               ))}
            </div>
         </PageContainer>
      </section>
   );
}

/** The one closing action: Browse Tracks, to the same destination as the hero, on the prototype's sky card with drifting hills. */
function Closing() {
   const hill = (dx: string, d: string, fill: string, opacity?: number) => (
      <path className="home-drift" style={{ "--dx": dx } as CSSProperties} d={d} fill={fill} opacity={opacity} />
   );
   return (
      <section aria-labelledby="home-closing-heading" className="py-16 md:py-24">
         <PageContainer>
            <div className="home-reveal relative flex flex-col items-center gap-5 overflow-clip rounded-[28px] bg-gradient-to-b from-(--home-sky-a) to-(--home-sky-b) px-6 pt-22 pb-34 text-center sm:px-20">
               <svg className="pointer-events-none absolute bottom-0 left-[-6%] h-[120px] w-[112%]" viewBox="0 0 1120 120" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  {hill("-24px", "M0 50 C 120 20, 230 46, 360 34 C 500 20, 620 56, 760 40 C 880 26, 1000 44, 1120 24 L1120 120 L0 120 Z", "var(--home-hill-sky)", 0.8)}
                  {hill("36px", "M760 70 C 840 52, 920 62, 1000 50 C 1060 42, 1100 52, 1120 46 L1120 120 L720 120 Z", "var(--home-hill-sun)")}
                  {hill("-14px", "M0 78 C 140 58, 280 86, 440 72 C 600 58, 720 90, 880 78 C 980 70, 1060 82, 1120 74 L1120 120 L0 120 Z", "var(--home-hill-mist)")}
                  <path d="M0 102 C 180 88, 360 110, 560 98 C 760 86, 940 108, 1120 96 L1120 120 L0 120 Z" fill="var(--home-hill-top)" />
               </svg>
               <h2 id="home-closing-heading" className="relative m-0 max-w-155 text-[34px]/10.5 font-medium tracking-[-0.03em] text-balance sm:text-[44px]/12.5">
                  {CLOSING.heading}
               </h2>
               <div className="relative flex flex-wrap justify-center gap-3 pt-3">
                  <Link href={CLOSING.action.href} prefetch={PREFETCH_PRIMARY} className={`${BUTTON} bg-foreground text-background hover:bg-foreground/90`}>
                     {CLOSING.action.label}
                     <ArrowRight aria-hidden="true" className="ml-2 size-4" />
                  </Link>
               </div>
            </div>
         </PageContainer>
      </section>
   );
}

/** The homepage is a vertical sequence of sections: a later section (e.g. learner state) joins the flow without restructuring. */
export function HomeContent({ tracks, freeChapterHref }: { tracks: HomeTracks; freeChapterHref: string | null }) {
   return (
      <>
         <HomeSmoothScroll />
         <main data-home className={HOME_FONT_VARIABLES}>
            <Hero freeChapterHref={freeChapterHref} />
            <Tracks tracks={tracks} />
            <StatsBand />
            <Knowledge />
            <Testimonials />
            <Pricing />
            <Faq />
            <Closing />
         </main>
         <Footer />
      </>
   );
}
