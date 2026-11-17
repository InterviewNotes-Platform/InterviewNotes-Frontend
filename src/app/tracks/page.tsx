import type { Metadata } from "next";
import { PreviewMarker, withPreviewRobots } from "@/app/_catalog/PreviewMarker";
import { TracksIndex } from "@/components/track/TracksIndex";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { getCatalogTrack, listCatalogTracks } from "@/lib/catalog/client";
import { listedTracks, tracksIndex } from "@/lib/catalog/trackIndex";

// The Track list is read from the catalog per request and is never built or cached statically.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
   return withPreviewRobots({
      title: "Tracks | InterviewNotes",
      description: "Every published InterviewNotes Track, with its modules, its Lessons and practice problems, and what is free or Premium.",
   });
}

// Public metadata only, sent without a session (P8 spec §5): the Track list, then each listed Track's public outline in parallel.
export default async function TracksPage() {
   const list = await listCatalogTracks();
   const outlines = new Map(await Promise.all((listedTracks(list) ?? []).map(async ({ track }) => [track.slug, await getCatalogTrack(track.slug)] as const)));

   return (
      <>
         <PreviewMarker />
         <div data-reader data-reader-surface="desk">
            <PageContainer as="main" className="py-12 md:py-16">
               <div className="mx-auto max-w-4xl">
                  <header className="mb-10 max-w-2xl md:mb-12">
                     <p className="m-0 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Tracks</p>
                     <h1 className="m-0 mt-3 text-title text-balance">Learn in order, one Track at a time.</h1>
                     <p className="mt-4 mb-0 text-body text-pretty text-muted-foreground">
                        Each Track arranges Lessons and practice problems into modules. Open a Track to see its full curriculum and start where it
                        recommends; Premium items are marked.
                     </p>
                  </header>
                  <TracksIndex index={tracksIndex(list, outlines)} />
               </div>
            </PageContainer>
            <Footer />
         </div>
      </>
   );
}
