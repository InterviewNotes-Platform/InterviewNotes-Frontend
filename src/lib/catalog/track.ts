import { startLesson } from "./curriculum";
import { linkableEntries } from "./routes";
import type { CatalogModule, CatalogOutlineEntry, CatalogTrack } from "./types";

type CurriculumType = "lesson" | "problem";
type CurriculumEntry = CatalogOutlineEntry & { type: CurriculumType };

// P1 §6.6: a Track places Lessons and Problems only. Any other entry is not curriculum.
const isCurriculum = (entry: CatalogOutlineEntry): entry is CurriculumEntry => entry.type === "lesson" || entry.type === "problem";

/** An outline entry that maps to a canonical route, with the module that groups it. */
export interface PlacedEntry {
   entry: CurriculumEntry;
   href: string;
   module: CatalogModule;
}

export interface Curriculum {
   /** Every module in the API's order, each with the entries that can be linked, in the API's order, and their counts. */
   modules: { module: CatalogModule; rows: PlacedEntry[]; counts: Record<CurriculumType, number> }[];
   /**
    * Start(T), the first Lesson in curriculum order (S-CUR-13), or null when there is none; never a Problem.
    * "Linkable" means the route only: the outline is public and has no viewer, and the item page decides what
    * that viewer may read.
    */
   start: PlacedEntry | null;
   /** Counts of linkable entries only, so they match what the outline renders. */
   counts: Record<CurriculumType, number>;
   /** The Problems placed in the outline, for supporting context; derived from the outline alone. */
   practice: PlacedEntry[];
}

/** Everything the Track page shows about the curriculum, computed from the one outline payload. */
export function curriculumOf(track: CatalogTrack): Curriculum {
   const modules = track.modules.map((module) => {
      const rows = linkableEntries(module.items.filter(isCurriculum)).map((row) => ({ ...row, module }));
      const problem = rows.filter(({ entry }) => entry.type === "problem").length;
      return { module, rows, counts: { lesson: rows.length - problem, problem } };
   });
   const placed = modules.flatMap(({ rows }) => rows);
   const practice = placed.filter(({ entry }) => entry.type === "problem");
   const start = startLesson(track);
   return {
      modules,
      start: placed.find(({ entry }) => entry.id === start?.id) ?? null,
      counts: { lesson: placed.length - practice.length, problem: practice.length },
      practice,
   };
}
