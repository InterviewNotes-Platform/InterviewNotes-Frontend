import Link from "next/link";
import { problemCategoryLabel } from "@/lib/catalog/problem";
import type { TrackPlacement } from "@/lib/catalog/navigation";
import { catalogEntryHref } from "@/lib/catalog/routes";
import type { CatalogMeta } from "@/lib/catalog/types";
import { PRACTICE_HREF } from "@/lib/primary-navigation";
import { cn } from "@/lib/utils";
import { DIFFICULTY_LABEL, LEVEL_LABEL, PremiumMark } from "./EntryRow";

const QUIET = "m-0 text-supporting text-muted-foreground";

/**
 * A Problem's identity from public metadata alone, so a locked Problem shows it too. Difficulty and level lead as the
 * two largest facts (a Problem sets an expectation, unlike a Lesson); the category, topics and the home Track stay
 * quiet. The Track is placement context only (never a relation) and is absent unless the Problem was released.
 */
export function ProblemHeader({ meta, placement }: { meta: CatalogMeta; placement?: TrackPlacement | null }) {
   const facts = [
      { label: "Difficulty", value: meta.difficulty && DIFFICULTY_LABEL[meta.difficulty] },
      { label: "Level", value: meta.level && LEVEL_LABEL[meta.level] },
   ].filter(({ value }) => value);
   const category = problemCategoryLabel(meta.category);
   const trackHref = placement && catalogEntryHref({ ...placement.track, type: "track" });

   return (
      <header>
         <nav aria-label="Breadcrumb" className="mb-6 text-supporting text-muted-foreground">
            <Link href={PRACTICE_HREF} prefetch={false} className="font-medium text-foreground transition-micro hover:text-primary">
               Practice
            </Link>
         </nav>
         <h1 className="m-0 text-title text-balance">{meta.title}</h1>
         {meta.summary ? <p className="mt-4 mb-0 text-body text-pretty text-muted-foreground">{meta.summary}</p> : null}
         {facts.length > 0 ? (
            <dl className="mt-8 mb-0 flex flex-wrap gap-x-12 gap-y-4">
               {facts.map(({ label, value }) => (
                  <div key={label}>
                     <dt className="text-supporting font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
                     <dd className="m-0 mt-1 text-subsection text-foreground">{value}</dd>
                  </div>
               ))}
            </dl>
         ) : null}
         <div className="mt-6 space-y-2 empty:hidden">
            {category || meta.access === "premium" ? (
               <p className={cn(QUIET, "flex flex-wrap items-center gap-x-3 gap-y-1")}>
                  {category ? (
                     <span>
                        <span className="sr-only">Category: </span>
                        {category}
                     </span>
                  ) : null}
                  {meta.access === "premium" ? <PremiumMark /> : null}
               </p>
            ) : null}
            {placement ? (
               <p className={QUIET}>
                  Part of{" "}
                  {trackHref ? (
                     <Link href={trackHref} prefetch={false} className="font-medium text-foreground transition-micro hover:text-primary">
                        {placement.track.title}
                     </Link>
                  ) : (
                     placement.track.title
                  )}
                  {" / "}
                  {placement.module.title}
               </p>
            ) : null}
            {meta.tags.length > 0 ? (
               <p className={QUIET}>
                  Topics: {meta.tags.join(" · ")}
               </p>
            ) : null}
         </div>
      </header>
   );
}
