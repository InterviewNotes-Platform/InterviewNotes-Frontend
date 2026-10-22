import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getCatalogItemMeta, getCatalogTrack } from "@/lib/catalog/client";
import type { CatalogItemType } from "@/lib/catalog/types";

/**
 * A loading boundary fixes the response status at 200 before the page runs, so an unknown entry must 404 in the layout
 * above it. Both reads are ones the segment already makes (metadata, the Track page), shared within the request.
 */
export async function ItemRouteGuard({ type, slug, children }: { type: CatalogItemType; slug: string; children: ReactNode }) {
   if ((await getCatalogItemMeta(type, slug)).status === "notFound") notFound();
   return children;
}

export async function TrackRouteGuard({ slug, children }: { slug: string; children: ReactNode }) {
   if ((await getCatalogTrack(slug)).status === "notFound") notFound();
   return children;
}
