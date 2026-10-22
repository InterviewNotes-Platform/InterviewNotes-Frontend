import { CatalogBody } from "@/components/catalog/CatalogBody";
import { CurriculumNavigation } from "@/components/catalog/ItemNavigation";
import { RelationGroup } from "@/components/catalog/LessonRelated";
import { ProblemHeader } from "@/components/catalog/ProblemHeader";
import { ProblemPreparation } from "@/components/catalog/ProblemPreparation";
import { ProblemStages } from "@/components/catalog/ProblemStages";
import { AlternateTracks } from "@/components/catalog/TrackContext";
import { TrackDrawer } from "@/components/curriculum/TrackDrawer";
import { TrackSidebar } from "@/components/curriculum/TrackSidebar";
import { PageContainer } from "@/components/layout/PageContainer";
import { ProblemOutline } from "@/components/problem/ProblemOutline";
import { RevealProvider } from "@/components/problem/RevealProvider";
import type { ItemNavigation } from "@/lib/catalog/navigation";
import { WITHHELD_NOTE } from "@/lib/catalog/positionCopy";
import { outlineOf } from "@/lib/catalog/outline";
import { problemRelations } from "@/lib/catalog/problem";
import { composeProblem } from "@/lib/catalog/problemSpine";
import type { CatalogItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { WithheldNote } from "./ItemContent";

/**
 * A readable Problem, challenge-first: where it sits, what it is, what to prepare, one note if sections were withheld, the
 * Interview stages and Review surfaces with every reveal closed, then what it connects to. Nothing is fetched here, so a
 * locked Problem (which never reaches this page) loads no body, Track or relations. From `lg` a Problem with a home Track also
 * shows that Track's contents beside the column (A-5), and below it they open in a drawer; the challenge-first order is unchanged.
 */
export function ProblemPage({ item, navigation, stayOnDeployment }: { item: CatalogItem; navigation: ItemNavigation | null; stayOnDeployment: boolean }) {
   const composition = composeProblem(item);
   const { interview, review, neutral } = composition;
   const phases = [...interview, ...review, ...(neutral ? [neutral] : [])];
   const related = navigation ? problemRelations(navigation.relations, item.id) : null;
   // Show everything is wanted wherever a reveal exists (S-RVL-6), and it lives with the outline; the outline's links wait for two phases.
   const outline = phases.some(({ kind, groups }) => kind !== "interview_stage" || groups.some(({ role }) => role !== "challenge"));
   // The outline the page already read, as the sidebar's groups (S6-RDR-2); none means today's layout (S6-RDR-1).
   const track = navigation?.home ? outlineOf(navigation.home.track, navigation.id) : null;
   const side = track !== null;
   const entry = ({ id, label }: { id: string; label: string }) => ({ id, label });

   return (
      <PageContainer as="main" className="py-12 md:py-16">
         <RevealProvider>
            <div
               className={cn(
                  side
                     ? cn(
                          "lg:grid lg:justify-center lg:gap-x-10 lg:grid-cols-[16rem_minmax(0,var(--container-reading))]",
                          outline && "xl:grid-cols-[16rem_minmax(0,var(--container-reading))_12rem]"
                       )
                     : outline
                       ? "lg:grid lg:grid-cols-[minmax(0,var(--container-reading))_12rem] lg:justify-center lg:gap-x-10 xl:grid-cols-[minmax(0,var(--container-reading))_15rem] xl:gap-x-16"
                       : "mx-auto w-full max-w-reading"
               )}
            >
               <div className={cn("mb-10 min-w-0 lg:mb-12 lg:row-start-1", side ? "lg:col-start-2" : "lg:col-start-1")}>
                  <ProblemHeader
                     meta={item}
                     placement={navigation?.home}
                     contents={track ? <TrackDrawer outline={track} className="mb-6" /> : undefined}
                  />
                  {related ? <ProblemPreparation groups={related.preparation} /> : null}
               </div>
               {outline ? (
                  <ProblemOutline
                     interview={interview.map(entry)}
                     review={review.map(entry)}
                     neutral={neutral ? entry(neutral) : null}
                     beside={side}
                     className={side ? "lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-span-2 xl:row-start-1" : "lg:col-start-2 lg:row-span-2 lg:row-start-1"}
                  />
               ) : null}
               {/* After the orientation block and the Problem's own outline and before the body, so Tab meets them in that order. */}
               {track ? (
                  <div className="hidden lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:block">
                     <TrackSidebar outline={track} className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto pr-1" />
                  </div>
               ) : null}
               <div
                  className={cn(
                     "min-w-0",
                     side ? (outline ? "lg:col-start-2 lg:row-start-3 xl:row-start-2" : "lg:col-start-2 lg:row-start-2") : "lg:col-start-1 lg:row-start-2"
                  )}
               >
                  {item.body ? <CatalogBody body={item.body} stayOnDeployment={stayOnDeployment} /> : null}
                  {item.sections_withheld ? <WithheldNote>{WITHHELD_NOTE}</WithheldNote> : null}
                  <ProblemStages composition={composition} stayOnDeployment={stayOnDeployment} />
                  {related ? (
                     <div className="mt-16 space-y-12 empty:hidden">
                        <RelationGroup id="problem_related_knowledge" label="Related Knowledge" rows={related.knowledge} withSummary />
                        <RelationGroup id="problem_related_problems" label="Related Problems" rows={related.problems} />
                        <RelationGroup id="problem_related_lessons" label="Related Lessons" rows={related.lessons} withSummary />
                     </div>
                  ) : null}
                  {navigation ? (
                     <div className="mt-16 space-y-12 border-t border-border pt-10 empty:hidden">
                        <CurriculumNavigation navigation={navigation} reading outlineClassName={side ? "lg:hidden" : undefined} />
                        <AlternateTracks placements={navigation.alternates} />
                     </div>
                  ) : null}
               </div>
            </div>
         </RevealProvider>
      </PageContainer>
   );
}
