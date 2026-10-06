import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogStateNotice } from "@/app/_catalog/CatalogStateNotice";
import { PreviewMarker, withPreviewRobots } from "@/app/_catalog/PreviewMarker";
import { PracticeFilters } from "@/components/catalog/PracticeFilters";
import { NoProblems, ProblemCard, ProblemCount, ProblemPager } from "@/components/catalog/ProblemResults";
import { PageContainer } from "@/components/layout/PageContainer";
import { listCatalogTracks } from "@/lib/catalog/client";
import { activeFilterCount, parsePracticeQuery, withKnownTrack } from "@/lib/catalog/practice";
import { loadProblemTopics, loadProblems } from "@/lib/catalog/problems";
import { linkableEntries } from "@/lib/catalog/routes";
import { PRIMARY_NAV, type NavArea } from "@/lib/primary-navigation";

// The Problem list comes from the catalog at request time and is never built or cached statically.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
   return withPreviewRobots({
      title: "Practice | InterviewNotes",
      description: "Interview-style Problems for ML and system design, filterable by topic, difficulty, level, Track and access.",
   });
}

interface PageProps {
   searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const LINK = "text-primary underline underline-offset-4";
const hrefOf = (area: NavArea) => PRIMARY_NAV.find((item) => item.area === area)!.href;

// Problem metadata is public and never gated, so this route sends no session. Each render reads the Track list, the capped
// Topic scan and one page of Problems: three kinds of list read, never an item.
export default async function PracticePage({ searchParams }: PageProps) {
   const requested = parsePracticeQuery(await searchParams);
   const [tracks, topics] = await Promise.all([listCatalogTracks(), loadProblemTopics()]);
   // A Track the catalog does not list is dropped before any request, so it can never reach the API.
   const query = withKnownTrack(requested, tracks.status === "ok" ? tracks.data.tracks.map(({ slug }) => slug) : []);
   const problems = await loadProblems(query);
   if ([tracks, topics, problems].some(({ status }) => status === "notFound")) notFound();

   const filters = activeFilterCount(query);
   const cards = problems.status === "ok" ? linkableEntries(problems.data.items) : [];
   // An empty first page with no filter means nothing is published at all: there is nothing to filter yet.
   const emptyCatalog = problems.status === "ok" && cards.length === 0 && filters === 0 && query.cursor === null;

   return (
      <>
         <PreviewMarker />
         <PageContainer as="main" className="py-12 md:py-20">
            <header className="max-w-2xl">
               <h1 className="m-0 text-title text-balance">Practice, one Problem at a time.</h1>
               <p className="mt-4 mb-0 text-body text-pretty text-muted-foreground">
                  Interview-style Problems for ML and system design, for rehearsing the reasoning an interview asks for. Work each one the way you would in
                  the room: clarify the requirements, sketch a design, then defend the trade-offs.
               </p>
               <p className="mt-4 mb-0 text-supporting text-pretty text-muted-foreground">
                  Want the ground first? Build it in{" "}
                  <Link href={hrefOf("learn")} prefetch={false} className={LINK}>
                     Tracks
                  </Link>
                  , or look up a concept in{" "}
                  <Link href={hrefOf("knowledge")} prefetch={false} className={LINK}>
                     Knowledge
                  </Link>
                  . Problems point back to both.
               </p>
            </header>
            <section aria-labelledby="problems-heading" className="mt-12 md:mt-16">
               <h2 id="problems-heading" className="m-0 mb-6 text-section">
                  Problems
               </h2>
               {tracks.status !== "ok" || topics.status !== "ok" || problems.status !== "ok" ? (
                  <CatalogStateNotice state="unavailable" />
               ) : emptyCatalog ? (
                  <NoProblems query={query} filtered={false} />
               ) : (
                  <>
                     <PracticeFilters query={query} topics={topics.data} tracks={tracks.data.tracks} />
                     <div className="mt-8">
                        {cards.length === 0 ? (
                           <NoProblems query={query} filtered={filters > 0} />
                        ) : (
                           <>
                              <ProblemCount count={cards.length} />
                              <ul role="list" className="m-0 mt-4 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                                 {cards.map(({ entry, href }) => (
                                    <li key={entry.id}>
                                       <ProblemCard problem={entry} href={href} />
                                    </li>
                                 ))}
                              </ul>
                           </>
                        )}
                     </div>
                     <ProblemPager query={query} next={problems.data.next_cursor} />
                  </>
               )}
            </section>
         </PageContainer>
      </>
   );
}
