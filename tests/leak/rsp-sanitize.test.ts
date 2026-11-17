import { describe, expect, it } from "vitest";
import { KEEP_HEADERS, anonymizeUrlField, errorKind, redirectTarget, routeTemplate, safeField, safeLine, safeOutput, safeString, sanitizeHeaders, sanitizePath, sanitizeUrl } from "../../scripts/perf/rsp-sanitize.mjs";

// P8-RSP-02 v2/v3: the RSP harness writes results files and console lines; nothing credential- or person-bearing
// may reach them. v3: allowlists (route templates, query-key list, safe-key list) instead of an identifier blacklist.
const BASE = "https://interviewnotes.io";
const SECRETS = [
   "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl",
   "sb-access-token-value",
   "pkce-code-0123456789",
   "person@example.com",
   "alice@example.com",
   "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
   "s3cr3t-password",
   "a1b2",
   "Tell me about the time I was fired from Acme",
];
const leaks = (value: unknown) => SECRETS.filter((secret) => JSON.stringify(value).includes(secret) || JSON.stringify(value).includes(encodeURIComponent(secret)));

describe("RSP harness sanitizer (P8-RSP-02 v3, v3.1)", () => {
   it("writes a path only as its route template: emails, short ids and titles in segments never survive", () => {
      expect(routeTemplate("/prepare/answers/alice@example.com")).toBe("/prepare/answers/[id]");
      expect(routeTemplate("/prepare/answers/a1b2")).toBe("/prepare/answers/[id]");
      expect(routeTemplate("/prepare/stories/Tell me about the time I was fired from Acme")).toBe("/prepare/stories/[id]");
      expect(routeTemplate("/lessons/behavioral-prep-sde-1")).toBe("/lessons/[slug]");
      expect(routeTemplate("/catalog/items/lesson/p6-level-one/related")).toBe("/catalog/items/lesson/[slug]/related");
      expect(routeTemplate("/_next/static/chunks/0a1b2c3d.js")).toBe("/_next/static/chunks/[asset]");
      expect(sanitizePath("/")).toBe("/");
   });

   it("keeps only allowlisted query keys and never a value: redirect targets, codes and emails", () => {
      expect(sanitizeUrl(`${BASE}/login?next=%2Fprepare%2Fanswers%2Falice%40example.com&email=person%40example.com#access_token=sb-access-token-value`, BASE)).toBe("/login?[key]&next");
      expect(sanitizeUrl(`${BASE}/prepare?alice@example.com=1&a1b2`, BASE)).toBe("/prepare?[key]");
   });

   it("reduces a credential-bearing cross-site redirect to an allowlisted origin, template and keys", () => {
      const location = `https://project.supabase.co/auth/v1/verify?token=pkce-code-0123456789&type=magiclink&redirect_to=${encodeURIComponent(`${BASE}/auth/callback`)}#refresh_token=x`;
      expect(sanitizeUrl(location, BASE)).toBe("https://project.supabase.co/auth/v1/verify?redirect_to&token&type");
      expect(sanitizeUrl(`https://user:s3cr3t-password@tracker.example.com/u/${SECRETS[0]}`, BASE)).toBe("[other-origin]/[id]/[id]");
   });

   it("keeps only timing and cache headers, sanitizes Location and omits unsafe header values", () => {
      const headers = {
         "cache-control": "private, no-store",
         "server-timing": "git;dur=180",
         vary: "x-user=person@example.com",
         location: `/auth/callback?code=${SECRETS[2]}&next=%2Fprepare%2Fanswers%2Fa1b2`,
         "set-cookie": `sb-session=${SECRETS[1]}; HttpOnly`,
         cookie: `sb-session=${SECRETS[1]}`,
         authorization: `Bearer ${SECRETS[0]}`,
         "x-user-email": SECRETS[3],
      };
      const kept = sanitizeHeaders(headers, BASE);
      expect(kept).toEqual({ "cache-control": "private, no-store", "server-timing": "git;dur=180", vary: "[omitted]", location: "/auth/callback?code&next" });
      for (const name of ["cookie", "set-cookie", "authorization"]) expect(KEEP_HEADERS).not.toContain(name);
      expect(leaks(kept)).toEqual([]);
   });

   it("turns an error into a fixed label; its message, URL and page text are never kept", () => {
      expect(errorKind(new Error(`page.goto: net::ERR_CONNECTION_REFUSED at ${BASE}/prepare/answers/alice@example.com`))).toBe("net::ERR_CONNECTION_REFUSED");
      expect(errorKind(new Error("Timeout 20000ms exceeded waiting for Tell me about the time I was fired from Acme"))).toBe("timeout");
      expect(errorKind("Error: something about person@example.com")).toBe("other");
   });

   it("safeOutput drops headings and unknown keys, omits unsafe strings and URL-shaped leaks, and keeps timings", () => {
      const record = {
         journeys: [
            {
               id: "J4",
               runs: [
                  {
                     run: 1,
                     from: `/prepare/answers/alice@example.com`,
                     clicked: "/lessons/[slug]",
                     error: "Error: person@example.com",
                     forward: {
                        navigationType: "client-transition",
                        clickToContentMs: 412,
                        clickToPendingMs: 14,
                        timedOut: false,
                        contentH1: "Tell me about the time I was fired from Acme",
                        contentHeadingChanged: true,
                        requestCount: 7,
                        navRequests: [{ url: `/login?next=/prepare/answers/a1b2`, status: 200, ttfbMs: 40 }],
                        serverApiCalls: [{ path: "/catalog/items/lesson/[slug]", status: 200, startMs: 3, endMs: 260, email: SECRETS[3] }],
                     },
                  },
               ],
            },
         ],
         questionTitle: SECRETS[8],
         session: SECRETS[0],
      };
      const out = safeOutput(record) as { journeys: { runs: { from: string; clicked: string; error: string; forward: Record<string, unknown> }[] }[] };
      const run = out.journeys[0].runs[0];
      expect(run.from).toBe("/prepare/answers/[id]");
      expect(run.clicked).toBe("/lessons/[slug]");
      expect(run.error).toBe("[omitted]");
      expect(run.forward).not.toHaveProperty("contentH1");
      expect(run.forward).toMatchObject({ navigationType: "client-transition", clickToContentMs: 412, clickToPendingMs: 14, timedOut: false, contentHeadingChanged: true, requestCount: 7 });
      expect(run.forward.navRequests).toEqual([{ url: "/login?next", status: 200, ttfbMs: 40 }]);
      expect(run.forward.serverApiCalls).toEqual([{ path: "/catalog/items/lesson/[slug]", status: 200, startMs: 3, endMs: 260 }]);
      expect(out).not.toHaveProperty("questionTitle");
      expect(out).not.toHaveProperty("session");
      expect(leaks(out)).toEqual([]);
   });

   it("console lines carry only safe values", () => {
      const line = safeLine`local J4 run ${1}: ERROR ${"person@example.com"} at ${"/prepare/answers/a1b2?code=pkce-code-0123456789"} content=${412}`;
      expect(line).toBe("local J4 run 1: ERROR [omitted] at [omitted] content=412");
      expect(safeString(SECRETS[0])).toBe("[omitted]");
      expect(safeString("0123456789abcdef0123456789abcdef0")).toBe("[omitted]");
   });

   it("never echoes unparseable input", () => {
      expect(sanitizeUrl("http://[bad", undefined)).toBe("<unparseable>");
   });

   // v3.1: the output boundary itself anonymizes, even when a caller skipped sanitizeUrl.
   const RAW = {
      email: "/prepare/answers/alice@example.com",
      shortId: "/prepare/answers/a1b2",
      opaque: "/session/3f2504e0-4f89-11d3-9a0c-0305e82c3301/x/0123456789abcdef0123456789abcdef",
      title: "/prepare/stories/Tell me about the time I was fired from Acme",
      encodedTitle: `/prepare/stories/${encodeURIComponent("Tell me about the time I was fired from Acme")}`,
      query: "/login?next=%2Fprepare%2Fanswers%2Fa1b2&person%40example.com=1#access_token=sb-access-token-value",
      absolute: "https://user:s3cr3t-password@interviewnotes.io/prepare/answers/a1b2?code=pkce-code-0123456789",
      otherSite: "https://tracker.example.com/u/person@example.com",
      relative: "prepare/answers/a1b2",
   };

   it("anonymizes every URL and path key at the boundary, whatever the caller passed", () => {
      const urlKeys = ["url", "path", "from", "clicked", "finalPath", "contentPath", "redirectedTo", "location", "base"];
      for (const [label, raw] of Object.entries(RAW)) {
         const record = Object.fromEntries(urlKeys.map((k) => [k, raw]));
         const out = safeOutput({ journeys: [{ runs: [{ source: record, forward: { navRequests: [{ url: raw }], serverApiCalls: [{ path: raw }] } }] }] });
         expect(leaks(out), label).toEqual([]);
         for (const fragment of ["a1b2", "alice", "person", "Acme", "fired", "3f2504e0", "0123456789abcdef"]) expect(JSON.stringify(out), `${label}: ${fragment}`).not.toContain(fragment);
      }
      expect(anonymizeUrlField(RAW.shortId)).toBe("/prepare/answers/[id]");
      expect(anonymizeUrlField(RAW.query)).toBe("/login?[key]&next");
      expect(anonymizeUrlField(RAW.absolute)).toBe("https://interviewnotes.io/prepare/answers/[id]?code");
      expect(anonymizeUrlField(RAW.otherSite)).toBe("[other-origin]/[id]/[id]");
      expect(anonymizeUrlField(RAW.relative)).toBe("/prepare/answers/[id]");
   });

   it("is idempotent on already-sanitized values, so correct output passes unchanged", () => {
      for (const clean of ["/lessons/[slug]?_rsc", "/_next/static/chunks/[asset]", "/catalog/items/lesson/[slug]/related", "https://project.supabase.co/auth/v1/verify?redirect_to&token&type", "[other-origin]/[id]", "/", "<unparseable>", "/login?[key]&next"]) {
         expect(anonymizeUrlField(clean)).toBe(clean);
         if (clean.startsWith("/")) expect(sanitizeUrl(clean, BASE)).toBe(clean);
      }
   });

   it("lets a private title or id through no free-text, label or console path", () => {
      const title = SECRETS[8];
      const out = safeOutput(
         {
            tool: "rsp-measure",
            env: title,
            label: "local-v3",
            journeys: [{ id: title, name: title, kind: title, notExercised: `no visible link matching ${title}`, runs: [{ selector: title, error: title, forward: { navigationType: title, pendingKind: title, navigationTypes: [title], clickToContentMs: 120, requestCount: 6 } }] }],
            warmup: { note: title, status: title, wallMs: 40 },
         },
         { constants: ["rsp-measure", "Track detail -> Lesson"] },
      ) as Record<string, unknown>;
      expect(leaks(out)).toEqual([]);
      expect(JSON.stringify(out)).not.toContain("Acme");
      expect(out).toMatchObject({ tool: "rsp-measure", env: "[omitted]", label: "local-v3", warmup: { wallMs: 40 } });
      expect(JSON.stringify(out)).toContain('"clickToContentMs":120');
      expect(JSON.stringify(out)).toContain('"requestCount":6');
      expect(safeOutput({ journeys: [{ name: "Track detail -> Lesson" }] }, { constants: ["Track detail -> Lesson"] })).toEqual({ journeys: [{ name: "Track detail -> Lesson" }] });
      expect(safeField("name", title, [])).toBe("[omitted]");
      expect(safeField("error", "timeout")).toBe("timeout");
      expect(safeLine`ERROR at ${"/prepare/answers/a1b2"} for ${"see /prepare/stories/a1b2 now"}`).toBe("ERROR at /prepare/answers/[id] for see /prepare/stories/[id] now");
   });

   it("keeps timings, statuses and counts exactly", () => {
      const forward = { navigationType: "client-transition", clickToFeedbackMs: 13, clickToPendingMs: 12, clickToContentMs: 590, clickToUsableMs: 599, timedOut: false, requestCount: 6, requestsByType: { fetch: 2, script: 4 }, longTasks: { count: 1, totalMs: 76, maxMs: 76 }, serverApiCalls: [{ path: "/catalog/items/lesson/catalog-e2e-free", status: 200, startMs: 9, endMs: 260 }] };
      expect(safeOutput({ journeys: [{ runs: [{ run: 1, forward }] }] })).toEqual({ journeys: [{ runs: [{ run: 1, forward: { ...forward, serverApiCalls: [{ path: "/catalog/items/lesson/[slug]", status: 200, startMs: 9, endMs: 260 }] } }] }] });
   });

   it("detects a redirect by comparing raw paths before templating, never an ordinary dynamic page", () => {
      expect(redirectTarget("/lessons/catalog-e2e-free", `${BASE}/lessons/catalog-e2e-free`, BASE)).toBeNull();
      expect(redirectTarget("/tracks/catalog-e2e-home?x=1", `${BASE}/tracks/catalog-e2e-home#top`, BASE)).toBeNull();
      expect(redirectTarget("/prepare/answers/a1b2", `${BASE}/login?next=%2Fprepare%2Fanswers%2Fa1b2`, BASE)).toBe("/login");
      expect(redirectTarget("/lessons/old-slug", `${BASE}/lessons/new-slug`, BASE)).toBe("/lessons/[slug]");
      expect(redirectTarget("/prepare", `${BASE}/prepare/answers/alice@example.com`, BASE)).toBe("/prepare/answers/[id]");
   });
});
