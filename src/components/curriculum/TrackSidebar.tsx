"use client";

import { useId, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronRight, PencilRuler } from "lucide-react";
import { filterOutline, type TrackSidebarOutline } from "@/lib/catalog/outline";
import { cn } from "@/lib/utils";
import { PremiumMark } from "@/components/catalog/EntryRow";

const subscribe = () => () => {};
/** False in the server HTML and while hydrating, so the filter, which needs JavaScript, is absent until it can work. */
const useHydrated = () => useSyncExternalStore(subscribe, () => true, () => false);

const NO_MATCH = "No entries match";

/**
 * A Track's contents beside the page that reads one of its items (S6-RDR-3, -5): the whole list is in the server's HTML and
 * each Module is a native `<details>`, so it reads and collapses without JavaScript. The current Module starts open. No link
 * prefetches, since a Track can hold dozens and each target page would read the catalog. The title filter narrows the rendered
 * list in the browser (S6-RDR-4). `touch` gives the drawer's 44 px targets; `onNavigate` lets the drawer close on a choice.
 */
export function TrackSidebar({
   outline,
   className,
   touch = false,
   onNavigate,
}: {
   outline: TrackSidebarOutline;
   className?: string;
   touch?: boolean;
   onNavigate?: () => void;
}) {
   const { title, href } = outline;
   const hydrated = useHydrated();
   const [query, setQuery] = useState("");
   const filterId = useId();
   const filtering = query.trim() !== "";
   const { groups, count } = filterOutline(outline.groups, query);
   const announcement = !filtering ? "" : count === 0 ? NO_MATCH : `${count} ${count === 1 ? "match" : "matches"}`;

   return (
      <nav aria-label="Track contents" className={cn("space-y-4", className)}>
         <p className="m-0 text-body font-semibold leading-snug">
            {href ? (
               <Link href={href} prefetch={false} onClick={onNavigate} className="text-foreground transition-micro hover:text-primary">
                  {title}
               </Link>
            ) : (
               title
            )}
         </p>
         {hydrated ? (
            <div>
               <label htmlFor={filterId} className="sr-only">
                  Filter by title
               </label>
               <input
                  id={filterId}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by title"
                  autoComplete="off"
                  className={cn(
                     "w-full rounded-md border border-input bg-transparent px-3 text-supporting text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                     touch ? "min-h-11" : "h-9"
                  )}
               />
               <p role="status" className="sr-only">
                  {announcement}
               </p>
            </div>
         ) : null}
         {filtering && count === 0 ? <p className="m-0 text-supporting text-muted-foreground">{NO_MATCH}</p> : null}
         <div className="space-y-1">
            {groups.map((group) => (
               <details key={group.key} open={filtering || group.current} className="group border-t border-border pt-1">
                  <summary
                     className={cn(
                        "flex cursor-pointer list-none items-start gap-2 py-1.5 text-supporting [&::-webkit-details-marker]:hidden",
                        touch ? "min-h-11" : "min-h-9"
                     )}
                  >
                     <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" />
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
                              onClick={onNavigate}
                              aria-current={entry.current ? "page" : undefined}
                              className={cn(
                                 "rounded-md border-l-2 py-1.5 pr-2 pl-3 text-supporting leading-snug transition-micro",
                                 touch ? "flex min-h-11 flex-col justify-center" : "block",
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
