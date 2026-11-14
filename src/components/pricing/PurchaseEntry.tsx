import { CheckoutPanel } from "@/components/pricing/CheckoutPanel";
import { PRICING_COPY } from "@/lib/pricing";
import { purchaseEnabled } from "@/lib/purchase-flag";

/**
 * The one place purchase controls live (P8-T33). Flag off: the truthful unavailable notice, no control and no request.
 * Flag on: the checkout panel, which asks the API for a hosted session; the flag only shows controls, it never grants access.
 */
export function PurchaseEntry() {
   if (purchaseEnabled()) return <CheckoutPanel apiUrl={process.env.NEXT_PUBLIC_API_URL || null} />;
   return (
      <div role="status" data-purchase-entry="off" className="rounded-lg border border-border bg-surface px-5 py-4">
         <p className="m-0 text-body font-semibold text-foreground">{PRICING_COPY.unavailable}</p>
         <p className="mt-2 mb-0 text-supporting text-muted-foreground">{PRICING_COPY.unavailableDetail}</p>
      </div>
   );
}
