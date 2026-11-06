import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItemListParams, CatalogMeta } from "@/lib/catalog/types";
import { loadItemTitles, TITLE_SCAN_PAGES } from "./itemTitles";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/catalog/client", () => ({ listCatalogItems: mocks.list }));

const meta = (id: string, title: string): CatalogMeta => {
    const [type, slug] = id.split(".");
    return { id, type, slug, title, summary: "A summary", tags: [], category: null, difficulty: null, level: null, access: "premium" } as CatalogMeta;
};
const ok = (items: CatalogMeta[], next_cursor: string | null = null) => ({ status: "ok" as const, data: { items, next_cursor } });

/** Answers each list call from `reply`, which sees the request exactly as the loader made it. */
function serve(reply: (params: CatalogItemListParams) => unknown) {
    mocks.list.mockImplementation(async (params: CatalogItemListParams) => reply(params));
}

beforeEach(() => {
    mocks.list.mockReset();
});

describe("loadItemTitles", () => {
    it("reads list metadata only and returns bare titles, free or premium", async () => {
        serve(({ type }) => (type === "lesson" ? ok([meta("lesson.a", "Lesson A")]) : ok([meta("problem.b", "Problem B")])));
        expect(await loadItemTitles()).toEqual({ "lesson.a": "Lesson A", "problem.b": "Problem B" });
        expect(mocks.list.mock.calls.map(([params]) => params)).toEqual([
            { type: "lesson", limit: 100, cursor: undefined },
            { type: "problem", limit: 100, cursor: undefined },
        ]);
    });

    it("follows the cursor the API issued", async () => {
        serve(({ type, cursor }) => {
            if (type === "problem") return ok([]);
            return cursor ? ok([meta("lesson.b", "B")]) : ok([meta("lesson.a", "A")], "next-1");
        });
        expect(await loadItemTitles()).toEqual({ "lesson.a": "A", "lesson.b": "B" });
    });

    it("gives nothing when any page fails: all or none", async () => {
        serve(({ type }) => (type === "lesson" ? ok([meta("lesson.a", "A")]) : { status: "unavailable", cause: "upstream" }));
        expect(await loadItemTitles()).toBeNull();
    });

    it("gives nothing when the scan cap is reached before the end", async () => {
        serve(() => ok([], "more"));
        expect(await loadItemTitles()).toBeNull();
        expect(mocks.list).toHaveBeenCalledTimes(TITLE_SCAN_PAGES * 2);
    });
});
