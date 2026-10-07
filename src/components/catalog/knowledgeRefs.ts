import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { markdownBlocks, type Block, type MarkdownBlock } from "./blocks";

interface MdNode {
   type: string;
   url?: string;
   children?: MdNode[];
   position?: { start: { offset?: number } };
}

const parser = unified().use(remarkParse).use(remarkGfm);

export interface KnowledgeCoverage {
   /** Per markdown block, the source offset of each link that carries a panel, and the Knowledge id it supports. */
   at: Map<MarkdownBlock, Map<number, string>>;
   /** The ids offered in context, in document order. */
   offered: string[];
}

/** Links in document order. A heading's links are skipped: a heading never becomes interactive. */
function* links(node: MdNode): Generator<MdNode> {
   if (node.type === "heading") return;
   if (node.type === "link") yield node;
   for (const child of node.children ?? []) yield* links(child);
}

/**
 * S-KNW-2: the first `ref:knowledge.*` link to each eligible target, in document order, found by parsing the body
 * with the renderer's own parser. Nothing here depends on render order; the renderer looks marks up by source offset.
 */
export function knowledgeCoverage(blocks: Block[], eligible: ReadonlyMap<string, unknown>): KnowledgeCoverage {
   const at = new Map<MarkdownBlock, Map<number, string>>();
   const offered = new Set<string>();
   for (const block of markdownBlocks(blocks)) {
      for (const link of links(parser.parse(block.text) as MdNode)) {
         const id = link.url?.startsWith("ref:knowledge.") ? link.url.slice(4) : null;
         const offset = link.position?.start.offset;
         if (!id || offset === undefined || !eligible.has(id) || offered.has(id)) continue;
         offered.add(id);
         at.set(block, (at.get(block) ?? new Map<number, string>()).set(offset, id));
      }
   }
   return { at, offered: [...offered] };
}
