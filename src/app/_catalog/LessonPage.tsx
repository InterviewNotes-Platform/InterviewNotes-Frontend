import { headingIds, parseBlocks } from "@/components/catalog/blocks";
import { CurriculumNavigation } from "@/components/catalog/ItemNavigation";
import { LessonHeader } from "@/components/catalog/LessonHeader";
import { BuildsOn, PracticeTransition, RelationGroup } from "@/components/catalog/LessonRelated";
import { AlternateTracks, LessonBreadcrumb } from "@/components/catalog/TrackContext";
import { LessonContents } from "@/components/lesson/LessonContents";
import { PageContainer } from "@/components/layout/PageContainer";
import { lessonPosition } from "@/lib/catalog/curriculum";
import { contentsOf, lessonRelations } from "@/lib/catalog/lesson";
import type { ItemNavigation } from "@/lib/catalog/navigation";
import type { CatalogItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { ItemContent } from "./ItemContent";

/**
 * A readable Lesson, in the order a reader needs it: where it sits, what it is, what it builds on, the body, then
 * related Knowledge, the step into Practice, and the curriculum around it. Everything comes from the item the API
 * released and its relations; nothing is fetched here and nothing on this page makes a request of its own.
 */
export function LessonPage({ item, navigation, stayOnDeployment }: { item: CatalogItem; navigation: ItemNavigation | null; stayOnDeployment: boolean }) {
   const related = navigation ? lessonRelations(navigation.relations) : null;
   // Contents link to heading ids, so they exist only while the rendered headings carry the API's ids.
   const { body, headings } = item;
   const anchored = body?.format === "markdown@1" && headingIds(parseBlocks(body.text), headings) !== null;
   const contents = anchored ? contentsOf(headings) : [];

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
               {navigation?.home ? (
                  <LessonBreadcrumb placement={navigation.home} position={lessonPosition(navigation.home.track, navigation.id)} />
               ) : null}
               <LessonHeader meta={item} />
               {related ? <BuildsOn rows={related.prerequisites} /> : null}
            </div>
            {contents.length > 0 ? <LessonContents entries={contents} className="lg:col-start-2 lg:row-span-2 lg:row-start-1" /> : null}
            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
               <ItemContent item={item} stayOnDeployment={stayOnDeployment} reading={{ headings }} />
               {related ? (
                  <div className="mt-16 space-y-12 empty:hidden">
                     <RelationGroup id="lesson_related_knowledge" label="Related Knowledge" rows={related.knowledge} withSummary />
                     <RelationGroup id="lesson_related_lessons" label="Related Lessons" rows={related.lessons} withSummary />
                     <PracticeTransition problems={related.practice} />
                     <RelationGroup id="lesson_related_problems" label="Related Problems" rows={related.problems} />
                  </div>
               ) : null}
               {navigation ? (
                  <div className="mt-16 space-y-12 border-t border-border pt-10 empty:hidden">
                     <CurriculumNavigation navigation={navigation} reading />
                     <AlternateTracks placements={navigation.alternates} />
                  </div>
               ) : null}
            </div>
         </div>
      </PageContainer>
   );
}
