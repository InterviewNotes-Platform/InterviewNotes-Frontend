import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { YourData } from "./YourData";

const API = "https://api.example.test";
let api: ReturnType<typeof createFakePrepApi>;
let token: string;

beforeEach(() => {
    api = createFakePrepApi();
    token = api.signIn("user-1");
});

/** The fake has no item state in delete-all; this adds the §15.7 count the real server sends. */
function withProgress(rows: unknown): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await api.fetch(input, init);
        if (!String(input).endsWith("/delete-all")) return response;
        const body = await response.json();
        const deleted = rows === undefined ? body.deleted : { ...body.deleted, item_state: rows };
        return new Response(JSON.stringify({ deleted }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
}

function open(fetch: typeof globalThis.fetch = api.fetch) {
    return render(<YourData apiUrl={API} getAccessToken={async () => token} fetch={fetch} />);
}

async function deleteEverything() {
    fireEvent.click(screen.getByRole("button", { name: "Delete all my data…" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
}

describe("Your data: Lesson and Problem progress (P7-T48)", () => {
    it("explains what progress covers, that only the learner reaches it, and links to the Privacy page", async () => {
        open();
        await screen.findByRole("button", { name: "Save target level" });
        expect(screen.getByText(/Once Lesson and Problem progress is on, this also covers when you complete, bookmark and open/)).toHaveTextContent(
            "Your progress is associated with your account and is not visible to other learners. The export includes it and Delete all removes it."
        );
        expect(screen.getByRole("link", { name: "See Privacy & AI Use" })).toHaveAttribute("href", "/privacy");
        expect(document.body).not.toHaveTextContent(/only you can reach|private to your account/i);
    });

    it("says the export includes progress and that delete-all removes it, in the card and in the dialog", async () => {
        open();
        await screen.findByRole("button", { name: "Save target level" });
        expect(screen.getByText(/Download every answer, story, link and your target level, and your Lesson and Problem progress/)).toBeInTheDocument();
        expect(screen.getByText(/Permanently delete every answer, story, link, your target level and your Lesson and Problem progress/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Delete all my data…" }));
        expect(screen.getByRole("alertdialog")).toHaveTextContent("your target level and your Lesson and Problem progress will be permanently deleted");
    });

    it("reports the progress rows the server removed, from its own count", async () => {
        open(withProgress(3));
        await screen.findByRole("button", { name: "Save target level" });
        await deleteEverything();
        expect(screen.getByText("The server confirmed the deletion: 0 answers, 0 stories, 0 links, 3 Lesson and Problem progress records deleted.")).toBeInTheDocument();
    });

    it("never says there was nothing to delete when only progress was removed", async () => {
        open(withProgress(1));
        await screen.findByRole("button", { name: "Save target level" });
        await deleteEverything();
        expect(screen.queryByText(/nothing left to delete/)).not.toBeInTheDocument();
        expect(screen.getByText(/1 Lesson or Problem progress record deleted/)).toBeInTheDocument();
    });

    it.each([["a zero count", 0], ["an older server with no count", undefined], ["a count that is not a number", "3"]])("still says nothing was left when there is nothing, with %s", async (_name, rows) => {
        open(withProgress(rows));
        await screen.findByRole("button", { name: "Save target level" });
        await deleteEverything();
        expect(screen.getByText("The server confirmed there was nothing left to delete.")).toBeInTheDocument();
    });
});
