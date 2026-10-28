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
vi.mock("@/components/prepare/picker/QuestionPicker", () => ({
    QuestionPicker: (props: { apiUrl: string | null; catalog: unknown; requested: unknown; storyId?: string | null }) => (
        <pre data-testid="picker">{JSON.stringify({ apiUrl: props.apiUrl, catalog: props.catalog, requested: props.requested, storyId: props.storyId })}</pre>
    ),
}));

import NewAnswerPage from "./page";

const Q = { content_id: "lesson.behavioral-prep-sde-1", question_id: "being-stuck", level: "sde-1", text: "Tell me.", snapshot_fallback: false };
const props = (search: Record<string, string | string[] | undefined> = {}) => ({ searchParams: Promise.resolve(search) });
const shown = () => JSON.parse(screen.getByTestId("picker").textContent ?? "{}");

beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
    mocks.createClient.mockReset().mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.load.mockReset().mockResolvedValue({ status: "ok", data: [Q] });
    mocks.notFound.mockClear();
    mocks.redirect.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("/prepare/new access", () => {
    it("is not found while the flag is off, before a session or the catalog is read", async () => {
        await expect(NewAnswerPage(props())).rejects.toThrow("NEXT_NOT_FOUND");
        expect(mocks.createClient).not.toHaveBeenCalled();
        expect(mocks.load).not.toHaveBeenCalled();
    });

    describe("with the flag on", () => {
        beforeEach(() => vi.stubEnv("NEXT_PUBLIC_PREP_ENABLED", "true"));

        it("sends a signed-out visitor to sign-in without reading the catalog", async () => {
            mocks.getUser.mockResolvedValue({ data: { user: null } });
            await expect(NewAnswerPage(props())).rejects.toThrow("NEXT_REDIRECT:/login?redirect=%2Fprepare%2Fnew");
            expect(mocks.load).not.toHaveBeenCalled();
        });

        it("brings a signed-out visitor back to the same question", async () => {
            mocks.getUser.mockResolvedValue({ data: { user: null } });
            const search = { content: "lesson.behavioral-prep-sde-1", question: "being-stuck" };
            await expect(NewAnswerPage(props(search))).rejects.toThrow(
                `NEXT_REDIRECT:/login?redirect=${encodeURIComponent("/prepare/new?content=lesson.behavioral-prep-sde-1&question=being-stuck")}`
            );
        });

        it("passes a well-formed story id to the picker, drops a malformed one, and keeps it through sign-in", async () => {
            const story = "11111111-1111-4111-8111-111111111111";
            render(await NewAnswerPage(props({ story })));
            expect(shown().storyId).toBe(story);
            render(await NewAnswerPage(props({ story: "not-an-id" })));
            expect(screen.getAllByTestId("picker")[1].textContent).not.toContain(`"storyId":"not-an-id"`);
            mocks.getUser.mockResolvedValue({ data: { user: null } });
            await expect(NewAnswerPage(props({ story }))).rejects.toThrow(`NEXT_REDIRECT:/login?redirect=${encodeURIComponent(`/prepare/new?story=${story}`)}`);
        });

        it("reads the four Lessons once and hands the picker the questions, the link's pair and the API origin", async () => {
            vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
            render(await NewAnswerPage(props({ content: Q.content_id, question: Q.question_id })));
            expect(mocks.load).toHaveBeenCalledTimes(1);
            expect(shown()).toEqual({
                apiUrl: "https://api.example.test",
                catalog: { status: "ok", questions: [Q] },
                requested: { content_id: Q.content_id, question_id: Q.question_id },
                storyId: null,
            });
        });

        it("ignores a malformed pair, and never hands the browser the server-only API_URL", async () => {
            vi.stubEnv("API_URL", "https://internal.example.test");
            vi.stubEnv("NEXT_PUBLIC_API_URL", "");
            render(await NewAnswerPage(props({ content: "../x", question: ["a", "b"] })));
            expect(shown()).toMatchObject({ apiUrl: null, requested: null });
        });

        it.each([
            [{ status: "unauthenticated" }, "signin"],
            [{ status: "unentitled" }, "unentitled"],
            [{ status: "unavailable", cause: "transport" }, "unavailable"],
            [{ status: "unavailable", cause: "malformed" }, "unavailable"],
            [{ status: "notFound" }, "unavailable"],
            [{ status: "retired" }, "unavailable"],
        ])("reports a catalog that returned %j as a failure (%s), never as an empty list", async (result, reason) => {
            mocks.load.mockResolvedValue(result);
            render(await NewAnswerPage(props()));
            expect(shown().catalog).toEqual({ status: "failed", reason });
        });
    });
});
