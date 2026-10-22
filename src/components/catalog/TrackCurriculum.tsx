import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, PencilRuler, type LucideIcon } from "lucide-react";
import { ModuleSection } from "@/components/track/ModuleSection";
import { Button } from "@/components/ui/button";
import { isLevelChoiceTrack } from "@/lib/catalog/levelChoice";
import { moduleFragmentId } from "@/lib/catalog/moduleLocation";
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

/** The one recommendation: the first Lesson (S-CUR-13). With no Lesson there is no Start and no placeholder. */
function TrackStart({ curriculum: { start, counts } }: { curriculum: Curriculum }) {
   if (!start) {
      const empty = counts.lesson + counts.problem === 0;
      return empty ? <p className="mt-8 mb-0 text-body text-muted-foreground">Nothing is published in this Track yet.</p> : null;
   }
   return (
      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
         <Button asChild size="lg" className="h-auto min-h-11 max-w-full px-6 py-2 text-left text-body whitespace-normal">
            <Link href={start.href} prefetch={false} aria-describedby="track_start_note">
               Start with {start.entry.title}
               <ArrowRight aria-hidden="true" />
            </Link>
         </Button>
         <p id="track_start_note" className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-supporting text-muted-foreground">
            <span>Recommended starting point</span>
            {start.entry.access === "premium" ? <PremiumMark /> : null}
         </p>
      </div>
   );
}

/** A level-choice Track (A-9): every Lesson as an equal choice, in curriculum order, with no recommended or first level. */
function LevelChoice({ curriculum, summaries }: { curriculum: Curriculum; summaries?: ReadonlyMap<string, string> | null }) {
   const levels = curriculum.modules.flatMap(({ rows }) => rows).filter(({ entry }) => entry.type === "lesson");
   if (levels.length === 0) {
      // Never a Start action here, even for a listed Track with no Lesson entry.
      return curriculum.counts.problem === 0 ? <p className="mt-8 mb-0 text-body text-muted-foreground">Nothing is published in this Track yet.</p> : null;
   }
   return (
      <section aria-labelledby="track_levels_heading" className="mt-8">
         <h2 id="track_levels_heading" className="m-0 text-subsection">
            Choose your level
         </h2>
         <ul role="list" className="m-0 mt-3 list-none p-0">
            {levels.map(({ entry, href }) => (
               <li key={entry.id}>
                  <Link
                     href={href}
                     prefetch={false}
                     className="group -mx-2 block min-h-11 rounded-md px-2 py-2.5 transition-micro -outline-offset-2 hover:bg-surface"
                  >
                     <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-body font-medium text-foreground transition-micro group-hover:text-primary">{entry.title}</span>
                        {entry.access === "premium" ? <PremiumMark /> : null}
                     </span>
                     {summaries?.get(entry.id) ? (
                        <span className="mt-1 block text-supporting text-pretty text-muted-foreground">{summaries.get(entry.id)}</span>
                     ) : null}
                  </Link>
               </li>
            ))}
         </ul>
      </section>
   );
}

/** The proposition (title, summary, what the curriculum holds) and the one primary action, or the level choice (A-9). */
export function TrackHeader({
   track,
   curriculum,
   summaries,
}: {
   track: CatalogTrack;
   curriculum: Curriculum;
   summaries?: ReadonlyMap<string, string> | null;
}) {
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
         {isLevelChoiceTrack(track) ? <LevelChoice curriculum={curriculum} summaries={summaries} /> : <TrackStart curriculum={curriculum} />}
      </header>
   );
}

/** One ordered row. The leading slot has a fixed width so a progress mark can later take its place. */
function CurriculumEntry({ entry, href, summary }: PlacedEntry & { summary?: string }) {
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
               {summary ? <span className="mt-1 block text-supporting text-pretty text-muted-foreground">{summary}</span> : null}
            </span>
            {entry.access === "premium" ? <PremiumMark /> : null}
         </Link>
      </li>
   );
}

/** "3 lessons · 1 practice problem"; a zero count is left out. */
const moduleCounts = ({ lesson, problem }: Curriculum["counts"]) =>
   [lesson ? plural(lesson, "lesson") : "", problem ? plural(problem, "practice problem") : ""].filter(Boolean).join(" · ");

interface TrackCurriculumProps {
   track: CatalogTrack;
   curriculum: Curriculum;
   /** Lesson summaries by item id, from a scan that completed; null or absent shows none, never a partial set. */
   summaries?: ReadonlyMap<string, string> | null;
}

/** Modules as separated sections, not cards. The first is open; the rest start collapsed. Ids with `_` never equal a Module key. */
export function TrackCurriculum({ track, curriculum, summaries }: TrackCurriculumProps) {
   // A Track with no modules has nothing to outline; the Start state in its header already says so.
   if (curriculum.modules.length === 0) return null;
   return (
      <nav aria-label={`${track.title} outline`} className="border-b border-border">
         {curriculum.modules.map(({ module, rows, counts }, index) => (
            <ModuleSection
               key={module.key}
               id={moduleFragmentId(module)}
               title={
                  <>
                     <span className="block text-supporting font-normal text-muted-foreground">Module {index + 1}</span> {module.title}
                  </>
               }
               detail={moduleCounts(counts)}
               defaultOpen={index === 0}
            >
               {rows.length ? (
                  <ol role="list" className="m-0 list-none p-0 pb-4">
                     {rows.map((row) => (
                        <CurriculumEntry key={row.entry.id} {...row} summary={row.entry.type === "lesson" ? summaries?.get(row.entry.id) : undefined} />
                     ))}
                  </ol>
               ) : (
                  <p className="m-0 pb-5 text-supporting text-muted-foreground">No published items in this Module yet.</p>
               )}
            </ModuleSection>
         ))}
      </nav>
   );
}

/** The Problems placed in the outline, read from the outline itself; nothing is fetched and nothing is invented. */
export function TrackSupport({ curriculum }: { curriculum: Curriculum }) {
   const { practice } = curriculum;
   if (practice.length === 0) return null;
   return (
      <section aria-labelledby="track_support_heading" className="mt-12">
         <h2 id="track_support_heading" className="m-0 mb-6 text-subsection">
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
