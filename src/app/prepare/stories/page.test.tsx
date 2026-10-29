import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/components/prepare/stories/StoryBank", () => ({ StoryBank: (props: { apiUrl: string | null }) => <pre data-testid="bank">{JSON.stringify(props)}</pre> }));
vi.mock("@/components/prepare/stories/NewStory", () => ({ NewStory: (props: { apiUrl: string | null }) => <pre data-testid="new">{JSON.stringify(props)}</pre> }));
vi.mock("@/components/prepare/stories/StoryEditor", () => ({ StoryEditor: (props: { apiUrl: string | null; storyId: string }) => <pre data-testid="editor">{JSON.stringify(props)}</pre> }));

import StoryPage from "./[id]/page";
import NewStoryPage from "./new/page";
import StoriesPage from "./page";

const ID = "00000000-0000-4000-8000-000000000001";
const detail = (id = ID) => StoryPage({ params: Promise.resolve({ id }) });
const pages = [
    { name: "/prepare/stories", run: () => StoriesPage(), path: "/prepare/stories", shown: "bank" },
    { name: "/prepare/stories/new", run: () => NewStoryPage(), path: "/prepare/stories/new", shown: "new" },
    { name: "/prepare/stories/[id]", run: () => detail(), path: `/prepare/stories/${ID}`, shown: "editor" },
];

beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
    mocks.createClient.mockReset().mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.notFound.mockClear();
    mocks.redirect.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe.each(pages)("$name access", ({ run, path, shown }) => {
    it("is not found while the flag is off, before a session is read", async () => {
        await expect(run()).rejects.toThrow("NEXT_NOT_FOUND");
        expect(mocks.createClient).not.toHaveBeenCalled();
    });

    describe("with the flag on", () => {
        beforeEach(() => vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true"));

        it("sends a signed-out visitor to sign-in, returning to the same page", async () => {
            mocks.getUser.mockResolvedValue({ data: { user: null } });
            await expect(run()).rejects.toThrow(`NEXT_REDIRECT:/login?redirect=${encodeURIComponent(path)}`);
        });

        it("treats a session that cannot be read as signed out", async () => {
            mocks.createClient.mockRejectedValue(new Error("no cookies"));
            await expect(run()).rejects.toThrow("NEXT_REDIRECT:/login");
        });

        it("renders the screen with the API origin, or none when the environment has none", async () => {
            vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
            render(await run());
            expect(JSON.parse(screen.getByTestId(shown).textContent ?? "{}").apiUrl).toBe("https://api.example.test");
        });

        it("passes no API origin when the environment has none", async () => {
            render(await run());
            expect(JSON.parse(screen.getByTestId(shown).textContent ?? "{}").apiUrl).toBeNull();
        });
    });
});

describe("/prepare/stories/[id] id", () => {
    beforeEach(() => vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true"));

    it.each(["new", "not-a-uuid", `${ID}/x`, "../answers"])("is not found for %s, without reading a session", async (id) => {
        await expect(detail(id)).rejects.toThrow("NEXT_NOT_FOUND");
        expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it("hands the editor the id", async () => {
        render(await detail());
        expect(JSON.parse(screen.getByTestId("editor").textContent ?? "{}").storyId).toBe(ID);
    });
});
