import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { practiceHref, type PracticeQuery } from "@/lib/catalog/practice";
import type { CatalogMeta } from "@/lib/catalog/types";
import { DiscoveryCard } from "./DiscoveryCard";
import { DIFFICULTY_LABEL, LEVEL_LABEL, PremiumMark } from "./EntryRow";
import { CardTopics } from "./KnowledgeBrowse";

/**
 * A Problem as a discovery surface, from list metadata alone. Difficulty and level lead the card (more prominent here than
 * on Lesson or Knowledge cards); topics are one quiet line; only a premium Problem carries an access mark.
 */
export function ProblemCard({ problem, href }: { problem: CatalogMeta; href: string }) {
   const { difficulty, level } = problem;
   return (
      <DiscoveryCard
         title={problem.title}
         summary={problem.summary}
         href={href}
         cue="Open Problem"
         eyebrow={
            <>
               {difficulty || level ? (
                  <span className="text-foreground">
                     {difficulty ? (
                        <>
                           <span className="sr-only">Difficulty: </span>
                           <span className="font-semibold">{DIFFICULTY_LABEL[difficulty]}</span>
                        </>
                     ) : null}
                     {difficulty && level ? <span aria-hidden="true"> · </span> : null}
                     {level ? (
                        <>
                           <span className="sr-only">Level: </span>
                           {LEVEL_LABEL[level]}
                        </>
                     ) : null}
                  </span>
               ) : null}
               {problem.access === "premium" ? <PremiumMark /> : null}
            </>
         }
         meta={problem.tags.length > 0 ? <CardTopics tags={problem.tags} /> : undefined}
      />
   );
}

/** The one status region of the results: a short count, so a screen reader hears what changed without the cards being read twice. */
export function ProblemCount({ count }: { count: number }) {
   return (
      <p role="status" className="m-0 text-supporting text-muted-foreground">
         Showing {count} {count === 1 ? "Problem" : "Problems"}
      </p>
   );
}

const NOTICE = "rounded-lg bg-surface px-6 py-12 text-center";
const NOTICE_LINK = "inline-flex min-h-11 items-center text-body text-primary underline underline-offset-4";

/** What an empty list means: nothing published yet, nothing matching the filters, or a stale cursor past the end. */
export function NoProblems({ query, filtered }: { query: PracticeQuery; filtered: boolean }) {
   if (filtered) {
      return (
         <div role="status" className={NOTICE}>
            <p className="mb-2 text-body text-muted-foreground">No Problems match the current filters.</p>
            <Link href={practiceHref()} prefetch={false} className={NOTICE_LINK}>
               Clear filters
            </Link>
         </div>
      );
   }
   if (query.cursor) {
      return (
         <div role="status" className={NOTICE}>
            <p className="mb-2 text-body text-muted-foreground">There are no more Problems here.</p>
            <Link href={practiceHref()} prefetch={false} className={NOTICE_LINK}>
               Back to the first page
            </Link>
         </div>
      );
   }
   return (
      <div role="status" className={NOTICE}>
         <p className="m-0 text-body text-muted-foreground">Problems arrive soon. Please check back.</p>
      </div>
   );
}

/** Cursor paging only: the API's cursor is opaque, so there is a way onward that keeps every filter, and a way back to the start. */
export function ProblemPager({ query, next }: { query: PracticeQuery; next: string | null }) {
   if (!next && !query.cursor) return null;
   return (
      <nav aria-label="Pagination" className="mt-10 flex items-center gap-4 border-t border-border pt-6 text-body">
         {query.cursor ? (
            <Link href={practiceHref({ ...query, cursor: null })} prefetch={false} className="font-medium transition-micro hover:text-primary">
               First page
            </Link>
         ) : null}
         {next ? (
            <Link href={practiceHref({ ...query, cursor: next })} prefetch={false} rel="next" className="ml-auto inline-flex items-center gap-1 font-medium text-primary">
               Next page
               <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
         ) : null}
      </nav>
   );
}
