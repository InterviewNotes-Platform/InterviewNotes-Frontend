import Link from "next/link";
import type { PreparationGroup } from "@/lib/catalog/problem";
import { PremiumMark, TYPE_LABEL } from "./EntryRow";

/**
 * "Before you start": the prerequisites and applied Knowledge the API already related to this Problem, grouped, as
 * titles with their type. Compact on purpose (no summaries) and never prefetched, so opening the page does not make the
 * server read every target. Nothing without a group.
 */
export function ProblemPreparation({ groups }: { groups: PreparationGroup[] }) {
   if (groups.length === 0) return null;
   return (
      <section aria-labelledby="problem_preparation" className="mt-10">
         <h2 id="problem_preparation" className="m-0 mb-4 text-subsection text-balance">
            Before you start
         </h2>
         <div className="space-y-5">
            {groups.map(({ id, label, rows }) => (
               <div key={id}>
                  <h3 className="m-0 mb-2 text-supporting font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
                  <ul className="m-0 list-none space-y-2 p-0">
                     {rows.map(({ entry, href }) => (
                        <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                           <Link href={href} prefetch={false} className="text-body font-medium text-foreground transition-micro hover:text-primary">
                              {entry.title}
                           </Link>
                           <span className="text-supporting text-muted-foreground">{TYPE_LABEL[entry.type]}</span>
                           {entry.access === "premium" ? <PremiumMark /> : null}
                        </li>
                     ))}
                  </ul>
               </div>
            ))}
         </div>
      </section>
   );
}
