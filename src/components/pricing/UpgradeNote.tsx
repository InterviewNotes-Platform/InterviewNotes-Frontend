import Link from "next/link";
import { purchaseEnabled } from "@/lib/purchase-flag";

/**
 * How to get Premium, for a reader the API has locked out (P8-PREM-05). With purchase on it links to /pricing; with it
 * off it states the plain fact, unless the caller's own message already does (`restates: false`).
 */
export function UpgradeNote({ restates = true }: { restates?: boolean }) {
   if (purchaseEnabled()) {
      return (
         <p className="mt-4 mb-0 text-supporting text-muted-foreground">
            <Link href="/pricing" prefetch={false} className="font-medium text-foreground underline underline-offset-4">
               See Premium plans and prices
            </Link>
         </p>
      );
   }
   return restates ? <p className="mt-4 mb-0 text-supporting text-muted-foreground">Paid access is not available yet.</p> : null;
}
