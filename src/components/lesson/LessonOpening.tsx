import { Fragment } from "react";
import { DIFFICULTY_LABEL, LEVEL_LABEL, PremiumMark } from "@/components/catalog/EntryRow";
import type { CatalogMeta } from "@/lib/catalog/types";

export interface LessonCounts {
   chapters: number;
   tables: number;
   diagrams: number;
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

const FENCE = /^ {0,3}(`{3,}|~{3,})([^\n]*)\n[\s\S]*?^ {0,3}\1[ \t]*$/gm;
const DELIMITER_ROW = /^(?=[^\n]*\|)[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/gm;

/** What the body holds, from its own markdown: mermaid fences, and GFM table delimiter rows outside any fence. */
export function countExhibits(markdown: string): Pick<LessonCounts, "tables" | "diagrams"> {
   const fences = [...markdown.matchAll(FENCE)];
   const diagrams = fences.filter(([, , info]) => /^mermaid\b/.test(info.trim())).length;
   const tables = markdown.replace(FENCE, "").match(DELIMITER_ROW)?.length ?? 0;
   return { tables, diagrams };
}

/**
 * The Lesson's title page (D × F v3 §4.4): a centred kicker, the serif title and italic standfirst, and one metadata line.
 * Readable pages only; the locked teaser keeps `LessonHeader`, so nothing here can reach a withheld page.
 */
export function LessonOpening({ meta, kicker, counts }: { meta: CatalogMeta; kicker: string; counts: LessonCounts }) {
   type Fact = { label: string | null; value: string };
   const facts = ([
      meta.level && { label: "Level", value: LEVEL_LABEL[meta.level] },
      meta.difficulty && { label: "Difficulty", value: DIFFICULTY_LABEL[meta.difficulty] },
      counts.chapters > 0 && { label: null, value: plural(counts.chapters, "chapter") },
      counts.tables > 0 && { label: null, value: plural(counts.tables, "table") },
      counts.diagrams > 0 && { label: null, value: plural(counts.diagrams, "diagram") },
   ] as (Fact | false | null | "")[]).filter((fact): fact is Fact => Boolean(fact));
   return (
      <header className="lesson-opening">
         <p className="lesson-kicker">{kicker}</p>
         <h1 className="lesson-title">{meta.title}</h1>
         {meta.summary ? <p className="lesson-standfirst">{meta.summary}</p> : null}
         {facts.length > 0 || meta.access === "premium" ? (
            <p className="lesson-meta">
               {facts.map(({ label, value }, index) => (
                  <Fragment key={value}>
                     {index > 0 ? <span aria-hidden="true">·</span> : null}
                     <span>
                        {label ? <span className="sr-only">{label}: </span> : null}
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
