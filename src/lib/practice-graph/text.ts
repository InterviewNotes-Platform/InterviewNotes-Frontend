/**
 * The learner-string rules of `graph-editor-contract.md` §6.1, mirroring the backend's `app/practice/graph/strings.py`:
 * NFC, then ECMAScript `trim()` (the backend uses the same set), then the stored form is checked. Lengths count Unicode
 * code points, never UTF-16 units. There is no HTML or script blacklist: text is inert and rendered only as text nodes.
 */

export type TextRule = "invalid_unicode" | "control_character" | "bidi_control" | "noncharacter" | "unbroken_run";

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const CONTROL = /\p{Cc}/u;
const BIDI = /[‪-‮⁦-⁩]/u;
const TRIM_CLASS = "\\t\\n\\v\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF";
const RUN = new RegExp(`[^${TRIM_CLASS}]{257,}`, "u");

export const MAX_UNBROKEN_RUN = 256;

export const codePoints = (value: string): number => [...value].length;

export const isNoncharacter = (cp: number): boolean => (cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe;

/** The stored form: what the server keeps and what the hashes cover. */
export function storedText(value: string): string {
   return value.normalize("NFC").trim();
}

/** The first rule the stored form breaks, or null. */
export function textRule(value: string, allowNewline: boolean): TextRule | null {
   if (LONE_SURROGATE.test(value)) return "invalid_unicode";
   const text = storedText(value);
   for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (CONTROL.test(ch) && !(allowNewline && ch === "\n")) return "control_character";
      if (BIDI.test(ch)) return "bidi_control";
      if (isNoncharacter(cp)) return "noncharacter";
   }
   return RUN.test(text) ? "unbroken_run" : null;
}

/**
 * Typing and pasting: characters the server would refuse are dropped as they arrive (a tab becomes a space), and the text is cut
 * at `limit` code points. `changed` says something was removed, so the field can say so. Long unbroken runs are left for validation.
 */
export function sanitizeInput(value: string, { limit, newline }: { limit: number; newline: boolean }): { value: string; changed: boolean } {
   let out = "";
   let count = 0;
   let changed = false;
   const chars = [...value.replace(/\r\n?/g, "\n")];
   for (const ch of chars) {
      const cp = ch.codePointAt(0)!;
      let kept: string | null = ch;
      if (cp >= 0xd800 && cp <= 0xdfff) kept = null;
      else if (ch === "\t") kept = " ";
      else if (CONTROL.test(ch) && !(newline && ch === "\n")) kept = null;
      else if (BIDI.test(ch) || isNoncharacter(cp)) kept = null;
      if (kept !== ch) changed = true;
      if (kept === null) continue;
      if (count >= limit) {
         changed = true;
         break;
      }
      out += kept;
      count += 1;
   }
   return { value: out, changed };
}
