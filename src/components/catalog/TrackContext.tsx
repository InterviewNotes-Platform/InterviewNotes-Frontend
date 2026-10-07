import Link from "next/link";
import { catalogEntryHref } from "@/lib/catalog/routes";
import type { TrackPlacement } from "@/lib/catalog/navigation";
import type { CatalogOutlineEntry, CatalogTrack } from "@/lib/catalog/types";
import { PRIMARY_NAV } from "@/lib/primary-navigation";
import { cn } from "@/lib/utils";
import { PremiumMark } from "./EntryRow";

const trackHref = (track: CatalogTrack) => catalogEntryHref({ ...track, type: "track" });
const LEARN_HREF = PRIMARY_NAV.find(({ area }) => area === "learn")!.href;
const CRUMB_LINK = "min-w-0 truncate font-medium text-foreground transition-micro hover:text-primary";

/** Home Track and module above the title: navigation context, not part of the item's URL. */
export function TrackBreadcrumb({ placement }: { placement: TrackPlacement }) {
   const href = trackHref(placement.track);
   return (
      <nav aria-label="Track context" className="mb-6 text-supporting text-muted-foreground">
         {href ? (
            <Link href={href} className="font-medium text-foreground transition-micro hover:text-primary">
               {placement.track.title}
            </Link>
         ) : (
            <span>{placement.track.title}</span>
         )}
         <span aria-hidden="true"> / </span>
         <span>{placement.module.title}</span>
      </nav>
   );
}

/** A Lesson's place: Learn / Track / Module. The Module is context only, never a link; long names truncate. */
export function LessonBreadcrumb({ placement }: { placement: TrackPlacement }) {
   const href = trackHref(placement.track);
   return (
      <nav aria-label="Breadcrumb" className="mb-6 text-supporting text-muted-foreground">
         <ol className="m-0 flex min-w-0 list-none items-center gap-2 p-0">
            <li className="shrink-0">
               <Link href={LEARN_HREF} prefetch={false} className="font-medium text-foreground transition-micro hover:text-primary">
                  Learn
               </Link>
            </li>
            <li className="flex min-w-0 items-center gap-2">
               <span aria-hidden="true">/</span>
               {href ? (
                  <Link href={href} prefetch={false} className={CRUMB_LINK}>
                     {placement.track.title}
                  </Link>
               ) : (
                  <span className="min-w-0 truncate">{placement.track.title}</span>
               )}
            </li>
            <li className="flex min-w-0 items-center gap-2">
               <span aria-hidden="true">/</span>
               <span className="min-w-0 truncate">{placement.module.title}</span>
            </li>
         </ol>
      </nav>
   );
}

interface StepProps {
   label: string;
   entry: CatalogOutlineEntry | null;
   reading: boolean;
   /** The step that leads onward (Next) sits at the end of the row. */
   onward?: boolean;
}

function Step({ label, entry, reading, onward = false }: StepProps) {
   const href = entry && catalogEntryHref(entry);
   if (!entry || !href) return null;
   const premium = entry.access === "premium";
   return (
      <Link
         href={href}
         prefetch={false}
         aria-label={`${label}: ${entry.title}${premium ? ", premium" : ""}`}
         className={cn(
            reading ? "group block min-h-11" : "block rounded-lg border border-border p-4 transition-micro hover:border-primary",
            onward && (reading ? "sm:col-start-2 sm:text-right" : "col-start-2")
         )}
      >
         <span className={cn("block text-supporting text-muted-foreground", !reading && "uppercase tracking-wide")}>{label}</span>
         <span className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", reading && "mt-1", reading && onward && "sm:justify-end")}>
            <span className={cn("font-medium text-foreground", reading && "text-body transition-micro group-hover:text-primary")}>
               {entry.title}
            </span>
            {premium ? <PremiumMark /> : null}
         </span>
      </Link>
   );
}

/**
 * The Lessons before and after in the home Track's order, never a Problem; a missing side renders nothing. `reading` is
 * the Lesson's open, typographic presentation of the same links. No link prefetches.
 */
export function TrackPrevNext({ placement, reading = false }: { placement: TrackPlacement; reading?: boolean }) {
   if (!placement.previousLesson && !placement.nextLesson) return null;
   return (
      <nav
         aria-label={`Previous and next in ${placement.track.title}`}
         className={reading ? "grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8" : "grid grid-cols-2 gap-4"}
      >
         <Step label="Previous lesson" entry={placement.previousLesson} reading={reading} />
         <Step label="Next lesson" entry={placement.nextLesson} reading={reading} onward />
      </nav>
   );
}

/** Other Tracks that include this item: links to those Tracks, never a second copy of the item. */
export function AlternateTracks({ placements }: { placements: TrackPlacement[] }) {
   const links = placements.flatMap((placement) => {
      const href = trackHref(placement.track);
      return href ? [{ placement, href }] : [];
   });
   if (links.length === 0) return null;
   return (
      <section aria-labelledby="alternate-tracks">
         <h2 id="alternate-tracks" className="mt-0 mb-2 text-subsection">
            Also in these Tracks
         </h2>
         <p className="mb-3 text-supporting text-muted-foreground">
            Navigation only. This page remains the one canonical address of this content.
         </p>
         <ul className="space-y-1">
            {links.map(({ placement, href }) => (
               <li key={placement.track.id}>
                  <Link href={href} prefetch={false} className="font-medium text-foreground transition-micro hover:text-primary">
                     {placement.track.title}
                  </Link>
                  <span className="text-supporting text-muted-foreground"> / {placement.module.title}</span>
               </li>
            ))}
         </ul>
      </section>
   );
}
