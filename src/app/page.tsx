import type { Metadata } from "next";
import { getCatalogItemMeta, listCatalogTracks } from "@/lib/catalog/client";
import { FREE_CHAPTER_LESSON_SLUG, freeChapterHref, homeTracks } from "@/lib/catalog/home";
import { PreviewMarker, withPreviewRobots } from "./_catalog/PreviewMarker";
import { HomeContent } from "./HomeContent";
import { HOME_METADATA } from "./home-copy";

// The two public metadata reads happen per request: a build must not freeze "unavailable", and a preview's answer is never shared.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
   return withPreviewRobots(HOME_METADATA);
}

/** At most two catalog reads, both public and sent without a session (S6-HOME-2); each failure only empties its own element. */
export default async function HomePage() {
   const [tracks, freeChapter] = await Promise.all([listCatalogTracks(), getCatalogItemMeta("lesson", FREE_CHAPTER_LESSON_SLUG)]);
   return (
      <>
         <PreviewMarker />
         <HomeContent tracks={homeTracks(tracks)} freeChapterHref={freeChapterHref(freeChapter)} />
      </>
   );
}
