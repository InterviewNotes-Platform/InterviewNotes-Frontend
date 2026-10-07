import "server-only";

import { getCatalogRelated, getCatalogTrack } from "./client";
import { homePlacement, lessonNeighbours, type LessonNeighbours } from "./curriculum";
import { catalogHref } from "./routes";
import type { CatalogItemType, CatalogMeta, CatalogTrack } from "./types";

/** Where one item sits in one Track, with the Lessons before and after it. Problems are never neighbours. */
export interface TrackPlacement extends LessonNeighbours {
   track: CatalogTrack;
}

export interface ItemNavigation {
   id: string;
   relations: Record<string, CatalogMeta[]>;
   /** The Track chosen by `S-CUR-1`, if any. Never promoted from another placement. */
   home: TrackPlacement | null;
   alternates: TrackPlacement[];
}

/** The item's place in the Track and its neighbouring Lessons across modules; null if the Track omits it. */
export function placeInTrack(track: CatalogTrack, itemId: string): TrackPlacement | null {
   const neighbours = lessonNeighbours(track, itemId);
   return neighbours && { track, ...neighbours };
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
   const chosen = homePlacement(placements);
   const found = await Promise.all(
      placements.map(async (placement) => {
         const track = await loadTrack(placement.track);
         const context = track && placeInTrack(track, id);
         return context ? { context, isHome: placement === chosen } : null;
      })
   );
   const contexts = found.filter((entry) => entry !== null);
   return {
      id,
      relations,
      home: contexts.find((entry) => entry.isHome)?.context ?? null,
      alternates: contexts.filter((entry) => !entry.isHome).map((entry) => entry.context),
   };
}
