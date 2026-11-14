import { PRICING_COPY } from "@/lib/pricing";
import { purchaseEnabled } from "@/lib/purchase-flag";

/**
 * The one place purchase controls will live. P8-T33 owns checkout (POST /me/billing/checkout and the hosted redirect), so
 * until it lands nothing here is operative: with the flag off or on, the page says plainly that no payment can be made.
 */
export function PurchaseEntry() {
   return (
      <div role="status" data-purchase-entry={purchaseEnabled() ? "on" : "off"} className="rounded-lg border border-border bg-surface px-5 py-4">
         <p className="m-0 text-body font-semibold text-foreground">{PRICING_COPY.unavailable}</p>
         <p className="mt-2 mb-0 text-supporting text-muted-foreground">{purchaseEnabled() ? PRICING_COPY.checkoutNotConnected : PRICING_COPY.unavailableDetail}</p>
      </div>
   );
}
