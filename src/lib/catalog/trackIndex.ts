import { isLevelChoiceTrack } from "./levelChoice";
import { linkableEntries } from "./routes";
import { curriculumOf } from "./track";
import type { CatalogAccess, CatalogResult, CatalogTrack, CatalogTrackList, CatalogTrackSummary } from "./types";

/** One Module as the index lists it: its number on the Track page and what it places. */
export interface IndexModule {
   key: string;
   number: number;
   title: string;
   lessons: number;
   problems: number;
}

/** What a Track's public outline holds, counted from linkable entries only, as the Track page counts them. */
export interface IndexOutline {
   modules: IndexModule[];
   lessons: number;
   problems: number;
   access: Record<CatalogAccess, number>;
   /** The recommended first Lesson (S-CUR-13); null for a level-choice Track or a Track with no Lesson. */
   start: { title: string; href: string; access: CatalogAccess } | null;
}

export interface IndexTrack {
   id: string;
   title: string;
   summary: string;
   href: string;
   /** Null when the outline read failed: the card then shows the list's data and says the outline is unavailable. */
   outline: IndexOutline | null;
}

export type TracksIndex = { status: "ok"; tracks: IndexTrack[] } | { status: "empty" } | { status: "unavailable" };

/** The listed Tracks that map to a canonical route and have a title, in the API's order; null when the list failed. */
export function listedTracks(list: CatalogResult<CatalogTrackList>): { track: CatalogTrackSummary; href: string }[] | null {
   if (list.status !== "ok") return null;
   return linkableEntries(list.data.tracks.map((track) => ({ ...track, type: "track" as const })))
      .filter(({ entry }) => entry.title.trim() !== "")
      .map(({ entry: { id, slug, title, summary }, href }) => ({ track: { id, slug, title, summary }, href }));
}

function indexOutline(track: CatalogTrack): IndexOutline {
   const curriculum = curriculumOf(track);
   const rows = curriculum.modules.flatMap(({ rows }) => rows);
   const premium = rows.filter(({ entry }) => entry.access === "premium").length;
   const start = isLevelChoiceTrack(track) ? null : curriculum.start;
   return {
      modules: curriculum.modules.flatMap(({ module, rows, counts }, index) =>
         rows.length ? [{ key: module.key, number: index + 1, title: module.title, lessons: counts.lesson, problems: counts.problem }] : []
      ),
      lessons: curriculum.counts.lesson,
      problems: curriculum.counts.problem,
      access: { free: rows.length - premium, premium },
      start: start ? { title: start.entry.title, href: start.href, access: start.entry.access } : null,
   };
}

/**
 * The `/tracks` page: every Track the public list returns, each with its public outline when that read succeeded. A Track
 * whose outline is now 404 or 410 is left out, since it is no longer published; nothing is shown that the API did not return.
 */
export function tracksIndex(
   list: CatalogResult<CatalogTrackList>,
   outlines: ReadonlyMap<string, CatalogResult<CatalogTrack>>
): TracksIndex {
   const listed = listedTracks(list);
   if (listed === null) return { status: "unavailable" };
   const tracks = listed.flatMap(({ track, href }): IndexTrack[] => {
      const result = outlines.get(track.slug);
      if (result?.status === "notFound" || result?.status === "retired") return [];
      const outline = result?.status === "ok" && result.data.id === track.id ? indexOutline(result.data) : null;
      return [{ id: track.id, title: track.title, summary: track.summary.trim(), href, outline }];
   });
   if (tracks.length > 0) return { status: "ok", tracks };
   return list.status === "ok" && list.data.tracks.length > 0 && listed.length === 0 ? { status: "unavailable" } : { status: "empty" };
}
