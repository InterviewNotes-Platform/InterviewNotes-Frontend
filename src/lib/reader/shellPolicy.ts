import type { TrackSidebarOutline } from "@/lib/catalog/outline";

/** What the API released to this caller: a body ("readable") or a withheld one ("locked"). Never inferred in the browser. */
export type ReaderAccess = "readable" | "locked";

/** The reader surface (P8-D-072): Lesson and Knowledge read on paper, Problem and Track sit on the desk. */
export type ReaderSurface = "paper" | "desk";

export type ReaderMode = "study" | "read";

export interface ReaderOrientation {
   /** The home Track's outline for the rail, sidebar and Track sheet; null shows none. */
   outline: TrackSidebarOutline | null;
}

/**
 * The shell's Track orientation for a page. A locked page shows none (S-LSN-18): no outline, position or Previous/Next, even
 * when a caller passes one. Fail-safe: anything but an explicit "readable" is treated as locked.
 */
export function readerOrientation(access: ReaderAccess, outline: TrackSidebarOutline | null | undefined): ReaderOrientation {
   return { outline: access === "readable" ? (outline ?? null) : null };
}
