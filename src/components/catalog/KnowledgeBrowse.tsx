import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";
import { KNOWLEDGE_GROUPS, explorerHref, type ExplorerQuery, type KnowledgeGroup } from "@/lib/catalog/knowledge";
import { cn } from "@/lib/utils";

/** The four editorial entry points: links, not cards. The current one is marked; none prefetches, as each reads the list. */
export function KnowledgeCategories({ current }: { current: KnowledgeGroup | null }) {
   return (
      <nav aria-label="Knowledge categories">
         <ul role="list" className="m-0 grid list-none gap-x-8 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {KNOWLEDGE_GROUPS.map((group) => {
               const active = group.id === current?.id;
               return (
                  <li key={group.id}>
                     <Link
                        href={explorerHref({ group })}
                        prefetch={false}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                           "block border-t-2 py-5 transition-micro hover:border-muted-foreground",
                           active ? "border-foreground" : "border-border"
                        )}
                     >
                        <span className="block text-subsection text-balance">{group.label}</span>
                        <span className="mt-1 block text-supporting text-pretty text-muted-foreground">{group.summary}</span>
                     </Link>
                  </li>
               );
            })}
         </ul>
      </nav>
   );
}

const PILL =
   "inline-flex min-h-9 items-center rounded-full border border-border px-3 text-supporting transition-micro hover:border-foreground aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background";

/** Topical discovery beside the categories, kept quiet: tags are collapsed until wanted or in use. Tags never replace categories. */
export function TopicTags({ tags, query }: { tags: string[]; query: ExplorerQuery }) {
   if (tags.length === 0 && !query.tag) return null;
   return (
      <div className="mt-6 border-y border-border">
         <Disclosure compact level="h3" title="Browse by topic" detail={query.tag ?? tags.length} defaultOpen={query.tag !== null}>
            <nav aria-label="Browse by topic" className="pb-4">
               <ul role="list" className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
                  {tags.map((tag) => (
                     <li key={tag}>
                        <Link href={explorerHref({ group: query.group, tag })} prefetch={false} aria-current={tag === query.tag ? "page" : undefined} className={PILL}>
                           {tag}
                        </Link>
                     </li>
                  ))}
                  {query.tag ? (
                     <li>
                        <Link href={explorerHref({ group: query.group })} prefetch={false} className="inline-flex min-h-9 items-center px-2 text-supporting text-primary underline underline-offset-4">
                           Clear topic
                        </Link>
                     </li>
                  ) : null}
               </ul>
            </nav>
         </Disclosure>
      </div>
   );
}

/** Cursor paging only: the API's cursor is opaque, so there is a way onward and a way back to the start, never a page number. */
export function TopicPager({ query, next }: { query: ExplorerQuery; next: string | null }) {
   if (!next && !query.cursor) return null;
   const { group, tag } = query;
   return (
      <nav aria-label="Pagination" className="mt-10 flex items-center gap-4 border-t border-border pt-6 text-body">
         {query.cursor ? (
            <Link href={explorerHref({ group, tag })} prefetch={false} className="font-medium transition-micro hover:text-primary">
               First page
            </Link>
         ) : null}
         {next ? (
            <Link href={explorerHref({ group, tag, cursor: next })} prefetch={false} rel="next" className="ml-auto inline-flex items-center gap-1 font-medium text-primary">
               Next page
               <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
         ) : null}
      </nav>
   );
}
