import type { CatalogMeta } from "./types";

/** A published Problem as search needs it: its list metadata and the reader route it opens. */
export interface SearchableProblem {
   meta: CatalogMeta;
   href: string;
}

const fold = (text: string) => text.toLocaleLowerCase("en").replace(/-/g, " ");

/** Problems whose title, summary or a topic holds every word of the term, case-insensitively, in the list's own order. */
export function matchProblems(index: readonly SearchableProblem[], term: string): SearchableProblem[] {
   const words = fold(term).split(/\s+/).filter(Boolean);
   if (words.length === 0) return [...index];
   return index.filter(({ meta }) => {
      const haystack = fold([meta.title, meta.summary, ...meta.tags].join(" "));
      return words.every((word) => haystack.includes(word));
   });
}
