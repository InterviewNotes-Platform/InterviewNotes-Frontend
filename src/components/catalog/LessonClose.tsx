import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LessonPosition } from "@/lib/catalog/curriculum";
import { moduleLocation } from "@/lib/catalog/moduleLocation";
import type { TrackPlacement } from "@/lib/catalog/navigation";
import { catalogEntryHref } from "@/lib/catalog/routes";
import { PremiumMark } from "./EntryRow";

const trackHref = ({ track }: TrackPlacement) => catalogEntryHref({ ...track, type: "track" });

/**
 * The one primary action of a Lesson's close: the canonical Next Lesson with its summary when the read succeeded.
 * Public metadata only, so a premium target shows its marker and nothing more. Never prefetched.
 */
export function NextLesson({ placement, summary }: { placement: TrackPlacement; summary: string | null }) {
   const next = placement.nextLesson;
   const href = next && catalogEntryHref(next);
   if (!next || !href) return null;
   const premium = next.access === "premium";
   return (
      <nav aria-label={`Next in ${placement.track.title}`}>
         <Button
            asChild
            variant="default"
            size="lg"
            className="h-auto min-h-11 w-full justify-between gap-4 px-6 py-5 text-left text-body whitespace-normal sm:w-auto"
         >
            <Link href={href} prefetch={false} aria-label={`Next lesson: ${next.title}${premium ? ", premium" : ""}`}>
               <span className="min-w-0">
                  <span className="block text-supporting font-normal">Next lesson</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
                     <span className="min-w-0 text-balance break-words">{next.title}</span>
                     {premium ? <PremiumMark /> : null}
                  </span>
                  {summary ? <span className="mt-2 block text-supporting font-normal text-pretty opacity-90">{summary}</span> : null}
               </span>
               <ArrowRight aria-hidden="true" />
            </Link>
         </Button>
      </nav>
   );
}

/** Replaces Next for the last Lesson: a statement of position, never of achievement, and the way back to the Track. */
export function EndOfTrack({ placement }: { placement: TrackPlacement }) {
   const href = trackHref(placement);
   return (
      <nav aria-label={`End of ${placement.track.title}`}>
         <p className="m-0 text-subsection text-balance">End of {placement.track.title}</p>
         <p className="mt-2 mb-0 text-body text-muted-foreground">This is the last lesson in this track.</p>
         {href ? (
            <Button asChild variant="default" size="lg" className="mt-5 h-auto min-h-11 px-6 py-2 text-left text-body whitespace-normal">
               <Link href={href} prefetch={false}>
                  Back to {placement.track.title}
               </Link>
            </Button>
         ) : null}
      </nav>
   );
}

const LINK = "inline-flex min-h-11 items-center gap-x-3 font-medium text-foreground transition-micro hover:text-primary";

/** Where the Lesson sits in its Module, the way back to the Module's location, and a quiet Previous lesson. */
export function CurriculumBlock({ placement, position }: { placement: TrackPlacement; position: LessonPosition | null }) {
   const moduleHref = moduleLocation(placement.track, placement.module);
   const previous = placement.previousLesson;
   const previousHref = previous && catalogEntryHref(previous);
   if (!position && !moduleHref && !previousHref) return null;
   return (
      <nav aria-label="Curriculum" className="space-y-1">
         {position ? (
            <p className="m-0 text-supporting text-muted-foreground">
               Module {position.module.index} of {position.module.count}
            </p>
         ) : null}
         {moduleHref ? (
            <div>
               <Link href={moduleHref} prefetch={false} className={LINK}>
                  Back to module: {placement.module.title}
               </Link>
            </div>
         ) : null}
         {previous && previousHref ? (
            <div>
               <Link
                  href={previousHref}
                  prefetch={false}
                  aria-label={`Previous lesson: ${previous.title}${previous.access === "premium" ? ", premium" : ""}`}
                  className={`${LINK} text-supporting font-normal text-muted-foreground`}
               >
                  <span>Previous lesson: {previous.title}</span>
                  {previous.access === "premium" ? <PremiumMark /> : null}
               </Link>
            </div>
         ) : null}
      </nav>
   );
}
