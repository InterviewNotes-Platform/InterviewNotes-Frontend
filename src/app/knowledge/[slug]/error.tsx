"use client";

import { CatalogRouteError } from "@/app/_catalog/CatalogRouteError";

export default function Error({ retry }: { retry: () => void }) {
   return <CatalogRouteError retry={retry} />;
}
