import type { Metadata } from "next";
import Link from "next/link";
import { PreviewMarker, withPreviewRobots } from "@/app/_catalog/PreviewMarker";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { ComparisonTable } from "@/components/pricing/ComparisonTable";
import { PlanCards } from "@/components/pricing/PlanCards";
import { PurchaseEntry } from "@/components/pricing/PurchaseEntry";
import { PREMIUM_BASELINE, PRICING_COPY } from "@/lib/pricing";

export function generateMetadata(): Metadata {
   return withPreviewRobots({
      title: "Pricing | InterviewNotes",
      description: "The InterviewNotes plans, what is free, and what Premium includes today.",
   });
}

/** Static plan data and wording only: no entitlement, billing or catalogue read (spec §5), so it shows every reader the same page. */
export default function PricingPage() {
   return (
      <>
         <PreviewMarker />
         <div data-pricing>
            <PageContainer as="main" className="py-12 md:py-16">
               <div className="mx-auto flex max-w-4xl flex-col gap-12">
                  <header className="max-w-2xl">
                     <p className="m-0 text-xs font-semibold tracking-[0.12em] text-premium uppercase">{PRICING_COPY.title}</p>
                     <h1 className="m-0 mt-3 text-title text-balance">{PRICING_COPY.heading}</h1>
                     <p className="mt-4 mb-0 text-body text-pretty text-muted-foreground">{PRICING_COPY.lead}</p>
                  </header>

                  <PurchaseEntry />

                  <section aria-labelledby="plans-heading" className="flex flex-col gap-4">
                     <h2 id="plans-heading" className="m-0 text-section">Premium plans</h2>
                     <PlanCards />
                  </section>

                  <section aria-labelledby="free-heading" className="flex flex-col gap-3">
                     <h2 id="free-heading" className="m-0 text-section">Free</h2>
                     <p className="m-0 max-w-2xl text-body text-pretty text-muted-foreground">
                        Everything not marked Premium is free to read. Premium content is labelled wherever it appears.{" "}
                        <Link href="/tracks" className="font-medium text-foreground underline underline-offset-4">Browse the Tracks</Link> to see what is published.
                     </p>
                  </section>

                  <section aria-labelledby="compare-heading" className="flex flex-col gap-4">
                     <h2 id="compare-heading" className="m-0 text-section">What Premium includes today</h2>
                     <p className="m-0 max-w-2xl text-body text-pretty text-muted-foreground">
                        Premium opens the content marked Premium. As of {PREMIUM_BASELINE.asOf}, the published Premium material is {PREMIUM_BASELINE.lessons} and{" "}
                        {PREMIUM_BASELINE.problemSections}. It is a small set, and the rest of the library stays free.
                     </p>
                     <ComparisonTable />
                  </section>
               </div>
            </PageContainer>
            <Footer />
         </div>
      </>
   );
}
