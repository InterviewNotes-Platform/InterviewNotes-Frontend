import { CatalogBody } from "@/components/catalog/CatalogBody";
import { CurriculumNavigation } from "@/components/catalog/ItemNavigation";
import { RelationGroup } from "@/components/catalog/LessonRelated";
import { ProblemHeader } from "@/components/catalog/ProblemHeader";
import { ProblemPreparation } from "@/components/catalog/ProblemPreparation";
import { ProblemStages } from "@/components/catalog/ProblemStages";
import { AlternateTracks } from "@/components/catalog/TrackContext";
import { PageContainer } from "@/components/layout/PageContainer";
import { ProblemOutline } from "@/components/problem/ProblemOutline";
import { RevealProvider } from "@/components/problem/RevealProvider";
import type { ItemNavigation } from "@/lib/catalog/navigation";
import { WITHHELD_NOTE } from "@/lib/catalog/positionCopy";
import { problemRelations } from "@/lib/catalog/problem";
import { composeProblem } from "@/lib/catalog/problemSpine";
import type { CatalogItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { WithheldNote } from "./ItemContent";

/**
 * A readable Problem, challenge-first: where it sits, what it is, what to prepare, one note if sections were withheld, the
 * Interview stages and Review surfaces with every reveal closed, then what it connects to. Nothing is fetched here, so a
 * locked Problem (which never reaches this page) loads no body, Track or relations.
 */
export function ProblemPage({ item, navigation, stayOnDeployment }: { item: CatalogItem; navigation: ItemNavigation | null; stayOnDeployment: boolean }) {
   const composition = composeProblem(item);
   const { interview, review, neutral } = composition;
   const phases = [...interview, ...review, ...(neutral ? [neutral] : [])];
   const related = navigation ? problemRelations(navigation.relations, item.id) : null;
   // Show everything is wanted wherever a reveal exists (S-RVL-6), and it lives with the outline; the outline's links wait for two phases.
   const outline = phases.some(({ kind, groups }) => kind !== "interview_stage" || groups.some(({ role }) => role !== "challenge"));
   const entry = ({ id, label }: { id: string; label: string }) => ({ id, label });

   return (
      <PageContainer as="main" className="py-12 md:py-16">
         <RevealProvider>
            <div
               className={cn(
                  outline
                     ? "lg:grid lg:grid-cols-[minmax(0,var(--container-reading))_12rem] lg:justify-center lg:gap-x-10 xl:grid-cols-[minmax(0,var(--container-reading))_15rem] xl:gap-x-16"
                     : "mx-auto w-full max-w-reading"
               )}
            >
               <div className="mb-10 min-w-0 lg:col-start-1 lg:row-start-1 lg:mb-12">
                  <ProblemHeader meta={item} placement={navigation?.home} />
                  {related ? <ProblemPreparation groups={related.preparation} /> : null}
               </div>
               {outline ? (
                  <ProblemOutline
                     interview={interview.map(entry)}
                     review={review.map(entry)}
                     neutral={neutral ? entry(neutral) : null}
                     className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
                  />
               ) : null}
               <div className="min-w-0 lg:col-start-1 lg:row-start-2">
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
                        <CurriculumNavigation navigation={navigation} reading />
                        <AlternateTracks placements={navigation.alternates} />
                     </div>
                  ) : null}
               </div>
            </div>
         </RevealProvider>
      </PageContainer>
   );
}
