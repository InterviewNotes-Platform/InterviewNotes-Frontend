import "server-only";

import { listCatalogItems } from "./client";
import { problemListParams, problemTopics, type PracticeQuery } from "./practice";
import type { CatalogItemPage, CatalogMeta, CatalogResult } from "./types";

export const PROBLEMS_PAGE_SIZE = 12;

// There is no tag vocabulary endpoint, so Topics come from Problem metadata: this many Problems at most, read in
// pages of the API's maximum size. A catalog larger than the cap offers the Topics of its first Problems only.
export const TOPIC_SCAN_CAP = 200;
const SCAN_PAGE_SIZE = 100;

/** One page of Problem metadata in the API's order, narrowed by the (already sanitized) filters. */
export function loadProblems(query: PracticeQuery): Promise<CatalogResult<CatalogItemPage>> {
   return listCatalogItems(problemListParams(query, PROBLEMS_PAGE_SIZE));
}

/**
 * Problem metadata for in-page search: every page of the list the filters allow, up to the scan cap, never a body and never
 * one request per Problem. `complete` is false when the cap stopped the scan, so search can say it covers only part.
 */
export async function loadProblemIndex(query: PracticeQuery): Promise<CatalogResult<{ items: CatalogMeta[]; complete: boolean }>> {
   const items: CatalogMeta[] = [];
   let cursor: string | undefined;
   for (let reads = 0; reads < TOPIC_SCAN_CAP / SCAN_PAGE_SIZE; reads += 1) {
      const result = await listCatalogItems({
         ...problemListParams({ ...query, cursor: null }, SCAN_PAGE_SIZE),
         cursor,
      });
      if (result.status !== "ok") return result;
      items.push(...result.data.items);
      if (result.data.next_cursor === null) return { status: "ok", data: { items, complete: true } };
      cursor = result.data.next_cursor;
   }
   return { status: "ok", data: { items, complete: false } };
}

const NO_FILTERS: PracticeQuery = {
   tag: null,
   difficulty: null,
   level: null,
   track: null,
   access: null,
   cursor: null,
};

/** The Topics present across Problems, from the unfiltered index: list metadata alone. */
export async function loadProblemTopics(): Promise<CatalogResult<string[]>> {
   const index = await loadProblemIndex(NO_FILTERS);
   return index.status === "ok" ? { status: "ok", data: problemTopics(index.data.items) } : index;
}
