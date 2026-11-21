import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { PrepareWorkspace } from "./PrepareWorkspace";

/*
 * The Desk home (P8-PREP-UX-02): one next action, where to start, and the answers. These tests read the real workspace over the
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

const sheet = () => screen.getByRole("region", { name: /Pick up where you left off|Write your first answer|Everything you started is Ready|Nothing recent to pick up/ });

describe("the focus sheet", () => {
    it("offers the newest unfinished answer to continue, skipping a newer Ready one", async () => {
        await open([
            { text: "Old in progress", status: "in_progress" },
            { text: "Newest unfinished draft", status: "draft" },
            { text: "Newest of all but Ready", status: "ready" },
        ]);
        const link = await screen.findByRole("link", { name: "Continue writing: Newest unfinished draft" });
        expect(link).toHaveAttribute("href", expect.stringMatching(/^\/prepare\/answers\/.+/));
        const focus = within(sheet());
        expect(focus.getByText("Newest unfinished draft")).toBeInTheDocument();
        expect(focus.getByText("Draft")).toBeInTheDocument();
        expect(focus.queryByText("Newest of all but Ready")).toBeNull();
    });

    it("names the collection and principle of a company answer, from the registry labels", async () => {
        await open([{ text: "Tell me about owning a fix.", status: "in_progress", catalog: true }]);
        await screen.findByRole("link", { name: /^Continue writing/ });
        expect(within(sheet()).getByText("Amazon Leadership Principles · Ownership")).toBeInTheDocument();
        expect(within(sheet()).getByText("In progress")).toBeInTheDocument();
    });

    it("keeps Answer a question beside Continue, as the secondary action", async () => {
        await open([{ text: "Mid-way", status: "in_progress" }]);
        await screen.findByRole("link", { name: /^Continue writing/ });
        expect(within(sheet()).getByRole("link", { name: "Answer a question" })).toHaveAttribute("href", "/prepare/new");
    });

    it("shows how to begin, and no Continue link, when there are no answers", async () => {
        await open([]);
        expect(await screen.findByRole("heading", { level: 2, name: "Write your first answer" })).toBeInTheDocument();
        expect(within(sheet()).getAllByRole("listitem")).toHaveLength(3);
        expect(screen.queryByRole("link", { name: /^Continue writing/ })).toBeNull();
        expect(within(sheet()).getByRole("link", { name: "Answer a question" })).toBeInTheDocument();
        expect(screen.getByText("No answers in progress.")).toBeInTheDocument();
    });

    it("says everything is Ready when every answer is, and does not claim it for an unread older page", async () => {
        await open([{ text: "Done one", status: "ready" }]);
        expect(await screen.findByRole("heading", { level: 2, name: "Everything you started is Ready" })).toBeInTheDocument();
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

    it("keeps the first-read failure inside the sheet, with Try again, and still offers Answer a question", async () => {
        const api = createFakePrepApi({ continuity: false });
        const token = api.signIn("ada");
        api.failNext("network");
        render(<PrepareWorkspace apiUrl={API} collections={COLLECTIONS} getAccessToken={async () => token} fetch={api.fetch} />);
        const alert = await screen.findByRole("alert");
        expect(sheet()).toContainElement(alert);
        expect(within(sheet()).getByRole("link", { name: "Answer a question" })).toBeInTheDocument();
        fireEvent.click(within(sheet()).getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("heading", { level: 2, name: "Write your first answer" })).toBeInTheDocument();
    });
});

describe("where to start", () => {
    it("links each collection and the Story Bank, with counts from the registry", async () => {
        await open([]);
        const start = within(screen.getByRole("region", { name: "Choose where to start" }));
        expect(start.getByRole("link", { name: /^General Behavioral/ })).toHaveAttribute("href", "/prepare/new");
        expect(start.getByRole("link", { name: /^Amazon Leadership Principles/ })).toHaveAttribute("href", "/prepare/new?collection=amazon");
        expect(start.getByRole("link", { name: /^Googleyness & Leadership/ })).toHaveAttribute("href", "/prepare/new?collection=google");
        expect(start.getByRole("link", { name: /Story Bank/ })).toHaveAttribute("href", "/prepare/stories");
        expect(start.getByText("16 principles · 48 questions")).toBeInTheDocument();
    });

    it("is present while the first read is still pending, and makes no request of its own", async () => {
        const api = createFakePrepApi({ continuity: false });
        const never = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
        render(<PrepareWorkspace apiUrl={API} collections={COLLECTIONS} getAccessToken={async () => api.signIn("ada")} fetch={never} />);
        expect(screen.getByRole("region", { name: "Choose where to start" })).toBeInTheDocument();
        expect(api.requests).toHaveLength(0);
    });

    it("shows no section when the page supplies no collections", async () => {
        await open([], { collections: [] });
        expect(screen.queryByRole("region", { name: "Choose where to start" })).toBeNull();
    });

    it("makes exactly one request, the answers list, however much it shows", async () => {
        const api = await open([{ text: "One", status: "in_progress" }]);
        await screen.findByRole("link", { name: /^Continue writing/ });
        expect(api.requests.map(({ method, path }) => `${method} ${path}`)).toEqual(["GET /answers?limit=100"]);
    });
});

describe("the answers panel", () => {
    it("marks a draft and dates every answer, keeping the company line as the first paragraph", async () => {
        await open([
            { text: "A draft question", status: "draft", catalog: true },
            { text: "A ready one", status: "ready" },
        ]);
        const list = within(await screen.findByRole("region", { name: "Your answers" }));
        const row = (await list.findByRole("link", { name: "A draft question" })).closest("li") as HTMLElement;
        expect(row.querySelector("p")).toHaveTextContent("Amazon Leadership Principles · Ownership");
        expect(within(row).getByText("Draft")).toBeInTheDocument();
        expect(row.querySelector("time")).toHaveAttribute("datetime");
        const ready = list.getByRole("link", { name: "A ready one" }).closest("li") as HTMLElement;
        expect(within(ready).queryByText("Draft")).toBeNull();
        expect(ready.querySelector("p")).toBeNull();
    });
});
