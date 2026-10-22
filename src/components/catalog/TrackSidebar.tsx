import Link from "next/link";
import { ChevronRight, PencilRuler } from "lucide-react";
import type { TrackSidebarOutline } from "@/lib/catalog/outline";
import { cn } from "@/lib/utils";
import { PremiumMark } from "./EntryRow";

/**
 * A Track's contents beside the page that reads one of its items (S6-RDR-3, -5): the whole list is in the server's HTML and
 * each Module is a native `<details>`, so it reads and collapses without JavaScript. The current Module starts open. No link
 * prefetches, since a Track can hold dozens and each target page would read the catalog.
 */
export function TrackSidebar({ outline, className }: { outline: TrackSidebarOutline; className?: string }) {
   const { title, href, groups } = outline;
   return (
      <nav aria-label="Track contents" className={cn("space-y-4", className)}>
         <p className="m-0 text-body font-semibold leading-snug">
            {href ? (
               <Link href={href} prefetch={false} className="text-foreground transition-micro hover:text-primary">
                  {title}
               </Link>
            ) : (
               title
            )}
         </p>
         <div className="space-y-1">
            {groups.map((group) => (
               <details key={group.key} open={group.current} className="group border-t border-border pt-1">
                  <summary className="flex min-h-9 cursor-pointer list-none items-start gap-2 py-1.5 text-supporting [&::-webkit-details-marker]:hidden">
                     <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                     <span className="min-w-0 flex-1">
                        <span className="block font-normal text-muted-foreground">Module {group.number}</span>
                        <span className="block font-semibold text-foreground">{group.title}</span>
                     </span>
                     <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {group.entries.length}
                        <span className="sr-only"> {group.entries.length === 1 ? "item" : "items"}</span>
                     </span>
                  </summary>
                  <ol className="m-0 list-none space-y-0.5 p-0 pb-2">
                     {group.entries.map((entry) => (
                        <li key={entry.id}>
                           <Link
                              href={entry.href}
                              prefetch={false}
                              aria-current={entry.current ? "page" : undefined}
                              className={cn(
                                 "block rounded-md border-l-2 py-1.5 pr-2 pl-3 text-supporting leading-snug transition-micro",
                                 entry.current
                                    ? "border-primary bg-muted font-semibold text-foreground"
                                    : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                              )}
                           >
                              {entry.title}
                              {entry.kind || entry.access === "premium" ? (
                                 <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal text-muted-foreground">
                                    {entry.kind ? (
                                       <span className="inline-flex items-center gap-1">
                                          <PencilRuler aria-hidden="true" className="size-3.5" />
                                          {entry.kind}
                                       </span>
                                    ) : null}
                                    {entry.access === "premium" ? <PremiumMark /> : null}
                                 </span>
                              ) : null}
                           </Link>
                        </li>
                     ))}
                  </ol>
               </details>
            ))}
         </div>
      </nav>
   );
}
