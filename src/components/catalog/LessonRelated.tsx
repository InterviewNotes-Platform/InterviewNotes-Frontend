import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LinkedMeta } from "@/lib/catalog/lesson";
import type { PracticeRow } from "@/lib/catalog/practiceStep";
import { DIFFICULTY_LABEL, PremiumMark, TYPE_LABEL } from "./EntryRow";

// Page-level ids use `_`, which a heading slug (`[a-z0-9-]`) can never contain, so they cannot collide with one.
const GROUP_LABEL = "m-0 mb-3 text-supporting font-semibold uppercase tracking-wide text-muted-foreground";

/** A Problem sets an expectation with its difficulty; on a Lesson's other neighbours that stays out of the way. */
const difficultyOf = ({ entry }: LinkedMeta) => (entry.type === "problem" && entry.difficulty ? DIFFICULTY_LABEL[entry.difficulty] : null);

interface GroupProps {
   id: string;
   label: string;
   /** A row may say how it relates ("Applied in"); it shows after the type and difficulty. */
   rows: (LinkedMeta & { relation?: string | null })[];
   /** One line of the target's own summary beneath its title. */
   withSummary?: boolean;
   /** Rows whose summary is already offered in the body (S-KNW-6): still listed, without it. */
   summaryOffered?: ReadonlySet<string>;
}

/** A quiet list of neighbours: public metadata only, never prefetched. Renders nothing when empty. */
export function RelationGroup({ id, label, rows, withSummary = false, summaryOffered }: GroupProps) {
   if (rows.length === 0) return null;
   return (
      <section aria-labelledby={id}>
         <h2 id={id} className={GROUP_LABEL}>
            {label}
         </h2>
         <ul className="m-0 list-none space-y-4 p-0">
            {rows.map((row) => {
               const { entry, href } = row;
               const detail = [difficultyOf(row), row.relation].filter(Boolean).join(" · ");
               return (
                  <li key={entry.id}>
                     <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Link href={href} prefetch={false} className="text-body font-medium text-foreground transition-micro hover:text-primary">
                           {entry.title}
                        </Link>
                        {detail ? <span className="text-supporting text-muted-foreground">{detail}</span> : null}
                        {entry.access === "premium" ? <PremiumMark /> : null}
                     </div>
                     {withSummary && entry.summary && !summaryOffered?.has(entry.id) ? (
                        <p className="mt-1 mb-0 text-supporting text-pretty text-muted-foreground">{entry.summary}</p>
                     ) : null}
                  </li>
               );
            })}
         </ul>
      </section>
   );
}

/** What the Lesson builds on: one wrapping line of links, each naming its type. A pointer, never a requirement. */
export function BuildsOn({ rows }: { rows: LinkedMeta[] }) {
   if (rows.length === 0) return null;
   return (
      <section aria-labelledby="lesson_builds_on" className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
         <h2 id="lesson_builds_on" className="m-0 text-supporting font-semibold text-muted-foreground">
            Builds on
         </h2>
         <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0">
            {rows.map(({ entry, href }) => (
               <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2">
                  <Link href={href} prefetch={false} className="text-body font-medium text-foreground transition-micro hover:text-primary">
                     {entry.title}
                  </Link>
                  <span className="text-supporting text-muted-foreground">{TYPE_LABEL[entry.type]}</span>
                  {entry.access === "premium" ? <PremiumMark /> : null}
               </li>
            ))}
         </ul>
      </section>
   );
}

/**
 * The Lesson's step into Practice: at most two Problems, each saying why it is here in one plain line. The title is
 * the row's single link (stretched over the row, never prefetched) and follows its "Problem" label in reading order.
 * Public metadata only. Renders nothing when empty.
 */
export function PracticeTransition({ problems }: { problems: PracticeRow[] }) {
   if (problems.length === 0) return null;
   return (
      <section aria-labelledby="lesson_practice" className="rounded-xl bg-surface p-6 md:p-8">
         <h2 id="lesson_practice" className="m-0 text-subsection text-balance">
            Practice
         </h2>
         <ul className="m-0 mt-5 list-none divide-y divide-border p-0">
            {problems.map(({ id, title, href, summary, difficulty, access, reason }) => (
               <li
                  key={id}
                  className="group relative flex items-start gap-4 py-5 first:pt-0 last:pb-0 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-ring"
               >
                  <div className="min-w-0 flex-1">
                     <p className="m-0 mb-1 text-supporting text-muted-foreground">{TYPE_LABEL.problem}</p>
                     <Link href={href} prefetch={false} className="text-subsection text-balance outline-none after:absolute after:inset-0">
                        {title}
                     </Link>
                     {summary ? <p className="mt-1 mb-0 text-body text-pretty text-muted-foreground">{summary}</p> : null}
                     <p className="m-0 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-supporting text-muted-foreground">
                        {difficulty ? <span>{DIFFICULTY_LABEL[difficulty]}</span> : null}
                        {access === "premium" ? <PremiumMark /> : null}
                        {reason ? <span className="text-pretty">{reason}</span> : null}
                     </p>
                  </div>
                  <ArrowRight
                     aria-hidden="true"
                     className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-standard group-hover:translate-x-0.5 group-hover:text-primary"
                  />
               </li>
            ))}
         </ul>
      </section>
   );
}
