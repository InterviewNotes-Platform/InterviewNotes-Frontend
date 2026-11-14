"use client";

import { useId, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { ProblemCard } from "@/components/catalog/ProblemResults";
import { matchProblems, type SearchableProblem } from "@/lib/catalog/practiceSearch";

/**
 * Search over the Problems the current filters allow, in the page: the metadata was read once on the server from the existing
 * list endpoint, so typing sends no request and the term is never written to the URL. With no term the server's own page of
 * results shows. When the scan was capped, the page says search covers only part of the list.
 */
export function PracticeSearch({ index, complete, children }: { index: SearchableProblem[]; complete: boolean; children: ReactNode }) {
   const [term, setTerm] = useState("");
   const id = useId();
   const matches = term.trim() ? matchProblems(index, term) : null;

   return (
      <div>
         <div role="search" className="mb-6">
            <label htmlFor={id} className="mb-1.5 block text-supporting font-medium text-muted-foreground">
               Search Problems
            </label>
            <div className="relative">
               <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
               <input
                  id={id}
                  type="search"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  onKeyDown={(event) => {
                     if (event.key === "Escape") setTerm("");
                  }}
                  placeholder="Title, summary or topic"
                  autoComplete="off"
                  className="h-11 w-full rounded-md border border-input bg-background pr-11 pl-9 text-body text-foreground transition-micro hover:border-foreground"
               />
               {term ? (
                  <button
                     type="button"
                     onClick={() => setTerm("")}
                     className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-md text-muted-foreground transition-micro hover:text-foreground"
                  >
                     <X aria-hidden="true" className="size-4" />
                     <span className="sr-only">Clear search</span>
                  </button>
               ) : null}
            </div>
            {complete ? null : <p className="mt-2 mb-0 text-supporting text-muted-foreground">Search covers the first {index.length} Problems in this list.</p>}
         </div>
         {matches === null ? (
            children
         ) : (
            <>
               <p role="status" className="m-0 text-supporting text-muted-foreground">
                  {matches.length === 0
                     ? `No Problems match “${term.trim()}”`
                     : `${matches.length} ${matches.length === 1 ? "Problem matches" : "Problems match"} “${term.trim()}”`}
               </p>
               {matches.length > 0 ? (
                  <ul role="list" className="m-0 mt-4 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                     {matches.map(({ meta, href }) => (
                        <li key={meta.id}>
                           <ProblemCard problem={meta} href={href} />
                        </li>
                     ))}
                  </ul>
               ) : (
                  <div className="mt-4 rounded-lg bg-surface px-6 py-12 text-center">
                     <button
                        type="button"
                        onClick={() => setTerm("")}
                        className="inline-flex min-h-11 items-center text-body text-[var(--primary-text)] underline underline-offset-4"
                     >
                        Clear search
                     </button>
                  </div>
               )}
            </>
         )}
      </div>
   );
}
