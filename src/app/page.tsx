import type { Metadata } from "next";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { getCatalogItemMeta, listCatalogItems, listCatalogTracks, publicReadsAreCached } from "@/lib/catalog/client";
import {
   FREE_CHAPTER_LESSON_SLUG,
   freeChapterHref,
   homeReadBudgetMs,
   homeTracks,
   wantsWholePage,
   withinBudget,
   type HomeTracks,
} from "@/lib/catalog/home";
import { homeRoles, ROLE_LIST_LIMIT } from "@/lib/catalog/roles";
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
 * A production page waits for those reads for `homeReadBudgetMs`, then renders what it has. A read still outstanding (the
 * free-tier API is starting, which takes tens of seconds) is shown as pending, never as empty or unavailable and never as a
 * made-up card. The read is not abandoned: `after` keeps the request alive until it settles, and because the read goes through
 * the Data Cache its answer lands there, where the page's own client retry (a fresh server render) finds it. A retry made
 * before the first read has finished is a further read of the same public path: the serverless platform gives no way to join
 * a read in flight in another invocation, so the retries are few and end (see `TracksRetry`). A preview deployment, whose
 * reads are never cached, keeps the old behaviour and waits. A crawler or monitor is given the whole page either way.
 *
 * It does not stream: a streamed boundary arrives in a hidden element that needs script to be moved into place, and the
 * Tracks are required content without script. With script off, a pending page says so and links on.
 */
export default async function HomePage() {
   const requestHeaders = await headers();
   const agent = userAgent({ headers: requestHeaders });
   const wholePage = wantsWholePage(requestHeaders.get("user-agent"), agent.isBot, requestHeaders.get("sec-fetch-mode"));
   // Called before the reads start so the timeline begins with them; `wp` shows on a hosted run whether browsers take the budgeted path.
   reportRender("home", wholePage);
   const budget = wholePage ? null : homeReadBudgetMs(publicReadsAreCached());

   const tracksRead = listCatalogTracks();
   const freeRead = getCatalogItemMeta("lesson", FREE_CHAPTER_LESSON_SLUG);
   // The optional role strip: one public list read, same budget; a late or failed answer just leaves the strip out.
   const rolesRead = listCatalogItems({ limit: ROLE_LIST_LIMIT });
   const [tracksAnswer, freeAnswer, rolesAnswer] = await Promise.all([
      withinBudget(tracksRead, budget),
      withinBudget(freeRead, budget),
      withinBudget(rolesRead, budget),
   ]);

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
            roles={rolesAnswer.settled ? homeRoles(rolesAnswer.value) : []}
         />
      </>
   );
}
