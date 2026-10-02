import { linkableEntries } from "@/lib/catalog/routes";
import type { CatalogMeta } from "@/lib/catalog/types";
import { EntryRow } from "./EntryRow";

const RELATION_LABEL: Record<string, string> = {
   prerequisite: "Read first",
   prerequisite_of: "Needed for",
   applies: "Applies",
   applied_in: "Applied in",
   related: "Related",
   mentions: "Mentions",
   mentioned_in: "Mentioned in",
};

const labelFor = (relation: string) => RELATION_LABEL[relation] ?? relation.replaceAll("_", " ");

/** The item's graph neighbours, grouped and ordered as the API returned them; metadata only. */
export function RelatedContent({ relations }: { relations: Record<string, CatalogMeta[]> }) {
   const groups = Object.entries(relations)
      .map(([relation, items]) => ({ relation, rows: linkableEntries(items) }))
      .filter((group) => group.rows.length > 0);
   if (groups.length === 0) return null;
   return (
      <section aria-labelledby="related-content">
         <h2 id="related-content" className="mb-3 text-xl font-semibold text-foreground">
            Related content
         </h2>
         <div className="space-y-5">
            {groups.map(({ relation, rows }) => (
               <div key={relation}>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                     {labelFor(relation)}
                  </h3>
                  <ul className="space-y-3">
                     {rows.map(({ entry, href }) => (
                        <EntryRow key={entry.id} entry={entry} href={href} />
                     ))}
                  </ul>
               </div>
            ))}
         </div>
      </section>
   );
}
