/** Wire types for the backend `/catalog` item endpoints (backend `app/routers/catalog.py`). */

export type CatalogItemType = "knowledge" | "lesson" | "problem";
export type CatalogAccess = "free" | "premium";
/** Git-owned classification within a type: Knowledge or Problem values, `null` for a Lesson. */
export type CatalogCategory =
   | "concept"
   | "term"
   | "technology"
   | "research"
   | "pattern"
   | "quick_reference"
   | "system_design"
   | "ml_system_design";

export interface CatalogMeta {
   id: string;
   type: CatalogItemType;
   slug: string;
   title: string;
   summary: string;
   tags: string[];
   category: CatalogCategory | null;
   difficulty: "easy" | "medium" | "hard" | null;
   level: "foundational" | "intermediate" | "advanced" | null;
   access: CatalogAccess;
}

/** A Track item's public outline entry; `primary` is true when this Track is the item's home. */
export interface CatalogOutlineEntry {
   id: string;
   type: CatalogItemType;
   slug: string;
   title: string;
   access: CatalogAccess;
   primary: boolean;
}

export interface CatalogModule {
   key: string;
   title: string;
   position: number;
   items: CatalogOutlineEntry[];
}

/** A Track and its outline: modules, then their items, in the order the API returns them. */
export interface CatalogTrack {
   id: string;
   slug: string;
   title: string;
   summary: string;
   modules: CatalogModule[];
}

/** A Track as `GET /catalog/tracks` lists it: no outline, so no module or item counts. */
export interface CatalogTrackSummary {
   id: string;
   slug: string;
   title: string;
   summary: string;
}

/** Every published Track, ordered by id. The list is not paginated. */
export interface CatalogTrackList {
   tracks: CatalogTrackSummary[];
}

/** The filters this client sends. The backend also accepts `category=` (P1-T27); it is not exposed here until P2-T6 consumes it. */
export interface CatalogItemListParams {
   type?: CatalogItemType;
   tag?: string;
   difficulty?: NonNullable<CatalogMeta["difficulty"]>;
   level?: NonNullable<CatalogMeta["level"]>;
   access?: CatalogAccess;
   /** A Track slug; `module` narrows it to one of that Track's module keys. */
   track?: string;
   module?: string;
   limit?: number;
   /** The `next_cursor` of the previous page, passed back untouched. */
   cursor?: string;
}

/** One page of public metadata ordered by id; `next_cursor` is null on the last page. */
export interface CatalogItemPage {
   items: CatalogMeta[];
   next_cursor: string | null;
}

/** Where an item sits in one Track; `primary` marks its home Track. */
export interface CatalogPlacement {
   track: string;
   module: string;
   position: number;
   primary: boolean;
}

/** An item's graph neighbours as public metadata, grouped by relation name, plus its placements. */
export interface CatalogRelated {
   id: string;
   relations: Record<string, CatalogMeta[]>;
   placements: CatalogPlacement[];
}

export interface CatalogBody {
   format: "markdown@1";
   text: string;
}

export interface CatalogHeading {
   id: string;
   level: number;
   text: string;
}

export interface CatalogSection {
   id: string;
   type: string;
   title: string | null;
   body: CatalogBody;
}

/** Metadata plus what this caller may read: a Lesson's body, or a Knowledge/Problem's sections. */
export interface CatalogItem extends CatalogMeta {
   body: CatalogBody | null;
   headings: CatalogHeading[];
   sections: CatalogSection[];
   /** True when premium sections were left out for this caller. */
   sections_withheld: boolean;
}

/**
 * - `unauthenticated` premium, no session (401)
 * - `unentitled`      premium, signed in without entitlement (402)
 * - `notFound`        unknown, unpublished, or catalog disabled (404)
 * - `retired`         the item was retired (410)
 * - `unavailable`     `transport`: API unreachable or unconfigured; `upstream`: API 5xx or an
 *                     unexpected status; `malformed`: a 2xx body this client cannot safely render
 */
export type CatalogResult<T> =
   | { status: "ok"; data: T }
   | { status: "unauthenticated" }
   | { status: "unentitled" }
   | { status: "notFound" }
   | { status: "retired" }
   | { status: "unavailable"; cause: "transport" | "upstream" | "malformed" };
