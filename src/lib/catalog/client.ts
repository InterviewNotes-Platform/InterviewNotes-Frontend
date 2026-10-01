import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
   CatalogBody,
   CatalogHeading,
   CatalogItem,
   CatalogItemType,
   CatalogMeta,
   CatalogResult,
   CatalogSection,
   CatalogTrack,
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

function isTrack(value: unknown): value is CatalogTrack {
   return (
      isRecord(value) &&
      isString(value.id) &&
      isString(value.slug) &&
      isString(value.title) &&
      isString(value.summary)
   );
}

function isItem(value: unknown): value is CatalogItem {
   if (!isMeta(value)) return false;
   const item = value as unknown as Record<string, unknown>;
   return (
      (item.kind === null || isString(item.kind)) &&
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

   const token = withSession ? await getAccessToken() : null;
   let response: Response;
   try {
      response = await fetch(`${base}${path}`, {
         headers: token ? { Authorization: `Bearer ${token}` } : {},
         // A signed-in response is user-specific and must never be shared. A signed-out
         // response is identical for every signed-out caller, so it may be cached.
         ...(token
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

/** A published Track. Tracks are never gated, so no session is sent and the response is shareable. */
export function getCatalogTrack(slug: string): Promise<CatalogResult<CatalogTrack>> {
   return request(`/catalog/tracks/${encodeURIComponent(slug)}`, isTrack, false);
}
