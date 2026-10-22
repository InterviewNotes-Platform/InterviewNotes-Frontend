import { headingIds, parseBlocks } from "@/components/catalog/blocks";
import { knowledgeCoverage } from "@/components/catalog/knowledgeRefs";
import { FullOutline } from "@/components/catalog/ItemNavigation";
import { CurriculumBlock, EndOfTrack, NextLesson, OtherLevels } from "@/components/catalog/LessonClose";
import { LessonHeader } from "@/components/catalog/LessonHeader";
import { TrackSidebar } from "@/components/catalog/TrackSidebar";
import { BuildsOn, PracticeTransition, RelationGroup } from "@/components/catalog/LessonRelated";
import { AlternateTracks, LessonBreadcrumb } from "@/components/catalog/TrackContext";
import { LessonContents } from "@/components/lesson/LessonContents";
import { PageContainer } from "@/components/layout/PageContainer";
import { lessonPosition } from "@/lib/catalog/curriculum";
import { isLevelChoiceTrack, levelsOf } from "@/lib/catalog/levelChoice";
import { contentsOf, knowledgeSupport, lessonRelations } from "@/lib/catalog/lesson";
import type { ItemNavigation } from "@/lib/catalog/navigation";
import { outlineOf } from "@/lib/catalog/outline";
import type { CatalogItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { ItemContent } from "./ItemContent";

/**
 * A readable Lesson, in the order a reader needs it: where it sits, what it is, what it builds on, the body, then the
 * close (Next lesson or End of Track, Knowledge, Practice, Problems, Back to module) and secondary context. A level-choice
 * Track (A-9) closes with its other levels instead of Next, Previous and End of Track. From `lg` a Lesson with a home Track also
 * shows that Track's contents beside the column (A-5); below it the page is unchanged. Everything comes from the item the API
 * released and its relations; nothing is fetched here and nothing on this page makes a request of its own.
 */
export function LessonPage({ item, navigation, stayOnDeployment }: { item: CatalogItem; navigation: ItemNavigation | null; stayOnDeployment: boolean }) {
   const home = navigation?.home ?? null;
   const levels = home && isLevelChoiceTrack(home.track) ? levelsOf(home.track) : null;
   // Another level is offered once, in Other levels; a Next Lesson is offered once, in the close.
   const offeredLessons = levels ? levels.map(({ id }) => id) : home?.nextLesson ? [home.nextLesson.id] : [];
   const related = navigation ? lessonRelations(navigation.relations, [...offeredLessons, ...navigation.practice.map(({ id }) => id)]) : null;
   // Contents link to heading ids, so they exist only while the rendered headings carry the API's ids.
   const { body, headings } = item;
   const blocks = body?.format === "markdown@1" ? parseBlocks(body.text) : null;
   const anchored = blocks !== null && headingIds(blocks, headings) !== null;
   const contents = anchored ? contentsOf(headings) : [];
   // The summaries the body offers in context are not repeated in Related Knowledge (S-KNW-6).
   const support = navigation ? knowledgeSupport(navigation.relations) : undefined;
   const offered = new Set(blocks && support ? knowledgeCoverage(blocks, support).offered : []);
   // The same outline the page already read, as the sidebar's groups (S6-RDR-2); none means today's layout (S6-RDR-1, -10).
   const outline = navigation && home ? outlineOf(home.track, navigation.id) : null;
   const side = outline !== null;

   return (
      <PageContainer as="main" className="py-12 md:py-16">
         <div
            className={cn(
               side
                  ? cn(
                       "lg:grid lg:justify-center lg:gap-x-10 lg:grid-cols-[16rem_minmax(0,var(--container-reading))]",
                       contents.length > 0 && "xl:grid-cols-[16rem_minmax(0,var(--container-reading))_12rem]"
                    )
                  : contents.length > 0
                    ? "lg:grid lg:grid-cols-[minmax(0,var(--container-reading))_12rem] lg:justify-center lg:gap-x-10 xl:grid-cols-[minmax(0,var(--container-reading))_15rem] xl:gap-x-16"
                    : "mx-auto w-full max-w-reading"
            )}
         >
            <div className={cn("mb-10 min-w-0 lg:mb-12 lg:row-start-1", side ? "lg:col-start-2" : "lg:col-start-1")}>
               {navigation && home ? (
                  <LessonBreadcrumb placement={home} position={lessonPosition(home.track, navigation.id)} levels={levels?.length} />
               ) : null}
               <LessonHeader meta={item} />
               {related ? <BuildsOn rows={related.prerequisites} /> : null}
            </div>
            {contents.length > 0 ? (
               <LessonContents
                  entries={contents}
                  beside={side}
                  className={side ? "lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-span-2 xl:row-start-1" : "lg:col-start-2 lg:row-span-2 lg:row-start-1"}
               />
            ) : null}
            {/* After the orientation block and the page's own contents and before the body, so Tab meets them in that order. */}
            {outline ? (
               <div className="hidden lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:block">
                  <TrackSidebar outline={outline} className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto pr-1" />
               </div>
            ) : null}
            <div
               className={cn(
                  "min-w-0",
                  side ? (contents.length > 0 ? "lg:col-start-2 lg:row-start-3 xl:row-start-2" : "lg:col-start-2 lg:row-start-2") : "lg:col-start-1 lg:row-start-2"
               )}
            >
               <ItemContent item={item} stayOnDeployment={stayOnDeployment} reading={{ headings, knowledge: support }} />
               {navigation && related ? (
                  <div className="mt-16 space-y-12 empty:hidden">
                     {home ? (
                        levels ? (
                           <OtherLevels placement={home} currentId={navigation.id} />
                        ) : home.nextLesson ? (
                           <NextLesson placement={home} summary={navigation.nextSummary} />
                        ) : (
                           <EndOfTrack placement={home} />
                        )
                     ) : null}
                     <RelationGroup id="lesson_related_knowledge" label="Related Knowledge" rows={related.knowledge} withSummary summaryOffered={offered} />
                     <PracticeTransition problems={navigation.practice} />
                     <RelationGroup id="lesson_related_problems" label="Related Problems" rows={related.problems} />
                     {home ? (
                        <CurriculumBlock
                           placement={levels ? { ...home, previousLesson: null } : home}
                           position={lessonPosition(home.track, navigation.id)}
                        />
                     ) : null}
                  </div>
               ) : null}
               {navigation && related ? (
                  <div className="mt-16 space-y-12 empty:hidden">
                     <RelationGroup id="lesson_related_lessons" label="Related Lessons" rows={related.lessons} withSummary />
                     <FullOutline
                        navigation={navigation}
                        reading
                        currentLabel={levels ? "Current level" : undefined}
                        className={side ? "lg:hidden" : undefined}
                     />
                     <AlternateTracks placements={navigation.alternates} />
                  </div>
               ) : null}
            </div>
         </div>
      </PageContainer>
   );
}
