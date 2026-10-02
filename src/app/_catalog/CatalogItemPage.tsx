import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogBody } from "@/components/catalog/CatalogBody";
import { ItemNavigation } from "@/components/catalog/ItemNavigation";
import { TrackBreadcrumb } from "@/components/catalog/TrackContext";
import { getCatalogItem, getCatalogItemMeta } from "@/lib/catalog/client";
import { loadItemNavigation } from "@/lib/catalog/navigation";
import { isPreview } from "@/lib/catalog/preview";
import { catalogHref } from "@/lib/catalog/routes";
import type { CatalogItem, CatalogItemType, CatalogMeta } from "@/lib/catalog/types";
import { CatalogStateNotice } from "./CatalogStateNotice";
import { PreviewMarker, withPreviewRobots } from "./PreviewMarker";

export async function catalogItemMetadata(type: CatalogItemType, slug: string): Promise<Metadata> {
   const result = await getCatalogItemMeta(type, slug);
   if (result.status !== "ok") return withPreviewRobots({});
   return withPreviewRobots({ title: result.data.title, description: result.data.summary });
}

function ItemHeader({ meta }: { meta: Pick<CatalogMeta, "title" | "summary"> }) {
   return (
      <header className="mb-8">
         <h1 className="text-3xl font-bold text-foreground">{meta.title}</h1>
         {meta.summary ? <p className="mt-2 text-muted-foreground">{meta.summary}</p> : null}
      </header>
   );
}

function ItemContent({ item }: { item: CatalogItem }) {
   const stayOnDeployment = isPreview();
   return (
      <>
         {item.body ? <CatalogBody body={item.body} stayOnDeployment={stayOnDeployment} /> : null}
         {item.sections.map((section) => (
            <section key={section.id} id={section.id}>
               {section.title ? <h2 className="text-2xl font-bold mt-8 mb-3 text-foreground">{section.title}</h2> : null}
               <CatalogBody body={section.body} stayOnDeployment={stayOnDeployment} />
            </section>
         ))}
         {item.sections_withheld ? (
            <p role="note" className="mt-8 border border-border p-4 text-sm text-muted-foreground">
               Some sections of this content are premium and are not included in your access.
            </p>
         ) : null}
      </>
   );
}

/**
 * One canonical page per catalog type + slug. The API decides what this caller may read;
 * the page only presents the result it is given. Relationships are loaded only for a body the
 * API has already released, so a locked page shows no Track or related context.
 */
export async function CatalogItemPage({ type, slug }: { type: CatalogItemType; slug: string }) {
   const result = await getCatalogItem(type, slug);
   if (result.status === "notFound") notFound();

   const signInPath = catalogHref(`${type}.${slug}`) ?? undefined;
   let content;
   let header: Pick<CatalogMeta, "title" | "summary"> | null = null;

   const navigation = result.status === "ok" ? await loadItemNavigation(type, slug) : null;

   if (result.status === "ok") {
      header = result.data;
      content = <ItemContent item={result.data} />;
   } else {
      // Public metadata is a safe teaser; the body stays withheld.
      if (result.status === "unauthenticated" || result.status === "unentitled") {
         const meta = await getCatalogItemMeta(type, slug);
         if (meta.status === "ok") header = meta.data;
      }
      content = <CatalogStateNotice state={result.status} signInPath={signInPath} />;
   }

   return (
      <>
         <PreviewMarker />
         <main className="max-w-3xl mx-auto px-6 py-8">
            {navigation?.home ? <TrackBreadcrumb placement={navigation.home} /> : null}
            {header ? <ItemHeader meta={header} /> : null}
            {content}
            {navigation ? <ItemNavigation navigation={navigation} /> : null}
         </main>
      </>
   );
}
