import { describe, expect, it } from "vitest";
import { createPrepClient } from "./client";

const BASE = "https://api.example.test";
const row = { content_id: "lesson.a", completed_at: null, last_visited_at: "2026-11-05T10:00:00Z", bookmarked_at: null, note: null, version: 1 };

function setup(respond: () => Response, token: string | null = "t") {
    const seen: { url: string; method: string; auth: string | null }[] = [];
    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        seen.push({ url: String(input), method: init.method ?? "GET", auth: new Headers(init.headers).get("Authorization") });
        return respond();
    }) as typeof globalThis.fetch;
    return { seen, client: createPrepClient({ baseUrl: BASE, getAccessToken: async () => token, fetch }) };
}
const page = (items: unknown[] = [row]) => new Response(JSON.stringify({ items, total: items.length, limit: 50, offset: 0 }), { status: 200 });

describe("getRecent and getBookmarks", () => {
    it("GET the contract's list paths with limit and offset and the bearer token", async () => {
        const { seen, client } = setup(() => page());
        expect(await client.getRecent({ limit: 50 })).toMatchObject({ status: "ok", data: { total: 1 } });
        await client.getBookmarks({ limit: 20, offset: 40 });
        await client.getBookmarks();
        expect(seen.map(({ method, url }) => `${method} ${url}`)).toEqual([
            `GET ${BASE}/me/prep/item-state/recent?limit=50`,
            `GET ${BASE}/me/prep/item-state/bookmarks?limit=20&offset=40`,
            `GET ${BASE}/me/prep/item-state/bookmarks`,
        ]);
        expect(seen.every(({ auth }) => auth === "Bearer t")).toBe(true);
    });

    it("sends nothing when signed out", async () => {
        const { seen, client } = setup(() => page(), null);
        expect(await client.getRecent()).toEqual({ status: "unauthenticated" });
        expect(await client.getBookmarks()).toEqual({ status: "unauthenticated" });
        expect(seen).toHaveLength(0);
    });

    it("reads 404 as notFound, a server error as unavailable and a malformed page as unavailable", async () => {
        expect(await setup(() => new Response("{}", { status: 404 })).client.getRecent()).toEqual({ status: "notFound" });
        expect(await setup(() => new Response("{}", { status: 500 })).client.getBookmarks()).toEqual({ status: "unavailable", cause: "upstream" });
        expect(await setup(() => page([{ content_id: "lesson.a" }])).client.getRecent()).toEqual({ status: "unavailable", cause: "malformed" });
    });
});
