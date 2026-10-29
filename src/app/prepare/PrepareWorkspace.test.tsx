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
        // Each answer opens its own editor by id, without prefetching it.
        expect(screen.getByRole("link", { name: "Tell me about a conflict." })).toHaveAttribute("href", "/prepare/answers/a1");
        expect(screen.getByRole("link", { name: "Tell me about a failure." })).toHaveAttribute("href", "/prepare/answers/a2");
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
        expect(screen.getByText("Showing 1 of 250 answers.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Show more answers" })).toBeInTheDocument();
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

const tagged = (id: string, status: string, text: string, tags: string[]) => ({ ...answer(id, status, text), tags });
const page = (items: unknown[], total: number, offset = 0) => jsonResponse(200, { items, total, limit: 100, offset });
const params = (url: string) => new URL(url).searchParams;

async function load(items: unknown[], total: number) {
    const harness = held();
    render(<PrepareWorkspace apiUrl={API} getAccessToken={token} fetch={harness.fetch} />);
    await flush();
    await act(async () => {
        harness.calls[0].release(page(items, total));
        await vi.advanceTimersByTimeAsync(0);
    });
    return harness;
}

async function release(call: { release: (response: Response) => void }, response: Response) {
    await act(async () => {
        call.release(response);
        await vi.advanceTimersByTimeAsync(0);
    });
}

const searchFor = (text: string) => {
    fireEvent.change(screen.getByRole("searchbox", { name: "Search answers" }), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
};

describe("search and filter", () => {
    it("asks for a page of 100 with no query at first, then searches with the typed words", async () => {
        const { calls } = await load([answer("a1", "draft", "Q1")], 1);
        expect(params(calls[0].url).get("limit")).toBe("100");
        expect(params(calls[0].url).has("q")).toBe(false);
        searchFor("  scope  ");
        await flush();
        expect(calls).toHaveLength(2);
        expect(params(calls[1].url).get("q")).toBe("scope");
        expect(screen.getByRole("status")).toHaveTextContent("Loading your workspace");
        await release(calls[1], page([answer("a2", "ready", "Scope question")], 1));
        expect(screen.getByRole("link", { name: "Scope question" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Q1" })).toBeNull();
        expect(screen.getByRole("status")).toHaveTextContent("1 answer matches.");
    });

    it("filters by a tag taken from an answer and removes the filter again", async () => {
        const { calls } = await load([tagged("a1", "draft", "Q1", ["leadership"])], 1);
        fireEvent.click(screen.getByRole("button", { name: "Filter by tag leadership" }));
        await flush();
        expect(params(calls[1].url).getAll("tag")).toEqual(["leadership"]);
        await release(calls[1], page([tagged("a1", "draft", "Q1", ["leadership"])], 1));
        expect(screen.getByRole("list", { name: "Tag filters" })).toHaveTextContent("leadership");
        fireEvent.click(screen.getByRole("button", { name: "Remove filter leadership" }));
        await flush();
        expect(params(calls[2].url).has("tag")).toBe(false);
    });

    it("says nothing matches, offers to clear, and the clear reads the whole list again", async () => {
        const { calls } = await load([answer("a1", "draft", "Q1")], 1);
        searchFor("zzz");
        await flush();
        await release(calls[1], page([], 0));
        expect(screen.getByRole("status")).toHaveTextContent("No answers match your search or filters.");
        expect(screen.queryByText("No answers in progress.")).toBeNull();
        fireEvent.click(screen.getAllByRole("button", { name: "Clear search and filters" })[0]);
        await flush();
        expect(params(calls[2].url).has("q")).toBe(false);
        expect((screen.getByRole("searchbox", { name: "Search answers" }) as HTMLInputElement).value).toBe("");
    });
});

describe("more than one page", () => {
    it("reads the next page by offset, adds it without repeating an answer, and moves focus to the count when the list is complete", async () => {
        const { calls } = await load([answer("a1", "draft", "Q1"), answer("a2", "draft", "Q2")], 3);
        expect(screen.getByRole("status")).toHaveTextContent("Showing 2 of 3 answers.");
        fireEvent.click(screen.getByRole("button", { name: "Show more answers" }));
        await flush();
        expect(params(calls[1].url).get("offset")).toBe("2");
        expect(screen.getByRole("button", { name: "Loading more…" })).toBeInTheDocument();
        await release(calls[1], page([answer("a2", "draft", "Q2"), answer("a3", "ready", "Q3")], 3, 2));
        expect(screen.getAllByRole("link", { name: /^Q\d$/ }).map((link) => link.textContent)).toEqual(["Q1", "Q2", "Q3"]);
        expect(screen.queryByRole("button", { name: /Show more answers|Loading more/ })).toBeNull();
        expect(screen.getByRole("status")).toHaveTextContent("3 answers.");
        expect(screen.getByRole("status")).toHaveFocus();
    });

    it("keeps what is loaded and offers another try when the next page cannot be read", async () => {
        const { calls } = await load([answer("a1", "draft", "Q1")], 2);
        fireEvent.click(screen.getByRole("button", { name: "Show more answers" }));
        await flush();
        await act(async () => {
            calls[1].fail(new TypeError("fetch failed"));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByRole("alert")).toHaveTextContent("We could not load more answers.");
        expect(screen.getByRole("link", { name: "Q1" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Show more answers" }));
        await flush();
        expect(calls).toHaveLength(3);
        await release(calls[2], page([answer("a2", "ready", "Q2")], 2, 1));
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("link", { name: "Q2" })).toBeInTheDocument();
    });

    it("drops a page that arrives after the search has changed", async () => {
        const { calls } = await load([answer("a1", "draft", "Q1")], 2);
        fireEvent.click(screen.getByRole("button", { name: "Show more answers" }));
        await flush();
        searchFor("other");
        await flush();
        await release(calls[2], page([answer("b1", "draft", "Found by search")], 1));
        await release(calls[1], page([answer("a2", "draft", "Late page")], 2, 1));
        expect(screen.getByRole("link", { name: "Found by search" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Late page" })).toBeNull();
    });

    it("sends the reader to sign in when the session ends while reading a page", async () => {
        const { calls } = await load([answer("a1", "draft", "Q1")], 2);
        fireEvent.click(screen.getByRole("button", { name: "Show more answers" }));
        await flush();
        await release(calls[1], new Response(null, { status: 401 }));
        expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?redirect=%2Fprepare");
    });
});
