import { CatalogBody } from "@/components/catalog/CatalogBody";
import { CurriculumNavigation } from "@/components/catalog/ItemNavigation";
import { RelationGroup } from "@/components/catalog/LessonRelated";
import { ProblemHeader } from "@/components/catalog/ProblemHeader";
import { ProblemPhases } from "@/components/catalog/ProblemPhases";
import { ProblemPreparation } from "@/components/catalog/ProblemPreparation";
import { AlternateTracks } from "@/components/catalog/TrackContext";
import { PageContainer } from "@/components/layout/PageContainer";
import { LessonContents } from "@/components/lesson/LessonContents";
import type { ItemNavigation } from "@/lib/catalog/navigation";
import { phasesOf, problemRelations } from "@/lib/catalog/problem";
import type { CatalogItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { WithheldNote } from "./ItemContent";

/**
 * A readable Problem as a reasoning sequence: where it sits, what it is, what to prepare, the phases, one note if the API
 * withheld sections, then what it connects to. Everything is the item the API released and its relations; nothing is
 * fetched here, so a locked Problem (which never reaches this page) loads no body, Track or relations.
 */
export function ProblemPage({ item, navigation, stayOnDeployment }: { item: CatalogItem; navigation: ItemNavigation | null; stayOnDeployment: boolean }) {
   const phases = phasesOf(item.sections);
   const related = navigation ? problemRelations(navigation.relations, item.id) : null;
   // One phase needs no navigation; with two or more the reader can jump between them.
   const entries = phases.length >= 2 ? phases.map(({ id, label }) => ({ id, level: 2 as const, text: label })) : [];

   return (
      <PageContainer as="main" className="py-12 md:py-16">
         <div
            className={cn(
               entries.length > 0
                  ? "lg:grid lg:grid-cols-[minmax(0,var(--container-reading))_12rem] lg:justify-center lg:gap-x-10 xl:grid-cols-[minmax(0,var(--container-reading))_15rem] xl:gap-x-16"
                  : "mx-auto w-full max-w-reading"
            )}
         >
            <div className="mb-10 min-w-0 lg:col-start-1 lg:row-start-1 lg:mb-12">
               <ProblemHeader meta={item} placement={navigation?.home} />
               {related ? <ProblemPreparation groups={related.preparation} /> : null}
            </div>
            {entries.length > 0 ? <LessonContents entries={entries} label="Phases" className="lg:col-start-2 lg:row-span-2 lg:row-start-1" /> : null}
            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
               {item.body ? <CatalogBody body={item.body} stayOnDeployment={stayOnDeployment} /> : null}
               <ProblemPhases phases={phases} stayOnDeployment={stayOnDeployment} />
               {item.sections_withheld ? (
                  <WithheldNote>The full library includes more material for this Problem than your current access covers.</WithheldNote>
               ) : null}
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
      </PageContainer>
   );
}
