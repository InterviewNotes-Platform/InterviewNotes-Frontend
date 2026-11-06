import type { ReactNode } from "react";
import { ItemRouteGuard } from "@/app/_catalog/CatalogRouteGuard";

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
   return <ItemRouteGuard type="lesson" slug={(await params).slug}>{children}</ItemRouteGuard>;
}
