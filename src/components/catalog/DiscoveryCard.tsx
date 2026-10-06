import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface DiscoveryCardProps {
   title: string;
   summary: string;
   /** A canonical route from `linkableEntries`. */
   href: string;
   /** The quiet closing cue, such as "Open Track"; decorative, since the title link carries the name. */
   cue: string;
   /** A quiet line above the title, such as a category; outside the link. Its height is reserved even when empty, so titles align across a row. */
   eyebrow?: ReactNode;
   /** A quiet line under the summary, such as topics; plain text, outside the link. */
   meta?: ReactNode;
}

/**
 * A discovery surface for one catalog entry, built only from list metadata. The title link stretches over the card, so
 * there is one link, one focus stop and no nested control. It never prefetches: that would make the server read every
 * target just to list them.
 */
export function DiscoveryCard({ title, summary, href, cue, eyebrow, meta }: DiscoveryCardProps) {
   return (
      <article className="group relative flex h-full flex-col rounded-lg bg-surface p-6 transition-micro hover:bg-secondary has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
         {eyebrow !== undefined ? <p className="m-0 mb-3 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-supporting text-muted-foreground">{eyebrow}</p> : null}
         <h3 className="m-0 text-subsection text-balance">
            <Link href={href} prefetch={false} className="outline-none after:absolute after:inset-0">
               {title}
            </Link>
         </h3>
         {summary ? <p className={`mt-2 ${meta ? "mb-3" : "mb-6"} text-body text-pretty text-muted-foreground`}>{summary}</p> : null}
         {meta ? <p className={`${summary ? "" : "mt-2 "}m-0 mb-6 text-supporting text-muted-foreground`}>{meta}</p> : null}
         <span aria-hidden="true" className="mt-auto inline-flex items-center gap-1 pt-2 text-supporting font-medium text-primary">
            {cue}
            <ArrowRight className="size-4 transition-transform duration-200 ease-standard group-hover:translate-x-0.5" />
         </span>
      </article>
   );
}
