import { catalogHref, linkableEntries } from "./routes";
import type { CatalogAccess, CatalogItemType, CatalogTrack } from "./types";

/**
 * The reader's Track contents (S6-RDR-3): a Track's outline as groups of linkable entries. Pure: it adapts the outline a
 * page has already read and adds no request, no order of its own and no learner state (S6-RDR-2, -13).
 */

export interface OutlineEntry {
   id: string;
   title: string;
   href: string;
   type: CatalogItemType;
   /** The visible kind of a Problem, which is practice and not reading (P3 `S-MOD-2`); null for every other type. */
   kind: "Practice problem" | null;
   access: CatalogAccess;
   current: boolean;
}

export interface OutlineGroup {
   key: string;
   /** The Module's place among all of the Track's Modules, empty ones included, as the Track page numbers it. */
   number: number;
   title: string;
   entries: OutlineEntry[];
   /** The group that holds the current entry; the only one that starts open. */
   current: boolean;
}

export interface TrackSidebarOutline {
   title: string;
   /** `/tracks/<slug>`; null only for a slug that maps to no canonical route. */
   href: string | null;
   groups: OutlineGroup[];
}

/**
 * Module groups in the API's order, each with its linkable entries in placement order. A Module with none is left out.
 * Null when nothing is linkable, so a caller shows no sidebar rather than an empty one.
 */
export function outlineOf(track: CatalogTrack, currentId: string): TrackSidebarOutline | null {
   const groups = track.modules.flatMap((module, index): OutlineGroup[] => {
      const entries = linkableEntries(module.items).map(
         ({ entry, href }): OutlineEntry => ({
            id: entry.id,
            title: entry.title,
            href,
            type: entry.type,
            kind: entry.type === "problem" ? "Practice problem" : null,
            access: entry.access,
            current: entry.id === currentId,
         })
      );
      if (entries.length === 0) return [];
      return [{ key: module.key, number: index + 1, title: module.title, entries, current: entries.some(({ current }) => current) }];
   });
   if (groups.length === 0) return null;
   // A current entry the outline cannot link still leaves one group open to start from.
   const opened = groups.some(({ current }) => current) ? groups : groups.map((group, index) => ({ ...group, current: index === 0 }));
   return { title: track.title, href: catalogHref(`track.${track.slug}`), groups: opened };
}
