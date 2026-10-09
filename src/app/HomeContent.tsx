import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Network, Sparkles, Star, Target, type LucideIcon } from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { PREFETCH_PRIMARY } from "@/lib/primary-navigation";
import { cn } from "@/lib/utils";
import { CONNECTION, ENTRY_HEADING, ENTRY_POINTS, FAQ, HERO, HERO_AREAS, HERO_TOPICS, PREMIUM, PRICING } from "./home-copy";
import { RotatingTopic } from "./RotatingTopic";

const ENTRY_ICONS: Record<(typeof ENTRY_POINTS)[number]["key"], LucideIcon> = {
   learn: BookOpen,
   knowledge: Network,
   practice: Target,
};

/** Entrance motion for the hero only; `motion-safe` leaves the content visible and still when motion is reduced. */
const ENTER = "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-backwards motion-safe:duration-500";

/** The gold tick chip used by the Free and Full-library lists. */
function Tick({ gold }: { gold?: boolean }) {
   return (
      <span aria-hidden="true" className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full", gold ? "bg-gold/20" : "bg-primary/10")}>
         <CheckCircle2 className={cn("size-3.5", gold ? "text-premium" : "text-primary")} />
      </span>
   );
}

function SectionIntro({ id, label, title, lead, gold }: { id: string; label: string; title: string; lead?: string; gold?: boolean }) {
   return (
      <div className="mx-auto mb-12 max-w-4xl text-center md:mb-16">
         <Badge variant="outline" className={cn("mb-4 px-3 py-1 text-supporting", gold ? "border-gold/40 text-premium" : "border-primary/30 text-primary")}>
            {label}
         </Badge>
         <h2 id={id} className="m-0 mb-6 text-2xl font-bold tracking-tight text-balance md:text-3xl">
            {title}
         </h2>
         {lead ? <p className="m-0 mx-auto max-w-3xl text-lg text-pretty text-muted-foreground md:text-xl">{lead}</p> : null}
      </div>
   );
}

function Hero() {
   return (
      <section aria-labelledby="home-heading" className="relative isolate overflow-hidden">
         {/* Decoration only: a hairline grid that fades out, and a soft spotlight from the accent. */}
         <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 [--grid:color-mix(in_oklab,var(--foreground)_7%,transparent)]">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
            <div className="absolute top-0 left-1/2 h-[400px] w-[1000px] -translate-x-1/2 rounded-full bg-primary/20 opacity-50 blur-[120px] dark:mix-blend-screen" />
         </div>

         <PageContainer className="flex flex-col items-center py-20 text-center md:py-28 lg:py-32">
            <div className={ENTER}>
               <Badge variant="outline" className="gap-2 border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary shadow-sm [&>svg]:size-4">
                  <Sparkles aria-hidden="true" />
                  {HERO.eyebrow}
               </Badge>
            </div>

            <h1 id="home-heading" className={`${ENTER} mt-6 mb-4 max-w-5xl text-4xl leading-[1.1] font-extrabold tracking-tight text-balance delay-100 md:text-5xl lg:text-6xl`}>
               {HERO.lead} <br className="hidden md:block" />
               <RotatingTopic topics={HERO_TOPICS} label={HERO.subject} /> {HERO.tail}
            </h1>

            <p className={`${ENTER} mt-0 mb-8 max-w-2xl text-base leading-relaxed font-medium text-pretty text-muted-foreground delay-150 md:text-lg`}>
               {HERO.intro.before}
               <strong className="font-semibold text-foreground">{HERO.intro.emphasis}</strong>
               {HERO.intro.after}
            </p>

            <ul className={`${ENTER} m-0 mb-10 flex max-w-3xl list-none flex-wrap justify-center gap-3 p-0 delay-200`}>
               {HERO_AREAS.map((area) => (
                  <li
                     key={area}
                     className="inline-flex cursor-default items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-sm font-medium transition-micro hover:bg-secondary"
                  >
                     <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
                     {area}
                  </li>
               ))}
            </ul>

            <div className={`${ENTER} flex w-full flex-col items-stretch justify-center gap-3 delay-300 sm:w-auto sm:flex-row sm:items-center`}>
               <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-xl bg-gold px-8 text-base font-bold text-gold-foreground shadow-xl shadow-gold/25 hover:bg-gold-hover hover:shadow-gold/40 motion-safe:hover:scale-105"
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
                  className="h-12 rounded-xl border-2 border-foreground/20 px-8 text-base font-bold hover:border-foreground/40 hover:bg-muted/60 hover:text-foreground"
               >
                  <Link href={HERO.secondaryAction.href}>{HERO.secondaryAction.label}</Link>
               </Button>
            </div>
         </PageContainer>
      </section>
   );
}

/** Access, kept calm: what is free, what is planned, the planned prices for information, and that nothing is for sale. No purchase action. */
function Premium() {
   return (
      <section id="access" aria-labelledby="home-premium-heading" className="scroll-mt-20 border-t border-border/50 bg-surface py-20 md:py-28">
         <PageContainer>
            <SectionIntro id="home-premium-heading" label={PREMIUM.label} title={PREMIUM.heading} lead={PREMIUM.lead} gold />

            <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-12">
               <div className="flex flex-col rounded-2xl border border-border/60 bg-background/70 p-6 text-left backdrop-blur-md transition-micro hover:bg-background md:p-8 lg:col-span-4 lg:self-start">
                  <p className="m-0 text-sm font-bold tracking-wider text-muted-foreground uppercase">{PREMIUM.free.label}</p>
                  <h3 className="mt-2 mb-0 text-subsection">{PREMIUM.free.title}</h3>
                  <ul className="m-0 mt-6 flex list-none flex-col gap-3 p-0 text-supporting text-muted-foreground">
                     {PREMIUM.free.points.map((point) => (
                        <li key={point} className="flex items-start gap-3">
                           <Tick />
                           {point}
                        </li>
                     ))}
                  </ul>
                  <Button asChild variant="outline" size="lg" className="mt-8 h-11 rounded-xl border-2 border-foreground/20 font-bold hover:bg-muted/60 hover:text-foreground">
                     <Link href={PREMIUM.free.action.href} prefetch={PREFETCH_PRIMARY}>
                        {PREMIUM.free.action.label}
                     </Link>
                  </Button>
               </div>

               <div className="relative flex flex-col overflow-hidden rounded-2xl border-2 border-gold/40 bg-gradient-to-b from-gold/10 to-transparent p-6 text-left shadow-2xl ring-1 shadow-gold/10 ring-gold/20 md:p-8 lg:col-span-8">
                  <span className="absolute top-0 right-0 rounded-bl-xl bg-gold px-3 py-1 text-xs font-bold tracking-wide text-gold-foreground uppercase">
                     {PREMIUM.full.ribbon}
                  </span>
                  <p className="m-0 flex items-center gap-2 text-sm font-bold tracking-wider text-premium uppercase">
                     <Star aria-hidden="true" className="size-4 fill-gold text-gold" />
                     {PREMIUM.full.label}
                  </p>
                  <h3 className="mt-2 mb-0 text-subsection">{PREMIUM.full.title}</h3>
                  <p className="mt-3 mb-0 text-supporting text-pretty text-muted-foreground">{PREMIUM.full.body}</p>
                  <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0 text-supporting font-medium">
                     {PREMIUM.full.points.map((point) => (
                        <li key={point} className="flex items-start gap-3">
                           <Tick gold />
                           {point}
                        </li>
                     ))}
                  </ul>

                  <div className="mt-8 flex flex-col gap-1 border-t border-gold/20 pt-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                     <p id="home-pricing-label" className="m-0 text-sm font-bold tracking-wider text-premium uppercase">
                        {PRICING.label}
                     </p>
                     <p className="m-0 text-supporting text-pretty text-muted-foreground">{PRICING.note}</p>
                  </div>
                  <ul aria-labelledby="home-pricing-label" className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-3">
                     {PRICING.plans.map(({ amount, unit }) => (
                        <li
                           key={unit}
                           className="relative flex items-baseline justify-center gap-1.5 overflow-hidden rounded-xl border border-gold/30 bg-background/80 px-4 pt-6 pb-5 text-center sm:flex-col sm:items-center sm:gap-0"
                        >
                           <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold/70 via-gold/40 to-gold/10" />
                           <span className="text-4xl font-extrabold tracking-tight tabular-nums">{amount}</span>
                           <span className="text-supporting font-semibold text-muted-foreground sm:mt-1">{unit}</span>
                        </li>
                     ))}
                  </ul>
                  <p className="mt-6 mb-0 text-supporting font-medium text-pretty">{PREMIUM.note}</p>
               </div>
            </div>
         </PageContainer>
      </section>
   );
}

/** Three equal doors into the product; each is one link, named by its title and action. */
function EntryPoints() {
   return (
      <section aria-labelledby="home-entry-heading" className="relative overflow-hidden border-t border-border/50 py-20 md:py-28">
         <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-gold/[0.04]" />
         <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [--grid:color-mix(in_oklab,var(--foreground)_4%,transparent)] bg-[linear-gradient(to_right,var(--grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid)_1px,transparent_1px)] bg-[size:32px_32px]"
         />
         <PageContainer className="relative">
            <SectionIntro id="home-entry-heading" label={ENTRY_HEADING.label} title={ENTRY_HEADING.heading} lead={ENTRY_HEADING.lead} />
            <ul className="m-0 mx-auto grid max-w-6xl list-none gap-5 p-0 lg:grid-cols-3">
               {ENTRY_POINTS.map(({ key, title, href, description, action }) => {
                  const Icon = ENTRY_ICONS[key];
                  return (
                     <li key={key} className="flex">
                        <Link
                           href={href}
                           prefetch={PREFETCH_PRIMARY}
                           aria-labelledby={`entry-${key}-title entry-${key}-action`}
                           aria-describedby={`entry-${key}-description`}
                           className="group flex w-full flex-col overflow-hidden wrap-anywhere rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.04] transition-[color,background-color,border-color,box-shadow,transform] duration-300 hover:border-gold/50 hover:shadow-xl hover:shadow-gold/10 motion-safe:hover:scale-[1.02]"
                        >
                           <span aria-hidden="true" className="h-1 w-full bg-gradient-to-r from-primary via-gold/70 to-primary/40" />
                           <span className="flex flex-1 flex-col p-6">
                              <span
                                 aria-hidden="true"
                                 className="mb-5 flex size-14 items-center justify-center rounded-xl border border-primary/10 bg-primary/10 text-primary transition-micro group-hover:border-primary/20 group-hover:bg-primary/15"
                              >
                                 <Icon className="size-7" />
                              </span>
                              <h3 id={`entry-${key}-title`} className="m-0 text-xl font-bold transition-micro group-hover:text-premium">
                                 {title}
                              </h3>
                              <p id={`entry-${key}-description`} className="mt-3 mb-6 text-supporting text-pretty text-muted-foreground">
                                 {description}
                              </p>
                              <span
                                 id={`entry-${key}-action`}
                                 className="mt-auto inline-flex items-center gap-2 border-t border-border/40 pt-4 text-sm font-bold text-premium"
                              >
                                 {action}
                                 <ArrowRight
                                    aria-hidden="true"
                                    className="size-4 transition-transform duration-(--duration-fast) ease-standard group-hover:translate-x-0.5"
                                 />
                              </span>
                           </span>
                        </Link>
                     </li>
                  );
               })}
            </ul>
            <p className="mx-auto mt-14 mb-0 max-w-reading text-center text-body text-pretty text-muted-foreground">{CONNECTION}</p>
         </PageContainer>
      </section>
   );
}

function Faq() {
   return (
      <section id="faq" aria-labelledby="home-faq-heading" className="scroll-mt-20 border-t border-border/50 bg-surface py-20 md:py-28">
         <PageContainer>
            <SectionIntro id="home-faq-heading" label={FAQ.label} title={FAQ.heading} />
            <div className="mx-auto flex max-w-2xl flex-col gap-3">
               {FAQ.items.map(({ q, a }) => (
                  <div key={q} className="overflow-hidden rounded-xl border border-border/60 bg-card px-5">
                     <Disclosure level="h3" compact title={q}>
                        <p className="m-0 pb-4 text-supporting leading-relaxed text-pretty text-muted-foreground">{a}</p>
                     </Disclosure>
                  </div>
               ))}
            </div>
         </PageContainer>
      </section>
   );
}

/** The homepage is a vertical sequence of sections: a later section (e.g. learner state) joins the flow without restructuring. */
export function HomeContent() {
   return (
      <>
         <main>
            <Hero />
            <Premium />
            <EntryPoints />
            <Faq />
         </main>
         <Footer />
      </>
   );
}
