import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SignupPage from "./page";

const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({ auth: { signInWithOAuth } }),
}));

function signUpFrom(search: string) {
    window.history.pushState({}, "", `/signup${search}`);
    render(<SignupPage />);
    fireEvent.click(screen.getByRole("button", { name: /sign up with google/i }));
    return signInWithOAuth.mock.calls[0][0].options.redirectTo as string;
}

afterEach(() => {
    signInWithOAuth.mockClear();
    window.history.pushState({}, "", "/");
});

describe("SignupPage Google sign-up redirect", () => {
    const callback = `${window.location.origin}/auth/callback`;

    it("uses the bare callback when no redirect is given", () => {
        expect(signUpFrom("")).toBe(callback);
    });

    it("carries an explicit catalog redirect, encoded as one next value", () => {
        const redirectTo = signUpFrom("?redirect=%2Fproblems%2Fdesign-a-feed%3Fpart%3D2%23hints");
        expect(redirectTo).toBe(`${callback}?next=%2Fproblems%2Fdesign-a-feed%3Fpart%3D2%23hints`);
    });

    it.each([
        ["an external URL", "?redirect=https%3A%2F%2Fevil.example"],
        ["a protocol-relative URL", "?redirect=%2F%2Fevil.example"],
        ["a legacy /learn path", "?redirect=%2Flearn%2Fml-system-design"],
        ["a non-catalog path", "?redirect=%2Fdemo"],
    ])("drops %s", (_case, search) => {
        expect(signUpFrom(search)).toBe(callback);
    });
});
