import type { Metadata } from "next";
import { PreviewMarker } from "@/app/_catalog/PreviewMarker";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { CheckoutReturn } from "@/components/pricing/CheckoutReturn";
import { isSessionId } from "@/lib/billing/client";

export const metadata: Metadata = {
   title: "Confirming your payment | InterviewNotes",
   robots: { index: false, follow: false },
   referrer: "no-referrer",
};

/** Stripe's success URL (payment-spec §6.1). The `session_id` only tells the backend which session to verify; nothing here reads success from the URL. */
export default async function PricingReturnPage({ searchParams }: { searchParams: Promise<{ session_id?: string | string[] }> }) {
   const { session_id: raw } = await searchParams;
   const candidate = Array.isArray(raw) ? raw[0] : raw;
   return (
      <>
         <PreviewMarker />
         <div data-pricing>
            <PageContainer as="main" className="py-12 md:py-16">
               <div className="mx-auto max-w-4xl">
                  <CheckoutReturn apiUrl={process.env.NEXT_PUBLIC_API_URL || null} sessionId={isSessionId(candidate) ? candidate : null} />
               </div>
            </PageContainer>
            <Footer />
         </div>
      </>
   );
}
