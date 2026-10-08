import Link from "next/link";
import { ArrowRight, BookOpen, Check, Network, Sparkles, Target, type LucideIcon } from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { PREFETCH_PRIMARY } from "@/lib/primary-navigation";
import { CONNECTION, ENTRY_HEADING, ENTRY_POINTS, FAQ, HERO, HERO_AREAS, HERO_TOPICS, PREMIUM, PRICING } from "./home-copy";
import { RotatingTopic } from "./RotatingTopic";

const ENTRY_ICONS: Record<(typeof ENTRY_POINTS)[number]["key"], LucideIcon> = {
   learn: BookOpen,
   knowledge: Network,
   practice: Target,
};

/** Entrance motion for the hero only; `motion-safe` leaves the content visible and still when motion is reduced. */
const ENTER = "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-backwards motion-safe:duration-500";

function SectionIntro({ label, children, lead }: { label: string; children: React.ReactNode; lead?: string }) {
   return (
      <div className="mx-auto mb-10 max-w-reading text-center md:mb-14">
         <Badge variant="outline" className="mb-4 border-primary/30 px-3 py-1 text-supporting text-primary">
            {label}
         </Badge>
         {children}
         {lead ? <p className="mt-4 mb-0 text-body text-pretty text-muted-foreground">{lead}</p> : null}
      </div>
   );
}

function Hero() {
   return (
      <section aria-labelledby="home-heading" className="relative isolate overflow-hidden">
         {/* Decoration only: a hairline grid that fades out, and a soft glow from the accent. */}
         <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_75%_at_50%_0%,#000_30%,transparent_100%)]" />
            <div className="absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(ellipse_45%_70%_at_50%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_100%)]" />
         </div>

         <PageContainer className="flex flex-col items-center py-16 text-center md:py-24 lg:py-28">
            <div className={ENTER}>
               <Badge variant="outline" className="gap-2 border-primary/30 bg-primary/[0.08] px-3 py-1 text-supporting text-primary [&>svg]:size-3.5">
                  <Sparkles aria-hidden="true" />
                  {HERO.eyebrow}
               </Badge>
            </div>

            <h1 id="home-heading" className={`${ENTER} mt-6 mb-0 max-w-4xl text-display text-balance delay-100`}>
               {HERO.lead} <RotatingTopic topics={HERO_TOPICS} label={HERO.subject} /> {HERO.tail}
            </h1>

            <p className={`${ENTER} mt-6 mb-0 max-w-2xl text-body text-pretty text-muted-foreground delay-150 md:text-subsection md:font-normal`}>
               {HERO.body}
            </p>

            <ul className={`${ENTER} m-0 mt-8 flex max-w-3xl list-none flex-wrap justify-center gap-3 p-0 delay-200`}>
               {HERO_AREAS.map((area) => (
                  <li
                     key={area}
                     className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-supporting font-medium"
                  >
                     <Check aria-hidden="true" className="size-4 text-primary" />
                     {area}
                  </li>
               ))}
            </ul>

            <div className={`${ENTER} mt-10 flex w-full flex-col items-stretch justify-center gap-3 delay-300 sm:w-auto sm:flex-row sm:items-center`}>
               <Button asChild size="lg" className="h-12 rounded-xl px-8 text-body font-semibold">
                  <Link href={HERO.primaryAction.href} prefetch={PREFETCH_PRIMARY}>
                     {HERO.primaryAction.label}
                     <ArrowRight aria-hidden="true" className="size-5" />
                  </Link>
               </Button>
               <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-xl px-8 text-body font-semibold hover:bg-surface hover:text-foreground"
               >
                  <Link href={HERO.secondaryAction.href}>{HERO.secondaryAction.label}</Link>
               </Button>
            </div>
         </PageContainer>
      </section>
   );
}

/** Three equal doors into the product; each is one link, named by its title and action. */
function EntryPoints() {
   return (
      <section aria-labelledby="home-entry-heading" className="border-t border-border py-16 md:py-24">
         <PageContainer>
            <SectionIntro label={ENTRY_HEADING.label} lead={ENTRY_HEADING.lead}>
               <h2 id="home-entry-heading" className="m-0 text-section text-balance">
                  {ENTRY_HEADING.heading}
               </h2>
            </SectionIntro>
            <ul className="m-0 grid list-none gap-4 p-0 lg:grid-cols-3 lg:gap-6">
               {ENTRY_POINTS.map(({ key, title, href, description, action }) => {
                  const Icon = ENTRY_ICONS[key];
                  return (
                     <li key={key} className="flex">
                        <Link
                           href={href}
                           prefetch={PREFETCH_PRIMARY}
                           aria-labelledby={`entry-${key}-title entry-${key}-action`}
                           aria-describedby={`entry-${key}-description`}
                           className="group flex w-full flex-col overflow-hidden wrap-anywhere rounded-xl border border-border bg-surface transition-micro hover:border-foreground/30"
                        >
                           <span aria-hidden="true" className="h-1 w-full bg-gradient-to-r from-primary via-primary/50 to-primary/10" />
                           <span className="flex flex-1 flex-col p-6 md:p-8">
                              <span
                                 aria-hidden="true"
                                 className="mb-6 flex size-12 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary transition-micro group-hover:bg-primary/15"
                              >
                                 <Icon className="size-6" />
                              </span>
                              <h3 id={`entry-${key}-title`} className="m-0 text-section">
                                 {title}
                              </h3>
                              <p id={`entry-${key}-description`} className="mt-3 mb-8 text-body text-pretty text-muted-foreground">
                                 {description}
                              </p>
                              <span
                                 id={`entry-${key}-action`}
                                 className="mt-auto inline-flex items-center gap-1.5 border-t border-border pt-4 text-supporting font-medium text-primary"
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
            <p className="mx-auto mt-12 mb-0 max-w-reading text-center text-body text-pretty text-muted-foreground">{CONNECTION}</p>
         </PageContainer>
      </section>
   );
}

/** Access, kept calm: what is free, what is planned, the planned prices for information, and that nothing is for sale. No purchase action. */
function Premium() {
   return (
      <section id="access" aria-labelledby="home-premium-heading" className="scroll-mt-20 border-t border-border bg-surface py-16 md:py-24">
         <PageContainer>
            <SectionIntro label={PREMIUM.label} lead={PREMIUM.lead}>
               <h2 id="home-premium-heading" className="m-0 text-section text-balance">
                  {PREMIUM.heading}
               </h2>
            </SectionIntro>

            <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2 md:gap-6">
               <div className="flex flex-col rounded-xl border border-border bg-background p-6 md:p-8">
                  <p className="m-0 text-supporting font-medium text-muted-foreground">{PREMIUM.free.label}</p>
                  <h3 className="mt-2 mb-0 text-subsection">{PREMIUM.free.title}</h3>
                  <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0 text-supporting text-muted-foreground">
                     {PREMIUM.free.points.map((point) => (
                        <li key={point} className="flex items-start gap-3">
                           <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                           {point}
                        </li>
                     ))}
                  </ul>
                  <Button asChild variant="outline" size="lg" className="mt-8 h-11 rounded-xl font-semibold hover:bg-surface hover:text-foreground">
                     <Link href={PREMIUM.free.action.href} prefetch={PREFETCH_PRIMARY}>
                        {PREMIUM.free.action.label}
                     </Link>
                  </Button>
               </div>

               <div className="flex flex-col rounded-xl border border-premium/40 bg-gradient-to-b from-premium/[0.08] to-background p-6 md:p-8">
                  <p className="m-0 text-supporting font-medium text-premium">{PREMIUM.full.label}</p>
                  <h3 className="mt-2 mb-0 text-subsection">{PREMIUM.full.title}</h3>
                  <p className="mt-5 mb-0 text-supporting text-pretty text-muted-foreground">{PREMIUM.full.body}</p>
                  <p className="mt-auto pt-8 mb-0 text-supporting font-medium text-pretty text-foreground">{PREMIUM.note}</p>
               </div>
            </div>

            <div className="mx-auto mt-4 max-w-3xl rounded-xl border border-border bg-background p-6 md:mt-6 md:p-8">
               <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-6">
                  <p id="home-pricing-label" className="m-0 text-supporting font-medium text-premium">
                     {PRICING.label}
                  </p>
                  <p className="m-0 text-supporting text-pretty text-muted-foreground">{PRICING.note}</p>
               </div>
               <ul aria-labelledby="home-pricing-label" className="m-0 mt-5 grid list-none gap-3 p-0 sm:grid-cols-3">
                  {PRICING.plans.map((plan) => (
                     <li key={plan} className="rounded-lg border border-border bg-surface px-4 py-4 text-subsection font-semibold tabular-nums">
                        {plan}
                     </li>
                  ))}
               </ul>
            </div>
         </PageContainer>
      </section>
   );
}

function Faq() {
   return (
      <section id="faq" aria-labelledby="home-faq-heading" className="scroll-mt-20 border-t border-border py-16 md:py-24">
         <PageContainer>
            <SectionIntro label={FAQ.label}>
               <h2 id="home-faq-heading" className="m-0 text-section text-balance">
                  {FAQ.heading}
               </h2>
            </SectionIntro>
            <div className="mx-auto flex max-w-reading flex-col gap-3">
               {FAQ.items.map(({ q, a }) => (
                  <div key={q} className="rounded-xl border border-border bg-surface px-5">
                     <Disclosure level="h3" compact title={q}>
                        <p className="m-0 pb-4 text-body text-pretty text-muted-foreground">{a}</p>
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
            <EntryPoints />
            <Premium />
            <Faq />
         </main>
         <Footer />
      </>
   );
}
