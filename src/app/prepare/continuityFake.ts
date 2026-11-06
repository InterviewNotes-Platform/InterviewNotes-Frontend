import type { ItemState } from "@/lib/prep/types";

/**
 * A stand-in for the three reads the Continue card and bookmarks make (api-contract §15.5, §15.9), for tests only. It
 * follows the contract's order (timestamp newest first, then `content_id`), paging and 404 while M2 is off. The shared
 * fake API has no list routes, so this task keeps its own.
 */
export type SeededItem = { id: string; visited?: string; bookmarked?: string; completed?: string };

const ROW = { completed_at: null, last_visited_at: null, bookmarked_at: null, note: null, version: 1 };

function stateOf({ id, visited, bookmarked, completed }: SeededItem): ItemState {
    return { ...ROW, content_id: id, last_visited_at: visited ?? null, bookmarked_at: bookmarked ?? null, completed_at: completed ?? null };
}

export function createContinuityFake({ continuity = true, items = {} }: { continuity?: boolean; items?: Record<string, SeededItem[]> } = {}) {
    const requests: { method: string; path: string; token: string | null }[] = [];
    const failures: Record<string, (number | "network")[]> = {};
    let on = continuity;

    function json(status: number, body: unknown): Response {
        return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }

    function list(rows: ItemState[], column: "last_visited_at" | "bookmarked_at", params: URLSearchParams): Response {
        const limit = Number(params.get("limit") ?? 50);
        const offset = Number(params.get("offset") ?? 0);
        const matching = rows
            .filter((row) => row[column] !== null)
            .sort((a, b) => (b[column] as string).localeCompare(a[column] as string) || a.content_id.localeCompare(b.content_id));
        return json(200, { items: matching.slice(offset, offset + limit), total: matching.length, limit, offset });
    }

    async function fetchImpl(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
        const url = new URL(String(input));
        const path = url.pathname.replace(/^\/me\/prep/, "");
        const header = new Headers(init.headers).get("Authorization");
        const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
        requests.push({ method: init.method ?? "GET", path: path + url.search, token });

        const failure = failures[path + url.search]?.shift();
        if (failure === "network") throw new TypeError("fetch failed");
        if (failure) return json(failure, { detail: "failed", code: "internal_error" });

        if (path === "/answers") return token ? json(200, { items: [], total: 0, limit: 100, offset: 0 }) : json(401, { code: "unauthenticated" });
        if (path.startsWith("/item-state") && !on) return json(404, { detail: "Not found", code: "not_found" });
        const owner = token?.replace(/^token-/, "");
        if (!owner) return json(401, { detail: "Unauthenticated", code: "unauthenticated" });
        if (path === "/features") return json(200, { item_state_available: on });
        const rows = (items[owner] ?? []).map(stateOf);
        if (path === "/item-state/recent") return list(rows, "last_visited_at", url.searchParams);
        if (path === "/item-state/bookmarks") return list(rows, "bookmarked_at", url.searchParams);
        return json(404, { detail: "Not found", code: "not_found" });
    }

    return {
        fetch: fetchImpl as typeof fetch,
        requests,
        /** The next request to this path and query (below `/me/prep`) fails with this status, or with a network error. */
        failNext(path: string, failure: number | "network") {
            (failures[path] ??= []).push(failure);
        },
        setContinuity(value: boolean) {
            on = value;
        },
        seed(owner: string, rows: SeededItem[]) {
            items[owner] = rows;
        },
        token: (owner: string) => `token-${owner}`,
    };
}

/** `lesson.item-NN` ids with strictly decreasing times, so the newest comes first. */
export function bookmarkedLessons(count: number): SeededItem[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `lesson.item-${String(index + 1).padStart(2, "0")}`,
        bookmarked: new Date(Date.UTC(2026, 10, 5, 12, 0, 0) - index * 60_000).toISOString(),
    }));
}
