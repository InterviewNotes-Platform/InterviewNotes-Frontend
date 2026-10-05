import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCatalogItem, getCatalogItemMeta, getCatalogRelated, getCatalogTrack } = vi.hoisted(() => ({
   getCatalogItem: vi.fn(),
   getCatalogItemMeta: vi.fn(),
   getCatalogRelated: vi.fn(),
   getCatalogTrack: vi.fn(),
}));
vi.mock("@/lib/catalog/client", () => ({ getCatalogItem, getCatalogItemMeta, getCatalogRelated, getCatalogTrack }));
vi.mock("next/navigation", () => ({
   notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
   },
}));
vi.mock("@/components/mdx/Mermaid", () => ({ Mermaid: () => null }));

import TrackPage from "../tracks/[slug]/page";
import { CatalogItemPage } from "./CatalogItemPage";

const CANONICAL = /^\/(lessons|problems|knowledge|tracks)\/[a-z0-9]+(-[a-z0-9]+)*$/;
const entry = (id: string, over = {}) => {
   const [type, slug] = id.split(".");
   return { id, type, slug, title: `Title ${slug}`, access: "free", primary: true, ...over };
};
const META = { id: "lesson.item", type: "lesson", slug: "item", title: "Synthetic Item", summary: "Synthetic summary", tags: [], difficulty: null, level: null, access: "free" };
const ITEM = { ...META, category: null, body: { format: "markdown@1", text: "Synthetic free body." }, headings: [], sections: [], sections_withheld: false };
const HOME = {
   id: "track.home",
   slug: "home",
   title: "Home Track",
   summary: "",
   modules: [
      { key: "m1", title: "First Module", position: 0, items: [entry("lesson.before"), entry("lesson.item"), entry("problem.after", { access: "premium" })] },
      { key: "m2", title: "Second Module", position: 1, items: [entry("lesson.later")] },
   ],
};
const OTHER = { id: "track.other", slug: "other", title: "Other Track", summary: "", modules: [{ key: "x", title: "Other Module", position: 0, items: [entry("lesson.item"), entry("lesson.elsewhere")] }] };
const RELATED = {
   id: "lesson.item",
   relations: { prerequisite: [{ ...META, id: "knowledge.base", type: "knowledge", slug: "base", title: "Base Knowledge", access: "premium" }] },
   placements: [
      { track: "other", module: "x", position: 0, primary: false },
      { track: "home", module: "m1", position: 1, primary: true },
   ],
};

const show = async (type: "lesson" | "problem" | "knowledge" = "lesson", slug = "item") => render(await CatalogItemPage({ type, slug }));
const hrefs = () => screen.getAllByRole("link").map((link) => link.getAttribute("href"));

beforeEach(() => {
   vi.clearAllMocks();
   getCatalogItem.mockResolvedValue({ status: "ok", data: ITEM });
   getCatalogItemMeta.mockResolvedValue({ status: "ok", data: META });
   getCatalogRelated.mockResolvedValue({ status: "ok", data: RELATED });
   getCatalogTrack.mockImplementation(async (slug: string) =>
      slug === "home" ? { status: "ok", data: HOME } : slug === "other" ? { status: "ok", data: OTHER } : { status: "notFound" }
   );
});

describe("item page navigation", () => {
   it("shows the home Track, module, previous/next and related content around the body", async () => {
      await show();
      expect(screen.getByText("Synthetic free body.")).toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "Track context" })).toHaveTextContent("Home Track / First Module");
      expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute("href", "/lessons/before");
      expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("href", "/problems/after");
      expect(screen.getByRole("navigation", { name: "Module: First Module" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Base Knowledge" })).toHaveAttribute("href", "/knowledge/base");
   });

   it("keeps one canonical identity: every link is a type-based route with no Track or query context", async () => {
      await show();
      for (const href of hrefs()) expect(href).toMatch(CANONICAL);
   });

   it("presents an alternate Track as navigation only, without a second copy of the content", async () => {
      await show();
      expect(screen.getByRole("link", { name: "Other Track" })).toHaveAttribute("href", "/tracks/other");
      expect(screen.getByText(/one canonical address/)).toBeInTheDocument();
      expect(screen.getAllByText("Synthetic free body.")).toHaveLength(1);
      expect(screen.getByRole("navigation", { name: "Track context" })).not.toHaveTextContent("Other Track");
   });

   it("takes neighbours from the home Track, not from the alternate", async () => {
      await show();
      expect(screen.queryByRole("link", { name: /elsewhere/i })).not.toBeInTheDocument();
   });

   it("asks the API for relationships and Tracks only; it fetches no other item's body", async () => {
      await show();
      expect(getCatalogItem).toHaveBeenCalledExactlyOnceWith("lesson", "item");
      expect(getCatalogRelated).toHaveBeenCalledExactlyOnceWith("lesson", "item");
      expect(getCatalogTrack.mock.calls.map(([slug]) => slug).sort()).toEqual(["home", "other"]);
   });

   it("marks a gated target and links its canonical page without exposing any body", async () => {
      await show();
      expect(screen.getByRole("link", { name: "Base Knowledge" }).parentElement).toHaveTextContent("Premium");
      expect(screen.queryByText(/premium body/i)).not.toBeInTheDocument();
   });

   it("renders no Track context or fabricated link for an item the API places in no Track", async () => {
      getCatalogRelated.mockResolvedValue({ status: "ok", data: { ...RELATED, placements: [] } });
      await show();
      expect(screen.queryByRole("navigation", { name: "Track context" })).not.toBeInTheDocument();
      expect(hrefs().filter((href) => href?.startsWith("/tracks/"))).toEqual([]);
      expect(screen.getByRole("link", { name: "Base Knowledge" })).toBeInTheDocument();
   });

   it("invents no home Track when the API marks none primary", async () => {
      getCatalogRelated.mockResolvedValue({ status: "ok", data: { ...RELATED, placements: [RELATED.placements[0]] } });
      await show();
      expect(screen.queryByRole("navigation", { name: "Track context" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Previous|Next/ })).not.toBeInTheDocument();
   });

   it("still renders the content, with no navigation and no error detail, when relationships are unavailable", async () => {
      getCatalogRelated.mockResolvedValue({ status: "unavailable", cause: "upstream" });
      await show();
      expect(screen.getByText("Synthetic free body.")).toBeInTheDocument();
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(/upstream|unavailable/i);
   });
});

describe("gated item pages", () => {
   it.each(["unauthenticated", "unentitled"] as const)("loads no relationships or Track context for a %s reader", async (status) => {
      getCatalogItem.mockResolvedValue({ status });
      await show();
      expect(getCatalogRelated).not.toHaveBeenCalled();
      expect(getCatalogTrack).not.toHaveBeenCalled();
      expect(screen.queryByRole("link", { name: /Previous|Next|Base Knowledge/ })).not.toBeInTheDocument();
      expect(screen.queryByText("Synthetic free body.")).not.toBeInTheDocument();
   });

   it.each([{ status: "retired" }, { status: "unavailable", cause: "transport" }])("loads no relationships for a $status item", async (result) => {
      getCatalogItem.mockResolvedValue(result);
      await show();
      expect(getCatalogRelated).not.toHaveBeenCalled();
   });
});

describe("Track page outline", () => {
   const params = { params: Promise.resolve({ slug: "home" }) };

   it("renders the outline in backend order with canonical item links and premium marks", async () => {
      render(await TrackPage(params));
      expect(screen.getByRole("heading", { level: 1, name: "Home Track" })).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["First Module", "Second Module"]);
      expect(hrefs()).toEqual(["/lessons/before", "/lessons/item", "/problems/after", "/lessons/later"]);
      expect(screen.getByRole("link", { name: "Title after" }).parentElement).toHaveTextContent("Premium");
   });

   it("loads no item bodies and no per-reader relationships", async () => {
      render(await TrackPage(params));
      expect(getCatalogItem).not.toHaveBeenCalled();
      expect(getCatalogRelated).not.toHaveBeenCalled();
   });

   it("marks no current item on the Track's own page", async () => {
      render(await TrackPage(params));
      expect(document.querySelector("[aria-current]")).toBeNull();
   });
});
