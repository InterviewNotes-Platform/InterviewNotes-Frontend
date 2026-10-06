import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogStateNotice } from "@/app/_catalog/CatalogStateNotice";
import { PreviewMarker, withPreviewRobots } from "@/app/_catalog/PreviewMarker";
import { TrackCurriculum, TrackHeader, TrackSupport } from "@/components/catalog/TrackCurriculum";
import { PageContainer, ReadingColumn } from "@/components/layout/PageContainer";
import { getCatalogTrack } from "@/lib/catalog/client";
import { curriculumOf } from "@/lib/catalog/track";
import type { CatalogTrack } from "@/lib/catalog/types";

interface PageProps {
   params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
   const result = await getCatalogTrack((await params).slug);
   if (result.status !== "ok") return withPreviewRobots({});
   return withPreviewRobots({ title: result.data.title, description: result.data.summary });
}

// Proposition, then the one Start action, then the curriculum, then context read from the same outline.
function TrackBody({ track }: { track: CatalogTrack }) {
   const curriculum = curriculumOf(track);
   return (
      <>
         <TrackHeader track={track} curriculum={curriculum} />
         <div className="mt-12 md:mt-16">
            <TrackCurriculum track={track} curriculum={curriculum} />
         </div>
         <TrackSupport curriculum={curriculum} />
      </>
   );
}

// Tracks are public and never gated, so unlike item pages this route sends no session.
export default async function TrackPage({ params }: PageProps) {
   const result = await getCatalogTrack((await params).slug);
   if (result.status === "notFound") notFound();

   return (
      <>
         <PreviewMarker />
         <PageContainer as="main" className="py-12 md:py-16">
            <ReadingColumn>
               {result.status === "ok" ? <TrackBody track={result.data} /> : <CatalogStateNotice state={result.status} />}
            </ReadingColumn>
         </PageContainer>
      </>
   );
}
