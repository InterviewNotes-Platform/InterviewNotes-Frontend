import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CatalogTrackSummary } from "@/lib/catalog/types";

/**
 * A discovery surface for one Track, built only from the list response: title and summary. The title
 * link stretches over the card, so there is one link, one focus stop and no nested control. It never
 * prefetches: that would make the server read every Track's outline just to list them.
 */
export function TrackCard({ track, href }: { track: CatalogTrackSummary; href: string }) {
   return (
      <article className="group relative flex h-full flex-col rounded-lg bg-surface p-6 transition-micro hover:bg-secondary has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
         <h3 className="m-0 text-subsection text-balance">
            <Link href={href} prefetch={false} className="outline-none after:absolute after:inset-0">
               {track.title}
            </Link>
         </h3>
         {track.summary ? <p className="mt-2 mb-6 text-body text-pretty text-muted-foreground">{track.summary}</p> : null}
         <span aria-hidden="true" className="mt-auto inline-flex items-center gap-1 pt-2 text-supporting font-medium text-primary">
            Open Track
            <ArrowRight className="size-4 transition-transform duration-200 ease-standard group-hover:translate-x-0.5" />
         </span>
      </article>
   );
}
