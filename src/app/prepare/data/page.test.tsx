import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import YourDataPage from "./page";

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
vi.mock("./YourData", () => ({ YourData: ({ apiUrl }: { apiUrl: string | null }) => <p>your data {String(apiUrl)}</p> }));

beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
    mocks.createClient.mockReset().mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.notFound.mockClear();
    mocks.redirect.mockClear();
});
afterEach(() => {
    vi.unstubAllEnvs();
});

describe("/prepare/data access", () => {
    it("is not found while the flag is off, before any session is read", async () => {
        await expect(YourDataPage()).rejects.toThrow("NEXT_NOT_FOUND");
        expect(mocks.createClient).not.toHaveBeenCalled();
    });

    describe("with the flag on", () => {
        beforeEach(() => vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true"));

        it("sends a signed-out visitor to sign-in, asking to return here", async () => {
            mocks.getUser.mockResolvedValue({ data: { user: null } });
            await expect(YourDataPage()).rejects.toThrow("NEXT_REDIRECT:/login?redirect=%2Fprepare%2Fdata");
        });

        it("treats a failing session lookup as signed out", async () => {
            mocks.getUser.mockRejectedValue(new Error("down"));
            await expect(YourDataPage()).rejects.toThrow("NEXT_REDIRECT:/login?redirect=%2Fprepare%2Fdata");
        });

        it("renders the page for a signed-in user, passing the API origin or null", async () => {
            vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
            render(await YourDataPage());
            expect(screen.getByText("your data https://api.example.test")).toBeInTheDocument();
        });

        it("passes null when the environment has no API origin", async () => {
            vi.stubEnv("NEXT_PUBLIC_API_URL", "");
            render(await YourDataPage());
            expect(screen.getByText("your data null")).toBeInTheDocument();
        });
    });
});
