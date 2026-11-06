import { sequenceOf } from "./curriculum";
import type { CatalogOutlineEntry, CatalogTrack } from "./types";

/**
 * Tracks whose Lessons are alternative levels, not a sequence (Amendment A-9, S6-TRK-5, S6-RDR-16). Their overview has no
 * Start, and none of their Lessons offers another level as Next, Previous or End of Track.
 */
export const LEVEL_CHOICE_TRACKS: ReadonlySet<string> = new Set(["behavioral-interview-preparation"]);

export const isLevelChoiceTrack = ({ slug }: Pick<CatalogTrack, "slug">): boolean => LEVEL_CHOICE_TRACKS.has(slug);

/** The levels of a level-choice Track: every Lesson in curriculum order, as equals. */
export function levelsOf(track: CatalogTrack): CatalogOutlineEntry[] {
   return sequenceOf(track)
      .filter(({ entry }) => entry.type === "lesson")
      .map(({ entry }) => entry);
}
