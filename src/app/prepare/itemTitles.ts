import "server-only";

import { listCatalogItems } from "@/lib/catalog/client";

/** Public Lesson and Problem titles by item id: list metadata only, no bodies and nothing about the learner. */
export type ItemTitles = Readonly<Record<string, string>>;

// A bound on one render's reads. Reaching it, or any failed page, yields nothing (all or none), so a missing id can mean "gone".
export const TITLE_SCAN_PAGES = 5;
const PAGE_SIZE = 100;

async function titlesOf(type: "lesson" | "problem"): Promise<ItemTitles | null> {
    const titles: Record<string, string> = {};
    let cursor: string | undefined;
    for (let reads = 0; reads < TITLE_SCAN_PAGES; reads += 1) {
        const result = await listCatalogItems({ type, limit: PAGE_SIZE, cursor });
        if (result.status !== "ok") return null;
        for (const { id, title } of result.data.items) titles[id] = title;
        if (result.data.next_cursor === null) return titles;
        cursor = result.data.next_cursor;
    }
    return null;
}

/** Every published Lesson and Problem title, or null unless both lists were read completely. */
export async function loadItemTitles(): Promise<ItemTitles | null> {
    const [lessons, problems] = await Promise.all([titlesOf("lesson"), titlesOf("problem")]);
    return lessons && problems ? { ...lessons, ...problems } : null;
}
