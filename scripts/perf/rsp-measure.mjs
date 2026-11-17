// P8-RSP-01 diagnostic, never shipped: click-to-content latency for App Router navigations, headless only.
//
//   node scripts/perf/rsp-measure.mjs --env local --base http://127.0.0.1:3210 --runs 5 --out results.json
//        [--journeys J1,J2] [--proxy http://127.0.0.1:3213] [--label text]
//
// Each run opens a fresh headless context (empty browser cache), loads the journey's source page, waits for it
// to settle (so any automatic prefetch has had its chance), then clicks the first visible link that matches the
// journey and times, from the click event's own timestamp:
//   feedback  first URL change or first DOM mutation in <body> after the click
//   content   the path matches the destination and a visible <h1> differs from the source page's <h1>
//   usable    content, then two animation frames and one macrotask ran (the main thread is free)
//   pending   (P8-RSP-02) the first animation frame in which a `[data-nav-pending]` element exists: a link's pending
//             hint (`data-nav-pending="link"`) or a route's loading boundary (`data-nav-pending="route"`). Never a
//             heading, so it can never be counted as content.
// --hover-ms n (P8-RSP-02) hovers the link for n ms before clicking, to model a reader's pointer lead time; requests
// and frontend-server API calls made during the hover are recorded separately (requestsDuringHover, serverCallsDuringHover).
// It also records every request after the click (path + query KEYS only, type, status, timing phases, transfer
// size and the cache/timing headers listed in KEEP_HEADERS), long tasks, and whether the click caused a full
// document load. No cookie, authorization header, body or query value is stored. Signed out only.
// P8-RSP-02 v3: nothing the page shows is stored (the heading is compared in the page and only a boolean comes
// back), paths are route templates, errors are fixed labels, and the results file and every console line pass
// safeOutput / safeLine in rsp-sanitize.mjs (tested in tests/leak/rsp-sanitize.test.ts).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { errorKind, redirectTarget, safeField, safeLine, safeOutput, sanitizeHeaders, sanitizePath, sanitizeUrl } from "./rsp-sanitize.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = Object.fromEntries(
   process.argv.slice(2).reduce((pairs, token, i, all) => (token.startsWith("--") ? [...pairs, [token.slice(2), all[i + 1]]] : pairs), [])
);
const BASE = (args.base ?? "").replace(/\/$/, "");
const ENV = args.env ?? "unknown";
const RUNS = Number(args.runs ?? 3);
const OUT = args.out;
const PROXY = args.proxy ?? null; // local latency proxy (rsp-latency-proxy.mjs) for server-side call logs
const ONLY = args.journeys ? new Set(args.journeys.split(",")) : null;
const SETTLE_MS = Number(args.settle ?? 1500);
const HOVER_MS = Number(args["hover-ms"] ?? 0);
const TIMEOUT_MS = 20000;
if (!BASE || !OUT) {
   console.error("usage: rsp-measure.mjs --env <name> --base <origin> --out <file.json> [--runs n] [--journeys ids] [--proxy origin]");
   process.exit(2);
}
const UA = "Mozilla/5.0 (P8-RSP-01/02 responsiveness audit; read-only; headless)";

// Journeys. `from` is a path or a { journey, pick } reference to a link found on an earlier source page, so no
// slug is invented: every destination is a link the deployed page itself renders.
const JOURNEYS = [
   { id: "J1", name: "Homepage -> Tracks", from: ["/"], link: ['a[href="/tracks"]', 'a[href="/#tracks"]'] },
   { id: "J2", name: "Tracks -> Track detail", from: ["/tracks", "/"], link: ['main a[href^="/tracks/"]', 'a[href^="/tracks/"]'] },
   { id: "J3", name: "Track detail -> Lesson", from: [{ discover: "/tracks", or: "/", link: 'main a[href^="/tracks/"]' }], link: ['main a[href^="/lessons/"]'] },
   {
      id: "J4",
      name: "Lesson -> adjacent Lesson/Problem",
      from: [{ discover: "track-lesson" }],
      link: ['a[aria-label^="Next lesson"]', 'main a[href^="/problems/"]', 'main a[href^="/lessons/"]'],
   },
   { id: "J5", name: "Homepage -> Prepare (signed out)", from: ["/"], link: ['a[href="/prepare"]'], destPath: /^\/(prepare|login)/ },
   { id: "J6", name: "Homepage -> Pricing", from: ["/"], link: ['a[href="/pricing"]'] },
   { id: "J7", name: "Back / forward (Track <-> Lesson)", kind: "history", from: [{ discover: "/tracks", or: "/", link: 'main a[href^="/tracks/"]' }], link: ['main a[href^="/lessons/"]'] },
   // P8-RSP-02: the two intent-prefetch links, on the e2e fixture Track that has a Start link and a Next lesson (local only).
   { id: "J9", name: "Track Start -> first Lesson (RSP-02 intent link; local fixture)", from: ["/tracks/catalog-e2e-home"], link: ['a[aria-describedby="track_start_note"]'] },
   { id: "J10", name: "Lesson -> Next lesson (RSP-02 intent link; local fixture)", from: ["/lessons/catalog-e2e-free"], link: ['a[aria-label^="Next lesson"]'] },
   { id: "J8", name: "Repeat visit (Track -> Lesson, back, same Lesson again)", kind: "repeat", from: [{ discover: "/tracks", or: "/", link: 'main a[href^="/tracks/"]' }], link: ['main a[href^="/lessons/"]'] },
];

// P8-RSP-02 v3.1: the only free text the results file may carry under `name`, `selector`, `notExercised`, `note`,
// `profile` and `tool` (safeOutput omits any other string there, e.g. a page title).
const TOOL = "P8-RSP-01 rsp-measure.mjs";
const PROFILE = "desktop 1280x900, headless Chromium, no throttling, signed out";
const WARMUP_NOTE = "first request of this run; not claimed cold or warm on the server";
const UNRESOLVED = "source page could not be resolved from deployed links";
const noLink = (journey) => `no visible link matching ${journey.link.join(" | ")}`;
const CONSTANTS = [TOOL, PROFILE, WARMUP_NOTE, UNRESOLVED, ...JOURNEYS.flatMap((j) => [j.name, noLink(j), ...j.link])];

// P8-RSP-02 v2: one sanitizer for everything written to disk (rsp-sanitize.mjs; tested in tests/leak/rsp-sanitize.test.ts).
const sanitize = (raw) => sanitizeUrl(raw, BASE);

// In every document: long tasks and a navigation monitor the harness arms just before a click.
const INIT = () => {
   window.__rspLT = [];
   try {
      new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__rspLT.push({ start: performance.timeOrigin + e.startTime, dur: e.duration }))).observe({ type: "longtask", buffered: true });
   } catch {}
   const wrap = (name) => {
      const original = history[name];
      history[name] = function (...a) {
         const r = original.apply(this, a);
         if (window.__rsp && !window.__rsp.urlChange) window.__rsp.urlChange = performance.timeOrigin + performance.now();
         return r;
      };
   };
   wrap("pushState");
   wrap("replaceState");
   window.addEventListener("popstate", () => {
      if (window.__rsp && !window.__rsp.urlChange) window.__rsp.urlChange = performance.timeOrigin + performance.now();
   });
};

// Armed in the page right before the action; resolves timestamps in epoch ms (performance.timeOrigin based).
const ARM = ({ sourceH1, destPathSource }) => {
   const destPath = new RegExp(destPathSource);
   const now = () => performance.timeOrigin + performance.now();
   const state = (window.__rsp = { docToken: Math.random().toString(36).slice(2), click: null, urlChange: null, mutation: null, pending: null, pendingKind: null, content: null, usable: null, contentPath: null });
   window.__rspDoc = state.docToken;
   document.addEventListener("click", (e) => { if (!state.click) state.click = performance.timeOrigin + e.timeStamp; }, { capture: true, once: true });
   new MutationObserver(() => { if (state.click && !state.mutation) state.mutation = now(); }).observe(document.body, { childList: true, subtree: true, characterData: true });
   // The destination's main heading: its first visible <h1>, or its first visible <h2> when it has no <h1>.
   const visibleH1 = () => ["h1", "h2"].map((tag) => [...document.querySelectorAll(tag)].find((h) => { const r = h.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(h).visibility !== "hidden"; })).find(Boolean);
   const tick = () => {
      if (state.click && !state.pending) {
         const marker = document.querySelector("[data-nav-pending]");
         if (marker) { state.pending = now(); state.pendingKind = marker.getAttribute("data-nav-pending"); }
      }
      if (!state.content) {
         const h1 = visibleH1();
         const text = h1?.textContent?.trim() ?? "";
         if (destPath.test(location.pathname) && h1 && text !== sourceH1) {
            state.content = now();
            state.contentPath = location.pathname;
            requestAnimationFrame(() => requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => { state.usable = now(); }; ch.port2.postMessage(0); }));
         }
      }
      if (!state.usable) requestAnimationFrame(tick);
   };
   requestAnimationFrame(tick);
};

function percentile(values, p) {
   const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
   if (!v.length) return null;
   const idx = (v.length - 1) * p;
   const lo = Math.floor(idx);
   return Math.round(v[lo] + (v[Math.min(lo + 1, v.length - 1)] - v[lo]) * (idx - lo));
}
const summary = (values) => ({ n: values.filter(Number.isFinite).length, median: percentile(values, 0.5), p75: percentile(values, 0.75), worst: percentile(values, 1), best: percentile(values, 0) });

async function firstVisible(page, selectors) {
   for (const selector of selectors) {
      const handles = await page.$$(selector);
      for (const h of handles) {
         const href = await h.getAttribute("href");
         // A link to the page already shown (an outline's current entry, an in-page #anchor) is not a navigation.
         if (!href || href.startsWith("#") || new URL(href, page.url()).pathname === new URL(page.url()).pathname) continue;
         if (await h.isVisible()) return { selector, href, handle: h };
      }
   }
   return null;
}

async function proxyCall(method, path) {
   if (!PROXY) return null;
   const r = await fetch(PROXY + path, { method });
   return r.json();
}

// One row per request, created synchronously on `request` (wall clock), so a streamed RSC fetch that the router
// later cancels (Playwright reports it as ERR_ABORTED) still has its start and response-headers times.
function attachNetwork(page) {
   const rows = [];
   const byReq = new Map();
   page.on("request", (req) => {
      const h = req.headers();
      const row = { url: sanitize(req.url()), type: req.resourceType(), method: req.method(), rsc: h["rsc"] === "1" || /[?&]_rsc/.test(sanitize(req.url())), prefetch: Boolean(h["next-router-prefetch"]), start: Date.now(), status: null, headersAt: null, end: null, ttfb: null, transfer: null, headers: {} };
      byReq.set(req, row);
      rows.push(row);
   });
   page.on("response", async (res) => {
      const row = byReq.get(res.request());
      if (!row) return;
      row.headersAt = Date.now();
      row.status = res.status();
      try {
         const headers = await res.allHeaders();
         row.headers = sanitizeHeaders(headers, BASE);
      } catch {}
   });
   page.on("requestfinished", async (req) => {
      const row = byReq.get(req);
      if (!row) return;
      row.end = Date.now();
      try {
         const t = req.timing();
         if (t.responseStart >= 0 && t.requestStart >= 0) row.ttfb = Math.round(t.responseStart - t.requestStart);
         const sizes = await req.sizes();
         row.transfer = sizes.responseBodySize + sizes.responseHeadersSize;
      } catch {}
   });
   page.on("requestfailed", (req) => {
      const row = byReq.get(req);
      if (!row) return;
      row.end = Date.now();
      row.failed = req.failure()?.errorText ?? "failed";
   });
   return rows;
}

async function settle(page) {
   await page.waitForLoadState("load");
   await page.waitForTimeout(SETTLE_MS);
}

async function measureAction(page, rows, action, { sourceH1, destPath }) {
   await page.evaluate(ARM, { sourceH1, destPathSource: destPath.source });
   const before = rows.length;
   const docBefore = await page.evaluate(() => window.__rspDoc);
   const actionStart = Date.now();
   if (PROXY) await proxyCall("DELETE", "/__rsp/log");
   await action();
   let fullReload = false;
   try {
      await page.waitForFunction(() => window.__rsp && window.__rsp.usable, null, { timeout: TIMEOUT_MS, polling: 50 });
   } catch {
      // A full document load drops the armed monitor; the new document's own timings are used instead.
      fullReload = (await page.evaluate(() => window.__rspDoc).catch(() => null)) !== docBefore;
   }
   await page.waitForTimeout(600); // let trailing requests finish so they are attributed to this navigation
   const s = await page.evaluate(() => ({ ...(window.__rsp ?? {}), doc: window.__rspDoc ?? null, lt: window.__rspLT ?? [], nav: performance.getEntriesByType("navigation")[0]?.toJSON?.() ?? null, timeOrigin: performance.timeOrigin }));
   if (s.doc !== docBefore) fullReload = true;
   const click = s.click ?? actionStart;
   const after = rows.slice(before).filter((r) => r.start >= click - 50);
   const rel = (t) => (t ? Math.round(t - click) : null);
   let feedback = [s.urlChange, s.mutation, s.content].filter(Boolean);
   let content = s.content;
   let usable = s.usable;
   if (fullReload && s.nav) {
      const fcp = await page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null);
      feedback = [s.timeOrigin + (fcp ?? s.nav.responseStart)];
      content = s.timeOrigin + (fcp ?? s.nav.domContentLoadedEventEnd);
      usable = s.timeOrigin + s.nav.loadEventEnd;
   }
   const navRequests = after.filter((r) => r.type === "document" || (r.rsc && !r.prefetch));
   const longTasks = (s.lt ?? []).filter((l) => l.start >= click && l.start <= (usable ?? click + TIMEOUT_MS));
   const serverCalls = PROXY ? await proxyCall("GET", "/__rsp/log") : null;
   return {
      navigationType: fullReload ? "full-document-load" : "client-transition",
      clickToFeedbackMs: feedback.length ? rel(Math.min(...feedback)) : null,
      clickToUrlChangeMs: rel(s.urlChange),
      clickToPendingMs: rel(s.pending),
      pendingKind: s.pendingKind ?? null,
      // P8-RSP-02 feedback: the named pending marker, or the content itself when it came first. Never a stray mutation.
      clickToMarkedFeedbackMs: [s.pending, content].filter(Boolean).length ? rel(Math.min(...[s.pending, content].filter(Boolean))) : null,
      clickToFirstMutationMs: rel(s.mutation),
      clickToContentMs: rel(content),
      clickToUsableMs: rel(usable),
      timedOut: !content,
      contentPath: s.contentPath ? sanitizePath(s.contentPath) : null,
      contentHeadingChanged: Boolean(s.content),
      navRequests: navRequests.map((r) => ({ url: r.url, type: r.type, status: r.status, startMs: rel(r.start), headersMs: rel(r.headersAt), ttfbMs: r.ttfb, endMs: rel(r.end), transfer: r.transfer, streamCancelled: r.failed ? errorKind(r.failed) : null, headers: r.headers })),
      requestCount: after.length,
      requestsByType: after.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] ?? 0) + 1 }), {}),
      scriptRequests: after.filter((r) => r.type === "script").map((r) => ({ url: r.url, startMs: rel(r.start), endMs: rel(r.end), transfer: r.transfer })),
      prefetchAfterClick: after.filter((r) => r.prefetch).length,
      failed: after.filter((r) => r.failed && !(r.rsc && r.failed === "net::ERR_ABORTED")).map((r) => ({ url: r.url, error: errorKind(r.failed) })),
      longTasks: { count: longTasks.length, totalMs: Math.round(longTasks.reduce((a, l) => a + l.dur, 0)), maxMs: Math.round(Math.max(0, ...longTasks.map((l) => l.dur))) },
      serverApiCalls: serverCalls ? serverCalls.map((c) => ({ path: sanitize(c.path), status: c.status, startMs: rel(c.start), endMs: rel(c.end) })) : undefined,
   };
}

async function openSource(browser, from) {
   const context = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } });
   await context.addInitScript(INIT);
   const page = await context.newPage();
   const rows = attachNetwork(page);
   const loadStart = Date.now();
   const response = await page.goto(BASE + from, { waitUntil: "domcontentloaded", timeout: 60000 });
   await settle(page);
   const nav = await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.toJSON?.());
   const prefetchBeforeClick = rows.filter((r) => r.prefetch).map((r) => ({ url: r.url, status: r.status, headers: r.headers }));
   const sourceH1 = await page.evaluate(() => (document.querySelector("h1") ?? document.querySelector("h2"))?.textContent?.trim() ?? "");
   return {
      context, page, rows, sourceH1,
      finalUrl: page.url(), // raw, in memory only: compared before templating (redirectTarget), never written
      source: {
         path: sanitize(from), finalPath: sanitizePath(new URL(page.url()).pathname), status: response?.status() ?? null,
         documentTtfbMs: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
         documentLoadMs: nav ? Math.round(nav.loadEventEnd) : null, wallLoadMs: Date.now() - loadStart,
         documentHeaders: sanitizeHeaders(response?.headers() ?? {}, BASE),
         prefetchBeforeClick,
      },
   };
}

async function resolveFrom(browser, journey, discovered) {
   for (const from of journey.from) {
      if (typeof from === "string") return from;
      if (from.discover === "track-lesson") return discovered.lessonHref ?? null;
      if (discovered.trackHref) return discovered.trackHref;
      for (const path of [from.discover, from.or]) {
         const { context, page } = await openSource(browser, path);
         const link = await firstVisible(page, [from.link]);
         await context.close();
         if (link?.href) return (discovered.trackHref = link.href);
      }
   }
   return null;
}

async function runJourney(browser, journey, discovered, run) {
   const from = await resolveFrom(browser, journey, discovered);
   if (!from) return { run, notExercised: UNRESOLVED };
   const { context, page, rows, sourceH1, source, finalUrl } = await openSource(browser, from);
   try {
      // v3.1: raw requested path vs raw final path (v3 compared a template with a raw path, so every dynamic page
      // was marked redirected). Only the target's template is kept.
      const redirectedTo = redirectTarget(from, finalUrl, BASE);
      if (redirectedTo) source.redirectedTo = redirectedTo;
      const link = await firstVisible(page, journey.link);
      if (!link) return { run, from: sanitizeUrl(from, BASE), source, notExercised: noLink(journey) };
      if (journey.id === "J3" && !discovered.lessonHref) discovered.lessonHref = link.href;
      const destPath = journey.destPath ?? new RegExp(`^${link.href.split(/[?#]/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
      const result = { run, from: sanitizeUrl(from, BASE), clicked: sanitizeUrl(link.href, BASE), selector: link.selector, source };
      if (HOVER_MS > 0) {
         if (PROXY) await proxyCall("DELETE", "/__rsp/log");
         const hoverFrom = rows.length;
         await link.handle.hover();
         await page.waitForTimeout(HOVER_MS);
         result.hoverMs = HOVER_MS;
         result.requestsDuringHover = rows.slice(hoverFrom).map((r) => ({ url: r.url, type: r.type, prefetch: r.prefetch ?? null, status: r.status ?? null }));
         result.serverCallsDuringHover = PROXY ? (await proxyCall("GET", "/__rsp/log")).map((c) => ({ path: sanitize(c.path), status: c.status })) : null;
      }
      result.forward = await measureAction(page, rows, () => link.handle.click(), { sourceH1, destPath });
      if (journey.kind === "history" || journey.kind === "repeat") {
         const destH1 = await page.evaluate(() => (document.querySelector("h1") ?? document.querySelector("h2"))?.textContent?.trim() ?? "");
         const srcPath = new RegExp(`^${new URL(BASE + from).pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
         result.back = await measureAction(page, rows, () => page.goBack({ waitUntil: "commit" }), { sourceH1: destH1, destPath: srcPath });
         if (journey.kind === "history") {
            result.historyForward = await measureAction(page, rows, () => page.goForward({ waitUntil: "commit" }), { sourceH1, destPath });
         } else {
            await page.waitForTimeout(500);
            const again = await firstVisible(page, [`main a[href="${link.href}"]`, ...journey.link]);
            if (again) result.repeat = await measureAction(page, rows, () => again.handle.click(), { sourceH1, destPath });
         }
      }
      return result;
   } finally {
      await context.close();
   }
}

const browser = await chromium.launch({ headless: true });
const started = new Date().toISOString();
const warmup = await (async () => {
   const t = Date.now();
   const r = await fetch(BASE + "/", { headers: { "user-agent": UA } }).catch((e) => ({ status: errorKind(e) }));
   return { path: "/", status: r.status, wallMs: Date.now() - t, note: WARMUP_NOTE };
})();
const discovered = {};
const journeys = [];
for (const journey of JOURNEYS) {
   if (ONLY && !ONLY.has(journey.id)) continue;
   const runs = [];
   for (let run = 1; run <= RUNS; run++) {
      const r = await runJourney(browser, journey, discovered, run).catch((e) => ({ run, error: errorKind(e) }));
      runs.push(r);
      const f = r.forward;
      console.log(
         r.notExercised ? safeLine`${safeField("env", ENV)} ${journey.id} run ${run}: NOT EXERCISED ${safeField("notExercised", r.notExercised, CONSTANTS)}`
         : r.error ? safeLine`${safeField("env", ENV)} ${journey.id} run ${run}: ERROR ${safeField("error", r.error)}`
         : safeLine`${safeField("env", ENV)} ${journey.id} run ${run}: ${safeField("navigationType", f.navigationType)} feedback=${f.clickToFeedbackMs ?? "-"} pending=${f.clickToPendingMs ?? "-"} content=${f.clickToContentMs ?? "-"} usable=${f.clickToUsableMs ?? "-"} back=${r.back?.clickToContentMs ?? "-"} fwd=${r.historyForward?.clickToContentMs ?? "-"} repeat=${r.repeat?.clickToContentMs ?? "-"}`
      );
      if (r.notExercised) break;
   }
   const ok = runs.filter((r) => r.forward);
   const pick = (k, leg = "forward") => ok.map((r) => r[leg]?.[k]).filter((x) => x !== undefined && x !== null);
   const stats = ok.length
      ? Object.fromEntries(
           ["forward", "back", "historyForward", "repeat"]
              .filter((leg) => ok.some((r) => r[leg]))
              .map((leg) => [leg, { feedback: summary(pick("clickToFeedbackMs", leg)), pending: summary(pick("clickToPendingMs", leg)), markedFeedback: summary(pick("clickToMarkedFeedbackMs", leg)), content: summary(pick("clickToContentMs", leg)), usable: summary(pick("clickToUsableMs", leg)), navigationTypes: [...new Set(pick("navigationType", leg))] }])
        )
      : null;
   journeys.push({ id: journey.id, name: journey.name, kind: journey.kind ?? "click", stats, notExercised: runs.find((r) => r.notExercised)?.notExercised ?? null, runs });
}
await browser.close();
writeFileSync(OUT, JSON.stringify(safeOutput({ tool: TOOL, env: ENV, base: BASE, label: args.label ?? null, started, finished: new Date().toISOString(), runsPerJourney: RUNS, settleMs: SETTLE_MS, profile: PROFILE, warmup, journeys }, { constants: CONSTANTS }), null, 2));
console.log("wrote results file");
