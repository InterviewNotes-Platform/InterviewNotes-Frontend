import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { PrepareWorkspace, SLOW_NOTICE_MS } from "./PrepareWorkspace";

const API = "https://api.example.test";

function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A fetch whose answer is released by the test, so "slow" is controlled, not slept. */
function held() {
    const calls: { url: string; release: (response: Response) => void; fail: (error: Error) => void }[] = [];
    const fetchMock = vi.fn(
        (input: RequestInfo | URL) =>
            new Promise<Response>((resolve, reject) => {
                calls.push({ url: String(input), release: resolve, fail: reject });
            })
    );
    return { calls, fetch: fetchMock as unknown as typeof fetch };
}

const answer = (id: string, status: string, text: string) => ({
    id, source: "custom", content_id: null, question_id: null, question_snapshot: text, snapshot_fallback: false,
    framework: "free_form", fields: {}, body: null, status, tags: [], story_ids: [],
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", version: 1,
});

const token = async () => "session-token";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function flush() {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
}

describe("first request", () => {
    it("shows Loading, not an error or an empty state, until the request resolves, then the result", async () => {
        const { calls, fetch } = held();
        render(<PrepareWorkspace apiUrl={API} getAccessToken={token} fetch={fetch} />);
        await flush();

        expect(screen.getByRole("status")).toHaveTextContent("Loading your workspace");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.queryByText(/No answers/)).toBeNull();
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toContain("/me/prep/answers");

        await act(async () => {
            calls[0].release(
                jsonResponse(200, { items: [answer("a1", "in_progress", "Tell me about a conflict."), answer("a2", "ready", "Tell me about a failure.")], total: 2, limit: 100, offset: 0 })
            );
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(screen.queryByRole("status")).toBeNull();
        expect(screen.getByText("Tell me about a conflict.")).toBeInTheDocument();
        expect(screen.getByText("Tell me about a failure.")).toBeInTheDocument();
    });

    it("says the wait is longer than usual once it is, and still reports no data", async () => {
        const { fetch } = held();
        render(<PrepareWorkspace apiUrl={API} getAccessToken={token} fetch={fetch} />);
        await flush();
        expect(screen.getByRole("status")).not.toHaveTextContent("longer than usual");

        await act(async () => {
            await vi.advanceTimersByTimeAsync(SLOW_NOTICE_MS);
        });
        expect(screen.getByRole("status")).toHaveTextContent("taking longer than usual");
        expect(screen.getByRole("status")).not.toHaveTextContent("Nothing is wrong");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.queryByText(/No answers/)).toBeNull();
    });

    it("shows the empty state only after an empty result", async () => {
        const api = createFakePrepApi();
        const accessToken = api.signIn("ada");
        render(<PrepareWorkspace apiUrl={API} getAccessToken={async () => accessToken} fetch={api.fetch} />);
        await flush();
        expect(screen.getByText("No answers in progress.")).toBeInTheDocument();
        expect(screen.getByText("No answers marked ready.")).toBeInTheDocument();
        expect(api.requests.map(({ method, token }) => [method, token])).toEqual([["GET", accessToken]]);
    });

    it("sends the user to sign-in again when there is no session token, without calling the API", async () => {
        const { calls, fetch } = held();
        render(<PrepareWorkspace apiUrl={API} getAccessToken={async () => null} fetch={fetch} />);
        await flush();
        expect(calls).toHaveLength(0);
        expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?redirect=%2Fprepare");
    });

    it("says it is unavailable when the API answers not found (the feature is off there)", async () => {
        const api = createFakePrepApi({ enabled: false });
        const accessToken = api.signIn("ada");
        render(<PrepareWorkspace apiUrl={API} getAccessToken={async () => accessToken} fetch={api.fetch} />);
        await flush();
        expect(screen.getByRole("alert")).toHaveTextContent("not available right now");
        expect(screen.queryByText(/No answers/)).toBeNull();
    });

    it("reports a failure after the slow wait, offers Try again, and loads on the second attempt", async () => {
        const { calls, fetch } = held();
        render(<PrepareWorkspace apiUrl={API} getAccessToken={token} fetch={fetch} />);
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(SLOW_NOTICE_MS);
            calls[0].fail(new TypeError("fetch failed"));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByRole("alert")).toHaveTextContent("could not reach the preparation service");
        expect(screen.queryByRole("status")).toBeNull();
        expect(screen.queryByText(/No answers/)).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        await flush();
        expect(screen.getByRole("status")).not.toHaveTextContent("longer than usual");
        expect(calls).toHaveLength(2);
        await act(async () => {
            calls[1].release(jsonResponse(200, { items: [], total: 0, limit: 100, offset: 0 }));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByText("No answers in progress.")).toBeInTheDocument();
    });

    it("reports a malformed answer as a failure, not an empty list", async () => {
        const { calls, fetch } = held();
        render(<PrepareWorkspace apiUrl={API} getAccessToken={token} fetch={fetch} />);
        await flush();
        await act(async () => {
            calls[0].release(jsonResponse(200, { unexpected: true }));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.queryByText(/No answers/)).toBeNull();
    });

    it("makes no request and offers no retry when the environment has no API", async () => {
        const { calls, fetch } = held();
        render(<PrepareWorkspace apiUrl={null} getAccessToken={token} fetch={fetch} />);
        await flush();
        expect(calls).toHaveLength(0);
        expect(screen.getByRole("alert")).toHaveTextContent("not configured");
        expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    });

    it("ignores an answer that arrives after the page is left", async () => {
        const { calls, fetch } = held();
        const { container, unmount } = render(<PrepareWorkspace apiUrl={API} getAccessToken={token} fetch={fetch} />);
        await flush();
        unmount();
        await act(async () => {
            calls[0].release(jsonResponse(200, { items: [], total: 0, limit: 100, offset: 0 }));
            await vi.advanceTimersByTimeAsync(SLOW_NOTICE_MS);
        });
        expect(container).toBeEmptyDOMElement();
    });
});

describe("answer-first skeleton", () => {
    it("leads with an Answer a question link to the picker, without prefetching it", async () => {
        const { fetch } = held();
        render(<PrepareWorkspace apiUrl={API} getAccessToken={token} fetch={fetch} />);
        await flush();
        const action = screen.getByRole("link", { name: "Answer a question" });
        expect(action).toHaveAttribute("href", "/prepare/new");
        expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
        expect(screen.queryAllByRole("link")).toHaveLength(1);
    });

    it("says how many answers it shows when the list is longer than one page", async () => {
        const { calls, fetch } = held();
        render(<PrepareWorkspace apiUrl={API} getAccessToken={token} fetch={fetch} />);
        await flush();
        await act(async () => {
            calls[0].release(jsonResponse(200, { items: [answer("a1", "draft", "Q1")], total: 250, limit: 100, offset: 0 }));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByText("Showing the latest 1 of 250 answers; older ones are not listed here.")).toBeInTheDocument();
    });

    it("does not claim a section is empty for the whole account when only the latest page was read", async () => {
        const { calls, fetch } = held();
        render(<PrepareWorkspace apiUrl={API} getAccessToken={token} fetch={fetch} />);
        await flush();
        const items = Array.from({ length: 100 }, (_, i) => answer(`r${i}`, "ready", `Ready question ${i}`));
        await act(async () => {
            calls[0].release(jsonResponse(200, { items, total: 130, limit: 100, offset: 0 }));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByText("No recent answers in progress.")).toBeInTheDocument();
        expect(screen.queryByText("No answers in progress.")).toBeNull();
    });
});
