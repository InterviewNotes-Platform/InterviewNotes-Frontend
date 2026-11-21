import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { PrepareWorkspace } from "./PrepareWorkspace";

/*
 * One user's questions never outlive their session (P8-PREP-UX-02 review). The focus sheet keeps a snapshot of the newest
 * unfinished answer, so these tests end the session in every way the page can learn of it, and look for that user's question
 * anywhere in the document: the sheet, the Continue link and the list.
 */

// The browser auth client's events, driven by the test: `emit("ada")` is a session for that user, `emit(null)` a sign-out.
const auth = vi.hoisted(() => {
    const listeners = new Set<(event: string, session: { user: { id: string } } | null) => void>();
    return { listeners, emit: (id: string | null) => listeners.forEach((listener) => listener("SIGNED_IN", id ? { user: { id } } : null)) };
});
vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: {
            onAuthStateChange: (listener: (event: string, session: { user: { id: string } } | null) => void) => {
                auth.listeners.add(listener);
                return { data: { subscription: { unsubscribe: () => auth.listeners.delete(listener) } } };
            },
        },
    }),
}));

const API = "https://api.example.test";
const ADA = "Ada's private question";
const BOB = "Bob's own question";

/** Answers for a user, created through the contract-faithful API in the order given. */
async function seed(api: ReturnType<typeof createFakePrepApi>, user: string, texts: string[], status: "draft" | "ready" = "draft") {
    const token = api.signIn(user);
    for (const text of texts) {
        const created = await api.fetch(`${API}/me/prep/answers`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ source: "custom", question_snapshot: text, framework: "star" }),
        });
        const row = (await created.json()) as { id: string; version: number };
        if (status !== "draft") await api.fetch(`${API}/me/prep/answers/${row.id}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ version: row.version, status }) });
    }
    return token;
}

/** Ada is signed in and shown her newest unfinished answer; `session.token` is what the browser would send next. */
async function openAsAda(extra: string[] = []) {
    const api = createFakePrepApi({ continuity: false });
    const session = { token: await seed(api, "ada", [...extra, ADA]) as string | null };
    await seed(api, "bob", [BOB]);
    api.requests.length = 0;
    render(<PrepareWorkspace apiUrl={API} getAccessToken={async () => session.token} fetch={api.fetch} />);
    await screen.findByRole("link", { name: `Continue writing: ${ADA}` });
    return { api, session };
}

/** None of Ada's question anywhere in the document: the sheet's text, the Continue link's name, or a row of the list. */
const noAda = () => {
    expect(screen.queryAllByText(ADA)).toHaveLength(0);
    expect(screen.queryByRole("link", { name: new RegExp(ADA) })).toBeNull();
};
const nothingOfAda = () => {
    noAda();
    expect(screen.queryByRole("link", { name: /^Continue writing/ })).toBeNull();
};

const search = (value: string) => {
    fireEvent.change(screen.getByRole("searchbox", { name: "Search answers" }), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
};

describe("the session the sheet belongs to", () => {
    it("is not reset by the first sign-in event, a repeat of it or a token refresh, and none of them reads anything", async () => {
        const { api } = await openAsAda();
        const read = api.requests.map(({ method, path }) => `${method} ${path}`);
        expect(read.filter((line) => line.startsWith("GET /answers"))).toEqual(["GET /answers?limit=100"]);
        act(() => auth.emit("ada"));
        act(() => auth.emit("ada"));
        expect(screen.getByRole("link", { name: `Continue writing: ${ADA}` })).toBeInTheDocument();
        // Nothing was read again, and the same page is still on screen, not a rebuilt one.
        expect(api.requests.map(({ method, path }) => `${method} ${path}`)).toEqual(read);
    });

    it("clears the previous user's question, Continue link and list the moment the user signs out", async () => {
        const { api, session } = await openAsAda();
        act(() => auth.emit("ada"));
        const before = api.requests.length;
        session.token = null;
        act(() => auth.emit(null));
        // In the render that sees the event: nothing of Ada is left, before anything is awaited.
        nothingOfAda();
        expect(await screen.findByText("Your session has ended. Sign in again to open your workspace.")).toBeInTheDocument();
        expect(screen.getAllByRole("alert")).toHaveLength(1);
        expect(within(screen.getByRole("region", { name: /Pick up where you left off/ })).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?redirect=%2Fprepare");
        nothingOfAda();
        // Nothing was sent for a signed-out browser.
        expect(api.requests).toHaveLength(before);
    });

    it("shows another user none of the last user's data, then that user's own, read with that user's token only", async () => {
        const { api, session } = await openAsAda();
        act(() => auth.emit("ada"));
        const before = api.requests.length;
        session.token = api.signIn("bob");
        act(() => auth.emit("bob"));
        nothingOfAda();
        expect(await screen.findByRole("link", { name: `Continue writing: ${BOB}` })).toBeInTheDocument();
        noAda();
        const after = api.requests.slice(before);
        expect(after.length).toBeGreaterThan(0);
        expect(after.every(({ token }) => token === "token-bob")).toBe(true);
    });

    it("drops the question when a later search finds the session ended, whatever the search", async () => {
        const { api, session } = await openAsAda();
        session.token = "token-expired";
        search("anything");
        expect(await screen.findByText("Your session has ended. Sign in again to open your workspace.")).toBeInTheDocument();
        nothingOfAda();
        expect(screen.getAllByRole("alert")).toHaveLength(1);
        expect(api.requests.at(-1)?.token).toBe("token-expired");
    });

    it("drops the question when a later read finds the workspace no longer available to this user", async () => {
        const { api } = await openAsAda();
        api.setEnabled(false);
        search("private");
        expect(await screen.findByText("The preparation workspace is not available right now.")).toBeInTheDocument();
        nothingOfAda();
        expect(screen.getAllByRole("alert")).toHaveLength(1);
    });

    it("does not bring the old snapshot back when access returns, until the unfiltered list is read again", async () => {
        const { api } = await openAsAda();
        api.setEnabled(false);
        search("private");
        await screen.findByText("The preparation workspace is not available right now.");
        api.setEnabled(true);
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        // The retry repeats the search, which shows matches but is not the list the sheet is read from.
        await screen.findByText("1 answer matches.");
        expect(screen.queryByRole("link", { name: /^Continue writing/ })).toBeNull();
        expect(screen.getByText("Clear the search to see your most recent unfinished answer.")).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole("button", { name: "Clear search and filters" })[0]);
        expect(await screen.findByRole("link", { name: `Continue writing: ${ADA}` })).toBeInTheDocument();
    });

    it("drops the question when the next page finds the session ended", async () => {
        // 101 answers make the first page partial, so there is a next page to ask for.
        const { api, session } = await openAsAda(Array.from({ length: 100 }, (_, n) => `Earlier question ${n + 1}`));
        const more = await screen.findByRole("button", { name: "Show more answers" });
        session.token = "token-expired";
        fireEvent.click(more);
        expect(await screen.findByText("Your session has ended. Sign in again to open your workspace.")).toBeInTheDocument();
        nothingOfAda();
        expect(api.requests.at(-1)).toMatchObject({ path: expect.stringContaining("offset=100"), token: "token-expired" });
    });

    it("keeps what the same session read when a later read merely fails to arrive", async () => {
        const { api } = await openAsAda();
        api.failNext("network");
        search("private");
        expect(await screen.findByText("We could not reach the preparation service.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: `Continue writing: ${ADA}` })).toBeInTheDocument();
    });
});
