import { headingIds, parseBlocks } from "@/components/catalog/blocks";
import { knowledgeCoverage } from "@/components/catalog/knowledgeRefs";
import { FullOutline } from "@/components/catalog/ItemNavigation";
import { CurriculumBlock, EndOfTrack, NextLesson, OtherLevels, PreviousInTrack } from "@/components/catalog/LessonClose";
import type { ReadingMode } from "@/components/catalog/CatalogBody";
import { BuildsOn, PracticeTransition, RelationGroup } from "@/components/catalog/LessonRelated";
import { AlternateTracks, LessonBreadcrumb } from "@/components/catalog/TrackContext";
import { LessonFolio } from "@/components/lesson/LessonFolio";
import { countExhibits, LessonOpening } from "@/components/lesson/LessonOpening";
import { LessonOutline, type Neighbour } from "@/components/lesson/LessonOutline";
import { LessonReaderFrame } from "@/components/lesson/LessonReaderFrame";
import "@/components/lesson/lesson-reader.css";
import { PageContainer } from "@/components/layout/PageContainer";
import { ReaderControls } from "@/components/prepare/reader/ReaderControls";
import { lessonPosition } from "@/lib/catalog/curriculum";
import { isLevelChoiceTrack, levelsOf } from "@/lib/catalog/levelChoice";
import { contentsOf, knowledgeSupport, lessonRelations, type ContentsEntry } from "@/lib/catalog/lesson";
import type { ItemNavigation } from "@/lib/catalog/navigation";
import { catalogEntryHref } from "@/lib/catalog/routes";
import type { CatalogItem, CatalogOutlineEntry } from "@/lib/catalog/types";
import { collectionOfContent } from "@/lib/prep/collections";
import { questionsOf } from "@/lib/prep/questions";
import { prepApiUrl, prepEnabled } from "@/lib/prep-flag";
import { ItemContent } from "./ItemContent";

/** The question sections of a collection Lesson that offer "Prepare your answer": the registry and the question source decide which, flag off offers none. */
function prepareLinks(item: CatalogItem): ReadingMode["prepare"] {
   if (!prepEnabled()) return undefined;
   const collection = collectionOfContent(item.id);
   const lesson = collection?.lessons.find(({ content_id }) => content_id === item.id);
   const questionIds = collection && lesson ? new Set(questionsOf(lesson, item, collection.grouped).map(({ question_id }) => question_id)) : null;
   return questionIds?.size ? { contentId: item.id, questionIds, questionTag: collection?.grouped ? "h3" : "h2" } : undefined;
}

/** Contents link to heading ids, so they exist only while the rendered headings carry the API's ids. */
function lessonContents(item: CatalogItem): { blocks: ReturnType<typeof parseBlocks> | null; contents: ContentsEntry[] } {
   const { body, headings } = item;
   const blocks = body?.format === "markdown@1" ? parseBlocks(body.text) : null;
   const anchored = blocks !== null && headingIds(blocks, headings) !== null;
   return { blocks, contents: anchored ? contentsOf(headings) : [] };
}

/** The Lesson's study tools for the reader shell's `tools` slot (P8-T27): readable Lessons only, as the shell mounts them. */
export function lessonTools(item: CatalogItem) {
   return <LessonFolio entries={lessonContents(item).contents} />;
}

function neighbour(entry: CatalogOutlineEntry | null): Neighbour | null {
   const href = entry && catalogEntryHref(entry);
   return entry && href ? { href, title: entry.title, premium: entry.access === "premium" } : null;
}

/**
 * A readable Lesson in the D × F v3 editorial reader (P8-T27): where it sits, the title page, what it builds on, the full
 * contents that dock into a section bar, the body with its exhibits, then the close (Next lesson or End of Track, Knowledge,
 * Practice, Problems, Back to module) and secondary context. A level-choice Track (A-9) closes with its other levels instead of
 * Next, Previous and End of Track. The home Track's contents (A-5) are the reader shell's. Everything comes from the item the
 * API released and its relations; nothing is fetched here. Rendered only for `access="readable"`, so no Track context, contents
 * or neighbours ever reach a locked page (S-LSN-18).
 */
export function LessonPage({ item, navigation, stayOnDeployment }: { item: CatalogItem; navigation: ItemNavigation | null; stayOnDeployment: boolean }) {
   const home = navigation?.home ?? null;
   const levels = home && isLevelChoiceTrack(home.track) ? levelsOf(home.track) : null;
   // Another level is offered once, in Other levels; a Next Lesson is offered once, in the close.
   const offeredLessons = levels ? levels.map(({ id }) => id) : home?.nextLesson ? [home.nextLesson.id] : [];
   const related = navigation ? lessonRelations(navigation.relations, [...offeredLessons, ...navigation.practice.map(({ id }) => id)]) : null;
   const { blocks, contents } = lessonContents(item);
   // The summaries the body offers in context are not repeated in Related Knowledge (S-KNW-6).
   const support = navigation ? knowledgeSupport(navigation.relations) : undefined;
   const offered = new Set(blocks && support ? knowledgeCoverage(blocks, support).offered : []);
   const position = home && navigation ? lessonPosition(home.track, navigation.id) : null;
   const kicker = ["Lesson", position && !levels ? `Module ${position.module.index}` : null, home?.track.title].filter(Boolean).join(" · ");
   const counts = { chapters: contents.filter(({ level }) => level === 2).length, ...countExhibits(item.body?.format === "markdown@1" ? item.body.text : "") };
   const adjacent = home && !levels ? { previous: neighbour(home.previousLesson), next: neighbour(home.nextLesson) } : { previous: null, next: null };

   return (
      <PageContainer as="main" className="py-12 md:py-16">
         <LessonReaderFrame chapters={counts.chapters}>
            <div className="mb-10 min-w-0 lg:mb-12">
               {navigation && home ? (
                  <div className="lesson-orientation">
                     <LessonBreadcrumb placement={home} position={position} levels={levels?.length} />
                  </div>
               ) : null}
               <LessonOpening meta={item} kicker={kicker} counts={counts} />
               {prepEnabled() ? <ReaderControls key={item.id} contentId={item.id} apiUrl={prepApiUrl()} /> : null}
               {related ? <BuildsOn rows={related.prerequisites} /> : null}
            </div>
            {contents.length > 0 ? <LessonOutline entries={contents} previous={adjacent.previous} next={adjacent.next} /> : null}
            <div className="min-w-0">
               <ItemContent item={item} stayOnDeployment={stayOnDeployment} reading={{ headings: item.headings, knowledge: support, prepare: prepareLinks(item), exhibits: true }} />
               {navigation && related ? (
                  <div className="lesson-close mt-16 space-y-12 empty:hidden">
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
                     {home ? <CurriculumBlock placement={{ ...home, previousLesson: null }} position={position} /> : null}
                     {home && !levels ? <PreviousInTrack placement={home} /> : null}
                  </div>
               ) : null}
               {navigation && related ? (
                  <div className="mt-16 space-y-12 empty:hidden">
                     <RelationGroup id="lesson_related_lessons" label="Related Lessons" rows={related.lessons} withSummary />
                     <FullOutline
                        navigation={navigation}
                        reading
                        currentLabel={levels ? "Current level" : undefined}
                        className={home ? "md:hidden" : undefined}
                     />
                     <AlternateTracks placements={navigation.alternates} />
                  </div>
               ) : null}
            </div>
         </LessonReaderFrame>
      </PageContainer>
   );
}
