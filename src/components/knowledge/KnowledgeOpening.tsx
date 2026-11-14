import { Fragment } from "react";
import { PremiumMark } from "@/components/catalog/EntryRow";
import { countExhibits } from "@/components/lesson/LessonOpening";
import { categoryLabel } from "@/lib/catalog/knowledge";
import type { CatalogItem } from "@/lib/catalog/types";

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** The released sections' own tables and diagrams; nothing withheld is counted, because it never arrives. */
export function entryCounts(item: Pick<CatalogItem, "sections">): { sections: number; tables: number; diagrams: number } {
   const markdown = item.sections.flatMap(({ body }) => (body.format === "markdown@1" ? [body.text] : [])).join("\n\n");
   return { sections: item.sections.length, ...countExhibits(markdown) };
}

/**
 * A Knowledge entry's title page (D × F v3 §4.4, P8-T28): a centred kicker with its category, the serif title, the italic
 * standfirst and one line of facts counted from the released content. No read time or other estimate. Readable pages only; the
 * locked teaser keeps `KnowledgeHeader`.
 */
export function KnowledgeOpening({ item }: { item: CatalogItem }) {
   const { sections, tables, diagrams } = entryCounts(item);
   const kicker = ["Knowledge", categoryLabel(item.category)].filter(Boolean).join(" · ");
   const facts = [sections > 0 && plural(sections, "section"), tables > 0 && plural(tables, "table"), diagrams > 0 && plural(diagrams, "diagram")].filter(
      (fact): fact is string => Boolean(fact)
   );
   return (
      <header className="lesson-opening">
         <p className="lesson-kicker">{kicker}</p>
         <h1 className="lesson-title">{item.title}</h1>
         {item.summary ? <p className="lesson-standfirst">{item.summary}</p> : null}
         {facts.length > 0 || item.access === "premium" ? (
            <p className="lesson-meta">
               {facts.map((fact, index) => (
                  <Fragment key={fact}>
                     {index > 0 ? <span aria-hidden="true">·</span> : null}
                     <span>{fact}</span>
                  </Fragment>
               ))}
               {item.access === "premium" ? <PremiumMark /> : null}
            </p>
         ) : null}
      </header>
   );
}
