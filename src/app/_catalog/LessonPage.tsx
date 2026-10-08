import { headingIds, parseBlocks } from "@/components/catalog/blocks";
import { knowledgeCoverage } from "@/components/catalog/knowledgeRefs";
import { FullOutline } from "@/components/catalog/ItemNavigation";
import { CurriculumBlock, EndOfTrack, NextLesson } from "@/components/catalog/LessonClose";
import { LessonHeader } from "@/components/catalog/LessonHeader";
import { BuildsOn, PracticeTransition, RelationGroup } from "@/components/catalog/LessonRelated";
import { AlternateTracks, LessonBreadcrumb } from "@/components/catalog/TrackContext";
import { LessonContents } from "@/components/lesson/LessonContents";
import { PageContainer } from "@/components/layout/PageContainer";
import { lessonPosition } from "@/lib/catalog/curriculum";
import { contentsOf, knowledgeSupport, lessonRelations } from "@/lib/catalog/lesson";
import type { ItemNavigation } from "@/lib/catalog/navigation";
import type { CatalogItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { ItemContent } from "./ItemContent";

/**
 * A readable Lesson, in the order a reader needs it: where it sits, what it is, what it builds on, the body, then the
 * close (Next lesson or End of Track, Knowledge, Practice, Problems, Back to module) and secondary context. Everything comes from the item the API
 * released and its relations; nothing is fetched here and nothing on this page makes a request of its own.
 */
export function LessonPage({ item, navigation, stayOnDeployment }: { item: CatalogItem; navigation: ItemNavigation | null; stayOnDeployment: boolean }) {
   const home = navigation?.home ?? null;
   const related = navigation
      ? lessonRelations(navigation.relations, [...(home?.nextLesson ? [home.nextLesson.id] : []), ...navigation.practice.map(({ id }) => id)])
      : null;
   // Contents link to heading ids, so they exist only while the rendered headings carry the API's ids.
   const { body, headings } = item;
   const blocks = body?.format === "markdown@1" ? parseBlocks(body.text) : null;
   const anchored = blocks !== null && headingIds(blocks, headings) !== null;
   const contents = anchored ? contentsOf(headings) : [];
   // The summaries the body offers in context are not repeated in Related Knowledge (S-KNW-6).
   const support = navigation ? knowledgeSupport(navigation.relations) : undefined;
   const offered = new Set(blocks && support ? knowledgeCoverage(blocks, support).offered : []);

   return (
      <PageContainer as="main" className="py-12 md:py-16">
         <div
            className={cn(
               contents.length > 0
                  ? "lg:grid lg:grid-cols-[minmax(0,var(--container-reading))_12rem] lg:justify-center lg:gap-x-10 xl:grid-cols-[minmax(0,var(--container-reading))_15rem] xl:gap-x-16"
                  : "mx-auto w-full max-w-reading"
            )}
         >
            <div className="mb-10 min-w-0 lg:col-start-1 lg:row-start-1 lg:mb-12">
               {navigation && home ? (
                  <LessonBreadcrumb placement={home} position={lessonPosition(home.track, navigation.id)} />
               ) : null}
               <LessonHeader meta={item} />
               {related ? <BuildsOn rows={related.prerequisites} /> : null}
            </div>
            {contents.length > 0 ? <LessonContents entries={contents} className="lg:col-start-2 lg:row-span-2 lg:row-start-1" /> : null}
            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
               <ItemContent item={item} stayOnDeployment={stayOnDeployment} reading={{ headings, knowledge: support }} />
               {navigation && related ? (
                  <div className="mt-16 space-y-12 empty:hidden">
                     {home ? (
                        home.nextLesson ? <NextLesson placement={home} summary={navigation.nextSummary} /> : <EndOfTrack placement={home} />
                     ) : null}
                     <RelationGroup id="lesson_related_knowledge" label="Related Knowledge" rows={related.knowledge} withSummary summaryOffered={offered} />
                     <PracticeTransition problems={navigation.practice} />
                     <RelationGroup id="lesson_related_problems" label="Related Problems" rows={related.problems} />
                     {home ? <CurriculumBlock placement={home} position={lessonPosition(home.track, navigation.id)} /> : null}
                  </div>
               ) : null}
               {navigation && related ? (
                  <div className="mt-16 space-y-12 empty:hidden">
                     <RelationGroup id="lesson_related_lessons" label="Related Lessons" rows={related.lessons} withSummary />
                     <FullOutline navigation={navigation} reading />
                     <AlternateTracks placements={navigation.alternates} />
                  </div>
               ) : null}
            </div>
         </div>
      </PageContainer>
   );
}
