import "server-only";

import { listCatalogItems } from "./client";
import { inGroup, type ExplorerQuery } from "./knowledge";
import type { CatalogItemPage, CatalogMeta, CatalogResult } from "./types";

export const TOPICS_PAGE_SIZE = 12;
// A bound on one render's list reads when a group is sparse; whatever is left stays one `next_cursor` away.
const MAX_LIST_READS = 6;

/**
 * One page of Knowledge topics from list metadata alone, never an item. `category=` is single-valued, so a group
 * (which may span two categories) is assembled by partitioning each API page. Reading continues until a page's worth
 * is held, and the cursor handed back is always one the API issued, so no item is repeated or skipped.
 */
export async function loadTopics({ group, tag, cursor }: ExplorerQuery): Promise<CatalogResult<CatalogItemPage>> {
   const topics: CatalogMeta[] = [];
   let next = cursor;
   for (let reads = 0; reads < MAX_LIST_READS; reads += 1) {
      const result = await listCatalogItems({
         type: "knowledge",
         tag: tag ?? undefined,
         limit: TOPICS_PAGE_SIZE,
         cursor: next ?? undefined,
      });
      if (result.status !== "ok") return result;
      topics.push(...(group ? result.data.items.filter((item) => inGroup(item, group)) : result.data.items));
      next = result.data.next_cursor;
      if (next === null || topics.length >= TOPICS_PAGE_SIZE) break;
   }
   return { status: "ok", data: { items: topics, next_cursor: next } };
}
