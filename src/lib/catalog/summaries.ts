import "server-only";

import { listCatalogItems } from "./client";

// P3 §17.2: one bounded scan of the Track's Lesson list. Reaching the cap, or any failed page, yields nothing.
export const SUMMARY_SCAN_PAGES = 5;
const SCAN_PAGE_SIZE = 100;

/** Lesson summaries by item id from list metadata alone, or null unless every page was read: all or none. */
export async function loadLessonSummaries(track: string): Promise<ReadonlyMap<string, string> | null> {
   const summaries = new Map<string, string>();
   let cursor: string | undefined;
   for (let reads = 0; reads < SUMMARY_SCAN_PAGES; reads += 1) {
      const result = await listCatalogItems({ type: "lesson", track, limit: SCAN_PAGE_SIZE, cursor });
      if (result.status !== "ok") return null;
      for (const { id, summary } of result.data.items) summaries.set(id, summary);
      if (result.data.next_cursor === null) return summaries;
      cursor = result.data.next_cursor;
   }
   return null;
}
