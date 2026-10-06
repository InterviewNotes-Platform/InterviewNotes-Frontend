import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listCatalogItems, listCatalogTracks } = vi.hoisted(() => ({ listCatalogItems: vi.fn(), listCatalogTracks: vi.fn() }));
vi.mock("@/lib/catalog/client", () => ({ listCatalogItems, listCatalogTracks }));
vi.mock("next/navigation", () => ({
   notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
   },
}));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

import PracticePage, * as practiceModule from "./page";

const TOKEN = "unit-synthetic-preview-token-0123456789abcdef";
const problem = (slug: string, over = {}) => ({
   id: `problem.${slug}`,
   type: "problem",
   slug,
   title: `Problem ${slug}`,
   summary: `Summary of ${slug}.`,
   tags: [],
   category: "system_design",
   difficulty: null,
   level: null,
   access: "free",
   ...over,
});
const PROBLEMS = [
   problem("alpha", { difficulty: "easy", level: "foundational", tags: ["serving", "latency", "ranking", "extra-tag"] }),
   problem("bravo", { difficulty: "hard", level: "advanced", access: "premium", tags: ["ranking"] }),
   problem("charlie"),
];
const TRACKS = [
   { id: "track.ranking", slug: "ranking", title: "Ranking Track", summary: "" },
   { id: "track.serving", slug: "serving", title: "Serving Track", summary: "" },
];
const page = (items: unknown[], next_cursor: string | null = null) => ({ status: "ok", data: { items, next_cursor } });
// The Topic scan asks for 100 at a time and the results for a page of 12, so the double tells them apart by `limit`.
const SCAN = 100;

const view = async (params: Record<string, string | string[] | undefined> = {}) =>
   render(await PracticePage({ searchParams: Promise.resolve(params) }));
const main = () => within(screen.getByRole("main"));
const resultCalls = () => listCatalogItems.mock.calls.map(([params]) => params).filter((params) => params.limit !== SCAN);
const cardTitles = () => main().queryAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);

beforeEach(() => {
   vi.clearAllMocks();
   listCatalogTracks.mockResolvedValue({ status: "ok", data: { tracks: TRACKS } });
   listCatalogItems.mockImplementation(async () => page(PROBLEMS));
});

afterEach(() => {
   vi.unstubAllEnvs();
});

describe("/practice populated", () => {
   it("opens with the proposition and a short orientation (what it is for, how to approach one, where it connects), then Problems", async () => {
      await view();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Practice, one Problem at a time.");
      const header = main().getByRole("banner");
      expect(header).toHaveTextContent("rehearsing the reasoning an interview asks for");
      expect(header).toHaveTextContent("clarify the requirements, sketch a design, then defend the trade-offs");
      expect(header).toHaveTextContent("Problems point back to both");
      expect(main().getByRole("heading", { level: 2, name: "Problems" })).toBeInTheDocument();
      expect(cardTitles()).toEqual(PROBLEMS.map((p) => p.title));
   });

   it("keeps the outline whole: h1, one h2, then card h3s only", async () => {
      await view();
      expect([...document.querySelectorAll("h1,h2,h3")].map((h) => h.tagName)).toEqual(["H1", "H2", ...PROBLEMS.map(() => "H3")]);
   });

   it("links quietly to Tracks and Knowledge without prefetching either", async () => {
      await view();
      const tracks = main().getByRole("link", { name: "Tracks" });
      const knowledge = main().getByRole("link", { name: "Knowledge" });
      expect(tracks).toHaveAttribute("href", "/tracks");
      expect(knowledge).toHaveAttribute("href", "/knowledge");
      expect(tracks).toHaveAttribute("data-prefetch", "false");
      expect(knowledge).toHaveAttribute("data-prefetch", "false");
   });

   it("lists Problems in the API's order, which it never reorders", async () => {
      listCatalogItems.mockImplementation(async () => page([PROBLEMS[2], PROBLEMS[0], PROBLEMS[1]]));
      await view();
      expect(cardTitles()).toEqual([PROBLEMS[2], PROBLEMS[0], PROBLEMS[1]].map((p) => p.title));
   });

   it("makes each card one link to the Problem, with no control inside it", async () => {
      await view();
      const cards = main().getAllByRole("article");
      expect(cards).toHaveLength(PROBLEMS.length);
      for (const card of cards) {
         expect(within(card).getAllByRole("link")).toHaveLength(1);
         expect(card.querySelectorAll("button, input, select")).toHaveLength(0);
      }
      expect(within(cards[0]).getByRole("link")).toHaveAttribute("href", "/problems/alpha");
      expect(within(cards[0]).getByRole("link")).toHaveAttribute("data-prefetch", "false");
   });

   it("leads each card with its difficulty and level, names them for a screen reader, and keeps topics to three quiet words", async () => {
      await view();
      const [alpha, bravo, charlie] = main().getAllByRole("article");
      expect(alpha).toHaveTextContent("Difficulty: Easy");
      expect(alpha).toHaveTextContent("Level: Foundational");
      expect(alpha).toHaveTextContent("Topics: serving · latency · ranking");
      expect(alpha).not.toHaveTextContent("extra-tag");
      expect(bravo).toHaveTextContent("Difficulty: Hard");
      expect(bravo).toHaveTextContent("Level: Advanced");
      expect(charlie).not.toHaveTextContent(/Difficulty|Level|Topics/);
   });

   it("marks only a premium Problem, and still links it", async () => {
      await view();
      const [alpha, bravo] = main().getAllByRole("article");
      expect(within(bravo).getByText("Premium")).toBeInTheDocument();
      expect(within(bravo).getByRole("link")).toHaveAttribute("href", "/problems/bravo");
      expect(within(alpha).queryByText("Premium")).not.toBeInTheDocument();
   });

   it("announces a short count through one status region", async () => {
      await view();
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(screen.getByRole("status")).toHaveTextContent("Showing 3 Problems");
   });

   it("never reads a Problem body: only list requests", async () => {
      await view();
      expect(listCatalogItems.mock.calls.every(([params]) => params.type === "problem")).toBe(true);
   });
});

describe("/practice filters", () => {
   it("offers all five, labelled, with the Access choices grouped under a legend", async () => {
      await view();
      const form = main().getByRole("form", { name: "Filter Problems" });
      for (const label of ["Topic", "Difficulty", "Level", "Track"]) expect(within(form).getByLabelText(label).tagName).toBe("SELECT");
      const access = within(form).getByRole("group", { name: "Access" });
      expect(within(access).getAllByRole("radio").map((radio) => radio.parentElement?.textContent)).toEqual(["All", "Free", "Premium"]);
      expect(within(form).getByRole("button", { name: "Apply" })).toHaveAttribute("type", "submit");
   });

   it("is a native GET form to /practice, so the URL is the state", async () => {
      await view();
      const form = main().getByRole("form", { name: "Filter Problems" });
      expect(form).toHaveAttribute("method", "get");
      expect(form).toHaveAttribute("action", "/practice");
   });

   it("takes Topic options from Problem metadata and Track options from the Track list, never Modules", async () => {
      await view();
      const options = (label: string) => within(screen.getByLabelText(label)).getAllByRole("option").map((option) => option.textContent);
      expect(options("Topic")).toEqual(["All topics", "extra-tag", "latency", "ranking", "serving"]);
      expect(options("Track")).toEqual(["All Tracks", "Ranking Track", "Serving Track"]);
      expect(options("Difficulty")).toEqual(["Any difficulty", "Easy", "Medium", "Hard"]);
      expect(options("Level")).toEqual(["Any level", "Foundational", "Intermediate", "Advanced"]);
      expect(screen.queryByLabelText(/module/i)).not.toBeInTheDocument();
   });

   it("selects what the URL says, sends it to the API, and counts it", async () => {
      await view({ tag: "ranking", difficulty: "hard", level: "advanced", track: "serving", access: "premium" });
      expect(screen.getByLabelText("Topic")).toHaveValue("ranking");
      expect(screen.getByLabelText("Difficulty")).toHaveValue("hard");
      expect(screen.getByLabelText("Level")).toHaveValue("advanced");
      expect(screen.getByLabelText("Track")).toHaveValue("serving");
      expect(screen.getByRole("radio", { name: "Premium" })).toBeChecked();
      expect(resultCalls()).toEqual([
         { type: "problem", tag: "ranking", difficulty: "hard", level: "advanced", access: "premium", track: "serving", limit: 12, cursor: undefined },
      ]);
      expect(screen.getByRole("button", { name: /Filters/ })).toHaveTextContent("5 active");
   });

   it("ignores unknown or malformed values: nothing it cannot recognise reaches the API", async () => {
      await view({ difficulty: "banana", level: ["a", "b"], access: "gold", tag: "Not Kebab", track: "no-such-track", module: "m", type: "lesson", category: "x", limit: "999" });
      expect(resultCalls()).toEqual([{ type: "problem", limit: 12 }]);
      expect(listCatalogItems.mock.calls.flat().some((params) => "module" in params || "category" in params)).toBe(false);
      expect(screen.getByLabelText("Track")).toHaveValue("");
      expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
   });

   it("drops a well-formed Track that the catalog does not list, rather than asking the API and meeting a 404", async () => {
      await view({ track: "ghost-track", difficulty: "easy" });
      expect(resultCalls()).toEqual([{ type: "problem", difficulty: "easy", limit: 12 }]);
   });

   it("keeps a Topic selectable even when the Topic scan did not see it", async () => {
      await view({ tag: "unseen-topic" });
      expect(screen.getByLabelText("Topic")).toHaveValue("unseen-topic");
   });

   it("offers Clear filters only while one is active, as a plain link to the bare route", async () => {
      const { unmount } = await view();
      expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
      unmount();
      await view({ level: "advanced" });
      expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/practice");
   });
});

describe("/practice pagination", () => {
   it("pages by the API's opaque cursor, carrying every active filter and nothing stale", async () => {
      listCatalogItems.mockImplementation(async ({ limit }) => (limit === SCAN ? page(PROBLEMS) : page(PROBLEMS, "problem.charlie")));
      await view({ tag: "ranking", difficulty: "hard", track: "ranking", access: "free" });
      const next = screen.getByRole("link", { name: /Next page/ });
      expect(next).toHaveAttribute("href", "/practice?tag=ranking&difficulty=hard&track=ranking&access=free&cursor=problem.charlie");
      expect(next).toHaveAttribute("rel", "next");
      expect(screen.queryByRole("link", { name: "First page" })).not.toBeInTheDocument();
   });

   it("sends the cursor back untouched, and offers the first page with the filters but without the cursor", async () => {
      await view({ difficulty: "easy", cursor: "problem.bravo" });
      expect(resultCalls()[0]).toMatchObject({ difficulty: "easy", cursor: "problem.bravo" });
      expect(screen.getByRole("link", { name: "First page" })).toHaveAttribute("href", "/practice?difficulty=easy");
      expect(screen.queryByRole("link", { name: /Next page/ })).not.toBeInTheDocument();
   });

   it("shows no pager for a single page", async () => {
      await view();
      expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
   });
});

describe("/practice empty result", () => {
   beforeEach(() => {
      listCatalogItems.mockImplementation(async ({ limit }) => (limit === SCAN ? page(PROBLEMS) : page([])));
   });

   it("says nothing matches and offers a way to clear the filters, keeping the filter bar", async () => {
      await view({ difficulty: "easy" });
      expect(screen.getByRole("status")).toHaveTextContent("No Problems match the current filters.");
      expect(screen.getAllByRole("link", { name: "Clear filters" }).every((link) => link.getAttribute("href") === "/practice")).toBe(true);
      expect(main().getByRole("form", { name: "Filter Problems" })).toBeInTheDocument();
      expect(main().queryAllByRole("article")).toHaveLength(0);
   });

   it("says there is no more, not 'nothing matches', past the end of an unfiltered list", async () => {
      await view({ cursor: "problem.zzz" });
      expect(screen.getByRole("status")).toHaveTextContent("There are no more Problems here.");
      expect(screen.getByRole("link", { name: "Back to the first page" })).toHaveAttribute("href", "/practice");
   });
});

describe("/practice empty catalog", () => {
   beforeEach(() => {
      listCatalogTracks.mockResolvedValue({ status: "ok", data: { tracks: [] } });
      listCatalogItems.mockResolvedValue(page([]));
   });

   it("keeps the orientation, invents nothing, and offers no filter for nothing", async () => {
      await view();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Practice, one Problem at a time.");
      expect(main().getByRole("link", { name: "Tracks" })).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Problems arrive soon.");
      expect(main().queryAllByRole("article")).toHaveLength(0);
      expect(screen.queryByRole("form", { name: "Filter Problems" })).not.toBeInTheDocument();
   });
});

describe("/practice unavailable", () => {
   it.each([
      ["the Problem list", () => listCatalogItems.mockResolvedValue({ status: "unavailable", cause: "transport" })],
      ["the Track list", () => listCatalogTracks.mockResolvedValue({ status: "unavailable", cause: "upstream" })],
      ["a malformed list", () => listCatalogItems.mockResolvedValue({ status: "unavailable", cause: "malformed" })],
   ])("shows a calm notice when %s fails, with the orientation intact and no Problem", async (_name, fail) => {
      fail();
      await view({ difficulty: "easy" });
      expect(screen.getByRole("status")).toHaveTextContent("temporarily unavailable");
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Practice, one Problem at a time.");
      expect(main().queryAllByRole("article")).toHaveLength(0);
      expect(screen.queryByRole("form", { name: "Filter Problems" })).not.toBeInTheDocument();
   });

   it("is not found where the catalog is disabled, as every other catalog route is", async () => {
      listCatalogTracks.mockResolvedValue({ status: "notFound" });
      listCatalogItems.mockResolvedValue({ status: "notFound" });
      await expect(PracticePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
   });

   it("never leaks a preview credential, whatever the state", async () => {
      vi.stubEnv("CATALOG_PREVIEW_TOKEN", TOKEN);
      listCatalogItems.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      const { container } = await view();
      expect(container.innerHTML).not.toContain(TOKEN);
   });
});

describe("/practice mobile disclosure", () => {
   it("collapses behind a Filters button that reports its state and the active count", async () => {
      await view({ difficulty: "easy", access: "free" });
      const toggle = screen.getByRole("button", { name: /Filters/ });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(toggle).toHaveTextContent("2 active");
      const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
      expect(panel).toHaveClass("hidden");
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(panel).toHaveClass("block");
   });

   it("closes on Escape and returns focus to the button", async () => {
      await view();
      const toggle = screen.getByRole("button", { name: /Filters/ });
      fireEvent.click(toggle);
      screen.getByLabelText("Topic").focus();
      fireEvent.keyDown(screen.getByLabelText("Topic"), { key: "Escape" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(toggle).toHaveFocus();
   });

   it("says nothing about a count when nothing is active", async () => {
      await view();
      expect(screen.getByRole("button", { name: "Filters" })).not.toHaveTextContent("active");
   });
});

describe("/practice route", () => {
   it("is rendered on demand and never built or cached statically", () => {
      expect(practiceModule.dynamic).toBe("force-dynamic");
   });

   it("titles itself Practice", () => {
      expect(practiceModule.generateMetadata()).toMatchObject({ title: "Practice | InterviewNotes" });
   });
});
