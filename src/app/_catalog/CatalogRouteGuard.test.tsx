import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCatalogItemMeta, getCatalogTrack } = vi.hoisted(() => ({ getCatalogItemMeta: vi.fn(), getCatalogTrack: vi.fn() }));
vi.mock("@/lib/catalog/client", () => ({ getCatalogItemMeta, getCatalogTrack }));
vi.mock("next/navigation", () => ({
   notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
   },
}));

import { ItemRouteGuard, TrackRouteGuard } from "./CatalogRouteGuard";

beforeEach(() => vi.clearAllMocks());

// The guard runs above the loading boundary, so these are the states that must stay a real 404 and nothing else.
describe("route guards", () => {
   it("404s an unknown item and an unknown Track", async () => {
      getCatalogItemMeta.mockResolvedValue({ status: "notFound" });
      getCatalogTrack.mockResolvedValue({ status: "notFound" });
      await expect(ItemRouteGuard({ type: "lesson", slug: "nope", children: "x" })).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(TrackRouteGuard({ slug: "nope", children: "x" })).rejects.toThrow("NEXT_NOT_FOUND");
      expect(getCatalogItemMeta).toHaveBeenCalledExactlyOnceWith("lesson", "nope");
   });

   it.each(["ok", "unauthenticated", "unentitled", "retired", "unavailable"])("renders the page when the read is %s", async (status) => {
      getCatalogItemMeta.mockResolvedValue({ status });
      getCatalogTrack.mockResolvedValue({ status });
      render(await ItemRouteGuard({ type: "problem", slug: "p", children: <p>item page</p> }));
      render(await TrackRouteGuard({ slug: "t", children: <p>track page</p> }));
      expect(screen.getByText("item page")).toBeInTheDocument();
      expect(screen.getByText("track page")).toBeInTheDocument();
   });
});
