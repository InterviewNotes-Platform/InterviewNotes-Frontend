"use client";

import { useState } from "react";
import { Pause, Play, Quote } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { SectionIntro } from "./SectionIntro";
import { TESTIMONIALS, TESTIMONIALS_SECTION } from "./home-copy";

type Testimonial = (typeof TESTIMONIALS)[number];

const ROWS = [
   { track: "testimonial-scroll-left", items: TESTIMONIALS.slice(0, 4), label: "Testimonials, first row" },
   { track: "testimonial-scroll-right", items: TESTIMONIALS.slice(4), label: "Testimonials, second row" },
] as const;

function Card({ t, copy }: { t: Testimonial; copy?: boolean }) {
   return (
      <li aria-hidden={copy || undefined} className={`mx-2.5 flex w-[350px] shrink-0 ${copy ? "motion-reduce:hidden" : ""}`}>
         <figure className="m-0 w-full rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur-sm">
            <Quote aria-hidden="true" className="mb-3 size-5 text-gold/60" />
            <blockquote className="m-0 mb-4 text-sm leading-relaxed text-foreground/90">&ldquo;{t.quote}&rdquo;</blockquote>
            <figcaption className="flex items-center gap-3 border-t border-border/30 pt-3">
               <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-(--primary-text)">
                  {t.initials}
               </span>
               <span>
                  <span className="block text-sm font-semibold">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">
                     {t.role} at {t.company}
                  </span>
               </span>
            </figcaption>
         </figure>
      </li>
   );
}

/** Two rows of testimonials that drift in opposite directions; hover, focus or the button pauses them, and reduced motion stops them. */
export function Testimonials() {
   const [paused, setPaused] = useState(false);

   return (
      <section aria-labelledby="home-testimonials-heading" data-paused={paused} className="overflow-hidden border-t border-border/50 py-20 md:py-28">
         <PageContainer>
            <SectionIntro id="home-testimonials-heading" label={TESTIMONIALS_SECTION.label} title={TESTIMONIALS_SECTION.heading} lead={TESTIMONIALS_SECTION.lead} />
            <div className="-mt-6 mb-10 flex justify-center motion-reduce:hidden">
               <Button type="button" variant="outline" size="sm" onClick={() => setPaused((p) => !p)} className="gap-2 rounded-full">
                  {paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
                  {paused ? "Play testimonials" : "Pause testimonials"}
               </Button>
            </div>
         </PageContainer>
         {ROWS.map(({ track, items, label }, row) => (
            <div key={track} className={`relative overflow-hidden motion-reduce:overflow-x-auto ${row === 0 ? "mb-5" : ""}`}>
               <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
               <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />
               <ul role="list" aria-label={label} tabIndex={0} className={`${track} m-0 flex w-max list-none p-0`}>
                  {items.map((t) => (
                     <Card key={t.name} t={t} />
                  ))}
                  {items.map((t) => (
                     <Card key={`${t.name}-copy`} t={t} copy />
                  ))}
               </ul>
            </div>
         ))}
      </section>
   );
}
