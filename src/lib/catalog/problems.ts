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

/** The Topics present across Problems, from list metadata alone: never a Problem body, never one request per Problem. */
export async function loadProblemTopics(): Promise<CatalogResult<string[]>> {
   const scanned: CatalogMeta[] = [];
   let cursor: string | undefined;
   for (let reads = 0; reads < TOPIC_SCAN_CAP / SCAN_PAGE_SIZE; reads += 1) {
      const result = await listCatalogItems({ type: "problem", limit: SCAN_PAGE_SIZE, cursor });
      if (result.status !== "ok") return result;
      scanned.push(...result.data.items);
      if (result.data.next_cursor === null) break;
      cursor = result.data.next_cursor;
   }
   return { status: "ok", data: problemTopics(scanned) };
}
