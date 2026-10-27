import { prepEnabled } from "@/lib/prep-flag";

export type NavArea = "learn" | "knowledge" | "prepare";

/** Where Tracks open: the homepage's Tracks section, the one place Tracks are discovered (S6-NAV-1).
 *  The header, the mobile menu and every Browse Tracks action share it. */
export const TRACKS_ENTRY = "/#tracks";

/** Where catalog pages (breadcrumbs, Practice) send "all Tracks": the homepage section, not the `/tracks` redirect (S6-RTE-2). */
export const TRACKS_INDEX_HREF = TRACKS_ENTRY;

/** Pricing and FAQ are homepage sections. Practice is not a product of its own: its routes belong to the Tracks area (spec §5.3). */
export const PRIMARY_NAV: readonly { area?: NavArea; label: string; href: string }[] = [
   { area: "learn", label: "Tracks", href: TRACKS_ENTRY },
   { area: "knowledge", label: "Knowledge", href: "/knowledge" },
   { label: "Pricing", href: "/#pricing" },
   { label: "FAQ", href: "/#faq" },
];

/** The preparation workspace (P7-D-024). It is listed only while the frontend `PREP_ENABLED` flag is on. */
export const PREPARE_HREF = "/prepare";

/** Where a question is chosen and an answer is started (P7-T18). */
export const PREPARE_NEW_HREF = "/prepare/new";

const PREPARE_ENTRY = { area: "prepare", label: "Prepare", href: PREPARE_HREF } as const;

/** What the header and the mobile menu list: `PRIMARY_NAV`, plus Prepare after Knowledge when the flag is on. */
export function primaryNav(enabled: boolean = prepEnabled()): readonly (typeof PRIMARY_NAV)[number][] {
   if (!enabled) return PRIMARY_NAV;
   const at = PRIMARY_NAV.findIndex(({ area }) => area === "knowledge") + 1;
   return [...PRIMARY_NAV.slice(0, at), PREPARE_ENTRY, ...PRIMARY_NAV.slice(at)];
}

/** The Practice route still exists inside the Tracks area; it is linked from Problems and filters, not from the navigation. */
export const PRACTICE_HREF = "/practice";

/** The gold Premium button in the header opens the planned pricing; nothing is for sale there. */
export const PREMIUM_HREF = "/#pricing";

/** The landing routes arrive in later P2 tasks; prefetching them now only logs 404s. Re-enable as each one ships. */
export const PREFETCH_PRIMARY = false;

const AREA_BY_ROOT = new Map<string, NavArea>([
   ["tracks", "learn"],
   ["lessons", "learn"],
   ["practice", "learn"],
   ["problems", "learn"],
   ["knowledge", "knowledge"],
   ["prepare", "prepare"],
]);

/** The primary area a pathname belongs to, decided by its first segment alone; null for every other route. */
export function activeArea(pathname: string | null | undefined): NavArea | null {
   const root = (pathname ?? "").split(/[?#]/, 1)[0].split("/")[1];
   return AREA_BY_ROOT.get(root) ?? null;
}
