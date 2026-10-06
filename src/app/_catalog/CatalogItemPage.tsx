import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemNavigation } from "@/components/catalog/ItemNavigation";
import { KnowledgeHeader } from "@/components/catalog/KnowledgeHeader";
import { LessonHeader } from "@/components/catalog/LessonHeader";
import { TrackBreadcrumb } from "@/components/catalog/TrackContext";
import { PageContainer, ReadingColumn } from "@/components/layout/PageContainer";
import { getCatalogItem, getCatalogItemMeta } from "@/lib/catalog/client";
import { loadItemNavigation } from "@/lib/catalog/navigation";
import { isPreview } from "@/lib/catalog/preview";
import { catalogHref } from "@/lib/catalog/routes";
import type { CatalogItemType, CatalogMeta } from "@/lib/catalog/types";
import { CatalogStateNotice } from "./CatalogStateNotice";
import { ItemContent } from "./ItemContent";
import { KnowledgePage } from "./KnowledgePage";
import { LessonPage } from "./LessonPage";
import { PreviewMarker, withPreviewRobots } from "./PreviewMarker";

export async function catalogItemMetadata(type: CatalogItemType, slug: string): Promise<Metadata> {
   const result = await getCatalogItemMeta(type, slug);
   if (result.status !== "ok") return withPreviewRobots({});
   return withPreviewRobots({ title: result.data.title, description: result.data.summary });
}

function ItemHeader({ meta }: { meta: Pick<CatalogMeta, "title" | "summary"> }) {
   return (
      <header className="mb-12">
         <h1 className="m-0 text-title text-balance">{meta.title}</h1>
         {meta.summary ? <p className="mt-3 mb-0 text-body text-pretty text-muted-foreground">{meta.summary}</p> : null}
      </header>
   );
}

/** The public teaser for a locked item: metadata only, in the header its type uses when readable. */
function TeaserHeader({ type, meta }: { type: CatalogItemType; meta: CatalogMeta }) {
   if (type === "lesson") return <div className="mb-12"><LessonHeader meta={meta} /></div>;
   if (type === "knowledge") return <div className="mb-12"><KnowledgeHeader meta={meta} /></div>;
   return <ItemHeader meta={meta} />;
}

/**
 * One canonical page per catalog type + slug. The API decides what this caller may read;
 * the page only presents the result it is given. Relationships are loaded only for a body the
 * API has already released, so a locked page shows no Track or related context. A readable Lesson or Knowledge topic
 * has its own composition; a locked one keeps this page's public header and notice.
 */
export async function CatalogItemPage({ type, slug }: { type: CatalogItemType; slug: string }) {
   const result = await getCatalogItem(type, slug);
   if (result.status === "notFound") notFound();

   const signInPath = catalogHref(`${type}.${slug}`) ?? undefined;
   let content;
   let header: React.ReactNode = null;

   const navigation = result.status === "ok" ? await loadItemNavigation(type, slug) : null;

   if (result.status === "ok") {
      if (type === "lesson") {
         return (
            <>
               <PreviewMarker />
               <LessonPage item={result.data} navigation={navigation} stayOnDeployment={isPreview()} />
            </>
         );
      }
      if (type === "knowledge") {
         return (
            <>
               <PreviewMarker />
               <KnowledgePage item={result.data} navigation={navigation} stayOnDeployment={isPreview()} />
            </>
         );
      }
      header = <ItemHeader meta={result.data} />;
      content = <ItemContent item={result.data} stayOnDeployment={isPreview()} />;
   } else {
      // Public metadata is a safe teaser; the body stays withheld.
      if (result.status === "unauthenticated" || result.status === "unentitled") {
         const meta = await getCatalogItemMeta(type, slug);
         if (meta.status === "ok") header = <TeaserHeader type={type} meta={meta.data} />;
      }
      content = <CatalogStateNotice state={result.status} signInPath={signInPath} />;
   }

   return (
      <>
         <PreviewMarker />
         <PageContainer as="main" className="py-12 md:py-16">
            <ReadingColumn>
               {navigation?.home ? <TrackBreadcrumb placement={navigation.home} /> : null}
               {header}
               {content}
               {navigation ? <ItemNavigation navigation={navigation} /> : null}
            </ReadingColumn>
         </PageContainer>
      </>
   );
}
