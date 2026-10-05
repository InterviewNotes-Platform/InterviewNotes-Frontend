import { linkableEntries } from "@/lib/catalog/routes";
import { cn } from "@/lib/utils";
import type { CatalogModule, CatalogOutlineEntry, CatalogTrack } from "@/lib/catalog/types";
import { EntryRow } from "./EntryRow";

function EntryList({ entries, currentId, prefetch }: { entries: CatalogOutlineEntry[]; currentId?: string; prefetch?: false }) {
   const rows = linkableEntries(entries);
   if (rows.length === 0) return <p className="text-supporting text-muted-foreground">No published items.</p>;
   return (
      <ol className="list-decimal space-y-2 pl-5 marker:text-muted-foreground">
         {rows.map(({ entry, href }) => (
            <EntryRow key={entry.id} entry={entry} href={href} current={entry.id === currentId} prefetch={prefetch} />
         ))}
      </ol>
   );
}

/** A Track's modules and their items exactly as the API ordered them; `currentId` marks one item. */
export function TrackOutline({ track, currentId, prefetch }: { track: CatalogTrack; currentId?: string; prefetch?: false }) {
   if (track.modules.length === 0) {
      return <p className="text-supporting text-muted-foreground">This Track has no published content yet.</p>;
   }
   return (
      <nav aria-label={`${track.title} outline`} className="space-y-10">
         {track.modules.map((module) => (
            <section key={module.key}>
               <h3 className="mt-0 mb-3 text-subsection">{module.title}</h3>
               <EntryList entries={module.items} currentId={currentId} prefetch={prefetch} />
            </section>
         ))}
      </nav>
   );
}

/** The members of one module, in the API's order. A module is context only and has no page. */
export function ModuleNavigation({
   module,
   currentId,
   prefetch,
   quiet = false,
}: {
   module: CatalogModule;
   currentId?: string;
   prefetch?: false;
   /** A smaller heading, for a page where this is context rather than a section of its own. */
   quiet?: boolean;
}) {
   return (
      <nav aria-label={`Module: ${module.title}`}>
         <h2 className={cn("mt-0 mb-3", quiet ? "text-body font-semibold" : "text-subsection")}>In this module: {module.title}</h2>
         <EntryList entries={module.items} currentId={currentId} prefetch={prefetch} />
      </nav>
   );
}
