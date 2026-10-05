import "server-only";

import { createClient } from "@/lib/supabase/server";
import { previewDelivery } from "./preview";
import type {
   CatalogBody,
   CatalogHeading,
   CatalogItem,
   CatalogItemListParams,
   CatalogItemPage,
   CatalogItemType,
   CatalogMeta,
   CatalogModule,
   CatalogOutlineEntry,
   CatalogPlacement,
   CatalogRelated,
   CatalogResult,
   CatalogSection,
   CatalogTrack,
   CatalogTrackList,
   CatalogTrackSummary,
} from "./types";

/** How long a signed-out (or metadata) response may be cached at the edge. */
const REVALIDATE_SECONDS = 60;

type Unavailable = Extract<CatalogResult<never>, { status: "unavailable" }>;

function unavailable(cause: Unavailable["cause"]): Unavailable {
   return { status: "unavailable", cause };
}

function apiUrl(): string | null {
   const url = process.env.API_URL;
   return url ? url.replace(/\/$/, "") : null;
}

/** The caller's Supabase access token, or null when signed out or Supabase is unreachable. */
async function getAccessToken(): Promise<string | null> {
   try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
   } catch (error) {
      console.error("Could not read Supabase session:", error);
      return null;
   }
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === "object" && value !== null;
}

const ITEM_TYPES = ["knowledge", "lesson", "problem"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const LEVELS = ["foundational", "intermediate", "advanced"];
const CATEGORIES = [
   "concept",
   "term",
   "technology",
   "research",
   "pattern",
   "quick_reference",
   "system_design",
   "ml_system_design",
];

function isString(value: unknown): value is string {
   return typeof value === "string";
}

function isOneOfOrNull(value: unknown, allowed: string[]): boolean {
   return value === null || (isString(value) && allowed.includes(value));
}

function isMeta(value: unknown): value is CatalogMeta {
   return (
      isRecord(value) &&
      isString(value.id) &&
      isString(value.type) &&
      ITEM_TYPES.includes(value.type) &&
      isString(value.slug) &&
      isString(value.title) &&
      isString(value.summary) &&
      Array.isArray(value.tags) &&
      value.tags.every(isString) &&
      isOneOfOrNull(value.category, CATEGORIES) &&
      isOneOfOrNull(value.difficulty, DIFFICULTIES) &&
      isOneOfOrNull(value.level, LEVELS) &&
      (value.access === "free" || value.access === "premium")
   );
}

/** Only `markdown@1` is renderable; any other body format is refused rather than shown raw. */
function isBody(value: unknown): value is CatalogBody {
   return isRecord(value) && value.format === "markdown@1" && isString(value.text);
}

function isHeading(value: unknown): value is CatalogHeading {
   return (
      isRecord(value) && isString(value.id) && typeof value.level === "number" && isString(value.text)
   );
}

function isSection(value: unknown): value is CatalogSection {
   return (
      isRecord(value) &&
      isString(value.id) &&
      isString(value.type) &&
      (value.title === null || isString(value.title)) &&
      isBody(value.body)
   );
}

function isOutlineEntry(value: unknown): value is CatalogOutlineEntry {
   return (
      isRecord(value) &&
      isString(value.id) &&
      isString(value.type) &&
      ITEM_TYPES.includes(value.type) &&
      isString(value.slug) &&
      isString(value.title) &&
      (value.access === "free" || value.access === "premium") &&
      typeof value.primary === "boolean"
   );
}

function isModule(value: unknown): value is CatalogModule {
   return (
      isRecord(value) &&
      isString(value.key) &&
      isString(value.title) &&
      typeof value.position === "number" &&
      Array.isArray(value.items) &&
      value.items.every(isOutlineEntry)
   );
}

function isTrack(value: unknown): value is CatalogTrack {
   return (
      isRecord(value) &&
      isString(value.id) &&
      isString(value.slug) &&
      isString(value.title) &&
      isString(value.summary) &&
      Array.isArray(value.modules) &&
      value.modules.every(isModule)
   );
}

function isTrackSummary(value: unknown): value is CatalogTrackSummary {
   return isRecord(value) && isString(value.id) && isString(value.slug) && isString(value.title) && isString(value.summary);
}

function isTrackList(value: unknown): value is CatalogTrackList {
   return isRecord(value) && Array.isArray(value.tracks) && value.tracks.every(isTrackSummary);
}

function isItemPage(value: unknown): value is CatalogItemPage {
   return (
      isRecord(value) &&
      Array.isArray(value.items) &&
      value.items.every(isMeta) &&
      (value.next_cursor === null || isString(value.next_cursor))
   );
}

function isPlacement(value: unknown): value is CatalogPlacement {
   return (
      isRecord(value) &&
      isString(value.track) &&
      isString(value.module) &&
      typeof value.position === "number" &&
      typeof value.primary === "boolean"
   );
}

function isRelated(value: unknown): value is CatalogRelated {
   return (
      isRecord(value) &&
      isString(value.id) &&
      isRecord(value.relations) &&
      !Array.isArray(value.relations) &&
      Object.values(value.relations).every((items) => Array.isArray(items) && items.every(isMeta)) &&
      Array.isArray(value.placements) &&
      value.placements.every(isPlacement)
   );
}

function isItem(value: unknown): value is CatalogItem {
   if (!isMeta(value)) return false;
   const item = value as unknown as Record<string, unknown>;
   return (
      (item.body === null || isBody(item.body)) &&
      Array.isArray(item.headings) &&
      item.headings.every(isHeading) &&
      Array.isArray(item.sections) &&
      item.sections.every(isSection) &&
      typeof item.sections_withheld === "boolean"
   );
}

async function request<T>(
   path: string,
   isValid: (body: unknown) => body is T,
   withSession: boolean
): Promise<CatalogResult<T>> {
   const base = apiUrl();
   if (!base) {
      console.error("catalog: API_URL is not set");
      return unavailable("transport");
   }

   const delivery = previewDelivery(base);
   if (!delivery) {
      console.error("catalog: the preview credential cannot be sent safely; no request was made");
      return unavailable("transport");
   }

   const token = withSession ? await getAccessToken() : null;
   let response: Response;
   try {
      response = await fetch(`${base}${path}`, {
         headers: { ...delivery.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
         // A signed-in response is user-specific and must never be shared, nor may a preview's.
         // A signed-out production response is identical for every such caller, so it may be cached.
         ...(token || !delivery.shareable
            ? { cache: "no-store" as const }
            : { next: { revalidate: REVALIDATE_SECONDS } }),
      });
   } catch (error) {
      console.error(`catalog: request to ${path} failed:`, error);
      return unavailable("transport");
   }

   if (response.status === 401) return { status: "unauthenticated" };
   if (response.status === 402) return { status: "unentitled" };
   if (response.status === 404) return { status: "notFound" };
   if (response.status === 410) return { status: "retired" };
   if (!response.ok) {
      console.error(`catalog: ${path} returned ${response.status}`);
      return unavailable("upstream");
   }

   let body: unknown;
   try {
      body = await response.json();
   } catch {
      return unavailable("malformed");
   }
   if (!isValid(body)) {
      console.error(`catalog: ${path} returned an unexpected shape`);
      return unavailable("malformed");
   }
   return { status: "ok", data: body };
}

function itemPath(type: CatalogItemType, slug: string): string {
   return `/catalog/items/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`;
}

/** An item with the body or sections this caller may read; the API decides, never this client. */
export function getCatalogItem(
   type: CatalogItemType,
   slug: string
): Promise<CatalogResult<CatalogItem>> {
   return request(itemPath(type, slug), isItem, true);
}

/** Public metadata only: safe to show a signed-out or unentitled reader as a teaser. */
export function getCatalogItemMeta(
   type: CatalogItemType,
   slug: string
): Promise<CatalogResult<CatalogMeta>> {
   return request(`${itemPath(type, slug)}/meta`, isMeta, false);
}

/**
 * An item's related items and Track placements, as public metadata. A premium item's graph needs
 * entitlement, so the session is sent; the API answers 401/402 rather than this client deciding.
 */
export function getCatalogRelated(
   type: CatalogItemType,
   slug: string
): Promise<CatalogResult<CatalogRelated>> {
   return request(`${itemPath(type, slug)}/related`, isRelated, true);
}

/** A published Track and its outline. Tracks are never gated, so no session is sent and the response is shareable. */
export function getCatalogTrack(slug: string): Promise<CatalogResult<CatalogTrack>> {
   return request(`/catalog/tracks/${encodeURIComponent(slug)}`, isTrack, false);
}

/** Every published Track by id, as identity and summary only. Public metadata: no session is sent. */
export function listCatalogTracks(): Promise<CatalogResult<CatalogTrackList>> {
   return request("/catalog/tracks", isTrackList, false);
}

// Exactly the query parameters the API accepts: it answers any other with 422.
const LIST_PARAMS = ["type", "tag", "difficulty", "level", "access", "track", "module", "limit", "cursor"] as const;

function itemListQuery(params: CatalogItemListParams): string {
   const pairs = LIST_PARAMS.flatMap((name) => {
      const value = params[name];
      return value === undefined || value === "" ? [] : [`${name}=${encodeURIComponent(String(value))}`];
   });
   return pairs.length ? `?${pairs.join("&")}` : "";
}

/**
 * One page of published item metadata, in the API's id order, narrowed by an AND of the given filters.
 * The cursor is opaque: pass back the previous page's `next_cursor`. Public: no session is sent.
 */
export function listCatalogItems(params: CatalogItemListParams = {}): Promise<CatalogResult<CatalogItemPage>> {
   return request(`/catalog/items${itemListQuery(params)}`, isItemPage, false);
}
