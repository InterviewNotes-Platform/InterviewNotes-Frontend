import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PremiumMark } from "@/components/catalog/EntryRow";
import { Button } from "@/components/ui/button";
import type { IndexOutline, IndexTrack, TracksIndex as TracksIndexData } from "@/lib/catalog/trackIndex";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
const numeral = (n: number) => String(n).padStart(2, "0");

const KICKER = "m-0 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase";

/** "2 modules · 8 items"; only what the public outline delivers is counted. */
const scope = ({ modules, lessons, problems }: IndexOutline) =>
   join(modules.length ? plural(modules.length, "module") : "", lessons + problems ? plural(lessons + problems, "item") : "");

function Outline({ outline, title }: { outline: IndexOutline; title: string }) {
   const { modules, access, start } = outline;
   if (modules.length === 0) return <p className="mt-6 mb-0 text-supporting text-muted-foreground">Nothing is published in this Track yet.</p>;
   return (
      <>
         <ol aria-label={`${title} modules`} className="m-0 mt-6 list-none border-t border-border p-0">
            {modules.map(({ key, number, title: moduleTitle, lessons, problems }) => (
               <li key={key} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 border-b border-border py-3">
                  <span aria-hidden="true" className="pt-0.5 text-supporting text-muted-foreground tabular-nums">
                     {numeral(number)}
                  </span>
                  <span className="min-w-0">
                     <span className="sr-only">Module {number}: </span>
                     <span className="block text-body font-medium text-foreground">{moduleTitle}</span>
                     <span className="block text-supporting text-muted-foreground">
                        {join(lessons ? plural(lessons, "lesson") : "", problems ? plural(problems, "practice problem") : "")}
                     </span>
                  </span>
               </li>
            ))}
         </ol>
         <p className="mt-4 mb-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-supporting text-muted-foreground">
            <span>{plural(access.free, "free item")}</span>
            {access.premium ? (
               <span className="inline-flex items-center gap-2">
                  <PremiumMark />
                  <span>{plural(access.premium, "item")}</span>
               </span>
            ) : null}
         </p>
         {start ? (
            <p className="mt-2 mb-0 flex flex-wrap items-center gap-x-2 text-supporting">
               <span className="text-muted-foreground">Starts with</span>
               <Link href={start.href} prefetch={false} className="font-medium text-[var(--primary-text)] underline underline-offset-4">
                  {start.title}
               </Link>
               {start.access === "premium" ? <PremiumMark /> : null}
            </p>
         ) : null}
      </>
   );
}

function TrackEntry({ track }: { track: IndexTrack }) {
   const headingId = `track-${track.id.replace(/\W/g, "-")}`;
   return (
      <li>
         <article aria-labelledby={headingId} className="rounded-xl border border-border bg-[var(--reader-paper)] p-6 md:p-8">
            <p className={KICKER}>{join("Track", track.outline ? scope(track.outline) : "")}</p>
            <h2 id={headingId} className="m-0 mt-3 text-subsection text-balance md:text-section">
               <Link href={track.href} prefetch={false} className="text-foreground transition-micro hover:text-[var(--primary-text)]">
                  {track.title}
               </Link>
            </h2>
            {track.summary ? <p className="mt-3 mb-0 max-w-reading text-body text-pretty text-muted-foreground">{track.summary}</p> : null}
            {track.outline ? (
               <Outline outline={track.outline} title={track.title} />
            ) : (
               <p className="mt-6 mb-0 text-supporting text-muted-foreground">This Track&apos;s outline is temporarily unavailable.</p>
            )}
            <div className="mt-6">
               <Button asChild className="h-auto min-h-11 max-w-full bg-[var(--primary-text)] px-5 py-2 text-left text-body whitespace-normal text-[var(--reader-on-brand)] hover:bg-[var(--primary-text)]/90">
                  <Link href={track.href} prefetch={false} aria-label={`Open ${track.title}`}>
                     Open Track
                     <ArrowRight aria-hidden="true" />
                  </Link>
               </Button>
            </div>
         </article>
      </li>
   );
}

/** The published Tracks with what each contains, or one truthful sentence in their place (P8-NAV-01). */
export function TracksIndex({ index }: { index: TracksIndexData }) {
   if (index.status !== "ok") {
      return (
         <p role="status" className="m-0 rounded-xl border border-border bg-[var(--reader-paper)] px-6 py-10 text-center text-body text-muted-foreground">
            {index.status === "empty" ? "No Tracks are published yet." : "The Tracks are temporarily unavailable. Please try again later."}
         </p>
      );
   }
   return (
      <ul role="list" className="m-0 grid list-none gap-6 p-0">
         {index.tracks.map((track) => (
            <TrackEntry key={track.id} track={track} />
         ))}
      </ul>
   );
}
