import Link from "next/link";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CatalogAccess, CatalogItemType } from "@/lib/catalog/types";

export const TYPE_LABEL: Record<CatalogItemType, string> = {
   knowledge: "Knowledge",
   lesson: "Lesson",
   problem: "Problem",
};

/** The API marks premium access; whether this reader holds it is decided only when the page loads. */
export function PremiumMark() {
   return (
      <Badge variant="outline" className="border-premium/40 bg-premium/10 font-semibold text-premium">
         <Lock aria-hidden="true" />
         Premium
      </Badge>
   );
}

interface EntryRowProps {
   entry: { title: string; type: CatalogItemType; access: CatalogAccess; summary?: string };
   /** A canonical route from `linkableEntries`. */
   href: string;
   current?: boolean;
}

/** One link to a catalog item. A premium target is marked and never prefetched. */
export function EntryRow({ entry, href, current = false }: EntryRowProps) {
   return (
      <li>
         <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
               href={href}
               prefetch={entry.access === "premium" ? false : undefined}
               aria-current={current ? "page" : undefined}
               className={cn("text-body font-medium transition-micro hover:text-primary", current ? "text-primary" : "text-foreground")}
            >
               {entry.title}
            </Link>
            <span className="text-supporting text-muted-foreground">{TYPE_LABEL[entry.type]}</span>
            {entry.access === "premium" ? <PremiumMark /> : null}
         </div>
         {entry.summary ? <p className="mt-1 mb-0 text-supporting text-muted-foreground">{entry.summary}</p> : null}
      </li>
   );
}
