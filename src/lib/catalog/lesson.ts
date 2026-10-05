import { linkableEntries } from "./routes";
import type { CatalogHeading, CatalogMeta } from "./types";

/** A heading as the contents list shows it. `id` is the API's, byte for byte. */
export interface ContentsEntry {
   id: string;
   level: 2 | 3;
   text: string;
}

const MIN_CONTENTS_ENTRIES = 2;

/** The API returns heading source (`Sizing the \`kv_cache\` [budget](ref:…)`); readers see it without markup. */
export function plainHeading(text: string): string {
   return text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*]|~~/g, "").trim();
}

/**
 * The Lesson's h2/h3 entries in document order, or none when there are fewer than two. The API's ids are
 * unique by contract, so a repeated id means the list cannot be trusted: no contents, never a rewritten id.
 */
export function contentsOf(headings: readonly CatalogHeading[]): ContentsEntry[] {
   const ids = new Set<string>();
   for (const { id } of headings) {
      if (!id || ids.has(id)) return [];
      ids.add(id);
   }
   const entries = headings
      .filter(({ level }) => level === 2 || level === 3)
      .map(({ id, level, text }) => ({ id, level: level as 2 | 3, text: plainHeading(text) }));
   return entries.length >= MIN_CONTENTS_ENTRIES ? entries : [];
}

export type LinkedMeta = { entry: CatalogMeta; href: string };

export interface LessonRelations {
   /** `prerequisite`: what to read before this Lesson (Knowledge or Lesson). */
   prerequisites: LinkedMeta[];
   /** `prerequisite_of` Problems, at most PRACTICE_LIMIT: this Lesson's next step into Practice. */
   practice: LinkedMeta[];
   knowledge: LinkedMeta[];
   lessons: LinkedMeta[];
   problems: LinkedMeta[];
}

export const PRACTICE_LIMIT = 2;

// The closed P1 vocabulary (§6.5) minus `prerequisite`, which has its own place. Inline `mentions` are never returned.
const RELATED_KEYS = new Set(["applied_in", "applies", "prerequisite_of", "related"]);

/**
 * Sorts the relation payload by relation name AND target type, from metadata alone. Order is the API's. A target
 * appears once: a prerequisite or a Practice Problem is not repeated below, and Problems past the Practice limit
 * fall through to the quiet Problems group. Unlinkable targets and unknown relation names are dropped.
 */
export function lessonRelations(relations: Record<string, CatalogMeta[]>): LessonRelations {
   const prerequisites = linkableEntries(relations.prerequisite ?? []);
   const practice = linkableEntries(relations.prerequisite_of ?? [])
      .filter(({ entry }) => entry.type === "problem")
      .slice(0, PRACTICE_LIMIT);

   const placed = new Set([...prerequisites, ...practice].map(({ entry }) => entry.id));
   const rest: Record<CatalogMeta["type"], LinkedMeta[]> = { knowledge: [], lesson: [], problem: [] };
   for (const [name, items] of Object.entries(relations)) {
      if (!RELATED_KEYS.has(name)) continue;
      for (const link of linkableEntries(items)) {
         if (placed.has(link.entry.id)) continue;
         placed.add(link.entry.id);
         rest[link.entry.type].push(link);
      }
   }
   return { prerequisites, practice, knowledge: rest.knowledge, lessons: rest.lesson, problems: rest.problem };
}
