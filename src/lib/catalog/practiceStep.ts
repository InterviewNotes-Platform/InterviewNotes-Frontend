import { interposedProblems } from "./curriculum";
import { catalogEntryHref, linkableEntries } from "./routes";
import type { CatalogMeta, CatalogTrack } from "./types";

/**
 * The Lesson's Practice step (P3 spec §8). Pure: selection, merge, bound and the relevance line, from the curriculum
 * and the relations the page already holds. The loader adds the few reads a row may need; nothing here fetches.
 */

export const PRACTICE_LIMIT = 2;

type Relations = Record<string, CatalogMeta[]>;

/** A Problem chosen for Practice, with the bases that qualified it, before any read. */
export interface PracticeCandidate {
   id: string;
   slug: string;
   title: string;
   access: CatalogMeta["access"];
   href: string;
   /** The Module the Problem is placed in when it is Interposed or trailing; null otherwise. */
   placedIn: string | null;
   /** The Problem is one of the Lesson's `prerequisite_of` relations. */
   prerequisite: boolean;
   /** Public metadata from the Lesson's relations, when the Problem is among them. */
   meta: CatalogMeta | null;
}

/** What the page shows for one Practice Problem: public fields and one grounded line saying why it is here. */
export interface PracticeRow {
   id: string;
   title: string;
   href: string;
   access: CatalogMeta["access"];
   summary: string | null;
   difficulty: CatalogMeta["difficulty"];
   reason: string;
}

/** Interposed Problems in Sequence order, then `prerequisite_of` Problems in API order; a Problem in both keeps both bases (S-PRC-1, S-PRC-2). */
export function practiceCandidates(
   track: CatalogTrack | null,
   lessonId: string,
   relations: Relations,
   claimed: readonly string[] = []
): PracticeCandidate[] {
   const known = new Map(Object.values(relations).flat().map((entry) => [entry.id, entry]));
   const merged = new Map<string, PracticeCandidate>();
   const taken = new Set(claimed);

   for (const entry of track ? (interposedProblems(track, lessonId) ?? []) : []) {
      const href = catalogEntryHref(entry);
      if (!href || taken.has(entry.id)) continue;
      const placedModule = track?.modules.find(({ items }) => items.some(({ id }) => id === entry.id));
      const { id, slug, title, access } = entry;
      merged.set(id, { id, slug, title, access, href, placedIn: placedModule?.title ?? null, prerequisite: false, meta: known.get(id) ?? null });
   }
   for (const { entry, href } of linkableEntries(relations.prerequisite_of ?? [])) {
      if (entry.type !== "problem" || taken.has(entry.id)) continue;
      const existing = merged.get(entry.id);
      if (existing) existing.prerequisite = true;
      else {
         const { id, slug, title, access } = entry;
         merged.set(id, { id, slug, title, access, href, placedIn: null, prerequisite: true, meta: entry });
      }
   }
   return [...merged.values()].slice(0, PRACTICE_LIMIT);
}

/** The first Knowledge the Lesson applies that the Problem applies too, in the Lesson's API order (S-PRC-5). */
export function sharedKnowledge(lessonApplies: readonly CatalogMeta[], problemApplies: readonly CatalogMeta[]): string | null {
   const theirs = new Set(problemApplies.filter(({ type }) => type === "knowledge").map(({ id }) => id));
   return lessonApplies.find(({ type, id }) => type === "knowledge" && theirs.has(id))?.title ?? null;
}

/** Bases in the order Placement, Prerequisite, Shared Knowledge, joined with " · " (S-PRC-5). */
export function relevanceOf({ placedIn, prerequisite }: Pick<PracticeCandidate, "placedIn" | "prerequisite">, shared: string | null): string {
   return [
      placedIn ? `Practice for this part of ${placedIn}` : null,
      prerequisite ? "Builds on this lesson" : null,
      shared ? `Also applies ${shared}` : null,
   ]
      .filter(Boolean)
      .join(" · ");
}

/** A row from a candidate, the public `/meta` read when the relations lacked it, and the shared-Knowledge title if any. */
export function practiceRow(candidate: PracticeCandidate, fetched: CatalogMeta | null, shared: string | null): PracticeRow {
   const meta = candidate.meta ?? fetched;
   return {
      id: candidate.id,
      title: candidate.title,
      href: candidate.href,
      access: candidate.access,
      summary: meta?.summary || null,
      difficulty: meta?.difficulty ?? null,
      reason: relevanceOf(candidate, shared),
   };
}
