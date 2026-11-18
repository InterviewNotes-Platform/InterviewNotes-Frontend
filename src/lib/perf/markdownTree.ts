import { cache } from "react";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified, type Processor } from "unified";
import { countParse } from "@/lib/perf/hotpath";
import type { CatalogItem } from "@/lib/catalog/types";
import { markdownBlocks, parseBlocks } from "@/components/catalog/blocks";

const parser = unified().use(remarkParse).use(remarkGfm);
const parse = (text: string) => (countParse(), parser.parse(text));
const parsedThisRender = cache(parse);

/** `BODY_PARSE_ONCE=off` restores a fresh parse at every use, with no reuse and no early parse. */
export const parseOnce = () => process.env.BODY_PARSE_ONCE !== "off";

/** The tree of one markdown block, parsed once per render (React's request-scoped `cache`, never kept across requests). */
export const parseMarkdown = (text: string) => (parseOnce() ? parsedThisRender(text) : parse(text));

/** A react-markdown remark plugin: take the tree `parseMarkdown` holds instead of parsing the same text again. */
export function sharedParse(this: Processor): void {
   if (parseOnce()) this.parser = (doc) => parseMarkdown(String(doc));
}

/**
 * Parses the released markdown while the item's Track reads are in flight, yielding between blocks so those reads keep moving.
 * It never rejects: a failure logs one fixed message, nothing from the error, and the render parses what is left as it always did.
 */
export async function parseReleasedBodies({ body, sections }: Pick<CatalogItem, "body" | "sections">): Promise<void> {
   if (!parseOnce()) return;
   try {
      for (const found of [body, ...sections.map((section) => section.body)]) {
         if (found?.format !== "markdown@1") continue;
         for (const block of markdownBlocks(parseBlocks(found.text))) {
            await new Promise<void>((resolve) => setImmediate(resolve));
            parseMarkdown(block.text);
         }
      }
   } catch {
      console.error("catalog: early parse stopped");
   }
}
