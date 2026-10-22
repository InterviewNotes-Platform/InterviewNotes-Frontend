/**
 * Approved legacy path -> catalog path entries, keyed by course slug or "course/chapter" (S6-RTE-3).
 * Empty: no reliable Course-to-Track mapping exists (P1 D-16). An entry needs A-2 and an equivalence record.
 */
export const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {};

const TRACKS_SECTION = "/#tracks";

/** Temporary (307) redirects for `/tracks`, `/learn` and every `/learn/...` path, in match order. */
export function compatibilityRedirects(approved: Readonly<Record<string, string>> = LEGACY_REDIRECTS) {
   const mapped = Object.entries(approved)
      .sort(([a], [b]) => b.split("/").length - a.split("/").length)
      .map(([key, destination]) => ({ source: `/learn/${key}/:path*`, destination, permanent: false }));
   return [
      { source: "/tracks", destination: TRACKS_SECTION, permanent: false },
      ...mapped,
      { source: "/learn/:path*", destination: TRACKS_SECTION, permanent: false },
   ];
}
