import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getCatalogItemMeta, getCatalogTrack } from "@/lib/catalog/client";
import type { CatalogItemType } from "@/lib/catalog/types";

/**
 * An unknown entry 404s in the layout, before the page runs. Both reads are ones the segment already makes
 * (metadata, the Track page), shared within the request.
 */
export async function ItemRouteGuard({ type, slug, children }: { type: CatalogItemType; slug: string; children: ReactNode }) {
   if ((await getCatalogItemMeta(type, slug)).status === "notFound") notFound();
   return children;
}

export async function TrackRouteGuard({ slug, children }: { slug: string; children: ReactNode }) {
   if ((await getCatalogTrack(slug)).status === "notFound") notFound();
   return children;
}
