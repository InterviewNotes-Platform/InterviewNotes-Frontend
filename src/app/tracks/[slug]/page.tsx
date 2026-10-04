import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogStateNotice } from "@/app/_catalog/CatalogStateNotice";
import { PreviewMarker, withPreviewRobots } from "@/app/_catalog/PreviewMarker";
import { TrackOutline } from "@/components/catalog/TrackOutline";
import { PageContainer, ReadingColumn } from "@/components/layout/PageContainer";
import { getCatalogTrack } from "@/lib/catalog/client";

interface PageProps {
   params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
   const result = await getCatalogTrack((await params).slug);
   if (result.status !== "ok") return withPreviewRobots({});
   return withPreviewRobots({ title: result.data.title, description: result.data.summary });
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
               {result.status === "ok" ? (
                  <>
                     <header className="mb-12">
                        <h1 className="m-0 text-title text-balance">{result.data.title}</h1>
                        {result.data.summary ? (
                           <p className="mt-3 mb-0 text-body text-pretty text-muted-foreground">{result.data.summary}</p>
                        ) : null}
                     </header>
                     <TrackOutline track={result.data} />
                  </>
               ) : (
                  <CatalogStateNotice state={result.status} />
               )}
            </ReadingColumn>
         </PageContainer>
      </>
   );
}
