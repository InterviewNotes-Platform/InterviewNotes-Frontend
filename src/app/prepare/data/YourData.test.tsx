import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionPicker, type CatalogLoad } from "@/components/prepare/picker/QuestionPicker";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { SLOW_NOTICE_MS } from "./messages";
import { YourData } from "./YourData";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const API = "https://api.example.test";

let api: ReturnType<typeof createFakePrepApi>;
let token: string;
const saveFile = vi.fn();

beforeEach(() => {
    saveFile.mockReset();
    api = createFakePrepApi();
    token = api.signIn("user-1");
});
afterEach(() => {
    vi.useRealTimers();
});

/** One browser context: its own component tree and token reader. The only thing contexts share is the server behind `fetch`. */
function open(fetch: typeof globalThis.fetch = api.fetch, userToken: string = token) {
    return render(<YourData apiUrl={API} getAccessToken={async () => userToken} fetch={fetch} saveFile={saveFile} />);
}

/** Wraps a fetch so a matching request stays unanswered until the test releases it. */
function hold(match: (method: string, path: string) => boolean) {
    const waiting: (() => void)[] = [];
    const wrapped = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (!match(init?.method ?? "GET", url.pathname.replace("/me/prep", "") + url.search)) return api.fetch(input, init);
        return new Promise<Response>((resolve) => waiting.push(() => void api.fetch(input, init).then(resolve)));
    }) as typeof globalThis.fetch;
    return {
        fetch: wrapped,
        pending: () => waiting.length,
        release: () => act(async () => waiting.splice(0).forEach((run) => run())),
    };
}

const level = () => screen.getByLabelText("Target level") as HTMLSelectElement;
const ready = () => screen.findByRole("button", { name: "Save target level" });
const writes = (path: string) => api.requests.filter((request) => request.path.startsWith(path) && request.method !== "GET");

async function chooseAndSave(value: string) {
    await ready();
    fireEvent.change(level(), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save target level" }));
}

describe("target level", () => {
    it("starts on no target level and offers Save only after a change", async () => {
        open();
        const save = await ready();
        expect(level()).toHaveValue("");
        expect(save).toHaveAttribute("aria-disabled", "true");
        fireEvent.change(level(), { target: { value: "sde-2" } });
        expect(save).not.toHaveAttribute("aria-disabled");
        expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    });

    it("says Saving while the request is open and Saved only after the API answered", async () => {
        const gate = hold((method, path) => method === "PATCH" && path === "/preferences");
        open(gate.fetch);
        await chooseAndSave("sde-2");
        await waitFor(() => expect(gate.pending()).toBe(1));
        expect(screen.getByText("Saving…")).toBeInTheDocument();
        expect(screen.queryByText(/Saved/)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save target level" })).toHaveAttribute("aria-disabled", "true");
        await gate.release();
        await waitFor(() => expect(screen.getByText("Saved: SDE-2.")).toBeInTheDocument());
        expect(writes("/preferences")[0].body).toEqual({ target_level: "sde-2", version: 0 });
    });

    it("keeps Saving true and takes no second write while the first is still open", async () => {
        const gate = hold((method, path) => method === "PATCH" && path === "/preferences");
        open(gate.fetch);
        await chooseAndSave("sde-1");
        await waitFor(() => expect(gate.pending()).toBe(1));

        // The select is locked; even a forced change is ignored and cannot reset the state.
        expect(level()).toBeDisabled();
        fireEvent.change(level(), { target: { value: "sde-2" } });
        fireEvent.click(screen.getByRole("button", { name: "Save target level" }));
        await act(async () => {});
        expect(level()).toHaveValue("sde-1");
        expect(screen.getByText("Saving…")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save target level" })).toHaveAttribute("aria-disabled", "true");
        expect(gate.pending()).toBe(1);

        await gate.release();
        await screen.findByText("Saved: SDE-1.");
        expect(level()).toBeEnabled();
        expect(writes("/preferences").map(({ body }) => body)).toEqual([{ target_level: "sde-1", version: 0 }]);
    });

    it("clears the saved level with no target level", async () => {
        open();
        await chooseAndSave("sde-1");
        await screen.findByText("Saved: SDE-1.");
        fireEvent.change(level(), { target: { value: "" } });
        fireEvent.click(screen.getByRole("button", { name: "Save target level" }));
        await screen.findByText("Saved: no target level.");
        expect(writes("/preferences").map(({ body }) => body)).toEqual([
            { target_level: "sde-1", version: 0 },
            { target_level: null, version: 1 },
        ]);
    });

    it("shows a failed save as an error, never as Saved, and keeps the choice for a retry", async () => {
        open();
        await ready();
        api.failNext(500);
        await chooseAndSave("sde-3");
        await screen.findByText(/Your choice was not saved/);
        expect(screen.queryByText(/^Saved/)).not.toBeInTheDocument();
        expect(level()).toHaveValue("sde-3");
        fireEvent.click(screen.getByRole("button", { name: "Save target level" }));
        await screen.findByText("Saved: SDE-3.");
    });

    it("confirms a write of unknown outcome by reading the API again", async () => {
        // The server applies the change, then the connection drops before the answer arrives.
        const lost = ((input: RequestInfo | URL, init?: RequestInit) =>
            init?.method === "PATCH" ? api.fetch(input, init).then(() => Promise.reject(new TypeError("connection lost"))) : api.fetch(input, init)) as typeof globalThis.fetch;
        open(lost);
        await chooseAndSave("engineering-manager");
        await screen.findByText("Saved: Engineering manager.");
        expect(api.requests.filter(({ method, path }) => method === "GET" && path === "/preferences")).toHaveLength(2);
    });

    it("keeps the reader's choice and says so when another context changed the level first", async () => {
        open();
        await ready();
        // Another context saves SDE-1 while this screen still holds version 0.
        const other = createPrepClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
        expect((await other.updatePreference({ target_level: "sde-1", version: 0 })).status).toBe("ok");

        await chooseAndSave("sde-3");
        await screen.findByText(/changed elsewhere and is now SDE-1\. Your choice is kept here/);
        expect(screen.queryByText(/^Saved/)).not.toBeInTheDocument();
        expect(level()).toHaveValue("sde-3");
        fireEvent.click(screen.getByRole("button", { name: "Save target level" }));
        await screen.findByText("Saved: SDE-3.");
        expect(writes("/preferences").at(-1)?.body).toEqual({ target_level: "sde-3", version: 1 });
    });

    it("tells a signed-out reader to sign in instead of saving", async () => {
        open(api.fetch, "token-nobody");
        await screen.findByText(/Your session has ended/);
        expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?redirect=%2Fprepare%2Fdata");
    });

    it("says the wait is long on a slow first read", async () => {
        vi.useFakeTimers();
        const gate = hold((method, path) => method === "GET" && path === "/preferences");
        open(gate.fetch);
        expect(screen.getByText(/Loading your target level/)).toBeInTheDocument();
        await act(async () => {
            vi.advanceTimersByTime(SLOW_NOTICE_MS);
        });
        expect(screen.getByText(/taking longer than usual/)).toBeInTheDocument();
    });

    it("offers Try again when the first read fails", async () => {
        api.failNext(500);
        open();
        await screen.findByText(/We could not reach|did not finish|not available|could not use/);
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        await ready();
    });
});

describe("a second independent context", () => {
    const catalog: CatalogLoad = {
        status: "ok",
        questions: [
            { content_id: "lesson.behavioral-prep-sde-1", question_id: "a", level: "sde-1", text: "An SDE-1 question", snapshot_fallback: false },
            { content_id: "lesson.behavioral-prep-sde-3", question_id: "b", level: "sde-3", text: "An SDE-3 question", snapshot_fallback: false },
        ],
    };

    it("sees the level saved in the first, and the picker starts on it", async () => {
        localStorage.clear();
        sessionStorage.clear();
        const first = open();
        await chooseAndSave("sde-3");
        await screen.findByText("Saved: SDE-3.");
        first.unmount();
        // Nothing the first context could have kept in the browser is available to the second.
        expect(localStorage.length + sessionStorage.length).toBe(0);

        const second = open(api.fetch, api.signIn("user-1"));
        await ready();
        await waitFor(() => expect(level()).toHaveValue("sde-3"));
        second.unmount();

        render(<QuestionPicker apiUrl={API} catalog={catalog} getAccessToken={async () => token} fetch={api.fetch} />);
        await waitFor(() => expect(screen.getByLabelText("Level")).toHaveValue("sde-3"));
        const questions = within(screen.getByRole("group", { name: "Question" })).getAllByRole("radio");
        expect(questions).toHaveLength(1);
    });

    it("does not show it to another user", async () => {
        open();
        await chooseAndSave("sde-2");
        await screen.findByText("Saved: SDE-2.");
        cleanupAndOpenAs("user-2");
        await ready();
        expect(level()).toHaveValue("");
    });

    function cleanupAndOpenAs(user: string) {
        document.body.innerHTML = "";
        open(api.fetch, api.signIn(user));
    }
});

describe("export", () => {
    it("downloads JSON only after the API answered, then says what arrived", async () => {
        await api.fetch(`${API}/me/prep/answers`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ source: "custom", question_snapshot: "Q?", framework: "free_form" }) });
        const gate = hold((_, path) => path.startsWith("/export"));
        open(gate.fetch);
        await ready();
        fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));
        await waitFor(() => expect(gate.pending()).toBe(1));
        expect(screen.getByText(/Preparing your export/)).toBeInTheDocument();
        expect(saveFile).not.toHaveBeenCalled();
        await gate.release();
        await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
        const [name, text, type] = saveFile.mock.calls[0];
        expect(name).toMatch(/^interviewnotes-prep-\d{4}-\d{2}-\d{2}\.json$/);
        expect(type).toBe("application/json");
        expect(JSON.parse(text).answers).toHaveLength(1);
        expect(await screen.findByText(/Your export arrived: 1 answers and 0 stories/)).toBeInTheDocument();
    });

    it("downloads Markdown", async () => {
        open();
        await ready();
        fireEvent.click(screen.getByRole("button", { name: "Download Markdown" }));
        await screen.findByText(/Your export arrived\. Your browser is saving .*\.md/);
        expect(saveFile.mock.calls[0][2]).toBe("text/markdown");
    });

    it("reports a failure, downloads nothing and can be tried again", async () => {
        open();
        await ready();
        api.failNext(500);
        fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was downloaded.");
        expect(saveFile).not.toHaveBeenCalled();
        expect(screen.queryByText(/Your export arrived/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));
        await screen.findByText(/Your export arrived/);
        expect(saveFile).toHaveBeenCalledTimes(1);
    });

    it("does not start a second export while one is open", async () => {
        const gate = hold((_, path) => path.startsWith("/export"));
        open(gate.fetch);
        await ready();
        fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));
        fireEvent.click(screen.getByRole("button", { name: /Download Markdown/ }));
        await act(async () => {});
        expect(gate.pending()).toBe(1);
    });

    it("reports a download the browser refused to start", async () => {
        saveFile.mockImplementation(() => {
            throw new Error("blocked");
        });
        open();
        await ready();
        fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("could not start the download");
    });
});

describe("delete all", () => {
    const trigger = () => screen.getByRole("button", { name: "Delete all my data…" });
    const dialog = () => screen.getByRole("alertdialog", { name: "Delete all your preparation data?" });

    async function seed() {
        const auth = { Authorization: `Bearer ${token}` };
        for (const text of ["One?", "Two?"]) await api.fetch(`${API}/me/prep/answers`, { method: "POST", headers: auth, body: JSON.stringify({ source: "custom", question_snapshot: text, framework: "free_form" }) });
        await api.fetch(`${API}/me/prep/stories`, { method: "POST", headers: auth, body: JSON.stringify({ title: "S", framework: "free_form" }) });
        await api.fetch(`${API}/me/prep/preferences`, { method: "PATCH", headers: auth, body: JSON.stringify({ target_level: "sde-2", version: 0 }) });
        api.requests.length = 0;
    }

    it("asks first, focuses Cancel, and sends nothing when cancelled", async () => {
        open();
        await ready();
        fireEvent.click(trigger());
        expect(dialog()).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
        expect(screen.getByText("Deletion cancelled. Nothing was deleted.")).toBeInTheDocument();
        expect(trigger()).toHaveFocus();
        expect(writes("/delete-all")).toHaveLength(0);
    });

    it("closes on Escape as a cancellation", async () => {
        open();
        await ready();
        fireEvent.click(trigger());
        fireEvent.keyDown(dialog(), { key: "Escape" });
        await screen.findByText("Deletion cancelled. Nothing was deleted.");
        expect(writes("/delete-all")).toHaveLength(0);
    });

    it("shows Deleting while the request is open and reports only the counts the API returned", async () => {
        await seed();
        const gate = hold((method, path) => method === "POST" && path === "/delete-all");
        open(gate.fetch);
        await waitFor(() => expect(level()).toHaveValue("sde-2"));
        fireEvent.click(trigger());
        fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
        await waitFor(() => expect(gate.pending()).toBe(1));
        expect(screen.getByText(/Deleting your data/)).toBeInTheDocument();
        expect(screen.queryByText(/confirmed the deletion/)).not.toBeInTheDocument();

        // Escape and a second click do nothing while it is open.
        fireEvent.keyDown(dialog(), { key: "Escape" });
        fireEvent.click(screen.getByRole("button", { name: "Deleting…" }));
        expect(dialog()).toBeInTheDocument();
        expect(gate.pending()).toBe(1);

        await gate.release();
        await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
        expect(screen.getByText("The server confirmed the deletion: 2 answers, 1 story, 0 links and your target level deleted.")).toBeInTheDocument();
        expect(writes("/delete-all").map(({ body }) => body)).toEqual([{ confirm: "delete-all" }]);
        expect(trigger()).toHaveFocus();
        // The target level section reads the API again and shows that nothing is stored.
        await waitFor(() => expect(level()).toHaveValue(""));
    });

    it("keeps the dialog open on a failure, says nothing was shown as deleted, and retries", async () => {
        await seed();
        open();
        await ready();
        fireEvent.click(trigger());
        api.failNext(500);
        fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("We cannot tell whether a deletion finished");
        expect(dialog()).toBeInTheDocument();
        expect(screen.queryByText(/confirmed the deletion/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Try deleting again" }));
        await screen.findByText(/confirmed the deletion: 2 answers, 1 story/);
    });

    it("does not claim that nothing was deleted after a close that followed an unknown outcome", async () => {
        open();
        await ready();
        fireEvent.click(trigger());
        api.failNext("network");
        fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
        await screen.findByRole("alert");
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(await screen.findByText(/could not confirm whether the earlier deletion finished/)).toBeInTheDocument();
        expect(screen.queryByText(/Nothing was deleted\./)).not.toBeInTheDocument();
    });

    it("remembers an unknown outcome through later retries until the server confirms", async () => {
        open();
        await ready();
        fireEvent.click(trigger());
        api.failNext("network");
        fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
        await screen.findByText(/We cannot tell whether a deletion finished/);

        // The retry is refused as signed out: the earlier outcome is still unknown.
        api.failNext(401);
        fireEvent.click(screen.getByRole("button", { name: "Try deleting again" }));
        await within(dialog()).findByRole("link", { name: "Sign in" });
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(await screen.findByText(/could not confirm whether the earlier deletion finished/)).toBeInTheDocument();
        expect(screen.queryByText(/Nothing was deleted/)).not.toBeInTheDocument();

        // A later refusal that is not a lost reply does not claim "Nothing was deleted" either.
        fireEvent.click(trigger());
        api.failNext(404);
        fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("We cannot tell whether a deletion finished");
        expect(screen.queryByText(/Nothing was deleted\./)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(await screen.findByText(/could not confirm whether the earlier deletion finished/)).toBeInTheDocument();

        // Only an answer from the server clears it.
        fireEvent.click(trigger());
        fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
        await screen.findByText(/The server confirmed/);
        fireEvent.click(trigger());
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(await screen.findByText("Deletion cancelled. Nothing was deleted.")).toBeInTheDocument();
    });

    it("sends a signed-out reader to sign in from inside the dialog", async () => {
        open(api.fetch, "token-nobody");
        await screen.findAllByText(/Your session has ended/);
        fireEvent.click(trigger());
        fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
        await waitFor(() => expect(within(dialog()).getByRole("link", { name: "Sign in" })).toBeInTheDocument());
    });

    it("makes the rest of the page inert while the dialog is open and releases it after", async () => {
        open();
        await ready();
        const page = document.body.firstElementChild!;
        fireEvent.click(trigger());
        expect(page).toHaveAttribute("inert");
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(page).not.toHaveAttribute("inert"));
    });
});

describe("without an API", () => {
    it("says the service is not configured and offers no actions", () => {
        render(<YourData apiUrl={null} />);
        expect(screen.getAllByRole("alert")[0]).toHaveTextContent("not configured");
        expect(screen.getByRole("button", { name: "Delete all my data…" })).toBeDisabled();
    });
});
