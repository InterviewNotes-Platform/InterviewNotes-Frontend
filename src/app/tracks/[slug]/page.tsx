import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogStateNotice } from "@/app/_catalog/CatalogStateNotice";
import { PreviewMarker, withPreviewRobots } from "@/app/_catalog/PreviewMarker";
import { TrackCurriculum, TrackHeader, TrackSupport } from "@/components/catalog/TrackCurriculum";
import { PageContainer, ReadingColumn } from "@/components/layout/PageContainer";
import { ReaderShell } from "@/components/reader/ReaderShell";
import { getCatalogTrack } from "@/lib/catalog/client";
import { outlineOf } from "@/lib/catalog/outline";
import { loadLessonSummaries } from "@/lib/catalog/summaries";
import { prepApiUrl, prepEnabled } from "@/lib/prep-flag";
import { curriculumOf } from "@/lib/catalog/track";
import type { CatalogTrack } from "@/lib/catalog/types";
import { TRACKS_INDEX_HREF } from "@/lib/primary-navigation";

interface PageProps {
   params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
   const result = await getCatalogTrack((await params).slug);
   if (result.status !== "ok") return withPreviewRobots({});
   return withPreviewRobots({ title: result.data.title, description: result.data.summary });
}

// Proposition, then the one Start action (or the level choice), then the curriculum, then context read from the same outline.
function TrackBody({ track, summaries }: { track: CatalogTrack; summaries: ReadonlyMap<string, string> | null }) {
   const curriculum = curriculumOf(track);
   return (
      <>
         <nav aria-label="Breadcrumb" className="mb-8 text-supporting">
            <ol role="list" className="m-0 flex list-none flex-wrap items-center gap-x-2 p-0 text-muted-foreground">
               <li>
                  <Link href={TRACKS_INDEX_HREF} prefetch={false} className="font-medium text-[var(--primary-text)] underline-offset-4 hover:underline">
                     Tracks
                  </Link>
               </li>
               <li aria-hidden="true">/</li>
               <li className="min-w-0 wrap-anywhere">
                  {track.title}
               </li>
            </ol>
         </nav>
         <TrackHeader track={track} curriculum={curriculum} summaries={summaries} />
         <div className="mt-12 md:mt-16">
            <TrackCurriculum
               track={track}
               curriculum={curriculum}
               summaries={summaries}
               itemState={prepEnabled() ? { apiUrl: prepApiUrl() } : undefined}
            />
         </div>
         <TrackSupport curriculum={curriculum} />
      </>
   );
}

// Tracks are public and never gated, so unlike item pages this route sends no session.
export default async function TrackPage({ params }: PageProps) {
   const result = await getCatalogTrack((await params).slug);
   if (result.status === "notFound") notFound();
   // Lesson summaries are one bounded list scan, and only when the outline has a Lesson to describe.
   const summaries =
      result.status === "ok" && curriculumOf(result.data).counts.lesson ? await loadLessonSummaries(result.data.slug) : null;

   // The Track is public, so the shell is "readable"; its rail shows this Track's outline with no current item (P8-T26 contract).
   const outline = result.status === "ok" ? outlineOf(result.data, "") : null;
   return (
      <>
         <PreviewMarker />
         <ReaderShell access="readable" surface="desk" outline={outline}>
            <PageContainer as="main" className="py-6 md:py-10">
               <div className="-mx-4 max-w-[60rem] border-y border-border bg-[var(--reader-paper)] px-4 py-10 md:mx-auto md:rounded-xl md:border md:px-12 md:py-14">
                  <ReadingColumn>
                     {result.status === "ok" ? <TrackBody track={result.data} summaries={summaries} /> : <CatalogStateNotice state={result.status} />}
                  </ReadingColumn>
               </div>
            </PageContainer>
         </ReaderShell>
      </>
   );
}
