export type NavArea = "learn" | "knowledge";

/** Tracks (the Learn area) targets the Track index; legacy `/learn/*` stays outside the navigation. Pricing and FAQ are
 *  homepage sections. Practice is not a product of its own: its routes belong to the Tracks area (spec §5.3). */
export const PRIMARY_NAV: readonly { area?: NavArea; label: string; href: string }[] = [
   { area: "learn", label: "Tracks", href: "/tracks" },
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
