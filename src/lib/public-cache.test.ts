import { describe, expect, it } from "vitest";
import { PUBLIC_CACHE_ROUTES, publicCacheHeaders, supabaseSessionCookies } from "./public-cache";

const PRODUCTION = { NETLIFY: "true", CONTEXT: "production", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co" };

describe("public CDN cache rules", () => {
   it("names the session cookies @supabase/ssr writes, whole and chunked", () => {
      expect(supabaseSessionCookies("https://abcdefgh.supabase.co")).toEqual(["sb-abcdefgh-auth-token", "sb-abcdefgh-auth-token.0"]);
   });

   it.each([
      ["outside Netlify", { ...PRODUCTION, NETLIFY: undefined }],
      ["on a branch deploy (beta)", { ...PRODUCTION, CONTEXT: "branch-deploy" }],
      ["on a deploy preview", { ...PRODUCTION, CONTEXT: "deploy-preview" }],
            ["without the Supabase URL", { ...PRODUCTION, NEXT_PUBLIC_SUPABASE_URL: undefined }],
      ["with a malformed Supabase URL", { ...PRODUCTION, NEXT_PUBLIC_SUPABASE_URL: "not a url" }],
   ])("caches nothing %s", (_name, env) => {
      expect(publicCacheHeaders(env)).toEqual([]);
   });

   it("lists only the two index pages: no Track detail (retired tombstone, 404), item body, homepage, account, practice, prepare or API route", () => {
      const sources = publicCacheHeaders(PRODUCTION).map(({ source }) => source);
      expect(sources).toEqual([...PUBLIC_CACHE_ROUTES]);
      expect(sources).toEqual(["/tracks", "/knowledge"]);
      for (const detail of ["/tracks/:slug", "/knowledge/:slug"]) expect(sources).not.toContain(detail);
   });

   it("bypasses any session, preview or RSC request and keys each session cookie and query apart", () => {
      for (const rule of publicCacheHeaders(PRODUCTION)) {
         expect(rule.missing).toEqual(
            expect.arrayContaining([
               { type: "cookie", key: "sb-abcdefgh-auth-token" },
               { type: "cookie", key: "sb-abcdefgh-auth-token.0" },
               { type: "cookie", key: "__prerender_bypass" },
               { type: "cookie", key: "__next_preview_data" },
               { type: "header", key: "authorization" },
               { type: "header", key: "rsc" },
               { type: "header", key: "next-router-prefetch" },
               { type: "header", key: "next-router-state-tree" },
               { type: "query", key: "_rsc" },
            ])
         );
         expect(rule.headers).toEqual([
            { key: "Netlify-CDN-Cache-Control", value: "public, s-maxage=60" },
            { key: "Netlify-Vary", value: "query,cookie=sb-abcdefgh-auth-token|sb-abcdefgh-auth-token.0|__prerender_bypass|__next_preview_data" },
         ]);
         // Only Netlify's shared cache is addressed: the downstream Cache-Control Next.js sets is never touched.
         expect(rule.headers.map(({ key }) => key.toLowerCase())).not.toContain("cache-control");
      }
   });
});
