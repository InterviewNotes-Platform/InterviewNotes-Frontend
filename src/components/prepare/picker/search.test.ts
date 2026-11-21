import { describe, expect, it } from "vitest";
import { highlight, matchesAll, MAX_QUERY_WORDS, queryWords, searchable } from "./search";

const joined = (pieces: { text: string }[]) => pieces.map(({ text }) => text).join("");
const marked = (pieces: { text: string; hit: boolean }[]) => pieces.filter(({ hit }) => hit).map(({ text }) => text);

describe("queryWords", () => {
   it("splits on whitespace, folds case and accents, and drops repeats", () => {
      expect(queryWords("  Déjà   VU deja ")).toEqual(["deja", "vu"]);
   });

   it("is empty for a blank query", () => {
      expect(queryWords("   ")).toEqual([]);
      expect(queryWords("")).toEqual([]);
   });

   it("keeps only the first words of a very long paste", () => {
      const paste = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
      expect(queryWords(paste)).toHaveLength(MAX_QUERY_WORDS);
   });
});

describe("matchesAll", () => {
   const text = searchable("Feedback that reshaped the plan", "Describe a time something a user told you", "Customer Obsession");

   it("needs every word, in any order and in any of the parts", () => {
      expect(matchesAll(text, queryWords("customer reshaped"))).toBe(true);
      expect(matchesAll(text, queryWords("customer frugality"))).toBe(false);
   });

   it("ignores case and accents on both sides", () => {
      expect(matchesAll(searchable("Résumé review"), queryWords("RESUME"))).toBe(true);
   });

   it("matches everything when there are no words", () => {
      expect(matchesAll(text, [])).toBe(true);
   });
});

describe("highlight", () => {
   it("returns the original text untouched when nothing matches or there are no words", () => {
      expect(highlight("Tell me about owning a fix.", [])).toEqual([{ text: "Tell me about owning a fix.", hit: false }]);
      expect(highlight("Tell me about owning a fix.", ["zzz"])).toEqual([{ text: "Tell me about owning a fix.", hit: false }]);
   });

   it("marks each occurrence of each word and keeps the original letters", () => {
      const pieces = highlight("Owning a fix, then Owning it again", queryWords("owning FIX"));
      expect(marked(pieces)).toEqual(["Owning", "fix", "Owning"]);
      expect(joined(pieces)).toBe("Owning a fix, then Owning it again");
   });

   it("merges overlapping words into one mark", () => {
      const pieces = highlight("customer", queryWords("custom stomer"));
      expect(marked(pieces)).toEqual(["customer"]);
   });

   it("marks an accented letter for an unaccented query, and the other way round", () => {
      expect(marked(highlight("Résumé review", queryWords("resume")))).toEqual(["Résumé"]);
      expect(marked(highlight("Resume review", queryWords("résumé")))).toEqual(["Resume"]);
   });

   it("never loses or reorders a character", () => {
      const text = "Earth’s Best Employer: “Strive” — 100% (really)";
      for (const query of ["earth", "best strive", "100", "(really", "’s"]) expect(joined(highlight(text, queryWords(query)))).toBe(text);
   });
});
