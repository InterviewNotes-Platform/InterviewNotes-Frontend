export type NavArea = "learn" | "knowledge";

/** Where Tracks open. The catalog has published no Track, so `/tracks` is empty and the live courses at `/learn` stand in;
 *  switch this one constant to "/tracks" when the first Track is published (spec §5.3). The header and homepage share it. */
export const TRACKS_ENTRY = "/learn";

/** The catalog Track index, which catalog pages (breadcrumbs, Practice) keep linking to. */
export const TRACKS_INDEX_HREF = "/tracks";

/** Pricing and FAQ are homepage sections. Practice is not a product of its own: its routes belong to the Tracks area (spec §5.3). */
export const PRIMARY_NAV: readonly { area?: NavArea; label: string; href: string }[] = [
   { area: "learn", label: "Tracks", href: TRACKS_ENTRY },
   { area: "knowledge", label: "Knowledge", href: "/knowledge" },
   { label: "Pricing", href: "/#pricing" },
   { label: "FAQ", href: "/#faq" },
];

/** The Practice route still exists inside the Tracks area; it is linked from Problems and filters, not from the navigation. */
export const PRACTICE_HREF = "/practice";

/** The gold Premium button in the header opens the planned pricing; nothing is for sale there. */
export const PREMIUM_HREF = "/#pricing";

/** The landing routes arrive in later P2 tasks; prefetching them now only logs 404s. Re-enable as each one ships. */
export const PREFETCH_PRIMARY = false;

const AREA_BY_ROOT = new Map<string, NavArea>([
   ["tracks", "learn"],
   ["lessons", "learn"],
   ["learn", "learn"],
   ["practice", "learn"],
   ["problems", "learn"],
   ["knowledge", "knowledge"],
]);

/** The primary area a pathname belongs to, decided by its first segment alone; null for every other route. */
export function activeArea(pathname: string | null | undefined): NavArea | null {
   const root = (pathname ?? "").split(/[?#]/, 1)[0].split("/")[1];
   return AREA_BY_ROOT.get(root) ?? null;
}
