import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseReleasedBodies } from "@/lib/perf/markdownTree";
import { KnowledgeHeader } from "@/components/catalog/KnowledgeHeader";
import { LessonHeader } from "@/components/catalog/LessonHeader";
import { ProblemHeader } from "@/components/catalog/ProblemHeader";
import { PageContainer, ReadingColumn } from "@/components/layout/PageContainer";
import { ReaderShell } from "@/components/reader/ReaderShell";
import { getCatalogItem, getCatalogItemMeta } from "@/lib/catalog/client";
import { loadItemNavigation } from "@/lib/catalog/navigation";
import { outlineOf } from "@/lib/catalog/outline";
import { withinItemBudget } from "@/lib/catalog/itemRead";
import { isPreview } from "@/lib/catalog/preview";
import { catalogHref } from "@/lib/catalog/routes";
import type { CatalogItemType, CatalogMeta } from "@/lib/catalog/types";
import { reportRender } from "@/lib/perf/hotpath";
import type { ReaderSurface } from "@/lib/reader/shellPolicy";
import { CatalogPending } from "@/app/CatalogPending";
import { CatalogStateNotice } from "./CatalogStateNotice";
import { KnowledgePage, knowledgeTools } from "./KnowledgePage";
import { LessonPage, lessonTools } from "./LessonPage";
import { PreviewMarker, withPreviewRobots } from "./PreviewMarker";
import { ProblemPage } from "./ProblemPage";

export async function catalogItemMetadata(type: CatalogItemType, slug: string): Promise<Metadata> {
   const answer = await withinItemBudget(getCatalogItemMeta(type, slug));
   // A pending page names nothing it has not read, and is never indexed (crawlers wait for the whole page).
   if (!answer.settled) return withPreviewRobots({ robots: { index: false, follow: false } });
   const result = answer.value;
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

/** The selected design's surfaces (P8-D-072): Lesson and Knowledge on paper, Problem on the desk. */
const SURFACE: Record<CatalogItemType, ReaderSurface> = { lesson: "paper", knowledge: "paper", problem: "desk" };

/**
 * One canonical page per catalog type + slug. The API decides what this caller may read; the page only presents the
 * result it is given. Relationships are loaded only for a body the API has already released, so a locked page shows no
 * Track or related context: it keeps the public header its type uses when readable, and a notice. Both sit in the reader
 * shell, which shows Track orientation only for `access="readable"` (S-LSN-18).
 */
/** The API had not answered by the deadline: the locked shell, which shows nothing about the item, and the bounded refresh. */
function PendingItemPage({ type, slug }: { type: CatalogItemType; slug: string }) {
   return (
      <>
         <PreviewMarker />
         <ReaderShell access="locked" surface={SURFACE[type]}>
            <PageContainer as="main" className="py-12 md:py-16">
               <ReadingColumn>
                  <CatalogPending href={catalogHref(`${type}.${slug}`) ?? ""} />
               </ReadingColumn>
            </PageContainer>
         </ReaderShell>
      </>
   );
}

export async function CatalogItemPage({ type, slug }: { type: CatalogItemType; slug: string }) {
   reportRender(type);
   const answer = await withinItemBudget(getCatalogItem(type, slug));
   if (!answer.settled) return <PendingItemPage type={type} slug={slug} />;
   const result = answer.value;
   if (result.status === "notFound") notFound();

   if (result.status === "ok") {
      const Page = READABLE[type];
      // The authorized body is parsed while the Track reads wait; `/related` still follows the item's own answer.
      const [navigation] = await Promise.all([loadItemNavigation(type, slug), parseReleasedBodies(result.data)]);
      const outline = navigation?.home ? outlineOf(navigation.home.track, navigation.id) : null;
      return (
         <>
            <PreviewMarker />
            <ReaderShell access="readable" surface={SURFACE[type]} outline={outline} expandWide={type === "lesson"} tools={type === "lesson" ? lessonTools(result.data) : type === "knowledge" ? knowledgeTools(result.data) : undefined}>
               <Page item={result.data} navigation={navigation} stayOnDeployment={isPreview()} />
            </ReaderShell>
         </>
      );
   }

   let header: React.ReactNode = null;
   // Public metadata is a safe teaser; the body stays withheld.
   if (result.status === "unauthenticated" || result.status === "unentitled") {
      const meta = await withinItemBudget(getCatalogItemMeta(type, slug));
      if (meta.settled && meta.value.status === "ok") header = <TeaserHeader type={type} meta={meta.value.data} />;
   }
   return (
      <>
         <PreviewMarker />
         <ReaderShell access="locked" surface={SURFACE[type]}>
            <PageContainer as="main" className="py-12 md:py-16">
               <ReadingColumn>
                  {header}
                  <CatalogStateNotice state={result.status} signInPath={catalogHref(`${type}.${slug}`) ?? undefined} />
               </ReadingColumn>
            </PageContainer>
         </ReaderShell>
      </>
   );
}
