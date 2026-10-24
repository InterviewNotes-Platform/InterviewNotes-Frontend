#!/usr/bin/env node
// Headless measurement probe for P3 (dev tool, not a Playwright Test spec). It drives an already running
// production build and fake API, and prints one JSON document on stdout; diagnostics go to stderr.
//
//   node tests/e2e/catalog/probe.mjs <mode>[,<mode>...] --routes /lessons/p3-seq-one,/tracks/p3-sequence
//     [--base http://localhost:3100] [--api http://127.0.0.1:3101]
//     [--viewports 390,768,1024,1440] [--themes light,dark] [--settle 500] [--body-selector <css>] [--identity entitled] [--strict]
//
// Modes: overflow, requests, offset, console, panel, syntax, expand, order, axe, interact, keys, motion, reveal, problem, timing. Add a mode by writing an async function in MODES; no new loop script.
// `requests` reads the fake API's /__catalog-log. The production build caches signed-out catalog reads for 60s, so a route
// whose count is 0 was served from that cache (`cached: true`). `--identity entitled` sends a session, which is never cached: exact counts.
//
// `timing` (P6 S6-PERF-4, -6) records TTFB, FCP, LCP, CLS, JavaScript transferred and request count per load, plus the latency of
// a Module toggle, a Problem reveal, the Track drawer and the soft navigation to the next Lesson (J7) where the route has that control, for every route x profile x condition.
//   node tests/e2e/catalog/probe.mjs timing --routes /,/lessons/p3-seq-one [--runs 10] [--profiles desktop,mobile-slow4g-cpu4x] [--conditions cold,warm]
//   node tests/e2e/catalog/probe.mjs timing --self-check      (local proof: stats, secret handling, origin confinement)
//   Profiles: `desktop` is 1280x900, unthrottled. `mobile-slow4g-cpu4x` is a Pixel 5 (393x727, touch) with 4x CPU slowdown and Slow 4G
//   (150ms latency, 1.6 Mbps down, 750 kbps up). Conditions: `cold` is an empty browser cache; `warm` is a second load after one uncounted priming load.
//   Request count is the requests that reached the network (a resource served from the browser's memory cache is none), plus the document.
//   Every run is kept under `results.timing[].runs`; `summary` has the median and p75 (linear interpolation) of the runs that produced the metric.
//   A metric or interaction the page does not produce is `null` / `not-applicable`, never 0. Interaction latency runs from the click event to the paint after
//   the expected state shows (within a frame). `--runs` must be at least 10; `--settle` is the wait after `load` before reading (default 500ms).
//   Runtime configuration stays in the environment, never in source or output: PROBE_BASE (the target, overridden by --base) and PROBE_HEADERS
//   (a JSON object of request headers, e.g. a Cookie for an entitled session). Headers go to the target origin only; any other origin is blocked and counted.
// API latency is measured with curl, not this script (S6-PERF-4):
//   curl -s -o /dev/null -H "Authorization: Bearer $TOKEN" -w 'connect %{time_connect} tls %{time_appconnect} ttfb %{time_starttransfer} total %{time_total}s %{size_download}B\n' "$API/catalog/items/lesson/<slug>"
//   for endpoint in "items/lesson/<slug>" "items/lesson/<slug>/meta" "items/lesson/<slug>/related" "tracks/<slug>"; do curl ... "$API/catalog/$endpoint"; done
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import { chromium, devices } from "@playwright/test";

const PROFILES = {
   desktop: { context: {} },
   "mobile-slow4g-cpu4x": {
      context: devices["Pixel 5"],
      cpuRate: 4,
      network: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
   },
};
const DEFAULTS = {
   base: process.env.PROBE_BASE ?? "http://localhost:3100",
   api: "http://127.0.0.1:3101",
   viewports: "390,768,1024,1440",
   themes: "light,dark",
   settle: "500",
   runs: "10",
   profiles: Object.keys(PROFILES).join(","),
   conditions: "cold,warm",
   // Lesson layout: main > grid > body column > CatalogBody wrapper > first body element.
   "body-selector": "main > div > div:last-child > div > :first-child",
};
const GUTTER_EXPAND = 16;
const HYDRATION = /minified react error #(?:418|419|422|423|425)|hydrat/i;
const list = (value) => value.split(",").map((part) => part.trim()).filter(Boolean);

function parseArgs(argv) {
   const options = { ...DEFAULTS };
   const positional = [];
   for (let index = 0; index < argv.length; index++) {
      const arg = argv[index];
      if (arg === "--strict") options.strict = true;
      else if (arg === "--self-check") options.selfCheck = true;
      else if (arg.startsWith("--")) options[arg.slice(2)] = argv[++index];
      else positional.push(arg);
   }
   return { options, modes: positional.flatMap(list) };
}

/** A fresh page at one viewport and theme (next-themes reads `theme` from localStorage). */
async function open(browser, { width = 1280, height = 900, theme = "light", cookies = [], ...contextOptions } = {}) {
   const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, ...contextOptions });
   await context.addInitScript((value) => localStorage.setItem("theme", value), theme);
   if (cookies.length > 0) await context.addCookies(cookies);
   return { context, page: await context.newPage(), close: () => context.close() };
}

/** The session cookie of a fixture identity, in the shape the e2e harness sends. Signed-in reads are never served from the data cache. */
function identityCookies(config) {
   if (!config.identity) return [];
   const { token, user } = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8")).identities[config.identity];
   const session = { access_token: token, refresh_token: "e2e-unused-refresh-token", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user };
   return [{ name: "sb-127-auth-token", value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url: config.base }];
}

/** Loads a route and returns its status and the console errors raised while it settled. */
async function visit(page, config, route) {
   const errors = [];
   const onConsole = (message) => void (message.type() === "error" && errors.push(message.text()));
   const onError = (error) => void errors.push(error.message);
   page.on("console", onConsole);
   page.on("pageerror", onError);
   const response = await page.goto(new URL(route, config.base).href, { waitUntil: "load" });
   await page.waitForTimeout(Number(config.settle));
   page.off("console", onConsole);
   page.off("pageerror", onError);
   return { status: response?.status() ?? null, errors };
}

async function catalogLog(config) {
   return (await fetch(new URL("/__catalog-log", config.api))).json();
}

/** The kind of catalog request. Only `item_read` fetches an item body, which is a Git read in the backend. */
function kindOf(path) {
   if (path === "/catalog/tracks") return "track_list";
   if (path.startsWith("/catalog/tracks/")) return "track_outline";
   if (path === "/catalog/items") return "item_list";
   if (path.endsWith("/meta")) return "item_meta";
   if (path.endsWith("/related")) return "item_related";
   return "item_read";
}

/** Tabs through the page and describes every stop, so order, names and focus indicators can be read back. Ends at the footer. */
async function tabOrder(page, limit = 200) {
   await page.evaluate(() => (window.scrollTo(0, 0), document.activeElement?.blur()));
   const stops = [];
   for (let index = 0; index < limit; index++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(250); // links transition their outline in, so read the indicator once it has settled
      const stop = await page.evaluate(() => {
         const element = document.activeElement;
         if (!element || element === document.body || element === document.documentElement) return null;
         const box = element.getBoundingClientRect();
         const style = getComputedStyle(element);
         const region = element.closest("[data-catalog-body]") ? "body" : element.closest("header") ? "header" : element.closest("footer") ? "footer" : element.closest("main") ? "main" : "other";
         return {
            tag: element.tagName.toLowerCase(),
            region,
            name: (element.getAttribute("aria-label") ?? element.textContent).trim().replace(/\s+/g, " ").slice(0, 70),
            tabindex: element.getAttribute("tabindex"),
            visible: box.width > 0 && box.height > 0,
            // The ring may be drawn by a container (`has-[a:focus-visible]`), so the element and its nearest ancestors are both checked.
            ...(() => {
               const rings = [element, ...Array.from({ length: 3 }).reduce((chain) => [...chain, (chain.at(-1) ?? element).parentElement], [])].filter(Boolean);
               const drawn = rings.find((node) => { const s = getComputedStyle(node); return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (node === element && s.boxShadow !== "none"); });
               return { indicator: !!drawn, focusStyle: drawn ? (drawn === element ? "self" : `ancestor <${drawn.tagName.toLowerCase()}>`) : `outline ${style.outlineStyle} ${style.outlineWidth} / shadow ${style.boxShadow === "none" ? "none" : "set"}` };
            })(),
         };
      });
      if (!stop) break;
      stops.push(stop);
      if (stop.region === "footer") break;
   }
   return stops;
}

/** Cookies, storage and IndexedDB of the page's origin, as sorted strings, so two snapshots can be compared exactly. */
async function learnerState(context, page) {
   const cookies = (await context.cookies()).map(({ name, domain, path, value }) => `${name}@${domain}${path}=${value}`).sort();
   const stored = await page.evaluate(async () => {
      const dump = (store) => Object.keys(store).sort().map((key) => `${key}=${store.getItem(key)}`);
      const idb = [];
      for (const { name } of (await indexedDB.databases?.()) ?? []) {
         idb.push(
            await new Promise((resolve) => {
               const request = indexedDB.open(name);
               request.onerror = () => resolve(`${name}: unreadable`);
               request.onsuccess = () => {
                  const db = request.result;
                  const stores = [...db.objectStoreNames];
                  if (stores.length === 0) return (db.close(), resolve(`${name}: no stores`));
                  const tx = db.transaction(stores, "readonly");
                  const counts = stores.map((store) => new Promise((done) => ((r) => (r.onsuccess = () => done(`${store}:${r.result}`)))(tx.objectStore(store).count())));
                  Promise.all(counts).then((all) => (db.close(), resolve(`${name}: ${all.join(",")}`)));
               };
            })
         );
      }
      return { local: dump(localStorage), session: dump(sessionStorage), idb };
   });
   return { cookies, ...stored };
}

/** The disclosure controls in Chromium's accessibility tree, as a screen reader gets them: role, name and expanded state. */
async function disclosureNodes(session) {
   const { nodes } = await session.send("Accessibility.getFullAXTree");
   return nodes
      .filter((node) => !node.ignored && node.role?.value === "DisclosureTriangle")
      .map((node) => ({ name: node.name?.value ?? "", expanded: node.properties?.find((property) => property.name === "expanded")?.value?.value }));
}

/** The visible headings of `main` in reading order, with the level jumps downward between structural headings (S-AX-1; authored body headings keep their relative levels, S-AX-2) and the headings placed inside a summary (S-RVL-12a). */
const headingOutline = () => {
   const shown = (e) => e.checkVisibility({ visibilityProperty: true }) && e.getClientRects().length > 0;
   const headings = [...document.querySelectorAll("main h1, main h2, main h3, main h4, main h5, main h6")].filter(shown);
   const structural = headings.filter((e) => !e.closest("[data-catalog-body]"));
   const name = (e) => e.textContent.trim().replace(/\s+/g, " ").slice(0, 60);
   return {
      count: headings.length,
      h1: document.querySelectorAll("h1").length,
      h2: headings.filter((e) => e.tagName === "H2").map(name),
      authored: headings.filter((e) => e.closest("[data-catalog-body]")).length,
      skips: structural.flatMap((e, i) => (i > 0 && Number(e.tagName[1]) > Number(structural[i - 1].tagName[1]) + 1 ? [`${structural[i - 1].tagName} ${name(structural[i - 1])} -> ${e.tagName} ${name(e)}`] : [])),
      empty: headings.filter((e) => name(e) === "").length,
      inSummary: headings.filter((e) => e.closest("summary")).length,
   };
};

/** The nine positions a P4 reader knows (spec 4.1); any other position in a spine is not a band. */
const KNOWN_POSITIONS = ["frame", "requirements", "design", "ml_reasoning", "evaluate_and_scale", "depth_and_trade_offs", "follow_ups", "reference_solution", "self_review"];

/**
 * What a route must show for an identity, read from the fixture and the contract's withholding rules, never from the page:
 * `locked` (a fully premium item the caller may not read), `none` (an item with no spine, served as a backend that predates P4),
 * or `staged` with the bands that must exist. An interview stage is listed whenever the document has a section there; a review
 * surface only with a section released to the caller (X-2), so an empty one is expected to be absent.
 */
function expectedStructure(route, identity) {
   const fixture = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
   const slug = route.split("/").pop();
   const item = fixture.items.find((candidate) => candidate.type === "problem" && candidate.slug === slug);
   if (!item) return { kind: "unknown" };
   const entitled = identity === "entitled";
   if (item.access === "premium" && !entitled) return { kind: "locked" };
   if (!Array.isArray(item.spine)) return { kind: "none" };
   const known = item.spine.filter(({ position }) => KNOWN_POSITIONS.includes(position));
   const released = (position) => (item.sections ?? []).some((section) => section.spine_position === position && (entitled || section.access !== "premium"));
   return {
      kind: "staged",
      interview: known.filter(({ kind }) => kind === "interview_stage").map(({ position }) => position),
      review: known.filter(({ kind, position }) => kind === "review_surface" && released(position)).map(({ position }) => position),
   };
}
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

const AREAS = ["cookies", "local", "session", "idb"];
const stateDiff = (a, b) => Object.fromEntries(AREAS.map((area) => [area, { added: b[area].filter((x) => !a[area].includes(x)), removed: a[area].filter((x) => !b[area].includes(x)) }]));
const differs = (diff) => Object.values(diff).some(({ added, removed }) => added.length + removed.length > 0);
const keysOf = (state) => Object.fromEntries(AREAS.map((area) => [area, state[area].map((entry) => (area === "idb" ? entry : entry.split("=")[0]))]));

/** Installed in every page: the longest declared transition or animation under a root, and the running animations longer than 1ms. */
const MOTION_INIT = () => {
   const ms = (text) => Math.max(0, ...text.split(",").map((part) => (parseFloat(part) || 0) * (part.trim().endsWith("ms") ? 1 : 1000)));
   window.__motion = (root) => {
      let declared = 0;
      for (const element of [root, ...root.querySelectorAll("*")]) {
         const style = getComputedStyle(element);
         if (style.transitionProperty !== "none") declared = Math.max(declared, ms(style.transitionDuration) + ms(style.transitionDelay));
         if (style.animationName !== "none") declared = Math.max(declared, ms(style.animationDuration) + ms(style.animationDelay));
      }
      const running = document.getAnimations().filter((a) => a.effect?.target && root.contains(a.effect.target) && a.effect.getComputedTiming().activeDuration > 1).length;
      return { declaredMs: Math.round(declared * 100) / 100, running };
   };
};

/** Credentials that must never reach the output: header values and URL userinfo. Shorter than 4 characters is not a credential and would garble text. */
const secrets = [];
const scrub = (text) => secrets.reduce((clean, secret) => (secret.length < 4 ? clean : clean.split(secret).join("[redacted]")), String(text));
// Only strings are scrubbed, so a numeric measurement can never be rewritten.
const render = (value) => JSON.stringify(value, (_, part) => (typeof part === "string" ? scrub(part) : part), 2);
const pathOf = (route) => route.split(/[?#]/)[0];
const originOf = (url) => {
   try {
      return new URL(url).origin;
   } catch {
      return "[invalid URL]";
   }
};
/** The first line of an error with every URL cut back to origin and path, since Playwright quotes the full URL including its query. */
const errorText = (error) =>
   scrub(error.message.split("\n")[0].replace(/https?:\/\/[^\s"'<>]+/g, (url) => (URL.canParse(url) ? new URL(url).origin + new URL(url).pathname : "[url]"))).slice(0, 200);
const reportOf = (config, routes) => ({ probe: "p3-probe/1", base: originOf(config.base), api: originOf(config.api), routes: routes.map(pathOf), results: {}, findings: 0 });

/** PROBE_HEADERS: a JSON object of request header names to string values. The parser's own message could quote the value, so it is never shown. */
function runtimeHeaders(raw = process.env.PROBE_HEADERS) {
   if (!raw) return {};
   let parsed;
   try {
      parsed = JSON.parse(raw);
   } catch {}
   if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Object.values(parsed).every((value) => typeof value === "string")) {
      throw new Error("PROBE_HEADERS must be a JSON object of header names to string values");
   }
   return parsed;
}

const TIMING_METRICS = ["ttfbMs", "fcpMs", "lcpMs", "cls", "jsTransferredBytes", "requestCount"];
const INTERACTIONS = {
   moduleToggle: (page) => page.locator("main button[aria-expanded]").filter({ hasText: /^Module \d/ }).first(),
   problemReveal: (page) => page.locator("main details[data-reveal] > summary").filter({ visible: true }).first(),
   drawerOpen: (page) => page.getByRole("button", { name: "Track contents" }).first(),
   // J7 (S6-PERF-2): a soft navigation from a Lesson to the next one. It runs last, because it leaves the page it started on.
   nextLesson: (page) => page.getByRole("link", { name: /^Next lesson: / }).first(),
};

/** Linear interpolation between closest ranks (the NumPy default), so the median of an even count is the mean of the middle two. */
function percentile(values, fraction) {
   if (values.length === 0) return null;
   const sorted = values.toSorted((a, b) => a - b);
   const at = (sorted.length - 1) * fraction;
   const low = Math.floor(at);
   return sorted[low] + (sorted[Math.ceil(at)] - sorted[low]) * (at - low);
}
const round = (value) => (value === null ? null : Math.round(value * 1000) / 1000);
const summarize = (values) => ({ n: values.length, median: round(percentile(values, 0.5)), p75: round(percentile(values, 0.75)) });

/** Cumulative Layout Shift as the largest session window: shifts less than 1s apart, a window no longer than 5s. */
function cumulativeShift(shifts) {
   let best = 0;
   let sum = 0;
   let first = 0;
   let last = 0;
   for (const [time, value] of shifts) {
      if (sum > 0 && (time - last > 1000 || time - first > 5000)) sum = 0;
      if (sum === 0) first = time;
      sum += value;
      last = time;
      best = Math.max(best, sum);
   }
   return best;
}

/** Installed in every document: the paint-time and layout-shift entries, and room for every resource entry. */
const TIMING_INIT = () => {
   const state = (window.__timing = { lcp: [], shifts: [], supported: {} });
   performance.setResourceTimingBufferSize(2000);
   const watch = (key, type, collect) => {
      try {
         new PerformanceObserver((entries) => collect(entries.getEntries())).observe({ type, buffered: true });
         state.supported[key] = true;
      } catch {
         state.supported[key] = false;
      }
   };
   watch("lcp", "largest-contentful-paint", (entries) => state.lcp.push(...entries.map((entry) => entry.startTime)));
   watch("cls", "layout-shift", (entries) => state.shifts.push(...entries.filter((entry) => !entry.hadRecentInput).map((entry) => [entry.startTime, entry.value])));
};

const readTimings = () => {
   const nav = performance.getEntriesByType("navigation")[0];
   const fcp = performance.getEntriesByType("paint").find((entry) => entry.name === "first-contentful-paint");
   const scripts = performance.getEntriesByType("resource").filter((entry) => entry.initiatorType === "script" || /\.m?js$/.test(new URL(entry.name).pathname));
   const { lcp, shifts, supported } = window.__timing;
   return {
      path: location.pathname,
      ttfb: nav ? nav.responseStart - nav.startTime : null,
      fcp: fcp ? fcp.startTime : null,
      lcp: lcp.length > 0 ? lcp.at(-1) : null,
      shifts,
      supported,
      jsBytes: scripts.reduce((sum, entry) => sum + entry.transferSize, 0),
   };
};

/** Arms a click timer on the control: the latency is the click event to the frame after the expected state shows. */
const ARM_INTERACTION = (control, kind) => {
   const was = control.getAttribute("aria-expanded");
   const wasPath = location.pathname;
   const wasTitle = document.querySelector("h1")?.textContent;
   // A soft navigation waits for the next Lesson to be rendered by the server, so it gets a longer limit than a local state change.
   const limit = kind === "nextLesson" ? 60000 : 5000;
   const done = {
      moduleToggle: () => control.getAttribute("aria-expanded") !== was && (was === "true" || document.getElementById(control.getAttribute("aria-controls")).checkVisibility()),
      problemReveal: () => control.parentElement.open,
      drawerOpen: () => document.querySelector('[role="dialog"][data-state="open"]')?.checkVisibility() === true,
      nextLesson: () => location.pathname !== wasPath && document.querySelector("h1")?.textContent !== wasTitle && document.querySelector("h1")?.checkVisibility() === true,
   }[kind];
   window.__interaction = new Promise((resolve) => {
      control.addEventListener(
         "click",
         (event) => {
            const check = () => {
               if (done()) requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - event.timeStamp)));
               else if (performance.now() - event.timeStamp < limit) requestAnimationFrame(check);
               else resolve(null);
            };
            check();
         },
         { capture: true, once: true }
      );
   });
};

async function measureInteraction(page, kind) {
   const control = INTERACTIONS[kind](page);
   if (!(await control.isVisible())) return { status: "not-applicable", reason: "control not present on this route and profile" };
   try {
      await control.evaluate(ARM_INTERACTION, kind);
      await control.click({ timeout: 5000 });
      const ms = await page.evaluate(() => window.__interaction);
      return ms === null ? { status: "failed", reason: `expected state not shown within ${kind === "nextLesson" ? 60 : 5}s` } : { status: "measured", ms: round(ms) };
   } catch (error) {
      return { status: "failed", reason: errorText(error) };
   }
}

/** One load of one route in a fresh context. Only the target origin is reachable, and the operator headers are sent to it alone. */
async function timedRun(browser, config, route, profile, condition) {
   const origin = new URL(config.base).origin;
   const { context, page, close } = await open(browser, { cookies: identityCookies(config), ...profile.context });
   try {
      await context.addInitScript(TIMING_INIT);
      const session = await context.newCDPSession(page);
      const traffic = { counting: false, requests: 0, blocked: new Set() };
      await session.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
      session.on("Fetch.requestPaused", async ({ requestId, request }) => {
         const url = new URL(request.url);
         const web = url.protocol === "http:" || url.protocol === "https:";
         const outside = web && url.origin !== origin;
         if (outside) traffic.blocked.add(url.origin);
         else if (web && traffic.counting) traffic.requests++;
         const sent = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !Object.keys(config.headers).some((own) => own.toLowerCase() === name.toLowerCase())));
         const headers = Object.entries({ ...sent, ...config.headers }).map(([name, value]) => ({ name, value }));
         // A request that settles while the context closes rejects here; there is nothing left to continue.
         await (outside ? session.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }) : session.send("Fetch.continueRequest", { requestId, ...(web && { headers }) })).catch(() => {});
      });
      if (profile.cpuRate) await session.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuRate });
      if (profile.network) {
         await session.send("Network.enable");
         await session.send("Network.emulateNetworkConditions", profile.network);
      }
      const load = async () => {
         const response = await page.goto(new URL(route, origin).href, { waitUntil: "load", timeout: 90_000 });
         await page.waitForTimeout(Number(config.settle));
         return response;
      };
      if (condition === "warm") {
         await load();
         await page.goto("about:blank");
      }
      traffic.counting = true;
      const response = await load();
      const read = await page.evaluate(readTimings);
      traffic.counting = false;
      if (read.path !== new URL(response.url()).pathname) throw new Error("measured a different document than the one requested");
      const unavailable = {};
      const value = (key, measured, reason) => (measured === null ? ((unavailable[key] = reason), null) : measured);
      const metrics = {
         ttfbMs: value("ttfbMs", round(read.ttfb), "no navigation timing entry"),
         fcpMs: value("fcpMs", round(read.fcp), "no first-contentful-paint entry"),
         lcpMs: value("lcpMs", round(read.lcp), read.supported.lcp ? "no largest-contentful-paint entry" : "not supported by this browser"),
         cls: value("cls", read.supported.cls ? round(cumulativeShift(read.shifts)) : null, "layout-shift not supported by this browser"),
         jsTransferredBytes: read.jsBytes,
         requestCount: traffic.requests,
      };
      const interactions = {};
      for (const kind of Object.keys(INTERACTIONS)) interactions[kind] = await measureInteraction(page, kind);
      return { status: response.status(), metrics, unavailable, interactions, blockedOrigins: [...traffic.blocked] };
   } finally {
      await close();
   }
}

function summarizeCell(runs) {
   const done = runs.filter((run) => !run.error);
   const metrics = Object.fromEntries(
      TIMING_METRICS.map((key) => {
         const values = done.map((run) => run.metrics[key]).filter((measured) => measured !== null);
         return [key, { ...summarize(values), unavailable: done.length - values.length }];
      })
   );
   const interactions = Object.fromEntries(
      Object.keys(INTERACTIONS).map((kind) => {
         const outcomes = done.map((run) => run.interactions[kind]);
         const count = (status) => outcomes.filter((outcome) => outcome.status === status).length;
         const measured = outcomes.filter((outcome) => outcome.status === "measured").map((outcome) => outcome.ms);
         return [kind, { ...summarize(measured), notApplicable: count("not-applicable"), failed: count("failed") }];
      })
   );
   return { metrics, interactions };
}

/** What a reader needs to reproduce or compare a timing run: the target origin, the profiles' definitions and the machine and browser. */
function timingMeta(config, browser, startedAt) {
   let playwright = null;
   try {
      playwright = createRequire(import.meta.url)("@playwright/test/package.json").version;
   } catch {}
   const profiles = Object.fromEntries(list(config.profiles).map((name) => [name, { ...(PROFILES[name].context.viewport && { viewport: PROFILES[name].context.viewport }), cpuRate: PROFILES[name].cpuRate ?? 1, network: PROFILES[name].network ?? "unthrottled" }]));
   return {
      schema: "p6-timing/1",
      targetOrigin: new URL(config.base).origin,
      startedAt,
      finishedAt: new Date().toISOString(),
      runsPerCell: Number(config.runs),
      settleMs: Number(config.settle),
      conditions: list(config.conditions),
      profiles,
      identity: config.identity ?? "signed-out",
      headerNames: Object.keys(config.headers).sort(),
      percentiles: "linear interpolation between closest ranks",
      runner: { browser: browser.version(), playwright, node: process.version, platform: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length },
   };
}

/** Local proof of T19's guarantees: percentile arithmetic, a dummy header value kept out of the output, and no request outside the target origin. */
async function timingSelfCheck(browser) {
   const dummy = "self-check-secret-9f3a1c";
   const seen = { headers: new Set(), strayHits: 0 };
   const listen = (handler) => new Promise((resolve) => { const server = createServer(handler).listen(0, "127.0.0.1", () => resolve(server)); });
   const stray = await listen((_, res) => (seen.strayHits++, res.end("x")));
   const target = await listen((req, res) => {
      if (req.url.startsWith("/boom")) return req.socket.destroy();
      seen.headers.add(req.headers["x-probe-secret"]);
      if (req.url === "/soft") {
         res.writeHead(200, { "content-type": "text/html" });
         return res.end(`<!doctype html><title>t</title><main><h1>one</h1><a href="/two" onclick="event.preventDefault();setTimeout(()=>{history.pushState({},'','/two');document.querySelector('h1').textContent='two'},150)">Next lesson: two</a></main>`);
      }
      if (req.url === "/app.js") return (res.writeHead(200, { "content-type": "text/javascript" }), res.end("document.title = 'ok'"));
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><title>t</title><h1>self-check</h1><script src="/app.js"></script><img src="http://127.0.0.1:${stray.address().port}/x.png">`);
   });
   try {
      const headers = runtimeHeaders(JSON.stringify({ "X-Probe-Secret": dummy }));
      secrets.push(dummy);
      const base = `http://127.0.0.1:${target.address().port}/`;
      const check = { ...DEFAULTS, base, headers, settle: "100" };
      const started = new Date().toISOString();
      const cells = await MODES.timing({ browser, config: check, routes: ["/"] });
      const raw = JSON.stringify({ cells, meta: timingMeta(check, browser, started) });
      const stats = [percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.75), percentile([4, 1, 3, 2, 5], 0.5), percentile([4, 1, 3, 2, 5], 0.75), percentile([7], 0.75), percentile([], 0.5)];
      const runs = cells.flatMap((cell) => cell.runs);
      // A route whose query carries a secret and whose navigation fails: Playwright quotes the whole URL in its error.
      const query = "route-query-secret-4d82e0";
      const apiUrl = `http://user:api-password-5b17c3@127.0.0.1:3101/path?key=api-query-secret-8e64f1`;
      const failing = await MODES.timing({ browser, config: { ...check, runs: "1", profiles: "desktop", conditions: "cold" }, routes: [`/boom?key=${query}`] });
      const soft = await MODES.timing({ browser, config: { ...check, runs: "1", profiles: "desktop", conditions: "cold" }, routes: ["/soft"] });
      const nextLesson = soft[0].runs[0].interactions?.nextLesson;
      const report = { ...reportOf({ ...check, api: apiUrl }, ["/boom?key=" + query]), results: { timing: [...cells, ...failing] } };
      const text = render(report);
      const ok = { status: 200, interactions: { drawerOpen: { status: "not-applicable" }, moduleToggle: { status: "measured", ms: 31.8 } } };
      const failed = { status: 200, interactions: { drawerOpen: { status: "failed" }, moduleToggle: { status: "measured", ms: 31.8 } } };
      const finding = (...cellRuns) => FINDING.timing({ failedRuns: 0, runs: cellRuns });
      const checks = {
         percentiles: JSON.stringify(stats) === JSON.stringify([5.5, 7.75, 3, 4, 7, null]),
         clsWindows: cumulativeShift([[0, 0.1], [500, 0.1], [3000, 0.15]]) === 0.2,
         cellsCovered: cells.length === 4 && cells.every((cell) => cell.runs.length === 10 && cell.failedRuns === 0),
         headerReachedTarget: seen.headers.size === 1 && seen.headers.has(dummy),
         secretNotSerialized: !raw.includes(dummy) && !render({ failure: `request with ${dummy} failed` }).includes(dummy),
         strayOriginBlocked: seen.strayHits === 0 && runs.every((run) => run.blockedOrigins.length === 1),
         requestsCounted: runs.every((run) => run.metrics.requestCount === 2),
         failedInteractionIsFinding: finding(ok) === false && finding(ok, failed) === true && finding({ ...ok, status: 500 }) === true && cells.every((cell) => !FINDING.timing(cell)),
         routeQueryNotReported: failing[0].failedRuns === 1 && failing[0].runs[0].error.includes("/boom") && !JSON.stringify(failing).includes(query) && !text.includes(query),
         apiUrlSanitized: report.api === "http://127.0.0.1:3101" && !text.includes("api-query-secret") && !text.includes("api-password"),
         measurementsIntact: JSON.stringify(stats) === JSON.stringify([5.5, 7.75, 3, 4, 7, null]) && cells.every((cell) => cell.runs.every((run) => run.metrics.requestCount === 2)) && text.includes('"requestCount": 2'),
         softNavigationMeasured: nextLesson?.status === "measured" && nextLesson.ms >= 140 && nextLesson.ms < 2000 && soft[0].failedRuns === 0,
         inapplicableNotZero: runs.every((run) => Object.values(run.interactions).every((outcome) => outcome.status === "not-applicable" && !("ms" in outcome))),
      };
      return { checks, ok: Object.values(checks).every(Boolean) };
   } finally {
      target.close();
      stray.close();
   }
}

const MODES = {
   async overflow({ browser, config, routes }) {
      const rows = [];
      for (const width of list(config.viewports).map(Number)) {
         for (const theme of list(config.themes)) {
            const { page, close } = await open(browser, { width, theme });
            for (const route of routes) {
               const { status, errors } = await visit(page, config, route);
               const m = await page.evaluate(() => ({
                  scrollWidth: document.documentElement.scrollWidth,
                  clientWidth: document.documentElement.clientWidth,
                  dark: document.documentElement.classList.contains("dark"),
               }));
               const overflowPx = Math.max(0, m.scrollWidth - m.clientWidth);
               const themeApplied = m.dark === (theme === "dark");
               const hydrationErrors = errors.filter((text) => HYDRATION.test(text)).length;
               rows.push({
                  route, width, theme, status, themeApplied, scrollWidth: m.scrollWidth, clientWidth: m.clientWidth, overflowPx, overflows: overflowPx > 0,
                  errors: errors.length, hydrationErrors, ...(errors.length > 0 && { errorTexts: errors }),
               });
            }
            await close();
         }
      }
      return rows;
   },

   async requests({ browser, config, routes }) {
      const { page, close } = await open(browser, { cookies: identityCookies(config) });
      const rows = [];
      for (const route of routes) {
         const since = (await catalogLog(config)).length;
         const { status } = await visit(page, config, route);
         const calls = (await catalogLog(config)).slice(since).map(({ path, query }) => ({ kind: kindOf(path), path, query }));
         const byKind = {};
         for (const { kind } of calls) byKind[kind] = (byKind[kind] ?? 0) + 1;
         rows.push({ route, identity: config.identity ?? "signed-out", status, catalog: calls.length, gitReads: byKind.item_read ?? 0, cached: calls.length === 0, byKind, calls });
      }
      await close();
      return rows;
   },

   async offset({ browser, config, routes }) {
      const { page, close } = await open(browser, { width: 390, height: 844 });
      const rows = [];
      for (const route of routes) {
         const { status } = await visit(page, config, route);
         const found = await page.evaluate((selector) => {
            const top = (element) => Math.round((element.getBoundingClientRect().top + window.scrollY) * 100) / 100;
            const body = document.querySelector(selector);
            const heading = document.querySelector("main h1");
            return { h1Top: heading && top(heading), tag: body?.tagName.toLowerCase() ?? null, top: body ? top(body) : null };
         }, config["body-selector"]);
         rows.push({ route, width: 390, status, matched: found.tag !== null, firstBodyElement: found.tag, bodyTop: found.top, h1Top: found.h1Top });
      }
      await close();
      return rows;
   },

   /** P3-T7: opens the first Knowledge toggle of each route and measures the panel against the viewport, the column and the reference. */
   async panel({ browser, config, routes }) {
      const GUTTER = 16;
      const rows = [];
      for (const width of list(config.viewports).map(Number)) {
         for (const theme of list(config.themes)) {
            const { page, close } = await open(browser, { width, height: 900, theme });
            for (const route of routes) {
               const { status, errors } = await visit(page, config, route);
               const toggles = page.getByRole("button", { name: /^About / });
               const row = { route, width, theme, status, toggles: await toggles.count(), errors: errors.length };
               if (row.toggles === 0) {
                  rows.push({ ...row, opened: false });
                  continue;
               }
               const toggle = toggles.first();
               for (let attempt = 0; attempt < 20 && (await toggle.getAttribute("aria-expanded")) !== "true"; attempt++) {
                  await toggle.click();
                  await page.waitForTimeout(150);
               }
               const m = await page.evaluate(() => {
                  const toggle = document.querySelector('button[aria-label^="About "]');
                  const wrapper = toggle.parentElement;
                  const panel = wrapper.querySelector('[role="group"]');
                  const link = wrapper.previousElementSibling;
                  const box = (rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
                  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
                  if (!panel) return { opened: false };
                  const p = box(panel.getBoundingClientRect());
                  const column = box(toggle.closest("[data-catalog-body]").getBoundingClientRect());
                  const reference = [...link.getClientRects(), toggle.getBoundingClientRect()].map(box);
                  const block = toggle.closest("p, li, td, blockquote");
                  const withToggle = block.getBoundingClientRect().height;
                  wrapper.style.display = "none";
                  const without = block.getBoundingClientRect().height;
                  wrapper.style.display = "";
                  const style = getComputedStyle(panel);
                  return {
                     opened: true,
                     panel: { left: p.left, right: p.right, top: p.top, width: p.right - p.left },
                     viewportWidth: document.documentElement.clientWidth,
                     overflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
                     coversReference: reference.some((r) => hit(p, r)),
                     belowReference: p.top >= Math.max(...reference.map((r) => r.bottom)) - 0.5,
                     column: { left: column.left, right: column.right },
                     paragraphDeltaPx: Math.round((withToggle - without) * 100) / 100,
                     insidePhrasing: !panel.closest("p") || ![...panel.querySelectorAll("*")].some((e) => /^(DIV|P|UL|OL|SECTION)$/.test(e.tagName)),
                     transition: style.transitionDuration,
                     animation: style.animationName,
                  };
               });
               const fit = m.opened && {
                  withinViewport: m.panel.left >= GUTTER - 0.5 && m.panel.right <= m.viewportWidth - GUTTER + 0.5,
                  withinColumn: m.panel.left >= m.column.left - 0.5 && m.panel.right <= m.column.right + 0.5,
               };
               const oneOpen = row.toggles > 1 ? await (async () => {
                  await toggles.nth(1).click();
                  await page.waitForTimeout(150);
                  return (await page.getByRole("group", { name: /^About / }).count()) === 1;
               })() : null;
               if (oneOpen !== null) await toggles.nth(0).click(); // reopen the first; the second closes
               await page.keyboard.press("Escape");
               await page.waitForTimeout(100);
               const escapeClosed = (await page.getByRole("group", { name: /^About / }).count()) === 0;
               const focusReturned = await page.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("About ") ?? false);
               await toggle.click();
               await page.waitForTimeout(100);
               await page.locator("main h1").click();
               await page.waitForTimeout(100);
               const outsideClosed = (await page.getByRole("group", { name: /^About / }).count()) === 0;
               rows.push({ ...row, ...m, ...fit, oneOpen, escapeClosed, focusReturned, outsideClosed });
            }
            await close();
         }
      }
      return rows;
   },

   /** P3-T9: contrast of every --syntax-* token, and of each token colour actually rendered, against the code surface. */
   async syntax({ browser, config, routes }) {
      const rows = [];
      for (const theme of list(config.themes)) {
         const { page, close } = await open(browser, { theme });
         for (const route of routes) {
            const { status, errors } = await visit(page, config, route);
            const m = await page.evaluate(() => {
               const rgb = (css) => {
                  const probe = document.createElement("span");
                  probe.style.color = css;
                  document.body.append(probe);
                  const channels = getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
                  probe.remove();
                  return channels;
               };
               const luminance = (channels) => {
                  const [r, g, b] = channels.map((value) => ((value /= 255) <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
                  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
               };
               const contrast = (a, b) => {
                  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
                  return Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100;
               };
               const surface = rgb(getComputedStyle(document.documentElement).getPropertyValue("--code-surface"));
               const names = new Set();
               for (const sheet of document.styleSheets) {
                  for (const rule of sheet.cssRules) {
                     for (const name of rule.style ?? []) if (name.startsWith("--syntax-")) names.add(name);
                  }
               }
               const tokens = [...names].sort().map((name) => {
                  const color = rgb(`var(${name})`);
                  return { name, color: color.join(","), contrast: contrast(color, surface) };
               });
               const rendered = new Map();
               for (const span of document.querySelectorAll("code.hljs span[class^='hljs-']")) {
                  const color = rgb(getComputedStyle(span).color);
                  const entry = rendered.get(span.className) ?? { class: span.className, count: 0, color: color.join(","), contrast: contrast(color, surface) };
                  entry.count++;
                  rendered.set(span.className, entry);
               }
               const text = (selector) => [...document.querySelectorAll(selector)].map((code) => contrast(rgb(getComputedStyle(code).color), surface));
               return {
                  dark: document.documentElement.classList.contains("dark"),
                  surface: surface.join(","),
                  tokens,
                  rendered: [...rendered.values()],
                  highlightedBlocks: document.querySelectorAll("code.hljs").length,
                  plainBlocksWithTokens: [...document.querySelectorAll("pre code:not(.hljs)")].filter((code) => code.querySelector("span")).length,
                  plainTextContrast: Math.min(...text("pre code"), 21),
               };
            });
            const all = [...m.tokens, ...m.rendered].map((entry) => entry.contrast);
            rows.push({ route, theme, status, errors: errors.length, themeApplied: m.dark === (theme === "dark"), ...m, minContrast: Math.min(...all, m.plainTextContrast) });
         }
         await close();
      }
      return rows;
   },

   /** P3-T10: expands the first overflowing diagram of each route and measures the dialog, its focus, ids, theme and requests. */
   async expand({ browser, config, routes }) {
      const rows = [];
      for (const width of list(config.viewports).map(Number)) {
         for (const theme of list(config.themes)) {
            // No stored theme: next-themes follows the emulated colour scheme, so it can flip while the dialog is open.
            const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: theme });
            const page = await context.newPage();
            for (const route of routes) {
               const { status, errors } = await visit(page, config, route);
               const expandButtons = page.getByRole("button", { name: "Expand diagram" });
               const figures = await page.locator("figure:has(svg)").count();
               const row = { route, width, theme, status, figures, expandButtons: await expandButtons.count() };
               const fitting = await page.locator("figure:has(svg):not(:has(button))").evaluateAll((all) => all.map((f) => f.querySelectorAll("button, [tabindex]").length));
               if (row.expandButtons === 0) {
                  rows.push({ ...row, fittingTabStops: fitting, opened: false, errors: errors.length });
                  continue;
               }
               const trigger = page.locator("button", { hasText: "Expand diagram" }).first();
               const logBefore = (await catalogLog(config)).length;
               const requests = [];
               const interactionErrors = [];
               const onRequest = (request) => void requests.push(request.url());
               const onConsole = (message) => void (message.type() === "error" && interactionErrors.push(message.text()));
               page.on("request", onRequest);
               page.on("console", onConsole);
               page.on("pageerror", (error) => interactionErrors.push(error.message));
               await trigger.scrollIntoViewIfNeeded();
               await trigger.focus();
               const inertBefore = await page.evaluate(() => document.querySelectorAll("[inert]").length);
               await page.keyboard.press("Enter");
               const dialog = page.getByRole("dialog");
               await dialog.waitFor();
               await page.waitForFunction(() => document.querySelector("[role=dialog] svg"));
               const before = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, y: window.scrollY }));

               const open = await page.evaluate(() => {
                  const dialog = document.querySelector("[role=dialog]");
                  const region = dialog.querySelector("[role=region]");
                  const svg = dialog.querySelector("svg");
                  const box = dialog.getBoundingClientRect();
                  const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
                  const touch = [dialog, ...dialog.querySelectorAll("*")].map((e) => getComputedStyle(e).touchAction).filter((v) => v !== "auto");
                  const root = document.documentElement;
                  const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
                  return {
                     viewport: { width: root.clientWidth, height: window.innerHeight },
                     dialog: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
                     title: dialog.getAttribute("aria-labelledby") && document.getElementById(dialog.getAttribute("aria-labelledby"))?.textContent,
                     regionName: region.getAttribute("aria-label"),
                     regionFocused: document.activeElement === region,
                     regionScrolls: { x: region.scrollWidth > region.clientWidth, y: region.scrollHeight > region.clientHeight },
                     svgWidth: Math.round(svg.getBoundingClientRect().width),
                     viewBoxWidth: Number(svg.getAttribute("viewBox").split(/\s+/)[2]),
                     duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
                     idCount: ids.length,
                     svgCount: document.querySelectorAll("svg[id^=mermaid]").length,
                     touchActions: touch,
                     viewportMeta: viewport,
                     userScalingDisabled: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(viewport),
                     bodyLocked: getComputedStyle(document.body).overflow === "hidden",
                     overflowX: root.scrollWidth > root.clientWidth,
                     // T10.5: every top-level page element is inert; the dialog, its backdrop and Radix's focus guards are not.
                     page: {
                        notInert: [...document.body.children]
                           .filter((e) => e.tagName !== "SCRIPT" && !e.hasAttribute("inert") && !e.contains(dialog) && !e.matches("[data-state=open].fixed.inset-0") && !e.hasAttribute("data-radix-focus-guard"))
                           .map((e) => e.tagName.toLowerCase()),
                        inertCount: document.querySelectorAll("body > [inert]").length,
                        dialogInert: !!dialog.closest("[inert]"),
                        backdropInert: !!document.querySelector("[data-state=open].fixed.inset-0")?.closest("[inert]"),
                     },
                  };
               });
               // The page behind, in Chromium's own accessibility tree: nothing, not even the empty Copy status shells.
               // (Playwright's ariaSnapshot is built from the DOM and ignores `inert`, so it cannot answer this.)
               const session = await context.newCDPSession(page);
               const { nodes } = await session.send("Accessibility.getFullAXTree");
               const byId = new Map(nodes.map((node) => [node.nodeId, node]));
               const inDialog = (node) => { for (let n = node; n; n = byId.get(n.parentId)) if (n.role?.value === "dialog") return true; return false; };
               const behind = nodes.filter((node) => !node.ignored && !inDialog(node) && !["RootWebArea", "generic", "none"].includes(node.role?.value));
               const exposed = { nodes: behind.length, roles: behind.map((node) => node.role?.value) };
               // The page must not scroll behind the dialog, by wheel or by keyboard.
               await page.mouse.move(2, 2);
               await page.mouse.wheel(0, 600);
               await page.keyboard.press("Tab");
               const afterTab = await page.evaluate(() => ({ inside: !!document.activeElement?.closest("[role=dialog]"), name: document.activeElement?.textContent?.trim() }));
               for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
               const trapped = await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"));
               const after = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, y: window.scrollY }));

               // Theme change while open (system preference): the dialog and the inline diagram both redraw.
               const mark = (dark) => page.evaluate((hex) => ({ dialog: document.querySelector("[role=dialog] svg").outerHTML.toLowerCase().includes(hex), inline: [...document.querySelectorAll("main svg")].some((s) => !s.closest("[role=dialog]") && s.outerHTML.toLowerCase().includes(hex)) }), dark ? "#1e3a5f" : "#dbeafe");
               const first = await mark(theme === "dark");
               await page.emulateMedia({ colorScheme: theme === "dark" ? "light" : "dark" });
               await page.waitForFunction((dark) => document.documentElement.classList.contains("dark") === dark, theme !== "dark");
               await page.waitForFunction((hex) => document.querySelector("[role=dialog] svg")?.outerHTML.toLowerCase().includes(hex), theme === "dark" ? "#dbeafe" : "#1e3a5f", { timeout: 5000 }).catch(() => {});
               await page.waitForTimeout(300);
               const flipped = await mark(theme !== "dark");
               const stillOpen = await dialog.count();
               await page.emulateMedia({ colorScheme: theme });
               await page.waitForTimeout(300);

               if (width === 390) {
                  const region = await page.locator("[role=dialog] [role=region]").boundingBox();
                  await session.send("Input.synthesizeScrollGesture", { x: region.x + region.width / 2, y: region.y + region.height / 2, xDistance: -150, yDistance: 0, gestureSourceType: "touch", speed: 800 });
                  await page.waitForTimeout(300);
               }
               const touchScrollLeft = await page.locator("[role=dialog] [role=region]").evaluate((e) => e.scrollLeft);

               // Each way of closing returns focus to the Expand button.
               const closers = {};
               const restored = {};
               const refocused = async () => (await page.waitForTimeout(150), trigger.evaluate((e) => e === document.activeElement));
               // The page is back as it was: the same inert elements as before opening, none of them top-level.
               const restoredPage = async () => page.evaluate((count) => document.querySelectorAll("[inert]").length === count && document.querySelectorAll("body > [inert]").length === 0, inertBefore);
               await page.keyboard.press("Escape");
               await dialog.waitFor({ state: "detached" });
               closers.escape = await refocused();
               restored.escape = await restoredPage();
               await trigger.click();
               await dialog.waitFor();
               await page.getByRole("button", { name: "Close" }).click();
               await dialog.waitFor({ state: "detached" });
               closers.close = await refocused();
               restored.close = await restoredPage();
               await trigger.click();
               await dialog.waitFor();
               await page.mouse.click(2, 2);
               await dialog.waitFor({ state: "detached" });
               closers.backdrop = await refocused();
               restored.backdrop = await restoredPage();
               page.off("request", onRequest);
               page.off("console", onConsole);
               rows.push({
                  ...row, fittingTabStops: fitting, opened: true, errors: errors.length + interactionErrors.length, errorTexts: [...errors, ...interactionErrors], ...open, exposed, afterTab, trapped,
                  pageScrolledBehind: after.y !== before.y, documentGrew: after.w > before.w || after.h > before.h,
                  themeFlip: { before: first, flipped, stillOpen: stillOpen === 1 },
                  touchScrollLeft, closers, restored,
                  requestsWhileOpen: requests.length, requests,
                  catalogRequests: (await catalogLog(config)).length - logBefore,
               });
            }
            await context.close();
         }
      }
      return rows;
   },

   /** P3-T11: what follows the Lesson body (close landmarks in order, first focusable) and, from Chromium's accessibility tree, the landmarks in `main` with the names of their links. */
   async order({ browser, config, routes }) {
      const rows = [];
      for (const width of list(config.viewports).map(Number)) {
         const { page, close } = await open(browser, { width, height: 900 });
         const session = await page.context().newCDPSession(page);
         for (const route of routes) {
            const { status, errors } = await visit(page, config, route);
            const found = await page.evaluate(() => {
               const main = document.querySelector("main");
               const body = main.querySelector("[data-catalog-body]");
               const text = (e) => (e.getAttribute("aria-label") ?? e.textContent).trim().replace(/\s+/g, " ").slice(0, 90);
               // A collapsed Module panel is inert and a responsive twin is display:none: neither is in the accessibility tree.
               const exposed = (e) => e.checkVisibility({ visibilityProperty: true }) && !e.closest("[inert]");
               const after = body ? [...main.querySelectorAll("nav[aria-label], h2, h3, a[href], button")].filter((e) => exposed(e) && !body.contains(e) && !!(body.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)) : [];
               const first = after.find((e) => e.matches("a[href], button"));
               return {
                  hasBody: !!body,
                  closeOrder: after.filter((e) => e.matches("nav[aria-label], h2, h3")).map(text),
                  firstAfterBody: first && { tag: first.tagName.toLowerCase(), landmark: first.closest("nav[aria-label]")?.getAttribute("aria-label") ?? null, inAside: !!first.closest("aside") },
               };
            });
            const { nodes } = await session.send("Accessibility.getFullAXTree");
            const byId = new Map(nodes.map((node) => [node.nodeId, node]));
            const links = (node, out = []) => {
               for (const id of node.childIds ?? []) {
                  const child = byId.get(id);
                  if (!child) continue;
                  if (!child.ignored && child.role?.value === "link") out.push(child.name?.value ?? "");
                  links(child, out);
               }
               return out;
            };
            const navs = [];
            const landmarks = (node) => {
               for (const id of node.childIds ?? []) {
                  const child = byId.get(id);
                  if (!child) continue;
                  if (!child.ignored && child.role?.value === "navigation") navs.push({ name: child.name?.value ?? "", links: links(child) });
                  landmarks(child);
               }
            };
            landmarks(nodes.find((node) => !node.ignored && node.role?.value === "main"));
            const allLinks = navs.flatMap((nav) => nav.links);
            // S-A11Y-1: what each P3 landmark's links must say about their destination.
            const typed = (nav) =>
               /^Next in /.test(nav.name) ? nav.links.every((n) => /^Next lesson: /.test(n))
               : /^End of /.test(nav.name) ? nav.links.every((n) => /^Back to /.test(n))
               : nav.name === "Curriculum" ? nav.links.every((n) => /^(Back to module: |Previous lesson: )/.test(n))
               : / outline$/.test(nav.name) ? nav.links.every((n) => /\b(Lesson|Practice problem)\b/.test(n))
               : true;
            const isNext = (name) => /^(Next in |End of )/.test(name ?? "");
            const nextAt = found.closeOrder.findIndex(isNext);
            const names = navs.map((nav) => nav.name);
            rows.push({
               route, width, status, errors: errors.length, ...found, navs,
               distinctNavNames: new Set(names).size === names.length,
               bareNames: allLinks.filter((name) => /^(next|previous)$/i.test(name)),
               namesStateDestination: navs.every(typed),
               nextFirstAfterBody: nextAt >= 0 ? isNext(found.firstAfterBody?.landmark) && !found.firstAfterBody.inAside : null,
               relationsBeforeNext: nextAt >= 0 ? found.closeOrder.slice(0, nextAt).filter((name) => /^(Related|Practice)/.test(name)) : [],
            });
         }
         await close();
      }
      return rows;
   },

   /** P3-T11: one axe scan per route, width and theme. Violations are listed with the landmark that owns each node, to tell P3 surfaces from the shell. */
   async axe({ browser, config, routes }) {
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      const rows = [];
      // Control: a clean result only counts if the scanner sees a violation planted on purpose.
      const control = await open(browser, { width: 1280 });
      await visit(control.page, config, routes[0]);
      await control.page.evaluate(() => document.querySelector("main").insertAdjacentHTML("beforeend", "<button></button>"));
      const planted = (await new AxeBuilder({ page: control.page }).analyze()).violations.map((violation) => violation.id);
      await control.close();
      rows.push({ route: "(control: unnamed button planted)", control: true, detected: planted.includes("button-name"), planted, errors: 0, blocking: 0 });
      for (const width of list(config.viewports).map(Number)) {
         for (const theme of list(config.themes)) {
            const { page, close } = await open(browser, { width, height: 900, theme });
            for (const route of routes) {
               const { status, errors } = await visit(page, config, route);
               const result = await new AxeBuilder({ page }).analyze();
               // axe cannot resolve the background behind SVG labels, so their contrast is measured against the node's own fill.
               const diagramLabels = await page.evaluate(() => {
                  const rgb = (css) => {
                     const probe = document.createElement("span");
                     probe.style.color = css;
                     document.body.append(probe);
                     const channels = getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
                     probe.remove();
                     return channels;
                  };
                  const luminance = (c) => c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
                  const ratios = [];
                  for (const node of document.querySelectorAll("figure svg g.node")) {
                     const label = node.querySelector(".nodeLabel");
                     const shape = node.querySelector("rect, polygon, path, circle, ellipse");
                     const fill = shape && getComputedStyle(shape).fill;
                     if (!label || !fill || fill === "none") continue;
                     const [high, low] = [luminance(rgb(getComputedStyle(label).color)), luminance(rgb(fill))].sort((a, b) => b - a);
                     ratios.push(Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100);
                  }
                  return { labels: ratios.length, minContrast: ratios.length ? Math.min(...ratios) : null };
               });
               const violations = [];
               for (const violation of result.violations) {
                  const nodes = await page.evaluate((targets) => targets.map((target) => {
                     const element = document.querySelector(target);
                     const owner = element?.closest("header, footer, [data-catalog-body], nav[aria-label], section[aria-labelledby], aside, main");
                     return element ? (owner?.matches("[data-catalog-body]") ? "lesson body" : `${owner?.tagName.toLowerCase()}${owner?.getAttribute("aria-label") ? `[${owner.getAttribute("aria-label")}]` : ""}`) : "unresolved";
                  }), violation.nodes.map((node) => node.target.join(" ")));
                  violations.push({
                     id: violation.id, impact: violation.impact, help: violation.help, count: violation.nodes.length,
                     owners: [...new Set(nodes)],
                     samples: violation.nodes.slice(0, 2).map((node) => ({ target: node.target.join(" "), html: node.html.slice(0, 120) })),
                  });
               }
               const ran = ["color-contrast", "link-name", "button-name", "aria-valid-attr-value", "landmark-unique", "region", "scrollable-region-focusable", "nested-interactive"];
               rows.push({ route, width, theme, status, errors: errors.length, rulesPassed: result.passes.length, diagramLabels, ranKeyRules: ran.filter((id) => result.passes.some((rule) => rule.id === id)), incompleteIds: result.incomplete.map((rule) => `${rule.id} x${rule.nodes.length}`), incompleteNodes: result.incomplete.map((rule) => ({ id: rule.id, targets: rule.nodes.slice(0, 3).map((node) => node.target.join(" ")), html: rule.nodes[0].html.slice(0, 140), why: rule.nodes[0].any[0]?.message ?? rule.nodes[0].all[0]?.message ?? null })), violations, blocking: violations.filter((v) => v.impact === "serious" || v.impact === "critical").length });
            }
            await close();
         }
      }
      return rows;
   },

   /** P3-T11: every P3 interaction a route offers, with the client requests each causes and the learner state before and after (cookies, storage, IndexedDB). */
   async interact({ browser, config, routes }) {
      const rows = [];
      for (const width of list(config.viewports).map(Number)) {
         const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light" });
         await context.grantPermissions(["clipboard-read", "clipboard-write"]);
         const page = await context.newPage();
         const traffic = [];
         const errors = [];
         page.on("request", (request) => traffic.push({ url: request.url(), type: request.resourceType(), rsc: request.headers().rsc === "1" || request.url().includes("_rsc=") }));
         page.on("console", (message) => void (message.type() === "error" && errors.push(message.text())));
         page.on("pageerror", (error) => errors.push(error.message));
         for (const route of routes) {
            const loadMark = traffic.length;
            const { status } = await visit(page, config, route);
            // Requests the page makes by itself while loading: P2's primary navigation prefetches here, so a count above zero shows the meter sees prefetch.
            const load = traffic.slice(loadMark).filter((r) => r.rsc);
            const loaded = await learnerState(context, page);
            const errorsBefore = errors.length;
            const steps = [];
            const step = async (name, act) => {
               const mark = { traffic: traffic.length, log: (await catalogLog(config)).length };
               const acted = await act();
               await page.waitForTimeout(400);
               const mine = traffic.slice(mark.traffic).filter((r) => r.type === "fetch" || r.type === "xhr" || r.rsc);
               if (acted) steps.push({ step: name, acted, clientFetches: mine.length, rsc: mine.filter((r) => r.rsc).length, catalogReads: (await catalogLog(config)).length - mark.log, urls: mine.slice(0, 3).map((r) => r.url.replace(config.base, "")) });
            };
            const each = async (selector, act, limit = 40) => {
               const found = page.locator(selector);
               const total = Math.min(await found.count(), limit);
               for (let index = 0; index < total; index++) await act(found.nth(index));
               return total;
            };
            const setDisclosures = (open) => each("[data-slot=disclosure] button[aria-expanded]", async (toggle) => {
               if (!(await toggle.isVisible()) || (await toggle.getAttribute("aria-expanded")) === String(open)) return;
               await toggle.scrollIntoViewIfNeeded();
               await toggle.click();
               await page.waitForTimeout(150);
            });
            await step("module:open-all", () => setDisclosures(true));
            await step("scroll", async () => {
               const height = await page.evaluate(() => document.documentElement.scrollHeight);
               let count = 0;
               for (let y = 0; y < height; y += 400, count++) {
                  await page.evaluate((top) => window.scrollTo(0, top), y);
                  await page.waitForTimeout(80);
               }
               await page.evaluate(() => window.scrollTo(0, 0));
               return count;
            });
            await step("hover", async () => {
               let hovered = 0;
               await each('main a[href^="/lessons"], main a[href^="/problems"], main a[href^="/knowledge"], main a[href^="/tracks"]', async (link) => {
                  if (!(await link.isVisible())) return;
                  await link.scrollIntoViewIfNeeded();
                  await link.hover();
                  await page.waitForTimeout(60);
                  hovered++;
               });
               await page.mouse.move(0, 0);
               return hovered;
            });
            await step("module:close-all", () => setDisclosures(false));
            await step("knowledge", () => each('button[aria-label^="About "]', async (toggle) => (await toggle.scrollIntoViewIfNeeded(), await toggle.click(), await page.waitForTimeout(120), await page.keyboard.press("Escape"))));
            await step("copy", () => each('button[aria-label^="Copy "]', async (button) => (await button.scrollIntoViewIfNeeded(), await button.click(), await page.waitForTimeout(150))));
            await step("expand", () => each('button:has-text("Expand diagram")', async (button) => {
               await button.scrollIntoViewIfNeeded();
               await button.click();
               await page.getByRole("dialog").waitFor();
               await page.keyboard.press("Escape");
               await page.getByRole("dialog").waitFor({ state: "detached" });
            }, 1));
            const go = (name, locator) => step(`navigate:${name}`, async () => {
               const link = locator.filter({ visible: true }).first();
               if (!(await link.count())) return 0;
               await link.scrollIntoViewIfNeeded();
               await link.click({ timeout: 5000 });
               await page.waitForURL((url) => url.pathname + url.hash !== route, { timeout: 8000 }).catch(() => {});
               await page.waitForLoadState("load");
               await page.goBack({ waitUntil: "load" });
               return 1;
            });
            await go("start", page.getByRole("link", { name: /^Start with / }));
            await go("next", page.getByRole("link", { name: /^Next lesson: / }));
            await go("back-to-module", page.getByRole("link", { name: /^Back to module:/ }));
            await go("practice", page.locator('section[aria-labelledby="lesson_practice"] a[href]'));
            await go("track-entry", page.locator("nav[aria-label$=' outline'] a[href]"));
            const afterP3 = await learnerState(context, page);
            // The theme switch is a P2 control that persists the choice; it is exercised last and reported on its own.
            const switcher = page.getByRole("button", { name: "Toggle theme" }).first();
            let afterTheme = afterP3;
            if (await switcher.isVisible()) {
               await switcher.click();
               await page.getByRole("menuitem", { name: "Dark" }).click();
               await page.waitForTimeout(300);
               afterTheme = await learnerState(context, page);
               await switcher.click();
               await page.getByRole("menuitem", { name: "Light" }).click();
               await page.waitForTimeout(200);
            }
            const p3 = stateDiff(loaded, afterP3);
            rows.push({
               route, width, status, loadRsc: load.length, loadUrls: load.slice(0, 4).map((r) => r.url.replace(config.base, "")), errors: errors.length - errorsBefore, errorTexts: errors.slice(errorsBefore), steps,
               state: { atLoad: keysOf(loaded), p3Changed: differs(p3), p3Diff: p3, themeSwitchDiff: stateDiff(afterP3, afterTheme) },
            });
         }
         await context.close();
      }
      return rows;
   },

   /** P3-T11: keyboard behaviour of the P3 surfaces a route offers (S-A11Y-1 ... S-A11Y-6). Each check runs only where its surface exists. */
   async keys({ browser, config, routes }) {
      const rows = [];
      for (const width of list(config.viewports).map(Number)) {
         const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light" });
         await context.grantPermissions(["clipboard-read", "clipboard-write"]);
         const page = await context.newPage();
         for (const route of routes) {
            const { status, errors } = await visit(page, config, route);
            const checks = {};
            const stops = await tabOrder(page);
            const main = stops.filter((stop) => stop.region !== "header" && stop.region !== "footer");
            const nextAt = main.findIndex((stop) => /^Next lesson: /.test(stop.name));
            const lastBody = main.map((stop) => stop.region).lastIndexOf("body");
            const tab = {
               stops: stops.length, mainStops: main.length,
               bareNames: main.filter((stop) => /^(next|previous)$/i.test(stop.name)).map((stop) => stop.name),
               unnamed: main.filter((stop) => !stop.name).length,
               positiveTabindex: main.filter((stop) => Number(stop.tabindex) > 0).length,
               invisible: main.filter((stop) => !stop.visible).map((stop) => stop.name),
               noIndicator: main.filter((stop) => !stop.indicator).map((stop) => `${stop.name} [${stop.focusStyle}]`),
               nextAt, stopsBetweenBodyAndNext: nextAt >= 0 && lastBody >= 0 ? nextAt - lastBody - 1 : null,
               order: main.map((stop) => `${stop.region === "body" ? "·" : ""}${stop.tag}:${stop.name}`),
            };
            checks.tabOrder = { ...tab, ok: tab.bareNames.length + tab.unnamed + tab.positiveTabindex + tab.invisible.length + tab.noIndicator.length === 0 && (tab.stopsBetweenBodyAndNext ?? 0) === 0 };

            const about = page.locator('button[aria-label^="About "]').first();
            if (await about.count()) {
               await about.scrollIntoViewIfNeeded();
               await about.hover();
               await page.waitForTimeout(250);
               const opensOnHover = (await about.getAttribute("aria-expanded")) === "true";
               await page.mouse.move(0, 0);
               const inert = () => page.evaluate(() => document.querySelectorAll("[inert]").length + document.querySelectorAll("[aria-modal=true]").length);
               const state = () => about.getAttribute("aria-expanded");
               const before = await inert();
               await about.focus();
               await page.keyboard.press("Enter");
               await page.waitForTimeout(150);
               const enter = await state();
               const panels = await page.getByRole("group", { name: /^About / }).count();
               const modal = (await inert()) !== before;
               await page.keyboard.press("Escape");
               await page.waitForTimeout(150);
               const escape = await state();
               const focusReturned = await about.evaluate((e) => e === document.activeElement);
               await page.keyboard.press("Space");
               await page.waitForTimeout(150);
               const space = await state();
               await page.keyboard.press("Tab");
               const tabMovesOn = await about.evaluate((e) => e !== document.activeElement);
               await page.locator("main h1").click();
               checks.knowledge = { opensOnHover, enter, panels, modal, escape, focusReturned, space, tabMovesOn, ok: !opensOnHover && enter === "true" && panels >= 1 && !modal && escape === "false" && focusReturned && space === "true" && tabMovesOn };
            }

            const copy = page.locator('button[aria-label^="Copy "]').first();
            if (await copy.count()) {
               await copy.scrollIntoViewIfNeeded();
               const read = () => copy.evaluate((button) => ({ name: button.getAttribute("aria-label"), text: button.textContent.trim(), status: button.nextElementSibling?.textContent.trim() ?? null, live: button.nextElementSibling?.getAttribute("aria-live") }));
               const initial = await read();
               await page.evaluate(() => {
                  const status = document.querySelector('button[aria-label^="Copy "]').nextElementSibling;
                  window.__announced = [];
                  new MutationObserver(() => void (status.textContent.trim() && window.__announced.push(status.textContent.trim()))).observe(status, { childList: true, characterData: true, subtree: true });
               });
               await copy.focus();
               await page.keyboard.press("Enter");
               await page.waitForTimeout(300);
               const during = await read();
               const success = await page.evaluate(() => [...window.__announced]);
               await page.waitForTimeout(2300);
               const settled = await read();
               await page.evaluate(() => (window.__announced.length = 0, Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: () => Promise.reject(new Error("denied")) })));
               await page.keyboard.press("Space");
               await page.waitForTimeout(300);
               const failedRead = await read();
               const failure = await page.evaluate(() => [...window.__announced]);
               checks.copy = {
                  initial, during, settled, failedRead, success, failure,
                  ok: initial.live === "polite" && during.name === initial.name && during.text === "Copied" && success.length === 1 && success[0] === "Copied" && settled.text === "Copy" && settled.status === "" &&
                      failedRead.name === initial.name && failure.length === 1 && /^Copy failed/.test(failure[0]),
               };
            }

            const toggles = page.locator("[data-slot=disclosure] button[aria-expanded]");
            if (route.startsWith("/tracks/") && (await toggles.count()) > 0) {
               const last = toggles.last();
               await last.scrollIntoViewIfNeeded();
               await last.focus();
               const read = () => last.evaluate((button) => ({ expanded: button.getAttribute("aria-expanded"), inert: !!document.getElementById(button.getAttribute("aria-controls"))?.closest("[inert]") }));
               const start = await read();
               await page.keyboard.press("Space");
               await page.waitForTimeout(500);
               const afterSpace = await read();
               await page.keyboard.press("Enter");
               await page.waitForTimeout(500);
               const afterEnter = await read();
               const collapsedInert = await toggles.evaluateAll((all) => all.filter((b) => b.getAttribute("aria-expanded") === "false").map((b) => !!document.getElementById(b.getAttribute("aria-controls"))?.closest("[inert]")));
               const consistent = (s) => s.inert === (s.expanded === "false");
               checks.module = { toggles: await toggles.count(), start, afterSpace, afterEnter, collapsedInert, ok: afterSpace.expanded !== start.expanded && afterEnter.expanded === start.expanded && [start, afterSpace, afterEnter].every(consistent) && collapsedInert.every(Boolean) };
            }

            const activations = {};
            for (const [name, link, destination] of [
               ["next", page.getByRole("link", { name: /^Next lesson: / }).first(), /^\/lessons\//],
               ["start", page.getByRole("link", { name: /^Start with / }).first(), /^\/(lessons|problems)\//],
               ["practice", page.locator('section[aria-labelledby="lesson_practice"] a[href]').first(), /^\/problems\//],
            ]) {
               if (!(await link.count())) continue;
               await link.scrollIntoViewIfNeeded();
               await link.focus();
               await page.keyboard.press("Enter");
               await page.waitForURL((url) => url.pathname !== route, { timeout: 8000 }).catch(() => {});
               const path = new URL(page.url()).pathname;
               activations[name] = { path, ok: destination.test(path) };
               await page.goBack({ waitUntil: "load" });
               await page.waitForTimeout(300);
            }
            if (Object.keys(activations).length > 0) checks.activate = { ...activations, ok: Object.values(activations).every((a) => a.ok) };

            const back = page.getByRole("link", { name: /^Back to module:/ }).first();
            if (await back.count()) {
               await back.scrollIntoViewIfNeeded();
               await back.focus();
               await page.keyboard.press("Enter");
               await page.waitForURL(/\/tracks\/[^#]+#/, { timeout: 8000 }).catch(() => {});
               await page.waitForTimeout(500);
               const arrival = await page.evaluate(() => {
                  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
                  const rect = target?.getBoundingClientRect();
                  return { hash: location.hash, found: !!target, open: target?.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded") === "true", inView: !!rect && rect.top >= 0 && rect.top < innerHeight, top: Math.round(rect?.top ?? -1) };
               });
               await page.keyboard.press("Tab");
               const focus = await page.evaluate(() => {
                  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
                  const active = document.activeElement;
                  return { name: (active?.getAttribute("aria-label") ?? active?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60), insideTarget: !!target?.contains(active), followsTarget: !!target && !!(target.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING) };
               });
               checks.fragment = { ...arrival, focus, ok: arrival.found && arrival.open && arrival.inView && (focus.insideTarget || focus.followsTarget) };
            }
            rows.push({ route, width, status, errors: errors.length, checks });
         }
         await context.close();
      }
      return rows;
   },

   /** P3-T11: the longest declared motion and the animations running on each P3 transition, with and without `prefers-reduced-motion`. */
   async motion({ browser, config, routes }) {
      const rows = [];
      for (const preference of ["reduce", "no-preference"]) {
         const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", reducedMotion: preference });
         await context.grantPermissions(["clipboard-read", "clipboard-write"]);
         await context.addInitScript(MOTION_INIT);
         const page = await context.newPage();
         for (const route of routes) {
            const { status } = await visit(page, config, route);
            const surfaces = {};
            const toggles = page.locator("[data-slot=disclosure] button[aria-expanded]");
            if (route.startsWith("/tracks/") && (await toggles.count()) > 1) {
               surfaces.module = await toggles.last().evaluate(async (button) => {
                  const root = button.closest("[data-slot=disclosure]");
                  const panel = () => document.getElementById(button.getAttribute("aria-controls"));
                  const until = (done) => new Promise((resolve) => { const t0 = performance.now(); const poll = () => (done() || performance.now() - t0 > 2000 ? resolve(Math.round(performance.now() - t0)) : requestAnimationFrame(poll)); poll(); });
                  if (button.getAttribute("aria-expanded") === "true") {
                     button.click();
                     await until(() => !!panel().closest("[inert]"));
                  }
                  button.click();
                  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                  const opening = window.__motion(root);
                  button.click();
                  return { ...opening, closeMs: await until(() => !!panel().closest("[inert]")) };
               });
               const id = await page.locator("[data-slot=disclosure]").last().evaluate((e) => e.parentElement?.id);
               if (id) {
                  const arrival = await context.newPage();
                  await arrival.goto(new URL(`${route}#${id}`, config.base).href, { waitUntil: "load" });
                  await arrival.waitForTimeout(400);
                  surfaces.fragmentArrival = await arrival.evaluate(() => {
                     const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
                     const root = target.querySelector("[data-slot=disclosure]");
                     return { open: root.dataset.state === "open", topPx: Math.round(target.getBoundingClientRect().top), scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior, ...window.__motion(root) };
                  });
                  await arrival.close();
               }
            }
            const about = page.locator('button[aria-label^="About "]').first();
            if (await about.count()) {
               await about.scrollIntoViewIfNeeded();
               surfaces.knowledge = await about.evaluate(async (button) => (button.click(), await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), window.__motion(button.parentElement)));
               await page.keyboard.press("Escape");
            }
            const copy = page.locator('button[aria-label^="Copy "]').first();
            if (await copy.count()) {
               await copy.scrollIntoViewIfNeeded();
               surfaces.copy = await copy.evaluate(async (button) => (button.click(), await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), window.__motion(button.parentElement)));
            }
            const expand = page.locator('button:has-text("Expand diagram")').first();
            if (await expand.count()) {
               await expand.scrollIntoViewIfNeeded();
               await expand.click();
               await page.getByRole("dialog").waitFor();
               surfaces.dialog = await page.evaluate(() => {
                  const dialog = window.__motion(document.querySelector("[role=dialog]"));
                  const overlay = document.querySelector("[data-state=open].fixed.inset-0");
                  const behind = overlay ? window.__motion(overlay) : { declaredMs: 0, running: 0 };
                  return { declaredMs: Math.max(dialog.declaredMs, behind.declaredMs), running: dialog.running + behind.running };
               });
               await page.keyboard.press("Escape");
               await page.getByRole("dialog").waitFor({ state: "detached" });
            }
            rows.push({ route, preference, status, surfaces });
         }
         await context.close();
      }
      return rows;
   },

   // P4-T12: at load, a Problem is challenge-first (S-CHL-1): no reveal open, and no authored body visible but the challenge.
   async reveal({ browser, config, routes }) {
      const rows = [];
      for (const width of list(config.viewports).map(Number)) {
         for (const theme of list(config.themes)) {
            const { page, close } = await open(browser, { width, theme, cookies: identityCookies(config) });
            for (const route of routes) {
               const { status, errors } = await visit(page, config, route);
               const found = await page.evaluate(() => {
                  const shown = (e) => e.checkVisibility({ visibilityProperty: true }) && e.getClientRects().length > 0;
                  const reveals = [...document.querySelectorAll("main details[data-reveal]")];
                  const bodies = [...document.querySelectorAll("main [data-catalog-body]")].filter(shown);
                  const challenge = (e) => e.closest("section[id]")?.previousElementSibling?.textContent === "The challenge";
                  const reference = bodies.filter((e) => !challenge(e));
                  return {
                     dark: document.documentElement.classList.contains("dark"),
                     reveals: reveals.length,
                     open: reveals.filter((e) => e.open).length,
                     outlineOpen: [...document.querySelectorAll("main details:not([data-reveal])")].filter((e) => e.open).length,
                     visibleBodies: bodies.length,
                     challengeBodies: bodies.length - reference.length,
                     referenceBodies: reference.length,
                     referenceChars: reference.reduce((sum, e) => sum + e.textContent.trim().length, 0),
                     staged: !!document.querySelector("main [aria-labelledby='problem_interview']"),
                     everythingControls: [...document.querySelectorAll("main button")].filter((e) => shown(e) && /everything/i.test(e.textContent)).length,
                     overflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
                  };
               });
               rows.push({
                  route, width, theme, status, themeApplied: found.dark === (theme === "dark"), ...found,
                  errors: errors.length, hydrationErrors: errors.filter((text) => HYDRATION.test(text)).length, ...(errors.length > 0 && { errorTexts: errors }),
               });
            }
            await close();
         }
      }
      return rows;
   },

   /** P4-T18: a Problem at each viewport and theme (S-LAY-1, S-LAY-4, S-AX-1 … S-AX-3, S-AX-9): overflow, bands before reference, heading outline, disclosure names and expanded states, and reveal motion. */
   async problem({ browser, config, routes }) {
      const rows = [];
      // The phone and rail outlines each hold one; only one is displayed at a width.
      const everything = (page) => page.locator("main button").filter({ hasText: /^(Show|Hide) everything$/, visible: true });
      for (const width of list(config.viewports).map(Number)) {
         for (const theme of list(config.themes)) {
            const { page, close } = await open(browser, { width, height: 900, theme, cookies: identityCookies(config) });
            const session = await page.context().newCDPSession(page);
            for (const route of routes) {
               const { status, errors } = await visit(page, config, route);
               // Order is read from the structure, never from the bodies: the bands the outline lists against the Reference Solution surface (else the Review group), whatever is open or closed.
               const layout = await page.evaluate(() => {
                  const ids = [...new Set([...document.querySelectorAll("nav[aria-label='Outline'] a[href^='#problem_']")].map((link) => link.getAttribute("href").slice(1)))];
                  const found = ids.map((id) => document.getElementById(id));
                  const interview = found.filter((element) => element?.closest("[aria-labelledby='problem_interview']"));
                  const listedReview = found.filter((element) => element?.closest("[aria-labelledby='problem_review']"));
                  const anchor = document.getElementById("problem_reference_solution") ?? document.getElementById("problem_review");
                  const top = (element) => element.getBoundingClientRect().top + window.scrollY;
                  const tops = found.filter(Boolean).map(top);
                  return {
                     dark: document.documentElement.classList.contains("dark"),
                     overflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
                     staged: !!document.getElementById("problem_interview") || !!document.getElementById("problem_review"),
                     interviewIds: interview.map((element) => element.id.replace(/^problem_/, "")),
                     reviewIds: listedReview.map((element) => element.id.replace(/^problem_/, "")),
                     reveals: document.querySelectorAll("main details[data-reveal]").length,
                     listedBands: ids.length,
                     missingBands: ids.filter((id, index) => !found[index]),
                     interviewBands: interview.length,
                     bandHeadings: document.querySelectorAll("main [aria-labelledby='problem_interview'] h2").length,
                     referenceAnchor: anchor?.id ?? null,
                     // Surfaces with nothing to show are omitted: then the outline lists no Review band and no Review container may exist.
                     bandsBeforeReference: interview.length > 0 && (listedReview.length === 0 ? !anchor : !!anchor && interview.every((element) => top(element) < top(anchor))),
                     bandsInOrder: tops.every((value, index) => index === 0 || value >= tops[index - 1]),
                  };
               });
               const outlineAtLoad = await page.evaluate(headingOutline);
               const before = await disclosureNodes(session);
               const expected = expectedStructure(route, config.identity ?? "signed-out");
               const structure = {
                  expected: expected.kind,
                  ok: expected.kind === "staged"
                     ? expected.interview.length > 0 && sameSet(layout.interviewIds, expected.interview) && sameSet(layout.reviewIds, expected.review) && (expected.review.length > 0 || !(await page.locator("#problem_review").count()))
                     : (expected.kind === "none" || expected.kind === "locked") && !layout.staged && layout.listedBands === 0,
                  ...(expected.kind === "staged" && { expectedInterview: expected.interview, expectedReview: expected.review, interviewIds: layout.interviewIds, reviewIds: layout.reviewIds }),
               };
               const row = {
                  kind: "layout", route, identity: config.identity ?? "signed-out", width, theme, status, themeApplied: layout.dark === (theme === "dark"), structure, ...layout,
                  headings: outlineAtLoad, disclosures: before.length, unnamed: before.filter((node) => !node.name).length,
                  expandedAtLoad: before.filter((node) => node.expanded !== false).length,
               };
               const first = page.locator("main details[data-reveal] > summary").filter({ visible: true }).first();
               if (await first.count()) {
                  await first.click();
                  const after = await disclosureNodes(session);
                  row.afterOne = { expanded: after.filter((node) => node.expanded === true).length, focusStays: await first.evaluate((element) => element === document.activeElement), shownAs: await first.evaluate((element) => element.parentElement.open) };
                  await first.click();
               }
               // Show everything lives in the outline, which is a collapsed disclosure on a phone.
               const toggle = page.locator("main details:not([data-reveal]) > summary").filter({ visible: true }).first();
               if ((await toggle.count()) && !(await everything(page).first().isVisible())) await toggle.click();
               // Not applicable (reported as such) when the route has no reveal content; otherwise the control must exist and must open every reveal.
               row.showAllApplicable = layout.reveals > 0;
               row.showAllControl = await everything(page).first().isVisible();
               if (row.showAllControl) {
                  await everything(page).first().click();
                  const total = await page.locator("main details[data-reveal]").count();
                  const open = await page.locator("main details[data-reveal][open]").count();
                  const all = await disclosureNodes(session);
                  row.showAll = { total, open, expanded: all.filter((node) => node.expanded === true).length, unnamed: all.filter((node) => !node.name).length, headings: await page.evaluate(headingOutline) };
               }
               rows.push({ ...row, errors: errors.length, hydrationErrors: errors.filter((text) => HYDRATION.test(text)).length });
            }
            await close();
         }
      }
      // Reveals use short size and opacity transitions, instant under reduced motion (S-AX-9); `no-preference` is the control that shows the meter can see motion.
      for (const preference of ["reduce", "no-preference"]) {
         const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", reducedMotion: preference });
         await context.addInitScript(MOTION_INIT);
         if (config.identity) await context.addCookies(identityCookies(config));
         const page = await context.newPage();
         for (const route of routes) {
            const { status } = await visit(page, config, route);
            const summary = page.locator("main details[data-reveal] > summary").filter({ visible: true }).first();
            if (!(await summary.count())) continue;
            await summary.click();
            const motion = await summary.evaluate(async (element) => (await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))), window.__motion(element.parentElement)));
            rows.push({ kind: "motion", route, preference, status, ...motion });
         }
         await context.close();
      }
      return rows;
   },

   async console({ browser, config, routes }) {
      const { page, close } = await open(browser);
      const rows = [];
      for (const route of routes) {
         const { status, errors } = await visit(page, config, route);
         rows.push({ route, status, errors, hydrationErrors: errors.filter((text) => HYDRATION.test(text)).length });
      }
      await close();
      return rows;
   },

   /** P6-T19 (S6-PERF-4, -5, -6): one cell per route, profile and condition, holding every run and the median and p75 of each metric. */
   async timing({ browser, config, routes }) {
      const cells = [];
      for (const route of routes) {
         for (const profile of list(config.profiles)) {
            for (const condition of list(config.conditions)) {
               console.error(`probe: timing ${pathOf(route)} ${profile} ${condition} x${config.runs}`);
               const runs = [];
               for (let run = 1; run <= Number(config.runs); run++) {
                  const startedAt = new Date().toISOString();
                  runs.push({ run, startedAt, ...(await timedRun(browser, config, route, PROFILES[profile], condition).catch((error) => ({ error: errorText(error) }))) });
               }
               cells.push({ route: pathOf(route), profile, condition, failedRuns: runs.filter((run) => run.error).length, summary: summarizeCell(runs), runs });
            }
         }
      }
      return cells;
   },
};

/** A finding is a row the caller should look at; `--strict` turns any finding into a non-zero exit. */
const FINDING = {
   overflow: (row) => row.overflows || !row.themeApplied || row.errors > 0 || row.status !== 200,
   requests: () => false,
   offset: (row) => !row.matched,
   console: (row) => row.errors.length > 0,
   // A failed run, a page that did not answer 200 or an interaction that failed (not one that does not apply) makes the cell's medians untrustworthy.
   timing: (cell) => cell.failedRuns > 0 || cell.runs.some((run) => (run.status !== undefined && run.status !== 200) || Object.values(run.interactions ?? {}).some((outcome) => outcome.status === "failed")),
   // Only the challenge may be showing at load; a Problem without a spine (a backend before P4) shows no body at all.
   reveal: (row) => row.errors > 0 || row.status !== 200 || !row.themeApplied || row.open > 0 || row.outlineOpen > 0 || row.referenceBodies > 0 || row.challengeBodies > (row.staged ? 1 : 0) || row.overflowPx > 0,
   // P2 contrast standard: 4.5:1 for text.
   syntax: (row) => row.errors > 0 || !row.themeApplied || row.minContrast < 4.5 || row.plainBlocksWithTokens > 0 || row.tokens.length === 0,
   expand: (row) => {
      if (row.errors > 0) return true;
      if (!row.opened) return row.fittingTabStops.some((stops) => stops > 0);
      const { dialog: d, viewport: v } = row;
      return !(
         d.left >= GUTTER_EXPAND - 0.5 && d.right <= v.width - GUTTER_EXPAND + 0.5 && d.top >= GUTTER_EXPAND - 0.5 && d.bottom <= v.height - GUTTER_EXPAND + 0.5 &&
         !row.overflowX && !row.documentGrew && !row.pageScrolledBehind && row.bodyLocked && row.regionFocused && row.trapped && row.afterTab.inside &&
         row.svgWidth === row.viewBoxWidth && row.duplicateIds.length === 0 && row.touchActions.length === 0 && !row.userScalingDisabled &&
         row.exposed.nodes === 0 && row.page.notInert.length === 0 && row.page.inertCount > 0 && !row.page.dialogInert && !row.page.backdropInert &&
         row.closers.escape && row.closers.close && row.closers.backdrop && row.restored.escape && row.restored.close && row.restored.backdrop && row.requestsWhileOpen === 0 && row.catalogRequests === 0 &&
         row.themeFlip.before.dialog && row.themeFlip.flipped.dialog && row.themeFlip.flipped.inline && row.themeFlip.stillOpen
      );
   },
   order: (row) => row.errors > 0 || row.bareNames.length > 0 || !row.namesStateDestination || !row.distinctNavNames || row.nextFirstAfterBody === false || row.relationsBeforeNext.length > 0,
   axe: (row) => row.errors > 0 || row.blocking > 0 || (row.control && !row.detected),
   interact: (row) =>
      row.errors > 0 || row.state.p3Changed || row.steps.some((s) => !s.step.startsWith("navigate:") && (s.clientFetches > 0 || s.rsc > 0 || s.catalogReads > 0)),
   keys: (row) => row.errors > 0 || Object.values(row.checks).some((check) => check.ok === false),
   // Under `reduce` nothing may declare more than 1ms or still be animating; `no-preference` rows are the control that shows the meter can see motion.
   motion: (row) => row.preference === "reduce" && Object.values(row.surfaces).some((s) => s.declaredMs > 1 || s.running > 0 || s.closeMs > 100),
   // P4-T18: every expected band is present (and no unexpected one), ordered before the Reference Solution or Review group; a route with reveals has a Show everything control that opens them all (not applicable otherwise); no sideways scroll, one h1 and no level jump between structural headings, every disclosure named and collapsed at load, one press expands one control, no motion under `reduce`.
   problem: (row) =>
      row.kind === "motion"
         ? row.preference === "reduce" && (row.declaredMs > 1 || row.running > 0)
         : row.errors > 0 || row.status !== 200 || !row.themeApplied || row.overflowPx > 0 || !row.structure.ok ||
           (row.structure.expected === "staged" && !(row.listedBands > 0 && row.missingBands.length === 0 && row.bandHeadings === row.interviewBands && row.bandsBeforeReference && row.bandsInOrder)) ||
           row.headings.h1 !== 1 || row.headings.skips.length > 0 || row.headings.empty > 0 || row.headings.inSummary > 0 ||
           row.unnamed > 0 || row.expandedAtLoad > 0 ||
           (row.showAllApplicable && (!row.afterOne || !row.showAllControl)) ||
           (row.afterOne && !(row.afterOne.expanded === 1 && row.afterOne.focusStays && row.afterOne.shownAs)) ||
           (row.showAll && (row.showAll.open !== row.showAll.total || row.showAll.total < row.reveals || row.showAll.expanded < row.showAll.total || row.showAll.unnamed > 0 || row.showAll.headings.skips.length > 0 || row.showAll.headings.empty > 0 || row.showAll.headings.inSummary > 0)),
   panel: (row) =>
      row.errors > 0 ||
      (row.toggles > 0 &&
         !(row.opened && row.withinViewport && row.withinColumn && !row.coversReference && row.belowReference && row.overflowPx === 0 && row.insidePhrasing && row.escapeClosed && row.focusReturned && row.outsideClosed && row.oneOpen !== false)),
};

const { options: config, modes } = parseArgs(process.argv.slice(2));
const routes = list(config.routes ?? "");
const unknown = modes.filter((mode) => !(mode in MODES));
const selfCheck = config.selfCheck && modes.join() === "timing";
if (modes.length === 0 || unknown.length > 0 || (routes.length === 0 && !selfCheck)) {
   console.error(`usage: probe.mjs <${Object.keys(MODES).join("|")}>[,...] --routes /a,/b${unknown.length ? ` (unknown mode: ${unknown})` : ""}`);
   process.exit(2);
}

let baseUrl;
try {
   baseUrl = new URL(config.base);
} catch {
   console.error("the base URL is not a valid URL");
   process.exit(2);
}
for (const url of [config.base, config.api].filter(URL.canParse)) secrets.push(...[new URL(url).username, new URL(url).password].filter(Boolean));
try {
   config.headers = runtimeHeaders();
} catch (error) {
   console.error(error.message);
   process.exit(2);
}
secrets.push(...Object.values(config.headers).filter(Boolean));
const unsupported = [...list(config.profiles).filter((name) => !(name in PROFILES)), ...list(config.conditions).filter((name) => !["cold", "warm"].includes(name))];
if (modes.includes("timing") && (!(Number(config.runs) >= 10) || !Number.isInteger(Number(config.runs)) || unsupported.length > 0)) {
   console.error(`timing needs --runs of at least 10 and known profiles (${Object.keys(PROFILES)}) and conditions (cold, warm)${unsupported.length ? `; unknown: ${unsupported}` : ""}`);
   process.exit(2);
}

const browser = await chromium.launch();
const startedAt = new Date().toISOString();
const output = reportOf(config, routes);
try {
   if (selfCheck) {
      const result = await timingSelfCheck(browser);
      console.log(render(result));
      process.exitCode = result.ok ? 0 : 1;
   } else {
      for (const mode of modes) {
         console.error(`probe: ${mode} (${routes.length} routes)`);
         output.results[mode] = await MODES[mode]({ browser, config, routes });
         output.findings += output.results[mode].filter(FINDING[mode]).length;
      }
      if (modes.includes("timing")) output.timing = timingMeta(config, browser, startedAt);
      console.log(render(output));
      process.exitCode = config.strict && output.findings > 0 ? 1 : 0;
   }
} catch (error) {
   if (!modes.includes("timing")) throw error;
   console.error(errorText(error));
   process.exitCode = 1;
} finally {
   await browser.close();
}
