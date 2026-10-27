import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreparePage from "./page";

const mocks = vi.hoisted(() => ({
    getUser: vi.fn(),
    createClient: vi.fn(),
    notFound: vi.fn(() => {
        throw new Error("NEXT_NOT_FOUND");
    }),
    redirect: vi.fn((to: string) => {
        throw new Error(`NEXT_REDIRECT:${to}`);
    }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./PrepareWorkspace", () => ({ PrepareWorkspace: ({ apiUrl }: { apiUrl: string | null }) => <p>workspace {String(apiUrl)}</p> }));

beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
    mocks.createClient.mockReset().mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.notFound.mockClear();
    mocks.redirect.mockClear();
});
afterEach(() => {
    vi.unstubAllEnvs();
});

describe("/prepare access", () => {
    it("is not found while the flag is off, before any session is read", async () => {
        await expect(PreparePage()).rejects.toThrow("NEXT_NOT_FOUND");
        expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it("is not found for a signed-in user too while the flag is off", async () => {
        vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "false");
        await expect(PreparePage()).rejects.toThrow("NEXT_NOT_FOUND");
        expect(mocks.getUser).not.toHaveBeenCalled();
    });

    describe("with the flag on", () => {
        beforeEach(() => vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true"));

        it("sends a signed-out visitor to sign-in, returning to /prepare", async () => {
            mocks.getUser.mockResolvedValue({ data: { user: null } });
            await expect(PreparePage()).rejects.toThrow("NEXT_REDIRECT:/login?redirect=%2Fprepare");
        });

        it("treats a failing session lookup as signed out", async () => {
            mocks.getUser.mockRejectedValue(new Error("down"));
            await expect(PreparePage()).rejects.toThrow("NEXT_REDIRECT:/login?redirect=%2Fprepare");
        });

        it("treats missing Supabase configuration as signed out", async () => {
            mocks.createClient.mockRejectedValue(new Error("Missing Supabase env vars"));
            await expect(PreparePage()).rejects.toThrow("NEXT_REDIRECT:/login?redirect=%2Fprepare");
        });

        it("renders the workspace for a signed-in user, handing it the API origin", async () => {
            vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
            render(await PreparePage());
            expect(screen.getByText("workspace https://api.example.test")).toBeInTheDocument();
            expect(screen.getByRole("main")).toBeInTheDocument();
        });

        it("never hands the browser the server-only API_URL", async () => {
            vi.stubEnv("API_URL", "https://internal.example.test");
            vi.stubEnv("NEXT_PUBLIC_API_URL", undefined);
            render(await PreparePage());
            expect(screen.getByText("workspace null")).toBeInTheDocument();
        });

        it("hands the workspace no API origin when the public one is empty or unset", async () => {
            vi.stubEnv("NEXT_PUBLIC_API_URL", "");
            render(await PreparePage());
            expect(screen.getByText("workspace null")).toBeInTheDocument();
        });
    });
});
