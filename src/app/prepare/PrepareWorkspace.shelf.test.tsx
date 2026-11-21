import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { PrepareWorkspace } from "./PrepareWorkspace";

/*
 * The Shelf home (P8-PREP-UX-03): one Continue line, the Library of volumes, and the answers shelved by collection. These tests read the real workspace over the
 * contract-faithful in-memory API, so a request the home should not make shows up in `api.requests`.
 */

const API = "https://api.example.test";
const AMAZON = "lesson.amazon-leadership-principles";
const COLLECTIONS = [
    { id: "behavioral", title: "General Behavioral", summary: "4 levels · 40 questions" },
    { id: "amazon", title: "Amazon Leadership Principles", summary: "16 principles · 48 questions" },
    { id: "google", title: "Googleyness & Leadership", summary: "6 themes · 18 questions" },
];
const LABELS = { [AMAZON]: { collection: "Amazon Leadership Principles", groups: { "alp-ownership-01": "Ownership" } } };

type Seed = { text: string; status?: "draft" | "in_progress" | "ready"; catalog?: boolean };

/** Created in the order given, so the last one written is the most recently updated, as the list's default order has it. */
async function open(seed: Seed[], props: Partial<React.ComponentProps<typeof PrepareWorkspace>> = {}) {
    const api = createFakePrepApi({ continuity: false });
    const token = api.signIn("ada");
    const call = (method: string, path: string, body?: unknown) =>
        api.fetch(`${API}/me/prep${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const { text, status = "draft", catalog = false } of seed) {
        const create = catalog
            ? { source: "catalog", content_id: AMAZON, question_id: "alp-ownership-01", question_snapshot: text, snapshot_fallback: false, framework: "star" }
            : { source: "custom", question_snapshot: text, framework: "star" };
        const row = (await (await call("POST", "/answers", create)).json()) as { id: string; version: number };
        await call("PATCH", `/answers/${row.id}`, { version: row.version, status });
    }
    api.requests.length = 0;
    render(<PrepareWorkspace apiUrl={API} labels={LABELS} collections={COLLECTIONS} getAccessToken={async () => token} fetch={api.fetch} {...props} />);
    return api;
}

const ribbon = () => screen.getByRole("region", { name: /^(Continue|Start here|Your workspace)$/ });

describe("the Continue ribbon", () => {
    it("offers the newest unfinished answer to continue, skipping a newer Ready one", async () => {
        await open([
            { text: "Old in progress", status: "in_progress" },
            { text: "Newest unfinished draft", status: "draft" },
            { text: "Newest of all but Ready", status: "ready" },
        ]);
        const link = await screen.findByRole("link", { name: "Continue writing: Newest unfinished draft" });
        expect(link).toHaveAttribute("href", expect.stringMatching(/^\/prepare\/answers\/.+/));
        const focus = within(ribbon());
        expect(focus.getByText("Newest unfinished draft")).toBeInTheDocument();
        expect(focus.getByText(/Draft/)).toBeInTheDocument();
        expect(focus.queryByText("Newest of all but Ready")).toBeNull();
    });

    it("names the collection and principle of a company answer, with its status, from the registry labels", async () => {
        await open([{ text: "Tell me about owning a fix.", status: "in_progress", catalog: true }]);
        await screen.findByRole("link", { name: /^Continue writing/ });
        expect(within(ribbon()).getByText(/^Amazon Leadership Principles · Ownership · In progress · Updated /)).toBeInTheDocument();
    });

    it("says where to begin, with no Continue link, when there are no answers", async () => {
        await open([]);
        expect(await screen.findByRole("heading", { level: 2, name: "Start here" })).toBeInTheDocument();
        expect(within(ribbon()).getByText("Open a collection below to choose your first question, or write your own.")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /^Continue writing/ })).toBeNull();
        expect(within(ribbon()).getByRole("link", { name: "Answer a question" })).toHaveAttribute("href", "/prepare/new");
        expect(screen.getByText("No answers yet.")).toBeInTheDocument();
    });

    it("says everything is Ready when every answer is, and does not claim it for an unread older page", async () => {
        await open([{ text: "Done one", status: "ready" }]);
        expect(await screen.findByText(/Everything you started is Ready/)).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /^Continue writing/ })).toBeNull();
    });

    it("is not changed by searching the answers", async () => {
        const api = await open([
            { text: "Alpha unfinished", status: "in_progress" },
            { text: "Beta other", status: "ready" },
        ]);
        await screen.findByRole("link", { name: "Continue writing: Alpha unfinished" });
        fireEvent.change(screen.getByRole("searchbox", { name: "Search answers" }), { target: { value: "beta" } });
        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        await waitFor(() => expect(api.requests.some(({ path }) => path.includes("q=beta"))).toBe(true));
        await screen.findByText("1 answer matches.");
        expect(screen.getByRole("link", { name: "Continue writing: Alpha unfinished" })).toBeInTheDocument();
        // The list itself shows only the match.
        const list = within(screen.getByRole("region", { name: "Your answers" }));
        expect(list.getByRole("link", { name: "Beta other" })).toBeInTheDocument();
        expect(list.queryByRole("link", { name: "Alpha unfinished" })).toBeNull();
    });

    it("keeps the first-read failure inside the ribbon, with Try again, and still offers Answer a question", async () => {
        const api = createFakePrepApi({ continuity: false });
        const token = api.signIn("ada");
        api.failNext("network");
        render(<PrepareWorkspace apiUrl={API} collections={COLLECTIONS} getAccessToken={async () => token} fetch={api.fetch} />);
        const alert = await screen.findByRole("alert");
        expect(ribbon()).toContainElement(alert);
        expect(within(ribbon()).getByRole("link", { name: "Answer a question" })).toBeInTheDocument();
        fireEvent.click(within(ribbon()).getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("heading", { level: 2, name: "Start here" })).toBeInTheDocument();
    });
});

describe("the Library", () => {
    it("shelves each collection and the Story Bank as volumes, with counts from the registry", async () => {
        await open([]);
        const library = within(screen.getByRole("region", { name: "Library" }));
        expect(library.getByRole("link", { name: /^Collection 1\s*General Behavioral/ })).toHaveAttribute("href", "/prepare/new");
        expect(library.getByRole("link", { name: /^Collection 2\s*Amazon Leadership Principles/ })).toHaveAttribute("href", "/prepare/new?collection=amazon");
        expect(library.getByRole("link", { name: /^Collection 3\s*Googleyness & Leadership/ })).toHaveAttribute("href", "/prepare/new?collection=google");
        expect(library.getByRole("link", { name: /^Yours\s*A story from your Story Bank/ })).toHaveAttribute("href", "/prepare/stories");
        expect(library.getByText("16 principles · 48 questions")).toBeInTheDocument();
    });

    it("is present while the first read is still pending, and makes no request of its own", async () => {
        const api = createFakePrepApi({ continuity: false });
        const never = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
        render(<PrepareWorkspace apiUrl={API} collections={COLLECTIONS} getAccessToken={async () => api.signIn("ada")} fetch={never} />);
        expect(screen.getByRole("region", { name: "Library" })).toBeInTheDocument();
        expect(api.requests).toHaveLength(0);
    });

    it("shows no Library when the page supplies no collections", async () => {
        await open([], { collections: [] });
        expect(screen.queryByRole("region", { name: "Library" })).toBeNull();
    });

    it("shows no count of the reader's own answers, because only the newest page is read", async () => {
        await open([{ text: "One", status: "in_progress", catalog: true }]);
        await screen.findByRole("link", { name: /^Continue writing/ });
        expect(within(screen.getByRole("region", { name: "Library" })).queryByText(/of your answers/)).toBeNull();
    });

    it("makes exactly one request, the answers list, however much it shows", async () => {
        const api = await open([{ text: "One", status: "in_progress" }]);
        await screen.findByRole("link", { name: /^Continue writing/ });
        expect(api.requests.map(({ method, path }) => `${method} ${path}`)).toEqual(["GET /answers?limit=100"]);
    });
});

describe("the answers, shelved by collection", () => {
    it("groups each answer under its collection in registry order, with the reader's own questions last", async () => {
        await open([
            { text: "My own question", status: "draft" },
            { text: "Tell me about owning a fix.", status: "in_progress", catalog: true },
        ]);
        const list = within(await screen.findByRole("region", { name: "Your answers" }));
        const shelves = await list.findAllByRole("heading", { level: 3 });
        expect(shelves.map((heading) => heading.textContent)).toEqual(["Amazon Leadership Principles1", "Your own questions1"]);
    });

    it("shows a general Lesson question under General Behavioral, with its status in words", async () => {
        const api = createFakePrepApi({ continuity: false });
        const token = api.signIn("ada");
        const created = await api.fetch(`${API}/me/prep/answers`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ source: "catalog", content_id: "lesson.behavioral-prep-sde-2", question_id: "when-the-plan-slipped", question_snapshot: "Tell me about a plan that slipped.", snapshot_fallback: false, framework: "star" }),
        });
        expect(created.status).toBe(201);
        render(<PrepareWorkspace apiUrl={API} labels={LABELS} collections={COLLECTIONS} getAccessToken={async () => token} fetch={api.fetch} />);
        const list = within(await screen.findByRole("region", { name: "Your answers" }));
        const shelf = (await list.findByRole("heading", { level: 3, name: /General Behavioral/ })).closest("section") as HTMLElement;
        expect(within(shelf).getByRole("link", { name: "Tell me about a plan that slipped." })).toBeInTheDocument();
        expect(within(shelf).getByText("Draft")).toBeInTheDocument();
    });

    it("names the group of a company answer, dates every answer, and gives each its status as text", async () => {
        await open([
            { text: "A draft question", status: "draft", catalog: true },
            { text: "A ready one", status: "ready" },
        ]);
        const list = within(await screen.findByRole("region", { name: "Your answers" }));
        const row = (await list.findByRole("link", { name: "A draft question" })).closest("li") as HTMLElement;
        expect(row.querySelector("p")).toHaveTextContent(/^Ownership · Updated /);
        expect(within(row).getByText("Draft")).toBeInTheDocument();
        expect(row.querySelector("time")).toHaveAttribute("datetime");
        const ready = list.getByRole("link", { name: "A ready one" }).closest("li") as HTMLElement;
        expect(within(ready).getByText("Ready")).toBeInTheDocument();
        expect(ready.querySelector("p")).toHaveTextContent(/^Updated /);
    });

    it("narrows what is loaded by status with the tabs, asking the server for nothing", async () => {
        const api = await open([
            { text: "A draft", status: "draft" },
            { text: "Mid-way", status: "in_progress" },
            { text: "Finished", status: "ready" },
        ]);
        const list = within(await screen.findByRole("region", { name: "Your answers" }));
        await list.findByRole("link", { name: "Finished" });
        const before = api.requests.length;
        fireEvent.click(list.getByRole("button", { name: "In progress" }));
        expect(list.getByRole("button", { name: "In progress" })).toHaveAttribute("aria-pressed", "true");
        expect(list.getByRole("link", { name: "Mid-way" })).toBeInTheDocument();
        expect(list.queryByRole("link", { name: "Finished" })).toBeNull();
        expect(list.queryByRole("link", { name: "A draft" })).toBeNull();
        fireEvent.click(list.getByRole("button", { name: "All" }));
        expect(list.getByRole("link", { name: "Finished" })).toBeInTheDocument();
        expect(api.requests).toHaveLength(before);
    });

    it("says so when no loaded answer has the chosen status", async () => {
        await open([{ text: "Only a draft", status: "draft" }]);
        const list = within(await screen.findByRole("region", { name: "Your answers" }));
        await list.findByRole("link", { name: "Only a draft" });
        fireEvent.click(list.getByRole("button", { name: "Ready" }));
        expect(list.getByText("No answers are ready.")).toBeInTheDocument();
    });
});
