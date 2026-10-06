import { Fragment } from "react";
import type { CatalogMeta } from "@/lib/catalog/types";
import { DIFFICULTY_LABEL, LEVEL_LABEL, PremiumMark } from "./EntryRow";

/** Title and summary lead. Level and difficulty follow as one quiet line, not a row of badges; only premium is marked. */
export function LessonHeader({ meta }: { meta: CatalogMeta }) {
   const facts = [
      { label: "Level", value: meta.level && LEVEL_LABEL[meta.level] },
      { label: "Difficulty", value: meta.difficulty && DIFFICULTY_LABEL[meta.difficulty] },
   ].filter(({ value }) => value);
   return (
      <header>
         <h1 className="m-0 text-title text-balance">{meta.title}</h1>
         {meta.summary ? <p className="mt-4 mb-0 text-body text-pretty text-muted-foreground">{meta.summary}</p> : null}
         {facts.length > 0 || meta.access === "premium" ? (
            <p className="mt-5 mb-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-supporting text-muted-foreground">
               {facts.map(({ label, value }, index) => (
                  <Fragment key={label}>
                     {index > 0 ? <span aria-hidden="true">·</span> : null}
                     <span>
                        <span className="sr-only">{label}: </span>
                        {value}
                     </span>
                  </Fragment>
               ))}
               {meta.access === "premium" ? <PremiumMark /> : null}
            </p>
         ) : null}
      </header>
   );
}
