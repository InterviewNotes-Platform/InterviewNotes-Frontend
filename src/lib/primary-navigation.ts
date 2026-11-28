import { prepEnabled } from "@/lib/prep-flag";

export type NavArea = "learn" | "knowledge" | "prepare";

/** Where Tracks open: the `/tracks` discovery page (P8-NAV-04).
 *  The header, the mobile menu and every Browse Tracks action share it. */
export const TRACKS_ENTRY = "/tracks";

/** Where catalog pages (breadcrumbs, Practice, errors) send "all Tracks": the same `/tracks` discovery page (P8 spec §5, P8-NAV-01). */
export const TRACKS_INDEX_HREF = TRACKS_ENTRY;

/** The pricing page (P8-NAV-02, P8-NAV-04). */
export const PRICING_HREF = "/pricing";

/** Pricing is the `/pricing` page; FAQ is a homepage section. Practice is not a product of its own: its routes belong to the Tracks area (spec §5.3). */
export const PRIMARY_NAV: readonly { area?: NavArea; label: string; href: string }[] = [
   { area: "learn", label: "Tracks", href: TRACKS_ENTRY },
   { area: "knowledge", label: "Knowledge", href: "/knowledge" },
   { label: "Pricing", href: PRICING_HREF },
   { label: "FAQ", href: "/#faq" },
];

/** The preparation workspace (P7-D-024). It is listed only while the frontend `PREP_ENABLED` flag is on. */
export const PREPARE_HREF = "/prepare";

/** Where a question is chosen and an answer is started (P7-T18). */
export const PREPARE_NEW_HREF = "/prepare/new";

/** The answer editor lives under this path (P7-T19). */
export const PREPARE_ANSWERS_HREF = "/prepare/answers";

const PREPARE_ENTRY = { area: "prepare", label: "Prepare", href: PREPARE_HREF } as const;

/** What the header and the mobile menu list: `PRIMARY_NAV`, plus Prepare after Knowledge when the flag is on. */
export function primaryNav(enabled: boolean = prepEnabled()): readonly (typeof PRIMARY_NAV)[number][] {
   if (!enabled) return PRIMARY_NAV;
   const at = PRIMARY_NAV.findIndex(({ area }) => area === "knowledge") + 1;
   return [...PRIMARY_NAV.slice(0, at), PREPARE_ENTRY, ...PRIMARY_NAV.slice(at)];
}

/** The Practice route still exists inside the Tracks area; it is linked from Problems and filters, not from the navigation. */
export const PRACTICE_HREF = "/practice";

/** The gold Premium button in the header opens the same `/pricing` page. */
export const PREMIUM_HREF = PRICING_HREF;

/** The primary destinations all exist, so their links load in the background and a click opens them at once. */
export const PREFETCH_PRIMARY = true;

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
