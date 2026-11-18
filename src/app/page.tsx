import type { Metadata } from "next";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { getCatalogItemMeta, listCatalogTracks } from "@/lib/catalog/client";
import {
   FREE_CHAPTER_LESSON_SLUG,
   HOME_READ_BUDGET_MS,
   freeChapterHref,
   homeTracks,
   withinBudget,
   type HomeTracks,
} from "@/lib/catalog/home";
import { reportHomeLate, reportRender } from "@/lib/perf/hotpath";
import { PreviewMarker, withPreviewRobots } from "./_catalog/PreviewMarker";
import { HomeContent } from "./HomeContent";
import { HOME_METADATA } from "./home-copy";

// The two public metadata reads happen per request: a build must not freeze "unavailable", and a preview's answer is never shared.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
   return withPreviewRobots(HOME_METADATA);
}

/**
 * Two public metadata reads in parallel, sent without a session (S6-HOME-2); each failure only empties its own element.
 * The hero stage is fixed copy and reads nothing (P6-D-50).
 *
 * The page waits for those reads for `HOME_READ_BUDGET_MS`, then renders what it has. A read that is still outstanding
 * (the free-tier API is starting, which takes tens of seconds) is shown as pending, never as empty or unavailable and never
 * as a made-up card; the read itself is not abandoned, `after` keeps the request alive until it settles so the answer lands
 * in the same cache, and the page's client retry then reads it back. This is the request the page already made, not a second
 * one. A crawler is given the whole page, so what is indexed does not depend on the API's mood.
 *
 * It does not stream: a streamed boundary arrives in a hidden element that needs script to be moved into place, and the
 * Tracks are required content without script. With script off, a pending page says so and links on.
 */
export default async function HomePage() {
   reportRender("home");
   const budget = userAgent({ headers: await headers() }).isBot ? null : HOME_READ_BUDGET_MS;

   const tracksRead = listCatalogTracks();
   const freeRead = getCatalogItemMeta("lesson", FREE_CHAPTER_LESSON_SLUG);
   const [tracksAnswer, freeAnswer] = await Promise.all([withinBudget(tracksRead, budget), withinBudget(freeRead, budget)]);

   const late = [...(tracksAnswer.settled ? [] : (["tracks"] as const)), ...(freeAnswer.settled ? [] : (["free"] as const))];
   if (late.length > 0) {
      reportHomeLate(late, Promise.allSettled([...(tracksAnswer.settled ? [] : [tracksRead]), ...(freeAnswer.settled ? [] : [freeRead])]));
   }

   const tracks: HomeTracks = tracksAnswer.settled ? homeTracks(tracksAnswer.value) : { status: "pending" };
   return (
      <>
         <PreviewMarker />
         <HomeContent
            tracks={tracks}
            freeChapterHref={freeAnswer.settled ? freeChapterHref(freeAnswer.value) : null}
            freeChapterPending={!freeAnswer.settled}
         />
      </>
   );
}
