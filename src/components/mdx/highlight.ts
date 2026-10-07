import { common } from "lowlight";
import type { Options } from "rehype-highlight";

const { bash, javascript, json, python, sql, typescript, yaml } = common;

/**
 * Server-side highlighting (S-CODE-1 … S-CODE-3): exactly the S-CODE-2 set and aliases are registered, so any other
 * token, and `text`/`plaintext`/`txt`, stays plain. Imported by the server renderer only; no client code imports it.
 */
export const HIGHLIGHT: Options = {
   languages: { bash, javascript, json, python, sql, typescript, yaml },
   aliases: { bash: ["sh", "shell"], javascript: ["js"], python: ["py"], typescript: ["ts"], yaml: ["yml"] },
   plainText: ["text", "plaintext", "txt"],
};
