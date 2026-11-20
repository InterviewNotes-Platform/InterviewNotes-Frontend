/*
 * The picker's search inside one loaded collection (P8-PREP-UX-02). Pure text matching over strings the page already
 * holds: it reads nothing, keeps the questions' own order, and never changes what a question says. Case and accents are
 * ignored; every word of the query must appear somewhere in the question's title, wording or group name.
 */

/** The most words of a query that count; a longer paste is cut so one search stays cheap and predictable. */
export const MAX_QUERY_WORDS = 8;

/** One piece of a string for display: matched pieces are marked. */
export type Piece = { text: string; hit: boolean };

const fold1 = (char: string) => char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The folded text and, for each folded unit, the index in the original string it came from. */
function fold(text: string): { folded: string; origin: number[] } {
   let folded = "";
   const origin: number[] = [];
   for (let i = 0; i < text.length; ) {
      const char = String.fromCodePoint(text.codePointAt(i)!);
      const piece = fold1(char);
      for (let k = 0; k < piece.length; k++) origin.push(i);
      folded += piece;
      i += char.length;
   }
   return { folded, origin };
}

/** The distinct words of a query, folded; empty when the query has none. */
export function queryWords(query: string): string[] {
   const words = fold(query).folded.split(/\s+/).filter(Boolean);
   return [...new Set(words)].slice(0, MAX_QUERY_WORDS);
}

/** The text a question is searched in, folded once so typing never re-folds the collection. */
export const searchable = (...parts: readonly (string | null | undefined)[]) => fold(parts.filter(Boolean).join("\n")).folded;

/** True when every word occurs in the folded text. No words match everything. */
export const matchesAll = (folded: string, words: readonly string[]) => words.every((word) => folded.includes(word));

/** The string cut into plain and marked pieces; marked pieces are where a word occurs. Concatenated, the pieces are the original. */
export function highlight(text: string, words: readonly string[]): Piece[] {
   if (words.length === 0 || text === "") return [{ text, hit: false }];
   const { folded, origin } = fold(text);
   const ranges: [number, number][] = [];
   for (const word of words) {
      for (let from = folded.indexOf(word); from !== -1; from = folded.indexOf(word, from + word.length)) {
         const start = origin[from];
         let end = from + word.length >= folded.length ? text.length : origin[from + word.length];
         // A character that folds to several units is marked whole, never cut in the middle.
         for (let at = from + word.length; at < folded.length && origin[at] === origin[at - 1]; at++) end = at + 1 < folded.length ? origin[at + 1] : text.length;
         ranges.push([start, end]);
      }
   }
   if (ranges.length === 0) return [{ text, hit: false }];
   ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
   const merged: [number, number][] = [];
   for (const range of ranges) {
      const last = merged.at(-1);
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
   }
   const pieces: Piece[] = [];
   let cursor = 0;
   for (const [start, end] of merged) {
      if (start > cursor) pieces.push({ text: text.slice(cursor, start), hit: false });
      pieces.push({ text: text.slice(start, end), hit: true });
      cursor = end;
   }
   if (cursor < text.length) pieces.push({ text: text.slice(cursor), hit: false });
   return pieces;
}
