import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCatalogItem, getCatalogItemMeta, getCatalogTrack } = vi.hoisted(() => ({ getCatalogItem: vi.fn(), getCatalogItemMeta: vi.fn(), getCatalogTrack: vi.fn() }));
vi.mock("@/lib/catalog/client", () => ({ getCatalogItem, getCatalogItemMeta, getCatalogRelated: vi.fn(), getCatalogTrack }));
vi.mock("@/lib/catalog/itemRead", () => ({ withinItemBudget: async () => ({ settled: false }) }));
vi.mock("next/navigation", () => ({
   notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
   },
   useRouter: () => ({ refresh: vi.fn() }),
}));

import { ItemRouteGuard, TrackRouteGuard } from "./CatalogRouteGuard";
import { CatalogItemPage, catalogItemMetadata } from "./CatalogItemPage";
import TrackPage, { generateMetadata as trackMetadata } from "@/app/tracks/[slug]/page";
import { PENDING } from "@/app/CatalogPending";

beforeEach(() => {
   for (const read of [getCatalogItem, getCatalogItemMeta, getCatalogTrack]) read.mockReset().mockReturnValue(new Promise(() => {}));
});

describe("a catalog page whose API read is still out at the deadline", () => {
   it.each(["lesson", "problem", "knowledge"] as const)("a %s renders the pending state, names nothing and is not indexed", async (type) => {
      render(await CatalogItemPage({ type, slug: "synthetic" }));
      expect(screen.getByRole("status")).toHaveTextContent(PENDING.loading);
      expect(document.body).not.toHaveTextContent(/Sign in|Paid access|retired|temporarily unavailable/i);
      expect(await catalogItemMetadata(type, "synthetic")).toEqual({ robots: { index: false, follow: false } });
   });

   it("a Track renders the pending state and is not indexed", async () => {
      render(await TrackPage({ params: Promise.resolve({ slug: "synthetic" }) }));
      expect(screen.getByRole("status")).toHaveTextContent(PENDING.loading);
      expect(await trackMetadata({ params: Promise.resolve({ slug: "synthetic" }) })).toEqual({ robots: { index: false, follow: false } });
   });

   it("the route guards decide nothing without an answer: they render the page instead of a 404", async () => {
      expect(await ItemRouteGuard({ type: "lesson", slug: "synthetic", children: "page" })).toBe("page");
      expect(await TrackRouteGuard({ slug: "synthetic", children: "page" })).toBe("page");
   });
});
