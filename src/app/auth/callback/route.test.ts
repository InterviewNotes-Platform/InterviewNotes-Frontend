// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authCallbackUrl } from "@/lib/auth-redirect";
import { GET } from "./route";

const exchangeCodeForSession = vi.fn();

vi.mock("next/headers", () => ({
    cookies: async () => ({ getAll: () => [], set: () => {} }),
}));
vi.mock("@supabase/ssr", () => ({
    createServerClient: () => ({ auth: { exchangeCodeForSession } }),
}));

const ORIGIN = "http://localhost:3000";

async function callback(params: Record<string, string>) {
    const url = `${ORIGIN}/auth/callback?${new URLSearchParams(params)}`;
    return (await GET(new NextRequest(url))).headers.get("location");
}

beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    exchangeCodeForSession.mockResolvedValue({ error: null });
});

afterEach(() => {
    vi.unstubAllEnvs();
    exchangeCodeForSession.mockReset();
});

describe("GET /auth/callback after a successful code exchange", () => {
    it.each([
        ["/learn/ml-system-design/chapter-name", `${ORIGIN}/learn/ml-system-design/chapter-name`],
        ["/learn/ml-system-design?tab=notes#intro", `${ORIGIN}/learn/ml-system-design?tab=notes#intro`],
        ["/%2F%2Fevil.example", `${ORIGIN}/%2F%2Fevil.example`],
    ])("redirects to the internal path %s", async (next, destination) => {
        expect(await callback({ code: "c", next })).toBe(destination);
    });

    it("redirects to /learn when next is missing", async () => {
        expect(await callback({ code: "c" })).toBe(`${ORIGIN}/learn`);
    });

    it.each([
        ["an absolute external URL", "https://evil.example/phish"],
        ["a protocol-relative URL", "//evil.example"],
        ["a userinfo suffix on the origin", "@evil.example"],
        ["a host suffix on the origin", ".evil.example"],
        ["a backslash host", "/\\evil.example"],
        ["a tab-split protocol-relative URL", "/\t/evil.example"],
        ["dot-segments collapsing to //", "/..//evil.example"],
        ["an encoded protocol-relative URL", "%2F%2Fevil.example"],
        ["an encoded absolute URL", "https%3A%2F%2Fevil.example"],
        ["a javascript: URL", "javascript:alert(1)"],
        ["a malformed host", "//["],
        ["an empty value", ""],
    ])("falls back to /learn for %s", async (_case, next) => {
        expect(await callback({ code: "c", next })).toBe(`${ORIGIN}/learn`);
    });

    it("completes the login round trip to the requested chapter", async () => {
        const redirectTo = new URL(authCallbackUrl(ORIGIN, "/learn/ml-system-design/chapter-name"));
        redirectTo.searchParams.set("code", "c");

        const response = await GET(new NextRequest(redirectTo));

        expect(response.headers.get("location")).toBe(`${ORIGIN}/learn/ml-system-design/chapter-name`);
    });
});

describe("GET /auth/callback without a session", () => {
    it("sends a failed exchange to the login error, ignoring next", async () => {
        exchangeCodeForSession.mockResolvedValue({ error: new Error("bad code") });
        expect(await callback({ code: "c", next: "/learn/x" })).toBe(`${ORIGIN}/login?error=auth_failed`);
    });

    it("sends a request without a code to the login error, ignoring next", async () => {
        expect(await callback({ next: "https://evil.example" })).toBe(`${ORIGIN}/login?error=auth_failed`);
        expect(exchangeCodeForSession).not.toHaveBeenCalled();
    });
});
