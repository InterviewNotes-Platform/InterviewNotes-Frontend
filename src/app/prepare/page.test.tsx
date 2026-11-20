import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreparePage from "./page";

const mocks = vi.hoisted(() => ({
    getUser: vi.fn(),
    loadItemTitles: vi.fn(),
    seen: vi.fn(),
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
vi.mock("./itemTitles", () => ({ loadItemTitles: mocks.loadItemTitles }));
vi.mock("./PrepareWorkspace", () => ({
    PrepareWorkspace: (props: { apiUrl: string | null; titles?: Record<string, string> | null }) => {
        mocks.seen(props);
        return (
            <p>
                workspace {String(props.apiUrl)} {JSON.stringify(props.titles)}
            </p>
        );
    },
}));

beforeEach(() => {
    mocks.loadItemTitles.mockReset().mockResolvedValue(null);
    mocks.seen.mockReset();
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
            expect(screen.getByText(/^workspace https:\/\/api\.example\.test/)).toBeInTheDocument();
            expect(screen.getByRole("main")).toBeInTheDocument();
        });

        it("hands the workspace public titles and nothing about the learner, and reads no catalog before sign-in", async () => {
            mocks.loadItemTitles.mockResolvedValue({ "lesson.a": "Lesson A" });
            vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
            render(await PreparePage());
            expect(screen.getByText('workspace https://api.example.test {"lesson.a":"Lesson A"}')).toBeInTheDocument();
            expect(mocks.getUser).toHaveBeenCalledTimes(1);
        });

        it("hands the workspace each collection's title and registry counts, with no catalog read of its own", async () => {
            render(await PreparePage());
            const { collections } = mocks.seen.mock.calls[0][0];
            expect(collections).toEqual([
                { id: "behavioral", title: "General Behavioral", summary: "4 levels · 40 questions" },
                { id: "amazon", title: "Amazon Leadership Principles", summary: "16 principles · 48 questions" },
                { id: "google", title: "Googleyness & Leadership", summary: "6 themes · 18 questions" },
            ]);
            // Titles are the one read the page makes; the counts come from the registry.
            expect(mocks.loadItemTitles).toHaveBeenCalledTimes(1);
        });

        it("reads no titles for a signed-out visitor", async () => {
            mocks.getUser.mockResolvedValue({ data: { user: null } });
            await expect(PreparePage()).rejects.toThrow("NEXT_REDIRECT");
            expect(mocks.loadItemTitles).not.toHaveBeenCalled();
        });

        it("never hands the browser the server-only API_URL", async () => {
            vi.stubEnv("API_URL", "https://internal.example.test");
            vi.stubEnv("NEXT_PUBLIC_API_URL", undefined);
            render(await PreparePage());
            expect(screen.getByText(/^workspace null/)).toBeInTheDocument();
        });

        it("hands the workspace no API origin when the public one is empty or unset", async () => {
            vi.stubEnv("NEXT_PUBLIC_API_URL", "");
            render(await PreparePage());
            expect(screen.getByText(/^workspace null/)).toBeInTheDocument();
        });
    });
});
