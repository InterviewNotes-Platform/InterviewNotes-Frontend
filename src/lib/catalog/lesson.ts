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
   knowledge: LinkedMeta[];
   lessons: LinkedMeta[];
   problems: LinkedMeta[];
}

// The closed P1 vocabulary (§6.5) minus `prerequisite`, which has its own place. Inline `mentions` are never returned.
const RELATED_KEYS = new Set(["applied_in", "applies", "prerequisite_of", "related"]);

/** The linkable `prerequisite` targets: what the Lesson builds on. */
export const prerequisitesOf = (relations: Record<string, CatalogMeta[]>): LinkedMeta[] => linkableEntries(relations.prerequisite ?? []);

/**
 * Sorts the relation payload by relation name AND target type, from metadata alone. Order is the API's. A target
 * appears once, at the first place it qualifies for (S-LSN-16): Builds on, then whatever the close already shows
 * (`claimed`: the Next lesson and the Practice Problems), then these groups. Unlinkable targets and unknown
 * relation names are dropped.
 */
export function lessonRelations(relations: Record<string, CatalogMeta[]>, claimed: readonly string[] = []): LessonRelations {
   const prerequisites = prerequisitesOf(relations);
   const placed = new Set([...prerequisites.map(({ entry }) => entry.id), ...claimed]);
   const rest: Record<CatalogMeta["type"], LinkedMeta[]> = { knowledge: [], lesson: [], problem: [] };
   for (const [name, items] of Object.entries(relations)) {
      if (!RELATED_KEYS.has(name)) continue;
      for (const link of linkableEntries(items)) {
         if (placed.has(link.entry.id)) continue;
         placed.add(link.entry.id);
         rest[link.entry.type].push(link);
      }
   }
   return { prerequisites, knowledge: rest.knowledge, lessons: rest.lesson, problems: rest.problem };
}
