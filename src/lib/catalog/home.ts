import { catalogEntryHref, linkableEntries } from "./routes";
import type { CatalogMeta, CatalogResult, CatalogTrackList } from "./types";

/** The first free Lesson of the genai-system-design Track (S6-HOME-4); `freeChapterHref` makes the action true per environment. */
export const FREE_CHAPTER_LESSON_SLUG = "anatomy-of-a-model-request";

export interface HomeTrackCard {
   id: string;
   title: string;
   summary: string;
   href: string;
}

/**
 * What the homepage's Tracks section shows: cards, the empty sentence, the unavailable sentence, or `pending`: the read
 * is still waiting on the API (for example while the free-tier backend starts), so the page says so instead of holding
 * everything back. `pending` is never a statement about the catalog and never carries a card.
 */
export type HomeTracks =
   | { status: "ok"; cards: HomeTrackCard[] }
   | { status: "empty" }
   | { status: "unavailable" }
   | { status: "pending" };

/**
 * How long a production homepage waits for its two public reads before it renders what it has. A Data Cache answer or a
 * running API answers well inside this; a sleeping free-tier API does not, and holding the hero for it takes the whole page.
 */
export const HOME_READ_BUDGET_MS = 800;

/**
 * The wait the homepage allows its reads, or null to wait as long as they take (the page as it was before the budget).
 *
 * A budget only helps when an abandoned read is not wasted: a production read goes through the Data Cache, so the read
 * the page stopped waiting for still finishes and the next render finds it. A preview's reads are never cached, so an
 * abandoned read would be lost and a steady, slow answer would never be shown: where reads are not cached the page waits
 * unless `HOME_READ_BUDGET_MS` is set (a number of milliseconds, or `off`). An environment value also overrides production,
 * as a switch.
 */
export function homeReadBudgetMs(readsAreCached: boolean, setting: string | undefined = process.env.HOME_READ_BUDGET_MS): number | null {
   const value = setting?.trim().toLowerCase();
   if (value === "off") return null;
   if (value) {
      const ms = Number(value);
      if (Number.isFinite(ms) && ms >= 0) return ms;
   }
   return readsAreCached ? HOME_READ_BUDGET_MS : null;
}

const CRAWLER_TOKENS = /bot|crawl|spider|slurp|lighthouse|pagespeed|pingdom|uptime|monitor|ahrefs|semrush/i;

/**
 * Whether a request should be given the whole page rather than the budgeted one: a search or AI crawler, a monitor, or a
 * client that says nothing about itself. What is indexed or checked then does not depend on the API's mood. The framework's
 * own list is checked first; the tokens catch what it misses.
 */
export function wantsWholePage(userAgent: string | null | undefined, frameworkSaysBot: boolean): boolean {
   return frameworkSaysBot || !userAgent?.trim() || CRAWLER_TOKENS.test(userAgent);
}

export type Bounded<T> = { settled: true; value: T } | { settled: false };

/**
 * `read`'s answer, or `{ settled: false }` once `ms` has passed without one. The read is never cancelled: it goes on and
 * fills the same cache it always did. A null budget waits as long as the read takes (a crawler is given the whole page).
 */
export function withinBudget<T>(read: Promise<T>, ms: number | null): Promise<Bounded<T>> {
   if (ms === null) return read.then((value) => ({ settled: true as const, value }));
   return new Promise<Bounded<T>>((resolve, reject) => {
      const timer = setTimeout(() => resolve({ settled: false }), ms);
      read.then(
         (value) => {
            clearTimeout(timer);
            resolve({ settled: true, value });
         },
         (error: unknown) => {
            clearTimeout(timer);
            reject(error);
         }
      );
   });
}

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
