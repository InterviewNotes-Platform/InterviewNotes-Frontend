import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCatalogTrack, getCatalogItem, getCatalogItemMeta, getCatalogRelated, listCatalogItems } = vi.hoisted(() => ({
   getCatalogTrack: vi.fn(),
   getCatalogItem: vi.fn(),
   getCatalogItemMeta: vi.fn(),
   getCatalogRelated: vi.fn(),
   listCatalogItems: vi.fn(),
}));
vi.mock("@/lib/catalog/client", () => ({ getCatalogTrack, getCatalogItem, getCatalogItemMeta, getCatalogRelated, listCatalogItems }));
vi.mock("next/navigation", () => ({
   notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
   },
}));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

import TrackPage from "./page";

const TOKEN = "unit-synthetic-preview-token-0123456789abcdef";
const entry = (id: string, access = "free") => {
   const [type, slug] = id.split(".");
   return { id, type, slug, title: `Title ${slug}`, access, primary: true };
};
const TRACK = {
   id: "track.curriculum",
   slug: "curriculum",
   title: "Curriculum Track",
   summary: "Track summary.",
   modules: [
      { key: "one", title: "First module", position: 1, items: [entry("lesson.alpha"), entry("problem.beta")] },
      { key: "two", title: "Second module", position: 2, items: [entry("lesson.gamma", "premium")] },
      { key: "three", title: "Third module", position: 3, items: [] },
   ],
};
const view = async () => render(await TrackPage({ params: Promise.resolve({ slug: "curriculum" }) }));

const listed = (slugs: string[], next_cursor: string | null = null) => ({
   status: "ok",
   data: { items: slugs.map((slug) => ({ id: `lesson.${slug}`, summary: `About ${slug}.` })), next_cursor },
});

beforeEach(() => {
   vi.clearAllMocks();
   getCatalogTrack.mockResolvedValue({ status: "ok", data: TRACK });
   listCatalogItems.mockResolvedValue(listed(["alpha", "gamma"]));
});

afterEach(() => {
   vi.unstubAllEnvs();
});

describe("Track page", () => {
   it("reads the one outline, then lays out proposition, Start, curriculum and context in that order", async () => {
      await view();
      expect(getCatalogTrack).toHaveBeenCalledExactlyOnceWith("curriculum");
      const main = screen.getByRole("main");
      const order = [
         within(main).getByRole("heading", { level: 1 }),
         within(main).getByRole("link", { name: "Start with Title alpha" }),
         within(main).getByRole("navigation", { name: "Curriculum Track outline" }),
         within(main).getByRole("region", { name: "In this Track" }),
      ];
      for (let index = 1; index < order.length; index++) {
         expect(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING, `step ${index}`).toBeTruthy();
      }
   });

   it("reads the Lesson list once for summaries, public and Track-scoped, and never an item, meta or relations", async () => {
      await view();
      expect(listCatalogItems).toHaveBeenCalledExactlyOnceWith({ type: "lesson", track: "curriculum", limit: 100, cursor: undefined });
      for (const read of [getCatalogItem, getCatalogItemMeta, getCatalogRelated]) expect(read).not.toHaveBeenCalled();
   });

   it("shows the scanned summaries on Lesson rows only", async () => {
      await view();
      const outline = within(screen.getByRole("navigation", { name: "Curriculum Track outline" }));
      expect(outline.getByText("About alpha.")).toBeInTheDocument();
      expect(outline.getByText("About gamma.")).toBeInTheDocument();
      expect(outline.queryByText(/About beta/)).not.toBeInTheDocument();
   });

   it("follows next_cursor across pages and shows every page's summaries", async () => {
      listCatalogItems.mockResolvedValueOnce(listed(["alpha"], "lesson.alpha")).mockResolvedValueOnce(listed(["gamma"]));
      await view();
      expect(listCatalogItems.mock.calls.map(([params]) => params.cursor)).toEqual([undefined, "lesson.alpha"]);
      expect(screen.getByText("About alpha.")).toBeInTheDocument();
      expect(screen.getByText("About gamma.")).toBeInTheDocument();
   });

   it("shows no summary at all, and still the whole curriculum, when a page fails after one succeeded", async () => {
      listCatalogItems.mockResolvedValueOnce(listed(["alpha"], "lesson.alpha")).mockResolvedValueOnce({ status: "unavailable", cause: "upstream" });
      await view();
      expect(listCatalogItems).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/^About /)).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Start with Title alpha" })).toBeInTheDocument();
      expect(screen.getAllByRole("button")).toHaveLength(3);
   });

   it("shows no summary at all when the five-page cap is reached, and reads no sixth page", async () => {
      listCatalogItems.mockImplementation(async ({ cursor }) => listed(["alpha"], `lesson.next-${cursor ?? "0"}`));
      await view();
      expect(listCatalogItems).toHaveBeenCalledTimes(5);
      expect(screen.queryByText(/^About /)).not.toBeInTheDocument();
   });

   it("does not scan for a Track with no Lesson, nor for an unavailable Track", async () => {
      getCatalogTrack.mockResolvedValue({ status: "ok", data: { ...TRACK, modules: [{ key: "d", title: "Drills", position: 1, items: [entry("problem.only")] }] } });
      await view();
      expect(screen.queryByRole("link", { name: /^Start/ })).not.toBeInTheDocument();
      getCatalogTrack.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      document.body.innerHTML = "";
      await view();
      expect(listCatalogItems).not.toHaveBeenCalled();
   });

   it("starts at the first Lesson, opens only the first module and keeps the premium entry linkable", async () => {
      await view();
      expect(screen.getByRole("link", { name: "Start with Title alpha" })).toHaveAttribute("href", "/lessons/alpha");
      expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-expanded"))).toEqual(["true", "false", "false"]);
      expect(screen.getByRole("link", { name: /Title gamma/ })).toHaveAttribute("href", "/lessons/gamma");
   });

   it("starts a premium-first curriculum at its premium Lesson, from the public outline alone", async () => {
      getCatalogTrack.mockResolvedValue({
         status: "ok",
         data: { ...TRACK, modules: [{ key: "one", title: "First module", position: 1, items: [entry("lesson.paid", "premium"), entry("lesson.free")] }] },
      });
      await view();
      expect(screen.getByRole("link", { name: "Start with Title paid" })).toHaveAttribute("href", "/lessons/paid");
      expect(screen.getByText("Recommended starting point").parentElement).toHaveTextContent("Premium");
      for (const read of [getCatalogItem, getCatalogItemMeta, getCatalogRelated]) expect(read).not.toHaveBeenCalled();
   });

   it("renders a Track whose outline is empty without a Start action or a crash", async () => {
      getCatalogTrack.mockResolvedValue({ status: "ok", data: { ...TRACK, modules: [] } });
      await view();
      expect(screen.getByRole("heading", { level: 1, name: "Curriculum Track" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /^Start/ })).not.toBeInTheDocument();
      expect(screen.getByText("Nothing is published in this Track yet.")).toBeInTheDocument();
   });

   it("marks a preview and keeps the unavailable state free of a heading and of the Track", async () => {
      vi.stubEnv("CATALOG_PREVIEW_TOKEN", TOKEN);
      await view();
      expect(screen.getByRole("complementary", { name: "Preview" })).toBeInTheDocument();

      getCatalogTrack.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      document.body.innerHTML = "";
      await view();
      expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("temporarily unavailable");
   });
});

describe("a level-choice Track (A-9)", () => {
   const LEVELS = {
      ...TRACK,
      id: "track.behavioral-interview-preparation",
      slug: "behavioral-interview-preparation",
      title: "Levels Track",
      modules: [
         {
            key: "choose",
            title: "Choose",
            position: 1,
            items: [entry("lesson.one"), entry("lesson.two", "premium"), entry("lesson.three"), entry("lesson.four")],
         },
      ],
   };
   const levelView = async () => render(await TrackPage({ params: Promise.resolve({ slug: LEVELS.slug }) }));

   beforeEach(() => {
      getCatalogTrack.mockResolvedValue({ status: "ok", data: LEVELS });
      listCatalogItems.mockResolvedValue(listed(["one", "two", "three", "four"]));
   });

   it("replaces Start with a Choose your level group of every Lesson, in curriculum order, with titles and summaries", async () => {
      await levelView();
      expect(screen.queryByRole("link", { name: /^Start/ })).not.toBeInTheDocument();
      const group = within(screen.getByRole("region", { name: "Choose your level" }));
      const links = group.getAllByRole("link");
      expect(links.map((link) => link.getAttribute("href"))).toEqual(["/lessons/one", "/lessons/two", "/lessons/three", "/lessons/four"]);
      expect(links.map((link) => link.getAttribute("data-prefetch"))).toEqual(["false", "false", "false", "false"]);
      for (const slug of ["one", "two", "three", "four"]) {
         expect(group.getByRole("link", { name: new RegExp(`Title ${slug}.*About ${slug}\\.`) })).toBeInTheDocument();
      }
      expect(links[1]).toHaveTextContent("Premium");
   });

   it("presents no level as recommended, first or preferred, and keeps the curriculum below", async () => {
      await levelView();
      expect(screen.queryByText(/recommended|preferred|start with|default/i)).not.toBeInTheDocument();
      const choice = screen.getByRole("region", { name: "Choose your level" });
      const outline = screen.getByRole("navigation", { name: "Levels Track outline" });
      expect(choice.compareDocumentPosition(outline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(outline).getAllByRole("link")).toHaveLength(4);
   });

   it("makes the same reads as any Track: one outline and one Lesson scan", async () => {
      await levelView();
      expect(getCatalogTrack).toHaveBeenCalledExactlyOnceWith(LEVELS.slug);
      expect(listCatalogItems).toHaveBeenCalledExactlyOnceWith({ type: "lesson", track: LEVELS.slug, limit: 100, cursor: undefined });
      for (const read of [getCatalogItem, getCatalogItemMeta, getCatalogRelated]) expect(read).not.toHaveBeenCalled();
   });

   it("still lists every level, without summaries, when the scan fails", async () => {
      listCatalogItems.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      await levelView();
      expect(within(screen.getByRole("region", { name: "Choose your level" })).getAllByRole("link")).toHaveLength(4);
      expect(screen.queryByText(/^About /)).not.toBeInTheDocument();
   });

   it("never renders Start for a listed Track with no Lesson, empty or holding only Problems", async () => {
      getCatalogTrack.mockResolvedValue({ status: "ok", data: { ...LEVELS, modules: [] } });
      await levelView();
      expect(screen.queryByRole("link", { name: /^Start/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Choose your level" })).not.toBeInTheDocument();
      expect(screen.getByText("Nothing is published in this Track yet.")).toBeInTheDocument();

      getCatalogTrack.mockResolvedValue({ status: "ok", data: { ...LEVELS, modules: [{ key: "d", title: "Drills", position: 1, items: [entry("problem.only")] }] } });
      document.body.innerHTML = "";
      await levelView();
      expect(screen.queryByRole("link", { name: /^Start/ })).not.toBeInTheDocument();
      expect(screen.queryByText("Recommended starting point")).not.toBeInTheDocument();
      expect(listCatalogItems).not.toHaveBeenCalled();
   });

   it("leaves an ordinary Track's Start action alone", async () => {
      getCatalogTrack.mockResolvedValue({ status: "ok", data: TRACK });
      await view();
      expect(screen.getByRole("link", { name: "Start with Title alpha" })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Choose your level" })).not.toBeInTheDocument();
   });
});
