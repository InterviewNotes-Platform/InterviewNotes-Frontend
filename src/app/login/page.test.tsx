import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({ auth: { signInWithOAuth } }),
}));

function signInFrom(search: string) {
    window.history.pushState({}, "", `/login${search}`);
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    return signInWithOAuth.mock.calls[0][0].options.redirectTo as string;
}

afterEach(() => {
    signInWithOAuth.mockClear();
    window.history.pushState({}, "", "/");
});

describe("LoginPage Google sign-in redirect", () => {
    const callback = `${window.location.origin}/auth/callback`;

    it("carries a valid internal redirect to the callback", () => {
        const redirectTo = signInFrom("?redirect=%2Flessons%2Fdynamic-batching");
        expect(redirectTo).toBe(`${callback}?next=%2Flessons%2Fdynamic-batching`);
    });

    it("encodes a redirect with a query and fragment as one next value", () => {
        const redirectTo = signInFrom("?redirect=%2Fproblems%2Fdesign-a-feed%3Fpart%3D2%23hints");
        expect(redirectTo).toBe(`${callback}?next=%2Fproblems%2Fdesign-a-feed%3Fpart%3D2%23hints`);
    });

    it("uses the bare callback when no redirect is given", () => {
        expect(signInFrom("")).toBe(callback);
    });

    it.each([
        ["an external URL", "?redirect=https%3A%2F%2Fevil.example"],
        ["a protocol-relative URL", "?redirect=%2F%2Fevil.example"],
        ["a backslash host", "?redirect=%2F%5Cevil.example"],
        ["a legacy /learn path", "?redirect=%2Flearn%2Fml-system-design%2Fchapter-name"],
        ["a non-catalog path", "?redirect=%2Fdemo"],
    ])("drops %s", (_case, search) => {
        expect(signInFrom(search)).toBe(callback);
    });
});

describe("LoginPage legal text", () => {
    it("links Privacy Policy to the Privacy & AI Use page and leaves Terms of Service unlinked", () => {
        render(<LoginPage />);
        expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
        expect(screen.queryByRole("link", { name: "Terms of Service" })).toBeNull();
        expect(screen.getByText("Terms of Service")).toBeInTheDocument();
    });
});
