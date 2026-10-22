import type { Metadata } from "next";
import { getCatalogItemMeta, listCatalogItems, listCatalogTracks } from "@/lib/catalog/client";
import { FREE_CHAPTER_LESSON_SLUG, freeChapterHref, homeProblem, homeTracks } from "@/lib/catalog/home";
import { PreviewMarker, withPreviewRobots } from "./_catalog/PreviewMarker";
import { HomeContent } from "./HomeContent";
import { HOME_METADATA } from "./home-copy";

// The three public metadata reads happen per request: a build must not freeze "unavailable", and a preview's answer is never shared.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
   return withPreviewRobots(HOME_METADATA);
}

/** Three public metadata reads in parallel, sent without a session (S6-HOME-2); each failure only empties its own element. */
export default async function HomePage() {
   const [tracks, freeChapter, problems] = await Promise.all([
      listCatalogTracks(),
      getCatalogItemMeta("lesson", FREE_CHAPTER_LESSON_SLUG),
      listCatalogItems({ type: "problem", limit: 1 }),
   ]);
   return (
      <>
         <PreviewMarker />
         <HomeContent tracks={homeTracks(tracks)} freeChapterHref={freeChapterHref(freeChapter)} problem={homeProblem(problems)} />
      </>
   );
}
