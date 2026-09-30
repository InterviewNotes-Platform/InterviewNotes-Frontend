import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
   CatalogItem,
   CatalogItemType,
   CatalogMeta,
   CatalogResult,
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

function isMeta(value: unknown): value is CatalogMeta {
   return (
      isRecord(value) &&
      typeof value.id === "string" &&
      typeof value.slug === "string" &&
      typeof value.title === "string" &&
      (value.access === "free" || value.access === "premium")
   );
}

function isMarkdownBody(value: unknown): boolean {
   return isRecord(value) && value.format === "markdown@1" && typeof value.text === "string";
}

/** Only `markdown@1` is renderable; any other body format is refused rather than shown raw. */
function isItem(value: unknown): value is CatalogItem {
   if (!isMeta(value)) return false;
   const { body, headings, sections } = value as unknown as Record<string, unknown>;
   return (
      Array.isArray(headings) &&
      Array.isArray(sections) &&
      (body === null || isMarkdownBody(body)) &&
      sections.every((section) => isRecord(section) && isMarkdownBody(section.body))
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
