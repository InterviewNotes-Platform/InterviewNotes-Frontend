/** Wire types for the backend `/catalog` item endpoints (backend `app/routers/catalog.py`). */

export type CatalogItemType = "knowledge" | "lesson" | "problem";
export type CatalogAccess = "free" | "premium";

export interface CatalogMeta {
   id: string;
   type: CatalogItemType;
   slug: string;
   title: string;
   summary: string;
   tags: string[];
   difficulty: "easy" | "medium" | "hard" | null;
   level: "foundational" | "intermediate" | "advanced" | null;
   access: CatalogAccess;
}

/** A Track's identity; its modules and outline are not consumed yet. */
export interface CatalogTrack {
   id: string;
   slug: string;
   title: string;
   summary: string;
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
   kind: string | null;
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
