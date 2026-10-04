import { linkableEntries } from "@/lib/catalog/routes";
import type { CatalogModule, CatalogOutlineEntry, CatalogTrack } from "@/lib/catalog/types";
import { EntryRow } from "./EntryRow";

function EntryList({ entries, currentId }: { entries: CatalogOutlineEntry[]; currentId?: string }) {
   const rows = linkableEntries(entries);
   if (rows.length === 0) return <p className="text-supporting text-muted-foreground">No published items.</p>;
   return (
      <ol className="list-decimal space-y-2 pl-5 marker:text-muted-foreground">
         {rows.map(({ entry, href }) => (
            <EntryRow key={entry.id} entry={entry} href={href} current={entry.id === currentId} />
         ))}
      </ol>
   );
}

/** A Track's modules and their items exactly as the API ordered them; `currentId` marks one item. */
export function TrackOutline({ track, currentId }: { track: CatalogTrack; currentId?: string }) {
   if (track.modules.length === 0) {
      return <p className="text-supporting text-muted-foreground">This Track has no published content yet.</p>;
   }
   return (
      <nav aria-label={`${track.title} outline`} className="space-y-10">
         {track.modules.map((module) => (
            <section key={module.key}>
               <h3 className="mt-0 mb-3 text-subsection">{module.title}</h3>
               <EntryList entries={module.items} currentId={currentId} />
            </section>
         ))}
      </nav>
   );
}

/** The members of one module, in the API's order. A module is context only and has no page. */
export function ModuleNavigation({ module, currentId }: { module: CatalogModule; currentId?: string }) {
   return (
      <nav aria-label={`Module: ${module.title}`}>
         <h2 className="mt-0 mb-3 text-subsection">In this module: {module.title}</h2>
         <EntryList entries={module.items} currentId={currentId} />
      </nav>
   );
}
