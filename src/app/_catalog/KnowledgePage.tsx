import { CatalogBody } from "@/components/catalog/CatalogBody";
import { KnowledgeBands } from "@/components/catalog/KnowledgeBands";
import { KnowledgeHeader } from "@/components/catalog/KnowledgeHeader";
import { RelationGroup } from "@/components/catalog/LessonRelated";
import { PageContainer } from "@/components/layout/PageContainer";
import { LessonContents } from "@/components/lesson/LessonContents";
import { bandsOf, knowledgeRelations } from "@/lib/catalog/knowledge";
import type { ItemNavigation } from "@/lib/catalog/navigation";
import type { CatalogItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { WithheldNote } from "./ItemContent";

/**
 * A readable Knowledge topic, in the order a reader needs it: what it is, the fast version, the explanation, the deeper
 * reference, then what it connects to. Everything is the item the API released and its relations; nothing is fetched
 * here, so a locked topic (which never reaches this page) loads no body and no relations.
 */
export function KnowledgePage({ item, navigation, stayOnDeployment }: { item: CatalogItem; navigation: ItemNavigation | null; stayOnDeployment: boolean }) {
   const bands = bandsOf(item.sections);
   const related = navigation ? knowledgeRelations(navigation.relations, item.id) : null;
   // One band needs no contents; with two or more the reader can jump straight to the reference.
   const contents = bands.length >= 2 ? bands.map(({ id, label }) => ({ id, level: 2 as const, text: label })) : [];

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
               <KnowledgeHeader meta={item} />
            </div>
            {contents.length > 0 ? <LessonContents entries={contents} trackScroll={false} className="lg:col-start-2 lg:row-span-2 lg:row-start-1" /> : null}
            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
               {item.body ? <CatalogBody body={item.body} stayOnDeployment={stayOnDeployment} /> : null}
               <KnowledgeBands bands={bands} stayOnDeployment={stayOnDeployment} />
               {item.sections_withheld ? <WithheldNote /> : null}
               {related ? (
                  <div className="mt-16 space-y-12 border-t border-border pt-10 empty:hidden">
                     <RelationGroup id="knowledge_related_lessons" label="Related Lessons" rows={related.lessons} withSummary />
                     <RelationGroup id="knowledge_related_problems" label="Related Problems" rows={related.problems} />
                     <RelationGroup id="knowledge_related_knowledge" label="Related Knowledge" rows={related.knowledge} withSummary />
                  </div>
               ) : null}
            </div>
         </div>
      </PageContainer>
   );
}
