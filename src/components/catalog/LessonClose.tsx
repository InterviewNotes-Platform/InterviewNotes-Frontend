import Link from "next/link";
import { ArrowRight, ChevronLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LessonPosition } from "@/lib/catalog/curriculum";
import { levelsOf } from "@/lib/catalog/levelChoice";
import { moduleLocation } from "@/lib/catalog/moduleLocation";
import type { TrackPlacement } from "@/lib/catalog/navigation";
import { catalogEntryHref } from "@/lib/catalog/routes";
import { PremiumMark } from "./EntryRow";

const trackHref = ({ track }: TrackPlacement) => catalogEntryHref({ ...track, type: "track" });

/**
 * The Premium mark on a filled primary action (P8-T26 F-1): it takes the button's own foreground on a transparent ground, so
 * its contrast is the button text's (measured in the T27 report) instead of gold on blue.
 */
function PremiumOnFill() {
   return (
      <span data-premium-mark className="inline-flex items-center gap-1 rounded-md border border-current px-2 py-0.5 text-xs font-semibold text-current">
         <Lock aria-hidden="true" className="size-3" />
         Premium
      </span>
   );
}

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
                     {premium ? <PremiumOnFill /> : null}
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

/** Replaces Next, Previous and End of Track for a level-choice Track (A-9): the other levels as equals, then the way back. */
export function OtherLevels({ placement, currentId }: { placement: TrackPlacement; currentId: string }) {
   const levels = levelsOf(placement.track).flatMap((entry) => {
      const href = entry.id === currentId ? null : catalogEntryHref(entry);
      return href ? [{ entry, href }] : [];
   });
   const back = trackHref(placement);
   if (levels.length === 0 && !back) return null;
   return (
      <nav aria-label="Other levels">
         {levels.length > 0 ? (
            <>
               <h2 id="other_levels_heading" className="m-0 text-subsection">
                  Other levels
               </h2>
               <ul role="list" className="m-0 mt-3 list-none p-0">
                  {levels.map(({ entry, href }) => (
                     <li key={entry.id}>
                        <Link
                           href={href}
                           prefetch={false}
                           aria-label={entry.access === "premium" ? `${entry.title}, premium` : undefined}
                           className="inline-flex min-h-11 items-center gap-x-3 text-body font-medium text-foreground transition-micro hover:text-primary"
                        >
                           <span>{entry.title}</span>
                           {entry.access === "premium" ? <PremiumMark /> : null}
                        </Link>
                     </li>
                  ))}
               </ul>
            </>
         ) : null}
         {back ? (
            <Button asChild variant="default" size="lg" className="mt-5 h-auto min-h-11 px-6 py-2 text-left text-body whitespace-normal">
               <Link href={back} prefetch={false}>
                  Back to Track: {placement.track.title}
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

const CARD =
   "group block rounded-lg border border-border p-4 no-underline transition-micro hover:border-[var(--primary-text)] hover:bg-muted";

/**
 * The end-of-page "Previous in the Track" card (§4.2): the previous Lesson's type, access and Module from the Track's public
 * outline (the same entries the shell's sidebar shows), or, at the start of the Track, the way to its overview. "Next" stays the
 * one Next lesson action above (S-LSN-16). Readable pages only, like every other piece of Track orientation (S-LSN-18).
 */
export function PreviousInTrack({ placement }: { placement: TrackPlacement }) {
   const previous = placement.previousLesson;
   const href = previous ? catalogEntryHref(previous) : trackHref(placement);
   if (!href) return null;
   const containing = previous ? placement.track.modules.find(({ items }) => items.some(({ id }) => id === previous.id)) : null;
   const premium = previous?.access === "premium";
   const metaId = `previous_in_track_${placement.track.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
   return (
      <nav aria-label={`Previous in ${placement.track.title}`}>
         <Link
            href={href}
            prefetch={false}
            aria-label={previous ? `Previous lesson: ${previous.title}${premium ? ", premium" : ""}` : `Track overview: ${placement.track.title}`}
            aria-describedby={metaId}
            className={CARD}
         >
            <span className="flex items-center gap-1 text-supporting font-medium text-[var(--primary-text)]">
               <ChevronLeft aria-hidden="true" className="size-4" />
               {previous ? "Previous in the Track" : "Start of the Track"}
            </span>
            <span className="lesson-card-title mt-1 block text-body font-semibold text-foreground">{previous ? previous.title : placement.track.title}</span>
            <span id={metaId} className="mt-1 block text-supporting text-muted-foreground">
               {previous ? ["Lesson", premium ? "Premium" : "Free", containing?.title].filter(Boolean).join(" · ") : "Back to the Track overview"}
            </span>
         </Link>
      </nav>
   );
}
