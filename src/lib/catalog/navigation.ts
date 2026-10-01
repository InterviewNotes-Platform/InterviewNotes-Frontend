import "server-only";

import { getCatalogRelated, getCatalogTrack } from "./client";
import { catalogHref, linkableEntries } from "./routes";
import type {
   CatalogItemType,
   CatalogMeta,
   CatalogModule,
   CatalogOutlineEntry,
   CatalogTrack,
} from "./types";

/** Where one item sits in one Track, with its neighbours in the Track's own order. */
export interface TrackPlacement {
   track: CatalogTrack;
   module: CatalogModule;
   previous: CatalogOutlineEntry | null;
   next: CatalogOutlineEntry | null;
}

export interface ItemNavigation {
   id: string;
   relations: Record<string, CatalogMeta[]>;
   /** The Track the API marks primary, if any. Never inferred. */
   home: TrackPlacement | null;
   alternates: TrackPlacement[];
}

/** The item's place in the Track and its neighbours across modules; null if the Track omits it. */
export function placeInTrack(track: CatalogTrack, itemId: string): TrackPlacement | null {
   const ordered = track.modules.flatMap((module) =>
      linkableEntries(module.items).map(({ entry }) => ({ module, entry }))
   );
   const index = ordered.findIndex(({ entry }) => entry.id === itemId);
   if (index === -1) return null;
   return {
      track,
      module: ordered[index].module,
      previous: ordered[index - 1]?.entry ?? null,
      next: ordered[index + 1]?.entry ?? null,
   };
}

async function loadTrack(slug: string): Promise<CatalogTrack | null> {
   if (!catalogHref(`track.${slug}`)) return null;
   const result = await getCatalogTrack(slug);
   return result.status === "ok" ? result.data : null;
}

/**
 * Relations and Track context for an item the caller has already been allowed to read. Anything
 * the API does not supply (or supplies for another item) is left out, never reconstructed.
 */
export async function loadItemNavigation(
   type: CatalogItemType,
   slug: string
): Promise<ItemNavigation | null> {
   const related = await getCatalogRelated(type, slug);
   if (related.status !== "ok" || related.data.id !== `${type}.${slug}`) return null;

   const { id, relations, placements } = related.data;
   const found = await Promise.all(
      placements.map(async (placement) => {
         const track = await loadTrack(placement.track);
         const context = track && placeInTrack(track, id);
         return context ? { context, primary: placement.primary } : null;
      })
   );
   const contexts = found.filter((entry) => entry !== null);
   return {
      id,
      relations,
      home: contexts.find((entry) => entry.primary)?.context ?? null,
      alternates: contexts.filter((entry) => !entry.primary).map((entry) => entry.context),
   };
}
