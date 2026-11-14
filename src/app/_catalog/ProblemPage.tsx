import { CatalogBody } from "@/components/catalog/CatalogBody";
import { CurriculumNavigation } from "@/components/catalog/ItemNavigation";
import { RelationGroup } from "@/components/catalog/LessonRelated";
import { ProblemHeader } from "@/components/catalog/ProblemHeader";
import { ProblemPreparation } from "@/components/catalog/ProblemPreparation";
import { ProblemChallenge, ProblemStages } from "@/components/catalog/ProblemStages";
import { AlternateTracks } from "@/components/catalog/TrackContext";
import { PageContainer } from "@/components/layout/PageContainer";
import { ProblemSplit } from "@/components/problem/ProblemSplit";
import { ReaderControls } from "@/components/prepare/reader/ReaderControls";
import { RevealProvider } from "@/components/problem/RevealProvider";
import type { ItemNavigation } from "@/lib/catalog/navigation";
import { WITHHELD_NOTE } from "@/lib/catalog/positionCopy";
import { problemRelations } from "@/lib/catalog/problem";
import { composeProblem } from "@/lib/catalog/problemSpine";
import type { CatalogItem } from "@/lib/catalog/types";
import { prepApiUrl, prepEnabled } from "@/lib/prep-flag";
import { WithheldNote } from "./ItemContent";

/**
 * A readable Problem in the split reader (P8-T29, D × F v3 §4.6), challenge-first: the context column holds what it is, the
 * challenge and what to prepare; the work column holds one note if sections were withheld, then one stage at a time with every
 * reveal closed, then what it connects to. Nothing is fetched here, so a locked Problem (which never reaches this page) loads
 * no body, Track or relations. The home Track's contents (A-5) are the reader shell's rail, sidebar and Track sheet (P8-T26).
 */
export function ProblemPage({ item, navigation, stayOnDeployment }: { item: CatalogItem; navigation: ItemNavigation | null; stayOnDeployment: boolean }) {
   const composition = composeProblem(item);
   const { interview, review, neutral } = composition;
   const phases = [...interview, ...review, ...(neutral ? [neutral] : [])];
   const related = navigation ? problemRelations(navigation.relations, item.id) : null;

   // Show everything is wanted wherever a reveal exists (S-RVL-6); a lone challenge has none.
   const reveals = phases.some(({ kind, groups }) => kind !== "interview_stage" || groups.some(({ role }) => role !== "challenge"));
   const stages = phases.map(({ id, label, step }) => ({
      id,
      label,
      step: step?.position ?? null,
   }));

   return (
      <PageContainer as="main" className="py-10 md:py-14">
         <RevealProvider>
            <ProblemSplit
               stages={stages}
               everything={reveals}
               context={
                  <>
                     <ProblemHeader meta={item} placement={navigation?.home} />
                     {prepEnabled() ? <ReaderControls key={item.id} contentId={item.id} apiUrl={prepApiUrl()} /> : null}
                     <ProblemChallenge composition={composition} stayOnDeployment={stayOnDeployment} />
                     {item.body ? <CatalogBody body={item.body} stayOnDeployment={stayOnDeployment} /> : null}
                     {related ? <ProblemPreparation groups={related.preparation} /> : null}
                  </>
               }
               before={item.sections_withheld ? <WithheldNote>{WITHHELD_NOTE}</WithheldNote> : null}
            >
               <ProblemStages composition={composition} stayOnDeployment={stayOnDeployment} challengeApart />
               {related ? (
                  <div className="mt-16 space-y-12 empty:hidden">
                     <RelationGroup id="problem_related_knowledge" label="Related Knowledge" rows={related.knowledge} withSummary />
                     <RelationGroup id="problem_related_problems" label="Related Problems" rows={related.problems} />
                     <RelationGroup id="problem_related_lessons" label="Related Lessons" rows={related.lessons} withSummary />
                  </div>
               ) : null}
               {navigation ? (
                  <div className="mt-16 space-y-12 border-t border-border pt-10 empty:hidden">
                     <CurriculumNavigation navigation={navigation} reading outlineClassName={navigation.home ? "md:hidden" : undefined} />
                     <AlternateTracks placements={navigation.alternates} />
                  </div>
               ) : null}
            </ProblemSplit>
         </RevealProvider>
      </PageContainer>
   );
}
