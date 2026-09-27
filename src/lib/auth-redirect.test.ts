import { describe, expect, it } from "vitest";
import { authCallbackUrl, safeRedirectPath } from "./auth-redirect";

describe("safeRedirectPath", () => {
    it.each([
        ["/learn/ml-system-design/chapter-name", "/learn/ml-system-design/chapter-name"],
        ["/learn?tab=notes#intro", "/learn?tab=notes#intro"],
        ["/learn/./a/../b", "/learn/b"],
    ])("keeps the internal path %s", (value, expected) => {
        expect(safeRedirectPath(value)).toBe(expected);
    });

    it.each([
        null,
        undefined,
        "",
        "learn",
        "https://evil.example",
        "//evil.example",
        "/\\evil.example",
        "/\t/evil.example",
        "/..//evil.example",
        "%2F%2Fevil.example",
        "javascript:alert(1)",
        "//[",
    ])("falls back to /learn for %j", (value) => {
        expect(safeRedirectPath(value)).toBe("/learn");
    });
});

describe("authCallbackUrl", () => {
    const origin = "http://localhost:3000";

    it("passes a valid redirect to the callback as next", () => {
        const url = new URL(authCallbackUrl(origin, "/learn/ml-system-design/chapter-name?tab=a&b=c"));
        expect(url.origin + url.pathname).toBe(`${origin}/auth/callback`);
        expect(url.searchParams.get("next")).toBe("/learn/ml-system-design/chapter-name?tab=a&b=c");
    });

    it.each([null, "https://evil.example", "//evil.example", "/learn"])(
        "leaves the callback URL bare for %j",
        (redirect) => {
            expect(authCallbackUrl(origin, redirect)).toBe(`${origin}/auth/callback`);
        },
    );
});
