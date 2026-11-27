import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getCatalogItemMeta, getCatalogTrack } from "@/lib/catalog/client";
import { withinItemBudget } from "@/lib/catalog/itemRead";
import type { CatalogItemType } from "@/lib/catalog/types";

/**
 * An unknown entry 404s in the layout, before the page runs. Both reads are ones the segment already makes
 * (metadata, the Track page), shared within the request. A read still out at the request's deadline decides nothing: the
 * page renders its pending state, and the 404 comes with the answer.
 */
export async function ItemRouteGuard({ type, slug, children }: { type: CatalogItemType; slug: string; children: ReactNode }) {
   const meta = await withinItemBudget(getCatalogItemMeta(type, slug));
   if (meta.settled && meta.value.status === "notFound") notFound();
   return children;
}

export async function TrackRouteGuard({ slug, children }: { slug: string; children: ReactNode }) {
   const track = await withinItemBudget(getCatalogTrack(slug));
   if (track.settled && track.value.status === "notFound") notFound();
   return children;
}
