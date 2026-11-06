import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { forgetItemStateAvailability } from "@/components/prepare/reader/itemStateAvailable";
import { createPrepClient } from "@/lib/prep/client";
import { Continuity } from "./Continuity";
import { bookmarkedLessons, createContinuityFake, type SeededItem } from "./continuityFake";
import type { ItemTitles } from "./itemTitles";

const BASE = "https://api.example.test";
const LESSON = "lesson.dynamic-batching";
const PROBLEM = "problem.rate-limiter";
const TITLES: ItemTitles = {
    [LESSON]: "Dynamic batching",
    [PROBLEM]: "Design a rate limiter",
    ...Object.fromEntries(bookmarkedLessons(45).map(({ id }) => [id, `Title of ${id}`])),
};

type Fake = ReturnType<typeof createContinuityFake>;

function setup({ user = "ada", titles = TITLES as ItemTitles | null, items = {}, continuity = true }: { user?: string | null; titles?: ItemTitles | null; items?: Record<string, SeededItem[]>; continuity?: boolean } = {}) {
    const fake = createContinuityFake({ continuity, items });
    const token = user === null ? null : fake.token(user);
    const client = createPrepClient({ baseUrl: BASE, getAccessToken: async () => token, fetch: fake.fetch });
    const view = render(<Continuity apiUrl={BASE} client={client} titles={titles} />);
    return { fake, view };
}

const paths = (fake: Fake) => fake.requests.map(({ path }) => path);
const click = async (element: HTMLElement) => {
    await act(async () => {
        fireEvent.click(element);
    });
};
const panel = (name: string) => screen.findByRole("region", { name });

beforeEach(() => forgetItemStateAvailability());
afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
});

describe("Continue", () => {
    it("links the most recently visited item, in the API's order, to its Lesson route", async () => {
        setup({
            items: {
                ada: [
                    { id: PROBLEM, visited: "2026-11-05T10:00:00Z" },
                    { id: LESSON, visited: "2026-11-05T11:00:00Z" },
                ],
            },
        });
        const card = within(await panel("Continue"));
        const link = await card.findByRole("link", { name: "Dynamic batching" });
        expect(link).toHaveAttribute("href", "/lessons/dynamic-batching");
        expect(card.getByText("Lesson")).toBeInTheDocument();
        expect(card.getAllByRole("link")).toHaveLength(1);
    });

    it("links a Problem to its Problem route", async () => {
        setup({ items: { ada: [{ id: PROBLEM, visited: "2026-11-05T10:00:00Z" }] } });
        expect(await screen.findByRole("link", { name: "Design a rate limiter" })).toHaveAttribute("href", "/problems/rate-limiter");
    });

    it("breaks a tie on the time by content id, as the contract orders it", async () => {
        const visited = "2026-11-05T10:00:00Z";
        setup({ items: { ada: [{ id: PROBLEM, visited }, { id: LESSON, visited }] } });
        expect(await screen.findByRole("link", { name: "Dynamic batching" })).toBeInTheDocument();
    });

    it("skips an item the catalog no longer lists and continues with the next one", async () => {
        setup({
            items: {
                ada: [
                    { id: "lesson.removed-lesson", visited: "2026-11-05T12:00:00Z" },
                    { id: PROBLEM, visited: "2026-11-05T10:00:00Z" },
                ],
            },
        });
        expect(await screen.findByRole("link", { name: "Design a rate limiter" })).toBeInTheDocument();
        expect(screen.queryByText(/removed-lesson/)).not.toBeInTheDocument();
    });

    it("names no title it does not have: with the catalog unread it says the title is unavailable but still links", async () => {
        setup({ titles: null, items: { ada: [{ id: LESSON, visited: "2026-11-05T10:00:00Z" }] } });
        const link = await screen.findByRole("link", { name: "Lesson (title unavailable)" });
        expect(link).toHaveAttribute("href", "/lessons/dynamic-batching");
    });

    it("says nothing recent is available, not that nothing was visited, when the visited rows are no longer named", async () => {
        setup({ items: { ada: [{ id: "lesson.gone-one", visited: "2026-11-05T12:00:00Z" }] } });
        const card = within(await panel("Continue"));
        expect(await card.findByText("No available recently opened Lessons or Problems.")).toBeInTheDocument();
        expect(card.queryByText(/Nothing to continue yet/)).not.toBeInTheDocument();
    });

    it("shows the empty state when nothing was visited", async () => {
        setup({ items: { ada: [{ id: LESSON, bookmarked: "2026-11-05T10:00:00Z" }] } });
        const card = within(await panel("Continue"));
        expect(await card.findByText(/Nothing to continue yet/)).toBeInTheDocument();
        expect(card.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("reports a failure as an error with a retry, never as an empty list, and recovers", async () => {
        const { fake } = setup({ items: { ada: [{ id: LESSON, visited: "2026-11-05T10:00:00Z" }] } });
        fake.failNext("/item-state/recent?limit=50", 500);
        const card = within(await panel("Continue"));
        expect(await card.findByRole("alert")).toHaveTextContent("We could not load where you left off.");
        expect(card.queryByText(/Nothing to continue yet/)).not.toBeInTheDocument();
        await click(card.getByRole("button", { name: "Try again to load Continue" }));
        expect(await card.findByRole("link", { name: "Dynamic batching" })).toBeInTheDocument();
    });

    it("never changes item state: it reads and nothing else", async () => {
        const { fake } = setup({ items: { ada: [{ id: LESSON, visited: "2026-11-05T10:00:00Z" }] } });
        await screen.findByRole("link", { name: "Dynamic batching" });
        await click(screen.getByRole("link", { name: "Dynamic batching" }));
        expect(fake.requests.every(({ method }) => method === "GET")).toBe(true);
    });
});

describe("Bookmarks", () => {
    it("lists only the caller's bookmarked items, newest first, each linking to its reader", async () => {
        setup({
            items: {
                ada: [
                    { id: LESSON, bookmarked: "2026-11-05T10:00:00Z" },
                    { id: PROBLEM, bookmarked: "2026-11-05T11:00:00Z" },
                    { id: "lesson.item-01", visited: "2026-11-05T09:00:00Z" },
                ],
                grace: [{ id: "lesson.item-02", bookmarked: "2026-11-05T12:00:00Z" }],
            },
        });
        const list = within(await panel("Bookmarks"));
        const links = await list.findAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual(["Design a rate limiter", "Dynamic batching"]);
        expect(links.map((link) => link.getAttribute("href"))).toEqual(["/problems/rate-limiter", "/lessons/dynamic-batching"]);
        expect(screen.queryByText(/item-02/)).not.toBeInTheDocument();
    });

    it("shows the empty state when there are no bookmarks", async () => {
        setup({ items: { ada: [{ id: LESSON, visited: "2026-11-05T10:00:00Z" }] } });
        const list = within(await panel("Bookmarks"));
        expect(await list.findByText(/No bookmarks yet/)).toBeInTheDocument();
    });

    it("pages with the contract's limit and offset, keeps the order and shows no item twice", async () => {
        const { fake } = setup({ items: { ada: bookmarkedLessons(45) } });
        const list = within(await panel("Bookmarks"));
        await waitFor(() => expect(list.getAllByRole("link")).toHaveLength(20));
        await click(list.getByRole("button", { name: "Show more bookmarks" }));
        await waitFor(() => expect(list.getAllByRole("link")).toHaveLength(40));
        await click(list.getByRole("button", { name: "Show more bookmarks" }));
        await waitFor(() => expect(list.getAllByRole("link")).toHaveLength(45));
        expect(list.queryByRole("button", { name: /Show more/ })).not.toBeInTheDocument();
        const hrefs = list.getAllByRole("link").map((link) => link.getAttribute("href"));
        expect(new Set(hrefs).size).toBe(45);
        expect(hrefs).toEqual(bookmarkedLessons(45).map(({ id }) => `/lessons/${id.slice("lesson.".length)}`));
        expect(paths(fake).filter((path) => path.includes("bookmarks"))).toEqual([
            "/item-state/bookmarks?limit=20",
            "/item-state/bookmarks?limit=20&offset=20",
            "/item-state/bookmarks?limit=20&offset=40",
        ]);
    });

    it("pages by the API rows read, not the unique rows shown, when a new bookmark makes the next page overlap", async () => {
        const { fake } = setup({ items: { ada: bookmarkedLessons(45) } });
        const list = within(await panel("Bookmarks"));
        await waitFor(() => expect(list.getAllByRole("link")).toHaveLength(20));
        // A newer bookmark pushes everything down one place: offset 20 now returns item-20 again, then item-21..39.
        fake.seed("ada", [...bookmarkedLessons(45), { id: PROBLEM, bookmarked: "2026-11-05T13:00:00Z" }]);
        await click(list.getByRole("button", { name: "Show more bookmarks" }));
        await waitFor(() => expect(list.getAllByRole("link")).toHaveLength(39));
        await click(list.getByRole("button", { name: "Show more bookmarks" }));
        await waitFor(() => expect(list.getAllByRole("link")).toHaveLength(45));
        expect(paths(fake).filter((path) => path.includes("bookmarks"))).toEqual([
            "/item-state/bookmarks?limit=20",
            "/item-state/bookmarks?limit=20&offset=20",
            "/item-state/bookmarks?limit=20&offset=40",
        ]);
        const hrefs = list.getAllByRole("link").map((link) => link.getAttribute("href"));
        expect(new Set(hrefs).size).toBe(45);
        expect(hrefs).toEqual(bookmarkedLessons(45).map(({ id }) => `/lessons/${id.slice("lesson.".length)}`));
        expect(list.queryByRole("button", { name: /Show more/ })).not.toBeInTheDocument();
    });

    it("reports a failure with a retry, never as an empty list, and recovers", async () => {
        const { fake } = setup({ items: { ada: [{ id: LESSON, bookmarked: "2026-11-05T10:00:00Z" }] } });
        fake.failNext("/item-state/bookmarks?limit=20", 503);
        const list = within(await panel("Bookmarks"));
        expect(await list.findByRole("alert")).toHaveTextContent("We could not load your bookmarks.");
        expect(list.queryByText(/No bookmarks yet/)).not.toBeInTheDocument();
        await click(list.getByRole("button", { name: "Try again to load bookmarks" }));
        expect(await list.findByRole("link", { name: "Dynamic batching" })).toBeInTheDocument();
    });

    it("keeps the rows already shown when the next page fails, and loads it on a second try", async () => {
        const { fake } = setup({ items: { ada: bookmarkedLessons(25) } });
        const list = within(await panel("Bookmarks"));
        await waitFor(() => expect(list.getAllByRole("link")).toHaveLength(20));
        fake.failNext("/item-state/bookmarks?limit=20&offset=20", "network");
        await click(list.getByRole("button", { name: "Show more bookmarks" }));
        expect(await list.findByRole("alert")).toHaveTextContent("We could not load more bookmarks");
        expect(list.getAllByRole("link")).toHaveLength(20);
        await click(list.getByRole("button", { name: "Show more bookmarks" }));
        await waitFor(() => expect(list.getAllByRole("link")).toHaveLength(25));
        expect(list.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("uses native links and buttons, so the keyboard reaches and activates them", async () => {
        setup({ items: { ada: bookmarkedLessons(21) } });
        const list = within(await panel("Bookmarks"));
        await waitFor(() => expect(list.getAllByRole("link")).toHaveLength(20));
        const [first] = list.getAllByRole("link");
        const button = list.getByRole("button", { name: "Show more bookmarks" });
        for (const element of [first, button]) {
            expect(element).not.toHaveAttribute("tabindex", "-1");
            element.focus();
            expect(element).toHaveFocus();
        }
        expect(first.tagName).toBe("A");
        expect(button.tagName).toBe("BUTTON");
    });
});

describe("gating", () => {
    it("sends nothing and shows nothing for a signed-out reader", async () => {
        const { fake, view } = setup({ user: null });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(fake.requests).toHaveLength(0);
        expect(view.container).toBeEmptyDOMElement();
    });

    it("asks the capability read first and, with M2 off, makes no list request and shows nothing", async () => {
        const { fake, view } = setup({ continuity: false, items: { ada: [{ id: LESSON, visited: "2026-11-05T10:00:00Z", bookmarked: "2026-11-05T10:00:00Z" }] } });
        await waitFor(() => expect(fake.requests).toHaveLength(1));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(paths(fake)).toEqual(["/features"]);
        expect(view.container).toBeEmptyDOMElement();
    });

    it.each([
        ["a server error", 500],
        ["a network failure", "network"],
        ["a 404", 404],
    ] as const)("fails closed on %s from the capability read", async (_name, failure) => {
        const fake = createContinuityFake({ items: { ada: [{ id: LESSON, visited: "2026-11-05T10:00:00Z" }] } });
        fake.failNext("/features", failure);
        const client = createPrepClient({ baseUrl: BASE, getAccessToken: async () => fake.token("ada"), fetch: fake.fetch });
        const { container } = render(<Continuity apiUrl={BASE} client={client} titles={TITLES} />);
        await waitFor(() => expect(fake.requests).toHaveLength(1));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(paths(fake)).toEqual(["/features"]);
        expect(container).toBeEmptyDOMElement();
    });

    it("hides the sections, without an error, when the lists answer 404 because M2 went off meanwhile", async () => {
        const fake = createContinuityFake();
        fake.failNext("/item-state/recent?limit=50", 404);
        fake.failNext("/item-state/bookmarks?limit=20", 404);
        const client = createPrepClient({ baseUrl: BASE, getAccessToken: async () => fake.token("ada"), fetch: fake.fetch });
        const { container } = render(<Continuity apiUrl={BASE} client={client} titles={TITLES} />);
        await waitFor(() => expect(fake.requests).toHaveLength(3));
        await waitFor(() => expect(container).toBeEmptyDOMElement());
        expect(paths(fake).sort()).toEqual(["/features", "/item-state/bookmarks?limit=20", "/item-state/recent?limit=50"]);
    });

    it("works under StrictMode without duplicate rows", async () => {
        const fake = createContinuityFake({ items: { ada: [{ id: LESSON, bookmarked: "2026-11-05T10:00:00Z" }] } });
        const client = createPrepClient({ baseUrl: BASE, getAccessToken: async () => fake.token("ada"), fetch: fake.fetch });
        render(
            <StrictMode>
                <Continuity apiUrl={BASE} client={client} titles={TITLES} />
            </StrictMode>
        );
        const list = within(await panel("Bookmarks"));
        expect(await list.findAllByRole("link")).toHaveLength(1);
    });
});

describe("privacy, preview and premium", () => {
    it("keeps item state out of the URL and every browser store", async () => {
        const before = window.location.href;
        setup({ items: { ada: [{ id: LESSON, visited: "2026-11-05T10:00:00Z", bookmarked: "2026-11-05T10:00:00Z" }] } });
        await screen.findAllByRole("link", { name: "Dynamic batching" });
        expect(window.location.href).toBe(before);
        expect(window.localStorage).toHaveLength(0);
        expect(window.sessionStorage).toHaveLength(0);
        expect(document.cookie).toBe("");
    });

    it("links by path alone, so a preview deployment stays on its own origin", async () => {
        setup({ items: { ada: [{ id: LESSON, visited: "2026-11-05T10:00:00Z", bookmarked: "2026-11-05T10:00:00Z" }, { id: PROBLEM, bookmarked: "2026-11-05T09:00:00Z" }] } });
        const links = await screen.findAllByRole("link");
        for (const link of links) {
            const href = link.getAttribute("href") as string;
            expect(href).toMatch(/^\/(lessons|problems)\/[a-z0-9-]+$/);
            expect(new URL(href, "https://deploy-preview-7--interviewnote-s.netlify.app").origin).toBe("https://deploy-preview-7--interviewnote-s.netlify.app");
        }
    });

    it("reads only the capability and the two lists: no catalog or content request, no body", async () => {
        const { fake } = setup({ items: { ada: [{ id: LESSON, visited: "2026-11-05T10:00:00Z", bookmarked: "2026-11-05T10:00:00Z" }] } });
        await screen.findAllByRole("link", { name: "Dynamic batching" });
        expect(paths(fake).sort()).toEqual(["/features", "/item-state/bookmarks?limit=20", "/item-state/recent?limit=50"]);
        expect(fake.requests.every(({ token }) => token === "token-ada")).toBe(true);
    });

    it("ignores an item that is not a Lesson or Problem, and does not call the list empty", async () => {
        setup({ items: { ada: [{ id: "knowledge.caching", bookmarked: "2026-11-05T10:00:00Z" }] }, titles: { ...TITLES, "knowledge.caching": "Caching" } });
        const list = within(await panel("Bookmarks"));
        expect(await list.findByText("No available bookmarked Lessons or Problems.")).toBeInTheDocument();
        expect(list.queryByRole("link")).not.toBeInTheDocument();
    });

    it("says no bookmarked item is available, not that there are no bookmarks, when the rows exist but the catalog no longer names them", async () => {
        setup({ items: { ada: [{ id: "lesson.gone-one", bookmarked: "2026-11-05T10:00:00Z" }, { id: "problem.gone-two", bookmarked: "2026-11-05T09:00:00Z" }] } });
        const list = within(await panel("Bookmarks"));
        expect(await list.findByText("No available bookmarked Lessons or Problems.")).toBeInTheDocument();
        expect(list.queryByText(/No bookmarks yet/)).not.toBeInTheDocument();
        expect(list.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("keeps a paging button when the first page names nothing but more rows exist", async () => {
        const gone = bookmarkedLessons(25);
        setup({ titles: {}, items: { ada: gone } });
        const list = within(await panel("Bookmarks"));
        expect(await list.findByText("None of the bookmarks loaded so far are available.")).toBeInTheDocument();
        expect(list.getByRole("button", { name: "Show more bookmarks" })).toBeInTheDocument();
    });
});
