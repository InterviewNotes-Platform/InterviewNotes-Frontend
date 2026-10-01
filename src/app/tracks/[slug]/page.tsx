import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogStateNotice } from "@/app/_catalog/CatalogStateNotice";
import { TrackOutline } from "@/components/catalog/TrackOutline";
import { getCatalogTrack } from "@/lib/catalog/client";

interface PageProps {
   params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
   const result = await getCatalogTrack((await params).slug);
   if (result.status !== "ok") return {};
   return { title: result.data.title, description: result.data.summary };
}

// Tracks are public and never gated, so unlike item pages this route sends no session.
export default async function TrackPage({ params }: PageProps) {
   const result = await getCatalogTrack((await params).slug);
   if (result.status === "notFound") notFound();

   return (
      <main className="max-w-3xl mx-auto px-6 py-8">
         {result.status === "ok" ? (
            <>
               <header className="mb-8">
                  <h1 className="text-3xl font-bold text-foreground">{result.data.title}</h1>
                  {result.data.summary ? <p className="mt-2 text-muted-foreground">{result.data.summary}</p> : null}
               </header>
               <TrackOutline track={result.data} />
            </>
         ) : (
            <CatalogStateNotice state={result.status} />
         )}
      </main>
   );
}
