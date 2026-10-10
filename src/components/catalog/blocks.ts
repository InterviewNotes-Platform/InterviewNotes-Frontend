import { PART_ORDER, SENIORITY_ORDER } from "@/lib/catalog/positionCopy";
import type { CatalogHeading } from "@/lib/catalog/types";

export type CalloutKind = "note" | "tip" | "warning";

export type Block =
   | { type: "markdown"; text: string }
   | { type: "callout"; kind: CalloutKind; children: Block[] }
   | { type: "part"; name: string; seniority: string | null; children: Block[] };

type Container = Exclude<Block, { type: "markdown" }>;

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CALLOUT_OPEN =
   /^ {0,3}:::[ \t]*callout[ \t]+kind=(?:(note|tip|warning)|"(note|tip|warning)")[ \t]*$/;
const PART_OPEN = /^ {0,3}:::[ \t]*part[ \t]+(.+?)[ \t]*$/;
// The backend's attribute grammar (`app/content_engine/body.py`): `name=bare-token` or `name="quoted"`, no repeats.
const ATTRIBUTE = /([a-z]+)=(?:([A-Za-z0-9_-]+)|"([^"]*)")(?:[ \t]+|$)/y;
const DIRECTIVE_CLOSE = /^ {0,3}:::[ \t]*$/;
// The backend's heading rule (`app/content_engine/body.py`): an ATX heading outside a code fence.
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;

/** The fence open after `line`, given the one open before it; one rule for every scan, as the backend has one. */
function nextFence(fence: string | null, line: string): string | null {
   const match = FENCE.exec(line);
   if (fence === null) return match ? match[1] : null;
   return match && match[1].startsWith(fence) && !match[2].trim() ? null : fence;
}

/** A top-level `::: part name=<name> [seniority=<seniority>]` line as a part block, else null (malformed lines stay prose). */
function partOpen(line: string): Extract<Block, { type: "part" }> | null {
   const attributes = PART_OPEN.exec(line)?.[1];
   if (attributes === undefined) return null;
   const found = new Map<string, string>();
   ATTRIBUTE.lastIndex = 0;
   while (ATTRIBUTE.lastIndex < attributes.length) {
      const match = ATTRIBUTE.exec(attributes);
      if (match === null || found.has(match[1])) return null;
      found.set(match[1], match[2] ?? match[3]);
   }
   const name = found.get("name");
   if (!name || [...found.keys()].some((key) => key !== "name" && key !== "seniority")) return null;
   return { type: "part", name, seniority: found.get("seniority") ?? null, children: [] };
}

/**
 * Splits a `markdown@1` body on the backend's `::: callout` and `::: part` fences, which remark-directive cannot parse.
 * Fence detection mirrors the backend body scanner: lines inside fenced code are literal, so a callout or part example in
 * a code block stays code. A part is recognised only at the top level (S-PRT-2); a `:::` closes the innermost open one.
 */
export function parseBlocks(text: string): Block[] {
   const root: Block[] = [];
   const open: Container[] = [];
   let buffer: string[] = [];
   let fence: string | null = null;

   const target = () => (open.length ? open[open.length - 1].children : root);
   const flush = () => {
      const chunk = buffer.join("\n");
      buffer = [];
      if (chunk.trim()) target().push({ type: "markdown", text: chunk });
   };
   const close = () => {
      const done = open.pop()!;
      target().push(done);
   };

   for (const line of text.split("\n")) {
      const inCode = fence !== null;
      fence = nextFence(fence, line);
      if (inCode || fence !== null) {
         buffer.push(line);
         continue;
      }
      const opened = CALLOUT_OPEN.exec(line);
      const part = open.length ? null : partOpen(line);
      if (opened || part) {
         flush();
         open.push(part ?? { type: "callout", kind: (opened![1] ?? opened![2]) as CalloutKind, children: [] });
      } else if (open.length && DIRECTIVE_CLOSE.test(line)) {
         flush();
         close();
      } else {
         buffer.push(line);
      }
   }
   flush();
   while (open.length) close();
   return root;
}

type PartBlock = Extract<Block, { type: "part" }>;

const indexIn = (order: readonly string[], value: string) => (order.includes(value) ? order.indexOf(value) : order.length);

/**
 * The top-level parts of a body in their canonical order, and bars in seniority order (S-PRT-6): an unattributed bar first,
 * an unlisted name or seniority after the listed ones. Equal parts keep their authored order.
 */
export function canonicalParts(blocks: Block[]): Block[] {
   const rank = ({ name, seniority }: PartBlock) => [indexIn(PART_ORDER, name), seniority === null ? -1 : indexIn(SENIORITY_ORDER, seniority)];
   const parts = blocks
      .filter((block): block is PartBlock => block.type === "part")
      .sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1]);
   let next = 0;
   return blocks.map((block) => (block.type === "part" ? parts[next++] : block));
}

export type MarkdownBlock = Extract<Block, { type: "markdown" }>;

export const markdownBlocks = (blocks: Block[]): MarkdownBlock[] =>
   blocks.flatMap((block) => (block.type === "markdown" ? [block] : markdownBlocks(block.children)));

/** Heading lines of one markdown block, 1-based within it, found by the backend's rule. */
function headingLines(text: string): { line: number; level: number; title: string }[] {
   const found: { line: number; level: number; title: string }[] = [];
   let fence: string | null = null;
   text.split("\n").forEach((content, index) => {
      const inCode = fence !== null;
      fence = nextFence(fence, content);
      const heading = inCode || fence !== null ? null : HEADING.exec(content);
      if (heading) found.push({ line: index + 1, level: heading[1].length, title: heading[2] ?? "" });
   });
   return found;
}

/**
 * The API's heading for each heading line of each markdown block, keyed by block and 1-based line. The API's
 * list is the only source of ids: this only pairs it with the lines it was extracted from, in order. Null
 * unless both agree on count, level and text, and the ids are unique, so a heading never carries a wrong id.
 */
export function headingIds(
   blocks: Block[],
   headings: readonly CatalogHeading[]
): Map<Block, Map<number, CatalogHeading>> | null {
   if (new Set(headings.map(({ id }) => id)).size !== headings.length) return null;
   const lines = markdownBlocks(blocks).flatMap((block) => headingLines(block.text).map((line) => ({ block, ...line })));
   if (lines.length !== headings.length) return null;

   const ids = new Map<Block, Map<number, CatalogHeading>>();
   for (const [index, { block, line, level, title }] of lines.entries()) {
      const heading = headings[index];
      if (heading.level !== level || heading.text !== title) return null;
      ids.set(block, (ids.get(block) ?? new Map<number, CatalogHeading>()).set(line, heading));
   }
   return ids;
}
