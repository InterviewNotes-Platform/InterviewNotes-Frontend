import Link from "next/link";
import { categoryLabel, explorerHref, groupOf } from "@/lib/catalog/knowledge";
import type { CatalogMeta } from "@/lib/catalog/types";
import { PremiumMark } from "./EntryRow";

const CRUMB_LINK = "min-w-0 truncate font-medium text-foreground transition-micro hover:text-primary";

/**
 * The topic's identity from public metadata alone, so a locked topic shows it too. The breadcrumb leads back to Knowledge
 * and to the category group; the category itself is one quiet word under the summary, and absent when the item has none.
 */
export function KnowledgeHeader({ meta }: { meta: CatalogMeta }) {
   const label = categoryLabel(meta.category);
   const group = groupOf(meta.category);
   return (
      <header>
         <nav aria-label="Breadcrumb" className="mb-6 text-supporting text-muted-foreground">
            <ol className="m-0 flex min-w-0 list-none items-center gap-2 p-0">
               <li className="shrink-0">
                  <Link href={explorerHref()} prefetch={false} className={CRUMB_LINK}>
                     Knowledge
                  </Link>
               </li>
               {group ? (
                  <li className="flex min-w-0 items-center gap-2">
                     <span aria-hidden="true">/</span>
                     <Link href={explorerHref({ group })} prefetch={false} className={CRUMB_LINK}>
                        {group.label}
                     </Link>
                  </li>
               ) : null}
            </ol>
         </nav>
         <h1 className="m-0 text-title text-balance">{meta.title}</h1>
         {meta.summary ? <p className="mt-4 mb-0 text-body text-pretty text-muted-foreground">{meta.summary}</p> : null}
         {label || meta.access === "premium" ? (
            <p className="mt-5 mb-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-supporting text-muted-foreground">
               {label ? (
                  <span>
                     <span className="sr-only">Category: </span>
                     {label}
                  </span>
               ) : null}
               {meta.access === "premium" ? <PremiumMark /> : null}
            </p>
         ) : null}
      </header>
   );
}
