import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogResult } from "@/lib/catalog/types";

export type BlockedState = Exclude<CatalogResult<unknown>["status"], "ok" | "notFound">;

const MESSAGES: Record<BlockedState, string> = {
   unauthenticated: "Sign in to read this content.",
   unentitled: "Paid access is not available yet.",
   retired: "This content has been retired.",
   unavailable: "This content is temporarily unavailable. Please try again later.",
};

/** What a reader sees instead of a body the API did not provide; never any backend detail. */
export function CatalogStateNotice({ state, signInPath }: { state: BlockedState; signInPath?: string }) {
   const locked = state === "unauthenticated" || state === "unentitled";
   return (
      <div role="status" className="rounded-lg bg-surface px-6 py-12 text-center">
         {locked ? <Lock className="mx-auto mb-3 h-6 w-6 text-premium" /> : null}
         <p className="mb-4 text-body text-muted-foreground last:mb-0">{MESSAGES[state]}</p>
         {state === "unauthenticated" ? (
            <Button asChild className="bg-foreground text-background hover:bg-foreground/90 h-8 text-sm">
               <Link href={signInPath ? `/login?redirect=${encodeURIComponent(signInPath)}` : "/login"}>Sign in</Link>
            </Button>
         ) : null}
      </div>
   );
}
