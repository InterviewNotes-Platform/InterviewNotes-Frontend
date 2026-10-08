import { linkableEntries } from "./routes";
import type { CatalogModule, CatalogOutlineEntry, CatalogPlacement, CatalogTrack } from "./types";

/**
 * The curriculum rules (P3 spec §4) over a Track outline. Pure: no I/O, no learner state. Problems are never
 * navigation stops; Previous and Next always name Lessons.
 */

export interface SequenceEntry {
   entry: CatalogOutlineEntry;
   module: CatalogModule;
   /** Index among all of the Track's Modules, empty ones included. */
   moduleIndex: number;
}

/** Sequence(T): linkable entries in Module order, then placement order (S-CUR-3). */
export function sequenceOf(track: CatalogTrack): SequenceEntry[] {
   return track.modules.flatMap((module, moduleIndex) =>
      linkableEntries(module.items).map(({ entry }) => ({ entry, module, moduleIndex }))
   );
}

const isLesson = ({ entry }: SequenceEntry) => entry.type === "lesson";
const isProblem = ({ entry }: SequenceEntry) => entry.type === "problem";

/** The home placement among those the API returned (S-CUR-1 a, b, c); null when there is none. Never guesses. */
export function homePlacement<T extends Pick<CatalogPlacement, "primary">>(placements: readonly T[]): T | null {
   const primary = placements.filter((placement) => placement.primary);
   if (primary.length === 1) return primary[0];
   return primary.length === 0 && placements.length === 1 ? placements[0] : null;
}

export interface LessonNeighbours {
   module: CatalogModule;
   previousLesson: CatalogOutlineEntry | null;
   nextLesson: CatalogOutlineEntry | null;
}

/** Nearest Lesson before and after an item, across Modules (S-CUR-5, S-CUR-6, S-CUR-14); null if the Track omits it. */
export function lessonNeighbours(track: CatalogTrack, itemId: string): LessonNeighbours | null {
   const sequence = sequenceOf(track);
   const index = sequence.findIndex(({ entry }) => entry.id === itemId);
   if (index === -1) return null;
   const next = sequence.slice(index + 1).find(isLesson);
   const previous = sequence.slice(0, index).findLast(isLesson);
   return { module: sequence[index].module, previousLesson: previous?.entry ?? null, nextLesson: next?.entry ?? null };
}

export interface Position {
   /** 1-based. */
   index: number;
   count: number;
}

export interface LessonPosition {
   module: Position;
   lesson: Position;
}

/** Module n of M over all Modules; Lesson n of N over the Module's Lesson entries (S-CUR-4). Null for a non-Lesson. */
export function lessonPosition(track: CatalogTrack, lessonId: string): LessonPosition | null {
   const sequence = sequenceOf(track);
   const current = sequence.find(({ entry }) => entry.id === lessonId);
   if (!current || !isLesson(current)) return null;
   const lessons = sequence.filter((candidate) => candidate.module === current.module && isLesson(candidate));
   return {
      module: { index: current.moduleIndex + 1, count: track.modules.length },
      lesson: { index: lessons.findIndex(({ entry }) => entry.id === lessonId) + 1, count: lessons.length },
   };
}

/** Problems strictly between a Lesson and its Next Lesson, or to the end of the Track for the last Lesson (S-CUR-9). */
export function interposedProblems(track: CatalogTrack, lessonId: string): CatalogOutlineEntry[] | null {
   const sequence = sequenceOf(track);
   const index = sequence.findIndex(({ entry }) => entry.id === lessonId);
   if (index === -1 || !isLesson(sequence[index])) return null;
   const after = sequence.slice(index + 1);
   const end = after.findIndex(isLesson);
   return (end === -1 ? after : after.slice(0, end)).filter(isProblem).map(({ entry }) => entry);
}

/** Problems before the Track's first Lesson; they belong to no Lesson (S-CUR-10). All Problems if there is no Lesson. */
export function leadingProblems(track: CatalogTrack): CatalogOutlineEntry[] {
   const sequence = sequenceOf(track);
   const first = sequence.findIndex(isLesson);
   return (first === -1 ? sequence : sequence.slice(0, first)).filter(isProblem).map(({ entry }) => entry);
}

/** Start(T): the first Lesson, never a Problem; null when the Track has none (S-CUR-13). */
export function startLesson(track: CatalogTrack): CatalogOutlineEntry | null {
   return sequenceOf(track).find(isLesson)?.entry ?? null;
}
