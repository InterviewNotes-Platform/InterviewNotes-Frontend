import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { PREFETCH_PRIMARY } from "@/lib/primary-navigation";
import { CONNECTION, ENTRY_POINTS, HERO, PREMIUM } from "./home-copy";

function Hero() {
   return (
      <section aria-labelledby="home-heading">
         <h1 id="home-heading" className="m-0 max-w-3xl text-display text-balance">
            {HERO.heading}
         </h1>
         <p className="mt-6 mb-0 max-w-2xl text-body text-pretty text-muted-foreground md:text-subsection md:font-normal">{HERO.lead}</p>
      </section>
   );
}

/** Three equal doors into the product; each is one link, named by its title and action. */
function EntryPoints() {
   return (
      <section aria-labelledby="home-entry-heading">
         <h2 id="home-entry-heading" className="sr-only">
            Where to start
         </h2>
         <ul className="m-0 grid list-none gap-4 p-0 lg:grid-cols-3 lg:gap-6">
            {ENTRY_POINTS.map(({ key, title, href, description, action }) => (
               <li key={key} className="flex">
                  <Link
                     href={href}
                     prefetch={PREFETCH_PRIMARY}
                     aria-labelledby={`entry-${key}-title entry-${key}-action`}
                     aria-describedby={`entry-${key}-description`}
                     className="group flex w-full flex-col wrap-anywhere rounded-xl border border-border bg-surface p-6 transition-micro hover:border-foreground/30 md:p-8"
                  >
                     <h3 id={`entry-${key}-title`} className="m-0 text-section">
                        {title}
                     </h3>
                     <p id={`entry-${key}-description`} className="mt-3 mb-0 text-body text-pretty text-muted-foreground">
                        {description}
                     </p>
                     <span id={`entry-${key}-action`} className="mt-auto inline-flex items-center gap-1.5 pt-8 text-supporting font-medium text-primary">
                        {action}
                        <ArrowRight
                           aria-hidden="true"
                           className="size-4 transition-transform duration-(--duration-fast) ease-standard group-hover:translate-x-0.5"
                        />
                     </span>
                  </Link>
               </li>
            ))}
         </ul>
         <p className="mt-12 mb-0 max-w-reading text-body text-pretty text-muted-foreground">{CONNECTION}</p>
      </section>
   );
}

function Premium() {
   return (
      <section aria-labelledby="home-premium-heading" className="border-t border-border pt-12 md:pt-16">
         <div className="grid gap-6 lg:grid-cols-3 lg:gap-6">
            <div>
               <p className="mb-2 text-supporting font-medium text-premium">{PREMIUM.label}</p>
               <h2 id="home-premium-heading" className="m-0 text-section text-balance">
                  {PREMIUM.heading}
               </h2>
            </div>
            <div className="max-w-reading lg:col-span-2">
               <p className="m-0 text-body text-pretty text-muted-foreground">{PREMIUM.body}</p>
               <p className="mt-4 mb-0 text-supporting text-muted-foreground">{PREMIUM.note}</p>
            </div>
         </div>
      </section>
   );
}

/** The homepage is a vertical sequence of sections: a later section (e.g. learner state) joins the flow without restructuring. */
export function HomeContent() {
   return (
      <>
         <PageContainer as="main" className="flex flex-col gap-16 py-16 md:gap-24 md:py-24">
            <Hero />
            <EntryPoints />
            <Premium />
         </PageContainer>
         <Footer />
      </>
   );
}
