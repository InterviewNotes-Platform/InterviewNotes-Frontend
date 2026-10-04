import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, PencilRuler, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import type { Curriculum, PlacedEntry } from "@/lib/catalog/track";
import type { CatalogTrack } from "@/lib/catalog/types";
import { PremiumMark } from "./EntryRow";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// Prefetching a link makes the server render its target page, which reads that item. A Track page
// reads the catalog once; only following a link reads the next page, so none of these links prefetch.

// Inside Learn a Problem is a practice step in the curriculum, not an entry in a Problem library.
const STEP: Record<PlacedEntry["entry"]["type"], { label: string; Icon: LucideIcon }> = {
   lesson: { label: "Lesson", Icon: BookOpen },
   problem: { label: "Practice problem", Icon: PencilRuler },
};

/** What the outline holds, such as "3 modules · 4 lessons"; only what it actually delivers is counted. */
export function curriculumSummary({ modules, counts }: Curriculum): string {
   return [
      modules.length ? plural(modules.length, "module") : "",
      counts.lesson ? plural(counts.lesson, "lesson") : "",
      counts.problem ? plural(counts.problem, "practice problem") : "",
   ]
      .filter(Boolean)
      .join(" · ");
}

function TrackStart({ start }: { start: PlacedEntry | null }) {
   if (!start) {
      return <p className="mt-8 mb-0 text-body text-muted-foreground">Nothing is published in this Track yet.</p>;
   }
   return (
      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
         <Button asChild size="lg" className="h-11 px-6 text-body">
            <Link href={start.href} prefetch={false} aria-describedby="track-start-note">
               Start
               <ArrowRight aria-hidden="true" />
            </Link>
         </Button>
         <p id="track-start-note" className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-supporting text-muted-foreground">
            <span>Begins with {start.entry.title}</span>
            {start.entry.access === "premium" ? <PremiumMark /> : null}
         </p>
      </div>
   );
}

/** The proposition (title, summary, what the curriculum holds) and the one primary action. */
export function TrackHeader({ track, curriculum }: { track: CatalogTrack; curriculum: Curriculum }) {
   const summary = curriculumSummary(curriculum);
   return (
      <header>
         <p className="m-0 mb-3 text-supporting font-medium text-muted-foreground">Track</p>
         <h1 className="m-0 text-title text-balance">{track.title}</h1>
         {track.summary ? <p className="mt-4 mb-0 text-body text-pretty text-muted-foreground">{track.summary}</p> : null}
         {summary ? (
            <p data-slot="curriculum-summary" className="mt-6 mb-0 text-supporting text-muted-foreground">
               {summary.split(" · ").map((part, index) => (
                  <Fragment key={part}>
                     {index > 0 ? " · " : null}
                     <span className="whitespace-nowrap">{part}</span>
                  </Fragment>
               ))}
            </p>
         ) : null}
         <TrackStart start={curriculum.start} />
      </header>
   );
}

/** One ordered row. The leading slot has a fixed width so a progress mark can later take its place. */
function CurriculumEntry({ entry, href }: PlacedEntry) {
   const { label, Icon } = STEP[entry.type];
   return (
      <li>
         <Link
            href={href}
            prefetch={false}
            className="group -mx-2 grid min-h-11 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 py-2.5 transition-micro -outline-offset-2 hover:bg-surface"
         >
            <span data-slot="entry-leading" aria-hidden="true" className="flex size-8 items-center justify-center text-muted-foreground">
               <Icon className="size-4" />
            </span>
            <span className="min-w-0">
               <span className="block text-body font-medium text-foreground transition-micro group-hover:text-primary">{entry.title}</span>
               <span className="block text-supporting text-muted-foreground">{label}</span>
            </span>
            {entry.access === "premium" ? <PremiumMark /> : null}
         </Link>
      </li>
   );
}

/** Modules as separated sections, not cards. The first is open; the rest start collapsed. */
export function TrackCurriculum({ track, curriculum }: { track: CatalogTrack; curriculum: Curriculum }) {
   // A Track with no modules has nothing to outline; the Start state in its header already says so.
   if (curriculum.modules.length === 0) return null;
   return (
      <nav aria-label={`${track.title} outline`} className="border-b border-border">
         {curriculum.modules.map(({ module, rows }, index) => (
            <Disclosure
               key={module.key}
               title={module.title}
               detail={plural(rows.length, "item")}
               defaultOpen={index === 0}
               className="border-t border-border"
            >
               {rows.length ? (
                  <ol role="list" className="m-0 list-none p-0 pb-4">
                     {rows.map((row) => (
                        <CurriculumEntry key={row.entry.id} {...row} />
                     ))}
                  </ol>
               ) : (
                  <p className="m-0 pb-5 text-supporting text-muted-foreground">No published items in this Module yet.</p>
               )}
            </Disclosure>
         ))}
      </nav>
   );
}

/** The Problems placed in the outline, read from the outline itself; nothing is fetched and nothing is invented. */
export function TrackSupport({ curriculum }: { curriculum: Curriculum }) {
   const { practice } = curriculum;
   if (practice.length === 0) return null;
   return (
      <section aria-labelledby="track-support-heading" className="mt-12">
         <h2 id="track-support-heading" className="m-0 mb-6 text-subsection">
            In this Track
         </h2>
         <h3 className="m-0 text-body font-semibold">Practice</h3>
         <p className="mt-1 mb-3 text-supporting text-muted-foreground">
            {plural(practice.length, "practice problem")} placed in the curriculum above.
         </p>
         <ul role="list" className="m-0 list-none p-0">
            {practice.map(({ entry, href, module }) => (
               <li key={entry.id} className="flex flex-wrap items-center gap-x-2">
                  <Link
                     href={href}
                     prefetch={false}
                     className="inline-flex min-h-11 items-center font-medium text-foreground transition-micro hover:text-primary"
                  >
                     {entry.title}
                  </Link>
                  <span className="text-supporting text-muted-foreground">/ {module.title}</span>
               </li>
            ))}
         </ul>
      </section>
   );
}
