import Link from "next/link";
import { Lock } from "lucide-react";
import { UpgradeNote } from "@/components/pricing/UpgradeNote";
import { Button } from "@/components/ui/button";
import { purchaseEnabled } from "@/lib/purchase-flag";
import type { CatalogResult } from "@/lib/catalog/types";

export type BlockedState = Exclude<CatalogResult<unknown>["status"], "ok" | "notFound">;

const MESSAGES: Record<BlockedState, string> = {
   unauthenticated: "Sign in to read this content.",
   unentitled: "Paid access is not available yet.",
   retired: "This content has been retired.",
   unavailable: "This content is temporarily unavailable. Please try again later.",
};

/** A 401 or 402 is only ever sent for Premium content, so the notice may say so (P8-PREM-05); the API, not the browser, decided that. */
const PREMIUM_LINE = "This is Premium content.";

/** What a reader sees instead of a body the API did not provide; never any backend detail. */
export function CatalogStateNotice({ state, signInPath }: { state: BlockedState; signInPath?: string }) {
   const locked = state === "unauthenticated" || state === "unentitled";
   // Purchase off: the existing sentence already says paid access is unavailable. Purchase on: say what the account lacks, then link.
   const message = state === "unentitled" && purchaseEnabled() ? "Your account does not include Premium." : MESSAGES[state];
   return (
      <div role="status" className="rounded-lg bg-surface px-6 py-12 text-center">
         {locked ? <Lock className="mx-auto mb-3 h-6 w-6 text-premium" /> : null}
         <p className="mb-4 text-body text-muted-foreground last:mb-0">{message}</p>
         {locked ? <p className="mb-4 text-supporting text-muted-foreground last:mb-0">{PREMIUM_LINE}</p> : null}
         {state === "unauthenticated" ? (
            <Button asChild className="bg-foreground text-background hover:bg-foreground/90 h-8 text-sm">
               <Link href={signInPath ? `/login?redirect=${encodeURIComponent(signInPath)}` : "/login"}>Sign in</Link>
            </Button>
         ) : null}
         {locked ? <UpgradeNote restates={state === "unauthenticated"} /> : null}
      </div>
   );
}
