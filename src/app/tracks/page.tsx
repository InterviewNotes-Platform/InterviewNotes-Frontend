import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogStateNotice } from "@/app/_catalog/CatalogStateNotice";
import { PreviewMarker, withPreviewRobots } from "@/app/_catalog/PreviewMarker";
import { TrackCard } from "@/components/catalog/TrackCard";
import { PageContainer } from "@/components/layout/PageContainer";
import { listCatalogTracks } from "@/lib/catalog/client";
import { linkableEntries } from "@/lib/catalog/routes";

// The Track list comes from the catalog at request time and is never built or cached statically.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
   return withPreviewRobots({
      title: "Learn | InterviewNotes",
      description: "Tracks are curated learning paths that order Lessons and practice problems into Modules.",
   });
}

function EmptyTracks() {
   return (
      <div role="status" className="rounded-lg bg-surface px-6 py-12 text-center">
         <p className="m-0 text-body text-muted-foreground">No Tracks are published yet. Please check back soon.</p>
      </div>
   );
}

// Tracks are public and never gated, so this route sends no session.
export default async function TracksPage() {
   const result = await listCatalogTracks();
   if (result.status === "notFound") notFound();

   const tracks =
      result.status === "ok" ? linkableEntries(result.data.tracks.map((track) => ({ ...track, type: "track" as const }))) : [];

   return (
      <>
         <PreviewMarker />
         <PageContainer as="main" className="py-12 md:py-20">
            <header className="max-w-2xl">
               <h1 className="m-0 text-title text-balance">Learn, one Track at a time.</h1>
               <p className="mt-4 mb-0 text-body text-pretty text-muted-foreground">
                  Tracks are curated learning paths. Each one orders its Lessons and practice problems into Modules, so you always
                  know what to read next. Pick a Track and begin at the start.
               </p>
            </header>
            <section aria-labelledby="tracks-heading" className="mt-12 md:mt-16">
               <h2 id="tracks-heading" className="m-0 mb-6 text-section">
                  Tracks
               </h2>
               {result.status !== "ok" ? (
                  <CatalogStateNotice state={result.status} />
               ) : tracks.length === 0 ? (
                  <EmptyTracks />
               ) : (
                  <ul role="list" className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                     {tracks.map(({ entry, href }) => (
                        <li key={entry.id}>
                           <TrackCard track={entry} href={href} />
                        </li>
                     ))}
                  </ul>
               )}
            </section>
         </PageContainer>
      </>
   );
}
