import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getUser: vi.fn(),
    createClient: vi.fn(),
    load: vi.fn(),
    notFound: vi.fn(() => {
        throw new Error("NEXT_NOT_FOUND");
    }),
    redirect: vi.fn((to: string) => {
        throw new Error(`NEXT_REDIRECT:${to}`);
    }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/prep/questions", () => ({ loadBehavioralQuestions: mocks.load }));
vi.mock("@/components/prepare/editor/AnswerEditor", () => ({
    AnswerEditor: (props: { apiUrl: string | null; answerId: string; catalog: unknown }) => (
        <pre data-testid="editor">{JSON.stringify({ apiUrl: props.apiUrl, answerId: props.answerId, catalog: props.catalog })}</pre>
    ),
}));

import AnswerPage from "./page";

const ID = "00000000-0000-4000-8000-000000000001";
const Q = { content_id: "lesson.behavioral-prep-sde-1", question_id: "being-stuck", level: "sde-1", text: "Tell me.", snapshot_fallback: false };
const props = (id = ID) => ({ params: Promise.resolve({ id }) });
const shown = () => JSON.parse(screen.getByTestId("editor").textContent ?? "{}");

beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
    mocks.createClient.mockReset().mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.load.mockReset().mockResolvedValue({ status: "ok", data: [Q] });
    mocks.notFound.mockClear();
    mocks.redirect.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("/prepare/answers/[id] access", () => {
    it("is not found while the flag is off, before a session or the catalog is read", async () => {
        await expect(AnswerPage(props())).rejects.toThrow("NEXT_NOT_FOUND");
        expect(mocks.createClient).not.toHaveBeenCalled();
        expect(mocks.load).not.toHaveBeenCalled();
    });

    describe("with the flag on", () => {
        beforeEach(() => vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true"));

        it("is not found for an id that cannot be an answer's, without reading anything", async () => {
            await expect(AnswerPage(props("new"))).rejects.toThrow("NEXT_NOT_FOUND");
            expect(mocks.createClient).not.toHaveBeenCalled();
        });

        it("sends a signed-out visitor to sign-in, returning to the same answer, without reading the catalog", async () => {
            mocks.getUser.mockResolvedValue({ data: { user: null } });
            await expect(AnswerPage(props())).rejects.toThrow(`NEXT_REDIRECT:/login?redirect=${encodeURIComponent(`/prepare/answers/${ID}`)}`);
            expect(mocks.load).not.toHaveBeenCalled();
        });

        it("reads the four Lessons once and hands the editor the questions, the id and the API origin", async () => {
            vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
            render(await AnswerPage(props()));
            expect(mocks.load).toHaveBeenCalledTimes(1);
            expect(shown()).toEqual({ apiUrl: "https://api.example.test", answerId: ID, catalog: [Q] });
        });

        it("passes no questions, rather than a guess, when the Lessons could not be read", async () => {
            mocks.load.mockResolvedValue({ status: "unavailable", cause: "upstream" });
            render(await AnswerPage(props()));
            expect(shown().catalog).toBeNull();
        });

        it("passes no API origin when the environment has none", async () => {
            render(await AnswerPage(props()));
            expect(shown().apiUrl).toBeNull();
        });
    });
});
