/**
 * The conservative public CDN cache (P8-T45, G-CACHE amendment 2026-11-27): 60 seconds in Netlify's shared cache for a
 * signed-out document request to a page whose response never depends on the caller, and nothing anywhere else.
 *
 * Only Netlify's own cache reads `Netlify-CDN-Cache-Control`; the `Cache-Control` Next.js sends downstream (Cloudflare, the
 * browser) stays `private, no-store`. The rule is decided per request from what arrives, before any rendering, so a
 * request that carries a Supabase session, an Authorization header, Next.js preview state or an RSC navigation header
 * never gets the header, and `Netlify-Vary` keeps the cache key apart from any request carrying a session cookie.
 * Item pages and the homepage are not listed (item access and withdrawal changes, and the homepage's per-agent
 * rendering, are open owner decisions).
 */

/** Pages whose signed-out response is the same for every caller: public catalog metadata only, no item body. */
export const PUBLIC_CACHE_ROUTES = ["/tracks", "/tracks/:slug", "/knowledge"] as const;

export const PUBLIC_CACHE_SECONDS = 60;

/** The cookie names `@supabase/ssr` stores a session under for this project: whole, or split from `.0` on. */
export function supabaseSessionCookies(supabaseUrl: string): string[] {
   const ref = new URL(supabaseUrl).hostname.split(".")[0];
   const name = `sb-${ref}-auth-token`;
   return [name, `${name}.0`];
}

type Condition = { type: "header" | "cookie" | "query"; key: string };

/**
 * Production on Netlify only: the preview catalog credential is set in the `dev` branch-deploy context alone (README), so
 * a preview catalog is never cached; without the Supabase URL the session cookie names are unknown, so nothing is cached
 * rather than guessing.
 */
export function publicCacheHeaders(env: Record<string, string | undefined> = process.env) {
   if (env.NETLIFY !== "true" || env.CONTEXT !== "production") return [];
   if (!env.NEXT_PUBLIC_SUPABASE_URL) return [];
   let sessionCookies: string[];
   try {
      sessionCookies = supabaseSessionCookies(env.NEXT_PUBLIC_SUPABASE_URL);
   } catch {
      return [];
   }
   const bypass = [...sessionCookies, "__prerender_bypass", "__next_preview_data"];
   const missing: Condition[] = [
      ...bypass.map((key) => ({ type: "cookie" as const, key })),
      ...["authorization", "rsc", "next-router-prefetch", "next-router-state-tree", "next-router-segment-prefetch", "next-url"].map((key) => ({ type: "header" as const, key })),
      { type: "query", key: "_rsc" },
   ];
   const headers = [
      { key: "Netlify-CDN-Cache-Control", value: `public, s-maxage=${PUBLIC_CACHE_SECONDS}` },
      // Every query string is its own entry (the runtime otherwise keys on `_rsc` alone), and so is every session cookie value.
      { key: "Netlify-Vary", value: `query,cookie=${bypass.join("|")}` },
   ];
   return PUBLIC_CACHE_ROUTES.map((source) => ({ source, missing, headers }));
}
