import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listCatalogTracks, getCatalogItem, getCatalogRelated } = vi.hoisted(() => ({
   listCatalogTracks: vi.fn(),
   getCatalogItem: vi.fn(),
   getCatalogRelated: vi.fn(),
}));
vi.mock("@/lib/catalog/client", () => ({ listCatalogTracks, getCatalogItem, getCatalogRelated }));
vi.mock("next/navigation", () => ({
   notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
   },
}));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

import TracksPage, * as tracksModule from "./page";
import { TrackCard } from "@/components/catalog/TrackCard";

const TOKEN = "unit-synthetic-preview-token-0123456789abcdef";
const TRACKS = [
   { id: "track.alpha", slug: "alpha", title: "Alpha Track", summary: "Alpha summary." },
   { id: "track.beta", slug: "beta", title: "Beta Track", summary: "Beta summary." },
   { id: "track.gamma", slug: "gamma", title: "Gamma Track", summary: "" },
];

async function view() {
   return render(await TracksPage());
}

beforeEach(() => {
   vi.clearAllMocks();
   listCatalogTracks.mockResolvedValue({ status: "ok", data: { tracks: TRACKS } });
});

afterEach(() => {
   vi.unstubAllEnvs();
});

describe("/tracks populated", () => {
   it("opens with the Learn proposition: one h1, then Tracks, then a card per Track", async () => {
      await view();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Learn, one Track at a time.");
      expect(screen.getByText(/curated learning paths/)).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: "Tracks" })).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Alpha Track", "Beta Track", "Gamma Track"]);
   });

   it("lists the Tracks in the API's order, each linking to its canonical route on this deployment", async () => {
      await view();
      const links = within(screen.getByRole("main")).getAllByRole("link");
      expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
         ["Alpha Track", "/tracks/alpha"],
         ["Beta Track", "/tracks/beta"],
         ["Gamma Track", "/tracks/gamma"],
      ]);
   });

   it("is a list of discovery cards with exactly one link each", async () => {
      await view();
      const cards = within(screen.getByRole("list")).getAllByRole("listitem");
      expect(cards).toHaveLength(3);
      for (const card of cards) expect(within(card).getAllByRole("link")).toHaveLength(1);
   });

   it("uses a three, two, then one column grid", async () => {
      await view();
      expect(screen.getByRole("list").className).toMatch(/md:grid-cols-2.*lg:grid-cols-3/);
   });

   it("reads the Track list once and never an item, relation or Track outline", async () => {
      await view();
      expect(listCatalogTracks).toHaveBeenCalledExactlyOnceWith();
      expect(getCatalogItem).not.toHaveBeenCalled();
      expect(getCatalogRelated).not.toHaveBeenCalled();
   });

   it("drops a Track whose id disagrees with its slug instead of linking it", async () => {
      listCatalogTracks.mockResolvedValue({
         status: "ok",
         data: { tracks: [...TRACKS, { id: "track.other", slug: "unrelated", title: "Mismatched", summary: "" }] },
      });
      await view();
      expect(screen.queryByText("Mismatched")).not.toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
   });

   it("has no Preview marker or noindex in production", async () => {
      await view();
      expect(screen.queryByRole("complementary", { name: "Preview" })).not.toBeInTheDocument();
      expect(tracksModule.generateMetadata()).not.toHaveProperty("robots");
   });
});

describe("/tracks empty", () => {
   it("keeps the proposition and says calmly that nothing is published, with no cards", async () => {
      listCatalogTracks.mockResolvedValue({ status: "ok", data: { tracks: [] } });
      await view();
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("No Tracks are published yet.");
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
      expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
   });

   it("is also empty when no listed Track can be linked", async () => {
      listCatalogTracks.mockResolvedValue({ status: "ok", data: { tracks: [{ id: "track.a", slug: "b", title: "Bad", summary: "" }] } });
      await view();
      expect(screen.getByRole("status")).toHaveTextContent("No Tracks are published yet.");
      expect(screen.queryByText("Bad")).not.toBeInTheDocument();
   });
});

describe("/tracks unavailable", () => {
   it.each(["transport", "upstream", "malformed"])("keeps the proposition and shows the P1 notice for %s", async (cause) => {
      listCatalogTracks.mockResolvedValue({ status: "unavailable", cause });
      await view();
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("This content is temporarily unavailable. Please try again later.");
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/transport|upstream|malformed|403|postgres/i);
   });

   it("is a 404 when the catalog is disabled, as every other catalog route is", async () => {
      listCatalogTracks.mockResolvedValue({ status: "notFound" });
      await expect(TracksPage()).rejects.toThrow("NEXT_NOT_FOUND");
   });
});

describe("/tracks in a preview deployment", () => {
   it("shows the Preview marker and is never indexed or followed", async () => {
      vi.stubEnv("CATALOG_PREVIEW_TOKEN", TOKEN);
      await view();
      expect(screen.getByRole("complementary", { name: "Preview" })).toBeInTheDocument();
      expect(tracksModule.generateMetadata()).toMatchObject({ robots: { index: false, follow: false } });
   });
});

describe("/tracks route configuration", () => {
   it("is rendered per request, never built or cached statically", () => {
      expect(tracksModule.dynamic).toBe("force-dynamic");
   });

   it("titles itself Learn", () => {
      expect(tracksModule.generateMetadata()).toMatchObject({ title: "Learn | InterviewNotes" });
   });
});

describe("TrackCard", () => {
   const card = (summary = "A summary.") =>
      render(<TrackCard track={{ id: "track.x", slug: "x", title: "X Track", summary }} href="/tracks/x" />);

   it("shows the title, the summary and an open cue, linking once to the Track", () => {
      card();
      expect(screen.getByRole("link", { name: "X Track" })).toHaveAttribute("href", "/tracks/x");
      expect(screen.getByRole("link")).toHaveAttribute("data-prefetch", "false");
      expect(screen.getAllByRole("link")).toHaveLength(1);
      expect(screen.getByText("A summary.")).toBeInTheDocument();
      expect(screen.getByText("Open Track")).toHaveAttribute("aria-hidden", "true");
   });

   it("omits a missing summary instead of inventing one", () => {
      card("");
      expect(document.querySelectorAll("p")).toHaveLength(0);
   });

   it("invents no counts, outcomes, ratings or hours, since the list response has none", () => {
      card();
      expect(document.body.textContent).not.toMatch(/\d/);
   });

   it("has no nested interactive element and no button", () => {
      card();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(document.querySelectorAll("a a, a button, button a")).toHaveLength(0);
   });

   it("shows focus on the card, not on a clipped title", () => {
      card();
      expect(screen.getByRole("link").className).toContain("outline-none");
      expect(document.querySelector("article")?.className).toContain("has-[a:focus-visible]:outline-2");
   });
});
