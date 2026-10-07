import { catalogEntryHref } from "./routes";
import type { CatalogModule, CatalogTrack } from "./types";

// Ids the app shell owns. A Module key equal to one gets no fragment, because the id would be a duplicate (S-MOD-4).
export const SHELL_IDS: readonly string[] = ["main-content"];

/** The id a Module's section carries on the Track page; null for a key that would collide with a shell id. */
export function moduleFragmentId(module: Pick<CatalogModule, "key">): string | null {
   return SHELL_IDS.includes(module.key) ? null : module.key;
}

/** A Module's location, `/tracks/<slug>#<key>`, or the plain Track URL when it has no fragment; null with no Track route. */
export function moduleLocation(track: CatalogTrack, module: Pick<CatalogModule, "key">): string | null {
   const href = catalogEntryHref({ ...track, type: "track" });
   const fragment = moduleFragmentId(module);
   return href && fragment ? `${href}#${fragment}` : href;
}
