import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import { LinkPending } from "./LinkPending";

type PendingLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, "prefetch"> & {
   /** The link stretches over a positioned row (`after:absolute after:inset-0`); the hint then spans that row. */
   stretched?: boolean;
};

/**
 * P8-RSP-02 v3: a never-prefetched link that acknowledges a click in the next frame with `LinkPending`, so a
 * curriculum, related-content or reader link gives feedback without a route loading boundary (whose React fallback
 * throttle holds an otherwise fast page back to ~300 ms). It makes no request before the click.
 */
export function PendingLink({ className, children, stretched = false, ...props }: PendingLinkProps) {
   return (
      <Link {...props} prefetch={false} className={cn(!stretched && "relative", className)}>
         {children}
         <LinkPending />
      </Link>
   );
}
