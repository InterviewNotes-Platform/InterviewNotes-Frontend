import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KnowledgeHeader } from "@/components/catalog/KnowledgeHeader";
import { LessonHeader } from "@/components/catalog/LessonHeader";
import { ProblemHeader } from "@/components/catalog/ProblemHeader";
import { PageContainer, ReadingColumn } from "@/components/layout/PageContainer";
import { getCatalogItem, getCatalogItemMeta } from "@/lib/catalog/client";
import { loadItemNavigation } from "@/lib/catalog/navigation";
import { isPreview } from "@/lib/catalog/preview";
import { catalogHref } from "@/lib/catalog/routes";
import type { CatalogItemType, CatalogMeta } from "@/lib/catalog/types";
import { CatalogStateNotice } from "./CatalogStateNotice";
import { KnowledgePage } from "./KnowledgePage";
import { LessonPage } from "./LessonPage";
import { PreviewMarker, withPreviewRobots } from "./PreviewMarker";
import { ProblemPage } from "./ProblemPage";

export async function catalogItemMetadata(type: CatalogItemType, slug: string): Promise<Metadata> {
   const result = await getCatalogItemMeta(type, slug);
   if (result.status !== "ok") return withPreviewRobots({});
   return withPreviewRobots({ title: result.data.title, description: result.data.summary });
}

/** The public teaser for a locked item: metadata only, in the header its type uses when readable. */
function TeaserHeader({ type, meta }: { type: CatalogItemType; meta: CatalogMeta }) {
   if (type === "lesson") return <div className="mb-12"><LessonHeader meta={meta} /></div>;
   if (type === "knowledge") return <div className="mb-12"><KnowledgeHeader meta={meta} /></div>;
   return <div className="mb-12"><ProblemHeader meta={meta} /></div>;
}

/** The composition of a readable item: each type has its own, built from the item the API released and its relations. */
const READABLE = { lesson: LessonPage, knowledge: KnowledgePage, problem: ProblemPage } as const;

/**
 * One canonical page per catalog type + slug. The API decides what this caller may read; the page only presents the
 * result it is given. Relationships are loaded only for a body the API has already released, so a locked page shows no
 * Track or related context: it keeps the public header its type uses when readable, and a notice.
 */
export async function CatalogItemPage({ type, slug }: { type: CatalogItemType; slug: string }) {
   const result = await getCatalogItem(type, slug);
   if (result.status === "notFound") notFound();

   if (result.status === "ok") {
      const Page = READABLE[type];
      const navigation = await loadItemNavigation(type, slug);
      return (
         <>
            <PreviewMarker />
            <Page item={result.data} navigation={navigation} stayOnDeployment={isPreview()} />
         </>
      );
   }

   let header: React.ReactNode = null;
   // Public metadata is a safe teaser; the body stays withheld.
   if (result.status === "unauthenticated" || result.status === "unentitled") {
      const meta = await getCatalogItemMeta(type, slug);
      if (meta.status === "ok") header = <TeaserHeader type={type} meta={meta.data} />;
   }
   return (
      <>
         <PreviewMarker />
         <PageContainer as="main" className="py-12 md:py-16">
            <ReadingColumn>
               {header}
               <CatalogStateNotice state={result.status} signInPath={catalogHref(`${type}.${slug}`) ?? undefined} />
            </ReadingColumn>
         </PageContainer>
      </>
   );
}
