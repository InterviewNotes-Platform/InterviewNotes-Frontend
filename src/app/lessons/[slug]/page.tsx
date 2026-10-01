import { CatalogItemPage, catalogItemMetadata } from "@/app/_catalog/CatalogItemPage";

// The response depends on the caller's session, so it is never built or cached statically.
export const dynamic = "force-dynamic";

interface PageProps {
   params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
   return catalogItemMetadata("lesson", (await params).slug);
}

export default async function Page({ params }: PageProps) {
   return <CatalogItemPage type="lesson" slug={(await params).slug} />;
}
