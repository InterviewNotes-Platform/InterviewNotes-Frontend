import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { forgetItemStateAvailability } from "@/components/prepare/reader/itemStateAvailable";
import { createContinuityFake } from "./continuityFake";
import { PrepareWorkspace } from "./PrepareWorkspace";

const API = "https://api.example.test";
const TITLES = { "lesson.dynamic-batching": "Dynamic batching" };
const items = { ada: [{ id: "lesson.dynamic-batching", visited: "2026-11-05T10:00:00Z", bookmarked: "2026-11-05T10:00:00Z" }] };

beforeEach(() => {
    forgetItemStateAvailability();
});

function open(fake: ReturnType<typeof createContinuityFake>, user: string | null) {
    const token = user === null ? null : fake.token(user);
    return render(<PrepareWorkspace apiUrl={API} titles={TITLES} getAccessToken={async () => token} fetch={fake.fetch} />);
}

describe("the workspace home with M2", () => {
    it("shows Continue and Bookmarks above the answers for a signed-in learner when M2 is on", async () => {
        const fake = createContinuityFake({ items });
        open(fake, "ada");
        expect(await screen.findByRole("region", { name: "Continue" })).toBeInTheDocument();
        expect(await screen.findByRole("region", { name: "Bookmarks" })).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: "Dynamic batching" })).toHaveLength(2);
        const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
        expect(headings.indexOf("Continue")).toBeGreaterThan(headings.indexOf("Prepare your answers"));
    });

    it("makes no item-state request, and shows neither section, when M2 is off", async () => {
        const fake = createContinuityFake({ continuity: false, items });
        open(fake, "ada");
        await screen.findByText("No answers in progress.");
        await waitFor(() => expect(fake.requests.some(({ path }) => path === "/features")).toBe(true));
        expect(fake.requests.filter(({ path }) => path.startsWith("/item-state"))).toEqual([]);
        expect(screen.queryByRole("region", { name: "Continue" })).not.toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Bookmarks" })).not.toBeInTheDocument();
    });

    it("makes no request of any kind for a signed-out browser, and the existing sign-in state is unchanged", async () => {
        const fake = createContinuityFake({ items });
        open(fake, null);
        expect(await screen.findByRole("alert")).toHaveTextContent("Your session has ended");
        expect(fake.requests).toHaveLength(0);
        expect(screen.queryByRole("region", { name: "Continue" })).not.toBeInTheDocument();
    });
});
