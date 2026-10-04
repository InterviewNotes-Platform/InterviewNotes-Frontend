import Link from "next/link";
import { catalogEntryHref } from "@/lib/catalog/routes";
import type { TrackPlacement } from "@/lib/catalog/navigation";
import type { CatalogOutlineEntry, CatalogTrack } from "@/lib/catalog/types";
import { PremiumMark } from "./EntryRow";

const trackHref = (track: CatalogTrack) => catalogEntryHref({ ...track, type: "track" });

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

function Step({ label, entry }: { label: string; entry: CatalogOutlineEntry | null }) {
   const href = entry && catalogEntryHref(entry);
   if (!entry || !href) return <span />;
   return (
      <Link
         href={href}
         prefetch={entry.access === "premium" ? false : undefined}
         className="block rounded-lg border border-border p-4 transition-micro hover:border-primary"
      >
         <span className="block text-supporting uppercase tracking-wide text-muted-foreground">{label}</span>
         <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-foreground">{entry.title}</span>
            {entry.access === "premium" ? <PremiumMark /> : null}
         </span>
      </Link>
   );
}

/** Neighbours in the home Track's order; a missing side stays empty, never invented. */
export function TrackPrevNext({ placement }: { placement: TrackPlacement }) {
   if (!placement.previous && !placement.next) return null;
   return (
      <nav aria-label={`Previous and next in ${placement.track.title}`} className="grid grid-cols-2 gap-4">
         <Step label="Previous" entry={placement.previous} />
         <Step label="Next" entry={placement.next} />
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
                  <Link href={href} className="font-medium text-foreground transition-micro hover:text-primary">
                     {placement.track.title}
                  </Link>
                  <span className="text-supporting text-muted-foreground"> / {placement.module.title}</span>
               </li>
            ))}
         </ul>
      </section>
   );
}
