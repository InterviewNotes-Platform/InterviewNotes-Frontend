import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LinkedMeta } from "@/lib/catalog/lesson";
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
   /** Name each target's type, for a group that mixes types. */
   withType?: boolean;
   /** One line of the target's own summary beneath its title. */
   withSummary?: boolean;
}

/** A quiet list of neighbours: public metadata only, never prefetched. Renders nothing when empty. */
export function RelationGroup({ id, label, rows, withType = false, withSummary = false }: GroupProps) {
   if (rows.length === 0) return null;
   return (
      <section aria-labelledby={id}>
         <h2 id={id} className={GROUP_LABEL}>
            {label}
         </h2>
         <ul className="m-0 list-none space-y-4 p-0">
            {rows.map((row) => {
               const { entry, href } = row;
               const detail = [withType ? TYPE_LABEL[entry.type] : null, difficultyOf(row), row.relation].filter(Boolean).join(" · ");
               return (
                  <li key={entry.id}>
                     <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Link href={href} prefetch={false} className="text-body font-medium text-foreground transition-micro hover:text-primary">
                           {entry.title}
                        </Link>
                        {detail ? <span className="text-supporting text-muted-foreground">{detail}</span> : null}
                        {entry.access === "premium" ? <PremiumMark /> : null}
                     </div>
                     {withSummary && entry.summary ? (
                        <p className="mt-1 mb-0 text-supporting text-pretty text-muted-foreground">{entry.summary}</p>
                     ) : null}
                  </li>
               );
            })}
         </ul>
      </section>
   );
}

/**
 * The Lesson's one strong step into Practice: the Problems that name it as a prerequisite, in the API's order. Each
 * title link stretches over its row (one link, one focus stop), and none prefetches. Renders nothing when empty.
 */
export function PracticeTransition({ problems }: { problems: LinkedMeta[] }) {
   if (problems.length === 0) return null;
   return (
      <section aria-labelledby="lesson_practice" className="rounded-xl bg-surface p-6 md:p-8">
         <h2 id="lesson_practice" className="m-0 text-section text-balance">
            Ready to apply this?
         </h2>
         <ul className="m-0 mt-6 list-none divide-y divide-border p-0">
            {problems.map((row) => {
               const { entry, href } = row;
               const difficulty = difficultyOf(row);
               return (
                  <li
                     key={entry.id}
                     className="group relative flex items-start gap-4 py-5 first:pt-0 last:pb-0 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-ring"
                  >
                     <div className="min-w-0 flex-1">
                        <Link href={href} prefetch={false} className="text-subsection text-balance outline-none after:absolute after:inset-0">
                           {entry.title}
                        </Link>
                        {entry.summary ? <p className="mt-1 mb-0 text-body text-pretty text-muted-foreground">{entry.summary}</p> : null}
                        {difficulty || entry.access === "premium" ? (
                           <p className="m-0 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-supporting text-muted-foreground">
                              {difficulty ? <span>{difficulty}</span> : null}
                              {entry.access === "premium" ? <PremiumMark /> : null}
                           </p>
                        ) : null}
                     </div>
                     <ArrowRight
                        aria-hidden="true"
                        className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-standard group-hover:translate-x-0.5 group-hover:text-primary"
                     />
                  </li>
               );
            })}
         </ul>
      </section>
   );
}
