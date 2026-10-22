import { catalogEntryHref, linkableEntries } from "./routes";
import type { CatalogItemPage, CatalogMeta, CatalogResult, CatalogTrackList } from "./types";

/** The first free Lesson of the genai-system-design Track (S6-HOME-4); `freeChapterHref` makes the action true per environment. */
export const FREE_CHAPTER_LESSON_SLUG = "anatomy-of-a-model-request";

export interface HomeTrackCard {
   id: string;
   title: string;
   summary: string;
   href: string;
}

/** What the homepage's Tracks section shows: cards, the empty sentence, or the unavailable sentence. */
export type HomeTracks = { status: "ok"; cards: HomeTrackCard[] } | { status: "empty" } | { status: "unavailable" };

/**
 * The published Tracks in the API's order, each with its canonical route. Only an empty list is "empty": a list whose
 * entries cannot be shown is unavailable, because "none published" would be untrue.
 */
export function homeTracks(result: CatalogResult<CatalogTrackList>): HomeTracks {
   if (result.status !== "ok") return { status: "unavailable" };
   const { tracks } = result.data;
   if (tracks.length === 0) return { status: "empty" };
   const cards = linkableEntries(tracks.map((track) => ({ ...track, type: "track" as const })))
      .filter(({ entry }) => entry.title.trim() !== "")
      .map(({ entry, href }) => ({ id: entry.id, title: entry.title, summary: entry.summary.trim(), href }));
   return cards.length > 0 ? { status: "ok", cards } : { status: "unavailable" };
}

/** The free Lesson's route, only when the API says this exact Lesson is free; null for a 404, a failure or any other answer. */
export function freeChapterHref(result: CatalogResult<CatalogMeta>): string | null {
   if (result.status !== "ok") return null;
   const { id, type, slug, access } = result.data;
   if (type !== "lesson" || slug !== FREE_CHAPTER_LESSON_SLUG || access !== "free") return null;
   return catalogEntryHref({ id, type, slug });
}

/** The Problem the hero stage shows: public list metadata only, never a body. */
export interface HomeProblem {
   title: string;
   summary: string;
}

/** The first published Problem in the API's order, or null for an empty page, a failure or a Problem with no title: the stage then shows its neutral card. */
export function homeProblem(result: CatalogResult<CatalogItemPage>): HomeProblem | null {
   if (result.status !== "ok") return null;
   const item = result.data.items.find((entry) => entry.type === "problem" && entry.title.trim() !== "");
   return item ? { title: item.title.trim(), summary: item.summary.trim() } : null;
}
