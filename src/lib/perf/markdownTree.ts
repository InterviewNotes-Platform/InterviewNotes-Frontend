import { cache } from "react";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified, type Processor } from "unified";
import type { CatalogItem } from "@/lib/catalog/types";
import { markdownBlocks, parseBlocks } from "@/components/catalog/blocks";

const parser = unified().use(remarkParse).use(remarkGfm);
const parsedThisRender = cache((text: string) => parser.parse(text));

/** `BODY_PARSE_ONCE=off` restores a fresh parse at every use, with no reuse and no early parse. */
export const parseOnce = () => process.env.BODY_PARSE_ONCE !== "off";

/** The tree of one markdown block, parsed once per render (React's request-scoped `cache`, never kept across requests). */
export const parseMarkdown = (text: string) => (parseOnce() ? parsedThisRender(text) : parser.parse(text));

/** A react-markdown remark plugin: take the tree `parseMarkdown` holds instead of parsing the same text again. */
export function sharedParse(this: Processor): void {
   if (parseOnce()) this.parser = (doc) => parseMarkdown(String(doc));
}

/**
 * Parses the released markdown while the item's Track reads are in flight, so the render finds every tree ready. It yields
 * between blocks so those reads keep moving; a failure only loses the head start, as the render parses on its own.
 */
export async function parseReleasedBodies({ body, sections }: Pick<CatalogItem, "body" | "sections">): Promise<void> {
   if (!parseOnce()) return;
   const bodies = [body, ...sections.map((section) => section.body)];
   for (const found of bodies) {
      if (found?.format !== "markdown@1") continue;
      for (const block of markdownBlocks(parseBlocks(found.text))) {
         await new Promise<void>((resolve) => setImmediate(resolve));
         try {
            parseMarkdown(block.text);
         } catch {}
      }
   }
}
