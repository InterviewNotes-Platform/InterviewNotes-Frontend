export type NavArea = "learn" | "practice" | "knowledge";

/** Learn deliberately targets the catalog Track index; legacy `/learn/*` stays outside the primary navigation. */
export const PRIMARY_NAV: readonly { area: NavArea; label: string; href: string }[] = [
   { area: "learn", label: "Learn", href: "/tracks" },
   { area: "practice", label: "Practice", href: "/practice" },
   { area: "knowledge", label: "Knowledge", href: "/knowledge" },
];

/** The landing routes arrive in later P2 tasks; prefetching them now only logs 404s. Re-enable as each one ships. */
export const PREFETCH_PRIMARY = false;

const AREA_BY_ROOT = new Map<string, NavArea>([
   ["tracks", "learn"],
   ["lessons", "learn"],
   ["learn", "learn"],
   ["practice", "practice"],
   ["problems", "practice"],
   ["knowledge", "knowledge"],
]);

/** The primary area a pathname belongs to, decided by its first segment alone; null for every other route. */
export function activeArea(pathname: string | null | undefined): NavArea | null {
   const root = (pathname ?? "").split(/[?#]/, 1)[0].split("/")[1];
   return AREA_BY_ROOT.get(root) ?? null;
}
