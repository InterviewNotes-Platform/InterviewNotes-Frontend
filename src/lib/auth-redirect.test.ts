import { describe, expect, it } from "vitest";
import { authCallbackUrl, DEFAULT_AUTH_REDIRECT, safeRedirectPath } from "./auth-redirect";

describe("safeRedirectPath", () => {
    it("defaults to the Tracks section of the homepage", () => {
        expect(DEFAULT_AUTH_REDIRECT).toBe("/#tracks");
    });

    it.each([
        "/tracks/ml-system-design",
        "/lessons/anatomy-of-a-model-request",
        "/problems/design-a-feed",
        "/knowledge",
        "/knowledge/chunking-long-inputs",
        "/practice",
        "/prepare",
        "/prepare/new",
        "/",
        "/#tracks",
    ])("keeps the canonical catalog destination %s", (value) => {
        expect(safeRedirectPath(value)).toBe(value);
    });

    it.each([
        ["/problems/design-a-feed?part=2#hints", "/problems/design-a-feed?part=2#hints"],
        ["/knowledge?group=ml-systems", "/knowledge?group=ml-systems"],
        ["/practice?topic=a&level=b#results", "/practice?topic=a&level=b#results"],
        ["/prepare?from=lesson#top", "/prepare?from=lesson#top"],
        ["/prepare/new?content=lesson.behavioral-prep-sde-1&question=being-stuck", "/prepare/new?content=lesson.behavioral-prep-sde-1&question=being-stuck"],
        ["/tracks/./a/../b", "/tracks/b"],
        ["/lessons/%2e%2e", "/"],
    ])("keeps the query and fragment of %s", (value, expected) => {
        expect(safeRedirectPath(value)).toBe(expected);
    });

    it.each([
        null,
        undefined,
        "",
        "   ",
        "\t\n",
        "tracks/x",
        "/learn",
        "/learn/",
        "/learn/ml-system-design/chapter-name",
        "/learn?tab=notes#intro",
        "/demo",
        "/login",
        "/tracks",
        "/tracks/",
        "/tracks/a/b",
        "/prepare/",
        "/prepare/data",
        "/prepare/new/",
        "/prepare/new/x",
        "/prepare/x/../../login",
        "/prepared",
        "/Prepare",
        "/prepare.json",
        "//prepare",
        "/\\prepare",
        "https://evil.example/prepare",
        "https://app.example/prepare",
        "/lessons",
        "/problems",
        "/unknown",
        "https://evil.example",
        "https://evil.example/tracks/x",
        "//evil.example",
        "/\\evil.example",
        "/\t/evil.example",
        "/..//evil.example",
        "/%2F%2Fevil.example",
        "/tracks/%2F%2Fevil.example",
        "%2F%2Fevil.example",
        "https%3A%2F%2Fevil.example",
        "javascript:alert(1)",
        "/javascript:alert(1)",
        "//[",
    ])("falls back to the default for %j", (value) => {
        expect(safeRedirectPath(value)).toBe(DEFAULT_AUTH_REDIRECT);
    });
});

describe("authCallbackUrl", () => {
    const origin = "http://localhost:3000";

    it("passes a valid redirect to the callback as next", () => {
        const url = new URL(authCallbackUrl(origin, "/lessons/dynamic-batching"));
        expect(url.origin + url.pathname).toBe(`${origin}/auth/callback`);
        expect(url.searchParams.get("next")).toBe("/lessons/dynamic-batching");
    });

    it("encodes a next containing ? and # as one query value", () => {
        const callback = authCallbackUrl(origin, "/problems/design-a-feed?part=2&x=y#hints");
        const url = new URL(callback);
        expect(url.hash).toBe("");
        expect([...url.searchParams.keys()]).toEqual(["next"]);
        expect(url.searchParams.get("next")).toBe("/problems/design-a-feed?part=2&x=y#hints");
        expect(callback).toBe(`${origin}/auth/callback?next=%2Fproblems%2Fdesign-a-feed%3Fpart%3D2%26x%3Dy%23hints`);
    });

    it.each([null, "", "/#tracks", "/learn", "/demo", "https://evil.example", "//evil.example"])(
        "leaves the callback URL bare for %j",
        (redirect) => {
            expect(authCallbackUrl(origin, redirect)).toBe(`${origin}/auth/callback`);
        },
    );
});
