import type { ReactNode } from "react";
import { TrackRouteGuard } from "@/app/_catalog/CatalogRouteGuard";

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
   return <TrackRouteGuard slug={(await params).slug}>{children}</TrackRouteGuard>;
}
