import { CatalogBody } from "@/components/catalog/CatalogBody";
import { KnowledgeBands } from "@/components/catalog/KnowledgeBands";
import { KnowledgeBreadcrumb } from "@/components/catalog/KnowledgeHeader";
import { RelationGroup } from "@/components/catalog/LessonRelated";
import { KnowledgeOpening } from "@/components/knowledge/KnowledgeOpening";
import { KnowledgeReader, type Depth, type DepthBand } from "@/components/knowledge/KnowledgeReader";
import "@/components/knowledge/knowledge-reader.css";
import { PageContainer } from "@/components/layout/PageContainer";
import { LessonFolio } from "@/components/lesson/LessonFolio";
import { LessonReaderFrame } from "@/components/lesson/LessonReaderFrame";
import "@/components/lesson/lesson-reader.css";
import { KNOWLEDGE_SCRATCH_KEY, KNOWLEDGE_SCRATCH_OPEN_KEY } from "@/components/lesson/pins";
import { bandsOf, knowledgeRelations, readingBands, sectionHeading } from "@/lib/catalog/knowledge";
import type { ItemNavigation } from "@/lib/catalog/navigation";
import type { CatalogItem, CatalogSection } from "@/lib/catalog/types";
import { WithheldNote } from "./ItemContent";

/** The released sections that have a heading, in reading order: what the outline lists and Now reading names. */
function headed(sections: readonly CatalogSection[]): { id: string; text: string }[] {
   return sections.flatMap((section) => {
      const text = sectionHeading(section);
      return text ? [{ id: section.id, text }] : [];
   });
}

/** The entry's study tools for the reader shell's `tools` slot (P8-T28): Now reading by section, Pins, and its own Scratch. */
export function knowledgeTools(item: CatalogItem) {
   const entries = headed(bandsOf(item.sections).flatMap(({ sections }) => sections)).map((entry) => ({ ...entry, level: 2 as const }));
   return <LessonFolio entries={entries} scratch={{ text: KNOWLEDGE_SCRATCH_KEY, open: KNOWLEDGE_SCRATCH_OPEN_KEY }} />;
}

/**
 * A readable Knowledge entry in the D × F v3 editorial reader (P8-T28), in the order a reader needs it: the title page, the
 * "In this entry" contents with Read at depth, the three canonical bands (fast understanding, explanation, deeper reference), then
 * what it connects to. Everything is the item the API released and its relations; nothing is fetched here, so a locked entry
 * (which never reaches this page) loads no body, no outline and no relations.
 */
export function KnowledgePage({ item, navigation, stayOnDeployment }: { item: CatalogItem; navigation: ItemNavigation | null; stayOnDeployment: boolean }) {
   const all = readingBands(item.sections);
   const bands = all.filter(({ sections }) => sections.length > 0);
   const related = navigation ? knowledgeRelations(navigation.relations, item.id) : null;
   // One band needs no contents or depth; with two or more, all three are offered and an empty one says so.
   const depthBands: DepthBand[] | null =
      bands.length >= 2 ? all.map(({ id, label, rank, sections }) => ({ id, label, rank: rank as Depth, sections: headed(sections) })) : null;
   const body = (
      <>
         {item.body ? <CatalogBody body={item.body} stayOnDeployment={stayOnDeployment} /> : null}
         <KnowledgeBands bands={bands} stayOnDeployment={stayOnDeployment} />
      </>
   );

   return (
      <PageContainer as="main" className="py-12 md:py-16">
         <LessonReaderFrame chapters={bands.length}>
            <div data-knowledge-reader="">
               <div className="mb-10 min-w-0 lg:mb-12">
                  <div className="lesson-orientation">
                     <KnowledgeBreadcrumb meta={item} />
                  </div>
                  <KnowledgeOpening item={item} />
               </div>
               {depthBands ? <KnowledgeReader bands={depthBands}>{body}</KnowledgeReader> : body}
               {item.sections_withheld ? <WithheldNote /> : null}
               {related ? (
                  <div className="mt-16 space-y-12 border-t border-border pt-10 empty:hidden">
                     <RelationGroup id="knowledge_related_lessons" label="Related Lessons" rows={related.lessons} withSummary />
                     <RelationGroup id="knowledge_related_problems" label="Related Problems" rows={related.problems} />
                     <RelationGroup id="knowledge_related_knowledge" label="Related Knowledge" rows={related.knowledge} withSummary />
                  </div>
               ) : null}
            </div>
         </LessonReaderFrame>
      </PageContainer>
   );
}
