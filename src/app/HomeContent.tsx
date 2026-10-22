import Link from "next/link";
import {
   ArrowRight,
   BookOpen,
   BrainCircuit,
   ChartColumn,
   CheckCircle2,
   ChevronDown,
   Cpu,
   FlaskConical,
   Layers,
   Lightbulb,
   Sparkles,
   Star,
   Trophy,
   Users,
   Zap,
   type LucideIcon,
} from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PREFETCH_PRIMARY } from "@/lib/primary-navigation";
import { cn } from "@/lib/utils";
import { CLOSING, FAQ, HERO, HERO_AREAS, HERO_TOPICS, KNOWLEDGE, PRICING, STATS, TRACKS } from "./home-copy";
import { HeroStage } from "./HeroStage";
import { RotatingTopic } from "./RotatingTopic";
import { SectionIntro } from "./SectionIntro";
import { Testimonials } from "./Testimonials";

const STAT_ICONS: Record<(typeof STATS)[number]["key"], LucideIcon> = { modules: BookOpen, engineers: Users, offers: Trophy, tracks: Zap };
const TRACK_ICONS: Record<(typeof TRACKS.items)[number]["key"], LucideIcon> = {
   "gen-ai-native": BrainCircuit,
   "ml-system-design": ChartColumn,
   "llm-platform": Zap,
   "ml-platform": Cpu,
   "gen-ai-foundations": BookOpen,
};
const KNOWLEDGE_ICONS: Record<(typeof KNOWLEDGE.groups)[number]["key"], LucideIcon> = {
   "core-concepts": Lightbulb,
   "technologies-research": FlaskConical,
   patterns: Layers,
   "quick-references": BookOpen,
};

/** Entrance motion for the hero copy only; `motion-safe` leaves the content visible and still when motion is reduced. */
const ENTER = "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-backwards motion-safe:duration-500";

/** The gold tick chip used by the pricing lists. */
function Tick() {
   return (
      <span aria-hidden="true" className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-gold/20">
         <CheckCircle2 className="size-3.5 text-premium" />
      </span>
   );
}

function Hero() {
   return (
      <section aria-labelledby="home-heading" className="relative isolate overflow-hidden bg-gradient-to-b from-(--home-sky-a) to-(--home-sky-b)">
         <PageContainer className="flex flex-col items-center pt-16 text-center md:pt-24 lg:pt-28">
            <div className={ENTER}>
               <Badge variant="outline" className="gap-2 border-primary/40 bg-card/70 px-4 py-2 text-sm font-bold text-(--primary-text) shadow-sm [&>svg]:size-4">
                  <Sparkles aria-hidden="true" />
                  {HERO.eyebrow}
               </Badge>
            </div>

            <h1 id="home-heading" className={`${ENTER} mt-6 mb-4 max-w-5xl text-4xl leading-[1.1] font-extrabold tracking-tight text-balance delay-100 md:text-5xl lg:text-6xl`}>
               {HERO.lead} <br className="hidden md:block" />
               <RotatingTopic topics={HERO_TOPICS} label={HERO.subject} /> {HERO.tail}
            </h1>

            <p className={`${ENTER} mt-0 mb-8 max-w-2xl text-base leading-relaxed font-medium text-pretty text-foreground/85 delay-150 md:text-lg`}>
               {HERO.intro.before}
               <strong className="font-semibold text-foreground">{HERO.intro.emphasis}</strong>
               {HERO.intro.after}
            </p>

            <div className={`${ENTER} mb-8 flex w-full flex-col items-stretch justify-center gap-3 delay-200 sm:w-auto sm:flex-row sm:items-center`}>
               <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-xl border border-(--home-edge) bg-gold px-8 text-base font-bold text-gold-foreground shadow-xl shadow-gold/25 hover:bg-gold-hover hover:shadow-gold/40 motion-safe:hover:scale-105"
               >
                  <Link href={HERO.primaryAction.href} prefetch={PREFETCH_PRIMARY}>
                     {HERO.primaryAction.label}
                     <ArrowRight aria-hidden="true" className="size-5" />
                  </Link>
               </Button>
               <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-xl border border-(--home-edge) bg-card px-8 text-base font-bold hover:bg-muted hover:text-foreground"
               >
                  <Link href={HERO.secondaryAction.href}>{HERO.secondaryAction.label}</Link>
               </Button>
            </div>

            <ul className={`${ENTER} m-0 flex max-w-5xl list-none flex-wrap justify-center gap-3 p-0 delay-300`}>
               {HERO_AREAS.map((area) => (
                  <li
                     key={area}
                     className="inline-flex cursor-default items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5 text-sm font-medium transition-micro hover:bg-card"
                  >
                     <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
                     {area}
                  </li>
               ))}
            </ul>
         </PageContainer>

         <HeroStage />
      </section>
   );
}

/** The four existing stats, in their own band after the hero (spec S6-HOME-1); wording is unchanged. */
function StatsBand() {
   return (
      <div className="bg-background pt-4 pb-16 md:pb-20">
         <PageContainer>
            <ul className="m-0 mx-auto grid max-w-4xl list-none grid-cols-2 gap-6 p-0 md:grid-cols-4 md:gap-10">
               {STATS.map(({ key, value, label }) => {
                  const Icon = STAT_ICONS[key];
                  return (
                     <li key={key} className="group cursor-default text-center">
                        <span aria-hidden="true" className="mx-auto mb-3 block w-fit rounded-xl border border-primary/15 bg-primary/10 p-3 transition-micro group-hover:bg-primary/15">
                           <Icon className="size-5 text-primary md:size-6" />
                        </span>
                        <span className="mb-1 block text-2xl font-extrabold md:text-3xl lg:text-4xl">{value}</span>
                        <span className="block text-xs font-semibold text-muted-foreground md:text-sm">{label}</span>
                     </li>
                  );
               })}
            </ul>
         </PageContainer>
      </div>
   );
}

/** Tracks are the primary product: the bento grid of the pre-P0 page, each card opening its course. */
function Tracks() {
   return (
      <section id="tracks" aria-labelledby="home-tracks-heading" className="relative scroll-mt-20 overflow-hidden border-t border-border/50 py-20 md:py-28">
         <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-gold/[0.04]" />
         <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [--grid:color-mix(in_oklab,var(--foreground)_4%,transparent)] bg-[linear-gradient(to_right,var(--grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid)_1px,transparent_1px)] bg-[size:32px_32px]"
         />
         <PageContainer className="relative">
            <SectionIntro id="home-tracks-heading" label={TRACKS.label} title={TRACKS.heading} lead={TRACKS.lead} />

            <ol className="m-0 mx-auto mb-12 flex max-w-4xl list-none flex-col gap-3 p-0 text-center sm:flex-row sm:justify-center sm:gap-4">
               {TRACKS.steps.map((step, i) => (
                  <li key={step} className="flex items-center justify-center gap-3 text-sm font-semibold text-foreground">
                     <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-bold text-gold-foreground">
                        {i + 1}
                     </span>
                     {step}
                  </li>
               ))}
            </ol>

            <ul className="m-0 mx-auto grid max-w-6xl list-none grid-cols-1 gap-5 p-0 md:grid-cols-2 lg:grid-cols-12">
               {TRACKS.items.map(({ key, href, title, tagline, grid }) => {
                  const Icon = TRACK_ICONS[key];
                  return (
                     <li key={key} className={cn("flex", grid)}>
                        <Link
                           href={href}
                           prefetch={PREFETCH_PRIMARY}
                           className="group relative flex w-full flex-col overflow-hidden wrap-anywhere rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.04] transition-[color,background-color,border-color,box-shadow,transform] duration-300 hover:border-gold/50 hover:shadow-xl hover:shadow-gold/10 motion-safe:hover:scale-[1.02]"
                        >
                           <span aria-hidden="true" className="h-1 w-full bg-gradient-to-r from-primary via-gold/70 to-primary/40" />
                           <span className="flex flex-1 flex-col p-6">
                              <span
                                 aria-hidden="true"
                                 className="mb-4 flex size-14 items-center justify-center rounded-xl border border-primary/10 bg-primary/10 text-primary transition-micro group-hover:border-primary/20 group-hover:bg-primary/15"
                              >
                                 <Icon className="size-7" />
                              </span>
                              <h3 className="m-0 mb-1.5 text-xl font-bold transition-micro group-hover:text-premium">{title}</h3>
                              <p className="m-0 mb-6 text-supporting font-medium text-muted-foreground">{tagline}</p>
                              <span className="mt-auto flex items-center justify-end gap-2 border-t border-border/30 pt-4 text-sm font-bold text-premium">
                                 {TRACKS.cardAction}
                                 <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
                              </span>
                           </span>
                        </Link>
                     </li>
                  );
               })}
            </ul>

            <div className="mt-14 text-center">
               <Button asChild size="lg" className="h-12 rounded-xl bg-gold px-8 font-bold text-gold-foreground shadow-xl shadow-gold/25 hover:bg-gold-hover hover:shadow-gold/40 motion-safe:hover:scale-105">
                  <Link href={TRACKS.action.href} prefetch={PREFETCH_PRIMARY}>
                     {TRACKS.action.label}
                     <ArrowRight aria-hidden="true" className="size-5" />
                  </Link>
               </Button>
            </div>
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
               {KNOWLEDGE.groups.map(({ key, href, title, description }) => {
                  const Icon = KNOWLEDGE_ICONS[key];
                  return (
                     <li key={key} className="flex">
                        <Link
                           href={href}
                           prefetch={false}
                           className="group flex w-full flex-col rounded-2xl border border-border/60 bg-background p-6 text-left transition-[color,background-color,border-color,box-shadow] duration-300 hover:border-gold/50 hover:shadow-xl hover:shadow-gold/10"
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

/** Planned pricing: three parallel plans that differ only in price and period, a shared list, and no purchase action. */
function Pricing() {
   return (
      <section id="pricing" aria-labelledby="home-pricing-heading" className="scroll-mt-20 border-t border-border/50 bg-surface py-20 md:py-28">
         <PageContainer>
            <SectionIntro id="home-pricing-heading" label={PRICING.label} title={PRICING.heading} lead={PRICING.lead} gold />

            <ul aria-label={PRICING.listLabel} className="m-0 mx-auto grid max-w-5xl list-none gap-5 p-0 md:grid-cols-3">
               {PRICING.plans.map(({ name, amount, unit }) => (
                  <li
                     key={name}
                     className="relative flex flex-col items-center overflow-hidden rounded-2xl border-2 border-gold/40 bg-gradient-to-b from-gold/10 to-transparent px-6 pt-12 pb-8 text-center shadow-2xl ring-1 shadow-gold/10 ring-gold/20"
                  >
                     <span className="flex items-center gap-2 text-sm font-bold tracking-wider text-premium uppercase">
                        <Star aria-hidden="true" className="size-4 fill-gold text-gold" />
                        {name}
                     </span>
                     <span className="mt-4 flex items-baseline gap-1.5">
                        <span className="text-5xl font-extrabold tracking-tight tabular-nums">{amount}</span>
                        <span className="text-supporting font-semibold text-muted-foreground">{unit}</span>
                     </span>
                     <span className="absolute top-0 right-0 rounded-bl-xl bg-gold px-3 py-1 text-xs font-bold tracking-wide text-gold-foreground uppercase">{PRICING.badge}</span>
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
            <div className="mx-auto flex max-w-2xl flex-col gap-3">
               {FAQ.items.map(({ q, a }) => (
                  <details key={q} className="group rounded-xl border border-border/60 bg-card px-5">
                     <summary className="flex min-h-11 cursor-pointer list-none items-center gap-4 rounded-md py-3 text-left transition-micro -outline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                        <h3 className="m-0 min-w-0 flex-1 text-body font-semibold text-balance">{q}</h3>
                        <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                     </summary>
                     <p className="m-0 pb-4 text-supporting leading-relaxed text-pretty text-muted-foreground">{a}</p>
                  </details>
               ))}
            </div>
         </PageContainer>
      </section>
   );
}

/** The one closing action: Browse Tracks, to the same destination as the hero. */
function Closing() {
   return (
      <section aria-labelledby="home-closing-heading" className="border-t border-border/50 bg-surface py-20 text-center md:py-24">
         <PageContainer>
            <h2 id="home-closing-heading" className="m-0 mb-8 text-2xl font-bold tracking-tight text-balance md:text-3xl">
               {CLOSING.heading}
            </h2>
            <Button asChild size="lg" className="h-12 rounded-xl border border-(--home-edge) bg-gold px-8 text-base font-bold text-gold-foreground shadow-xl shadow-gold/25 hover:bg-gold-hover hover:shadow-gold/40 motion-safe:hover:scale-105">
               <Link href={CLOSING.action.href} prefetch={PREFETCH_PRIMARY}>
                  {CLOSING.action.label}
                  <ArrowRight aria-hidden="true" className="size-5" />
               </Link>
            </Button>
         </PageContainer>
      </section>
   );
}

/** The homepage is a vertical sequence of sections: a later section (e.g. learner state) joins the flow without restructuring. */
export function HomeContent() {
   return (
      <>
         <main data-home>
            <Hero />
            <StatsBand />
            <Tracks />
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
