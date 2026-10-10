"use client";

import { useId, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReveal } from "./RevealProvider";

interface ProblemRevealProps {
   /** The visible action: what the control shows (S-RVL-4). */
   label: string;
   /** Read after the label by assistive technology only, to say where, when the label alone does not. */
   context?: string;
   /** Set quieter than a stage's reference controls (hints, S-HNT-8). */
   quiet?: boolean;
   /** A unit's section id: its reveal is keyed by it, so a fragment naming the unit can open it (S-RVL-8). */
   unit?: string;
   children: ReactNode;
}

/**
 * One reveal as a native disclosure: closed in the server HTML, opened by its own control with or without JavaScript, and
 * never holding a heading in its summary (S-RVL-11, S-RVL-12, S-RVL-12a). Its panel follows the control in reading order.
 * Once interactive, the page's reveal state holds its `open` (S-RVL-7); outside a page owner it stays plain native.
 */
export function ProblemReveal({ label, context, quiet = false, unit, children }: ProblemRevealProps) {
   const generated = useId();
   const key = unit ?? generated;
   const reveal = useReveal(key);
   return (
      <details data-reveal={key} className="mt-3" open={reveal?.open} onToggle={reveal?.onToggle}>
         <summary
            className={cn(
               "flex min-h-11 w-full cursor-pointer list-none items-center gap-2 rounded-sm font-semibold transition-micro hover:text-primary [&::-webkit-details-marker]:hidden",
               quiet ? "text-supporting text-muted-foreground" : "text-body"
            )}
         >
            {/* Turned by its own disclosure only: `group-open` would also match an open reveal around this one. */}
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 motion-safe:transition-transform [[open]>summary>&]:rotate-90" />
            <span>
               {label}
               {context ? <span className="sr-only">{context}</span> : null}
            </span>
         </summary>
         <div className="mt-4 mb-6 border-l border-border pl-5">{children}</div>
      </details>
   );
}
