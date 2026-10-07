export interface FenceInfo {
   /** The declared language token exactly as written; empty when the fence has none. */
   language: string;
   title?: string;
   caption?: string;
   alt?: string;
}

/** Keys each kind of fence honours (S-MD-1): `title` on code, `caption` and `alt` on a diagram. */
const KEYS = { code: ["title"], mermaid: ["caption", "alt"] } as const;

// info = language *( WS key="value" ): WS before every attribute, a value has no quote or line break.
const ATTRIBUTES = /^[ \t]*(?:[a-z]+="[^"\r\n]*"(?:[ \t]+[a-z]+="[^"\r\n]*")*)?[ \t]*$/;
const ATTRIBUTE = /([a-z]+)="([^"\r\n]*)"/g;

/**
 * What a fence's info string says: its language and the metadata it may carry. Pure: it never throws or logs.
 * Unknown and type-invalid keys are ignored, the first duplicate wins and an empty value is absent. Attribute
 * text that does not fit the grammar drops all metadata and keeps the language (S-MD-1 … S-MD-4).
 */
export function parseFence(language: string | null | undefined, meta: string | null | undefined): FenceInfo {
   const info: FenceInfo = { language: language ?? "" };
   if (!meta || !ATTRIBUTES.test(meta)) return info;

   const allowed: readonly string[] = info.language === "mermaid" ? KEYS.mermaid : KEYS.code;
   const seen = new Set<string>();
   for (const [, key, value] of meta.matchAll(ATTRIBUTE)) {
      if (seen.has(key)) continue;
      seen.add(key);
      if (allowed.includes(key) && value.trim()) info[key as "title" | "caption" | "alt"] = value.trim();
   }
   return info;
}

const LANGUAGES: Record<string, string> = {
   python: "Python",
   py: "Python",
   typescript: "TypeScript",
   ts: "TypeScript",
   javascript: "JavaScript",
   js: "JavaScript",
   json: "JSON",
   yaml: "YAML",
   yml: "YAML",
   bash: "Bash",
   sh: "Shell",
   shell: "Shell",
   sql: "SQL",
};
const PLAIN = new Set(["", "text", "plaintext", "txt"]);

/** The language label of a code header: a display name when registered, the token as written otherwise, none for plain text. */
export function languageLabel(language: string): string | null {
   const token = language.toLowerCase();
   if (PLAIN.has(token)) return null;
   return LANGUAGES[token] ?? language;
}

/** The accessible name of a code block (S-CODE-6). */
export function codeName(label: string | null, title?: string): string {
   const base = label ? `${label} code` : "Code";
   return title ? `${base}: ${title}` : base;
}

/** The accessible name of a diagram (S-DGM-2): the text alternative, else the caption, else "Diagram". */
export function diagramName({ alt, caption }: Pick<FenceInfo, "alt" | "caption">): string {
   return alt ?? caption ?? "Diagram";
}
