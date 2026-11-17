// P8-RSP-02 diagnostic, never shipped: the one boundary between what the RSP harness observes and what it writes
// to disk or prints. v3 replaces v2's identifier blacklist with allowlists:
//
//   routeTemplate  a path keeps only segments from STATIC_SEGMENTS; every other segment becomes a named parameter
//                  (`[slug]` after a catalog area, `[id]` anywhere else, `[asset]` for build files), so an email,
//                  a short answer id or a question title in a path never survives, whatever its shape.
//   sanitizeUrl    origin only for an allowlisted host, the route template, and query KEYS only from QUERY_KEYS
//                  (any other key is `[key]`). Never a query value, a fragment or userinfo.
//   sanitizeHeaders the KEEP_HEADERS subset; `location` becomes a sanitized URL, other values pass safeString.
//   errorKind      an arbitrary error becomes one fixed label; its message is never kept.
//   safeOutput     the final gate: only keys in SAFE_KEYS survive, and every string value passes its key's policy
//                  (v3.1): URL and path keys are re-templated here even if the caller forgot to sanitize; fixed-label
//                  keys accept only their labels; free-text keys accept only the caller's registered constants.
//                  Depth and array length are bounded. rsp-measure.mjs passes every results file through it.
//   safeLine       the same for a console line.
//
// Timings, navigation types, HTTP status codes and request counts are numbers or fixed labels and pass unchanged.

export const KEEP_HEADERS = ["cache-control", "cache-status", "age", "server-timing", "x-nextjs-cache", "x-nextjs-prerender", "x-nextjs-stale-time", "vary", "content-type", "location"];

// Route words the frontend and the catalog API use. A segment not listed here is never written.
const STATIC_SEGMENTS = new Set([
   "", "tracks", "lessons", "problems", "knowledge", "practice", "prepare", "answers", "stories", "questions", "data",
   "collections", "login", "logout", "signup", "auth", "callback", "confirm", "verify", "pricing", "checkout", "privacy", "terms",
   "demo", "about", "account", "settings", "learn", "catalog", "items", "lesson", "problem", "related", "meta", "me",
   "prep", "health", "v1", "api", "_next", "static", "chunks", "app", "css", "media", "image", "favicon.ico", "robots.txt",
   "sitemap.xml", "manifest.webmanifest", "icon.svg",
]);
// A segment after one of these is a public catalog slug; it is still templated, but named for readability.
const SLUG_PARENTS = new Set(["tracks", "lessons", "problems", "knowledge", "lesson", "problem"]);
// Query keys the measured routes are known to use. Any other key, which could itself be user data, is `[key]`.
const QUERY_KEYS = new Set(["_rsc", "next", "redirect_to", "redirect", "returnTo", "code", "token", "type", "error", "error_description", "state", "q", "page", "level", "tab", "mode", "view", "url", "w", "dpl"]);
// Hosts whose name may be written; any other origin is `[other-origin]`.
const SAFE_HOST = /^(?:127\.0\.0\.1|localhost|(?:[a-z0-9-]+\.)*(?:interviewnotes\.io|netlify\.app|onrender\.com|supabase\.co|googleapis\.com|gstatic\.com|stripe\.com))$/;

const MAX_STRING = 200;
const TEMPLATE_SEGMENT = /^\[(?:slug|id|asset)\]$/;

export function routeTemplate(pathname) {
   const segments = String(pathname ?? "").split("/");
   const out = segments.map((segment, i) => {
      const lower = segment.toLowerCase();
      if (STATIC_SEGMENTS.has(lower)) return lower;
      if (TEMPLATE_SEGMENT.test(segment)) return segment; // already a template: re-templating is idempotent
      if (segments[1] === "_next") return "[asset]";
      return SLUG_PARENTS.has(segments[i - 1]?.toLowerCase()) ? "[slug]" : "[id]";
   });
   return out.join("/").slice(0, MAX_STRING) || "/";
}

/** `raw` resolved against `base`: an allowlisted cross-site origin, the route template and allowlisted query keys. */
export function sanitizeUrl(raw, base) {
   try {
      const u = new URL(raw, base);
      const keys = [...new Set([...u.searchParams.keys()].map((k) => (QUERY_KEYS.has(k) ? k : "[key]")))].sort();
      const sameOrigin = base ? u.origin === new URL(base).origin : false;
      const origin = sameOrigin ? "" : SAFE_HOST.test(u.hostname) ? `${u.protocol}//${u.host}` : "[other-origin]";
      return origin + routeTemplate(u.pathname) + (keys.length ? `?${keys.join("&")}` : "");
   } catch {
      return "<unparseable>";
   }
}

/** Back-compatible name: a path is written only as its route template. */
export const sanitizePath = routeTemplate;

// A value that may be written as-is: short, printable, and with none of the characters that carry an email
// address, a percent-encoded value, a URL query or fragment, or a long opaque token.
const SAFE_STRING = /^[A-Za-z0-9 _\-.,;:=/[\]<>"'^*()+|!]*$/;
const OPAQUE_RUN = /[A-Za-z0-9_-]{33,}|ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;

// A path inside free text (after a start, space, quote, `=` or `(`), e.g. an error naming `/prepare/answers/a1b2`.
const EMBEDDED_PATH = /(^|[\s"'(=])(\/[^\s"')]*)/g;

export function safeString(value) {
   const s = String(value);
   if (s.length > MAX_STRING || !SAFE_STRING.test(s) || OPAQUE_RUN.test(s)) return "[omitted]";
   return s.replace(EMBEDDED_PATH, (_, lead, path) => lead + routeTemplate(path));
}

/**
 * v3.1: a URL or path value as the output boundary writes it, whatever the caller passed: raw, absolute, relative or
 * already sanitized. An allowlisted origin (else `[other-origin]`), the route template, allowlisted query keys only.
 * Never a value, fragment or userinfo. Idempotent on its own output.
 */
export function anonymizeUrlField(value) {
   const s = String(value);
   if (s === "<unparseable>") return s;
   const m = s.match(/^(\[other-origin\]|[a-z][a-z0-9+.-]*:\/\/[^/?#]*)?([^?#]*)(?:\?([^#]*))?/i);
   let origin = "";
   if (m[1] === "[other-origin]") origin = m[1];
   else if (m[1]) {
      try {
         const u = new URL(m[1]);
         origin = /^https?:$/.test(u.protocol) && SAFE_HOST.test(u.hostname) ? `${u.protocol}//${u.host}` : "[other-origin]";
      } catch {
         origin = "[other-origin]";
      }
   }
   const rawPath = m[2] || "/";
   const path = routeTemplate(rawPath.startsWith("/") ? rawPath : `/${rawPath}`);
   const keys = m[3]
      ? [...new Set(m[3].split("&").filter(Boolean).map((pair) => {
           let key = pair.split("=")[0];
           try {
              key = decodeURIComponent(key.replace(/\+/g, " "));
           } catch {}
           return QUERY_KEYS.has(key) ? key : "[key]";
        }))].sort()
      : [];
   return origin + path + (keys.length ? `?${keys.join("&")}` : "");
}

/**
 * v3.1: the redirect target to record, or null. Compares the requested and the final pathname as raw paths (decoded
 * the same way by URL), before either is templated, so an ordinary dynamic page (`/lessons/a` → `/lessons/a`) is not
 * a redirect. Only the target's template is returned.
 */
export function redirectTarget(requested, finalUrl, base) {
   try {
      const from = new URL(requested, base).pathname;
      const to = new URL(finalUrl, base).pathname;
      return from === to ? null : routeTemplate(to);
   } catch {
      return null;
   }
}

/** The KEEP_HEADERS subset of `headers` (lower-case names); `location` sanitized, every value through safeString. */
export function sanitizeHeaders(headers, base) {
   const kept = {};
   for (const name of KEEP_HEADERS) {
      const value = headers?.[name];
      if (value === undefined || value === null) continue;
      kept[name] = name === "location" ? sanitizeUrl(value, base) : safeString(value);
   }
   return kept;
}

/** A fixed label for an error; the message (which can hold a URL, a selector match or page text) is never kept. */
export function errorKind(error) {
   const text = String(error?.message ?? error ?? "");
   const net = text.match(/\bnet::(ERR_[A-Z_]+)\b/);
   if (net) return `net::${net[1]}`;
   if (/timeout|timed out/i.test(text)) return "timeout";
   if (/navigat|page\.goto|ERR_/i.test(text)) return "navigation";
   if (/selector|locator|element/i.test(text)) return "selector";
   if (/closed|detached|crash/i.test(text)) return "target-closed";
   return "other";
}

// Every key the harness may write. A key not listed here, anywhere in the tree, is dropped.
export const SAFE_KEYS = new Set([
   // file
   "tool", "env", "base", "label", "started", "finished", "runsPerJourney", "settleMs", "profile", "warmup", "journeys", "variant",
   // warmup
   "path", "status", "wallMs", "note",
   // journey
   "id", "name", "kind", "stats", "notExercised", "runs",
   "forward", "back", "historyForward", "repeat",
   "feedback", "pending", "markedFeedback", "content", "usable", "navigationTypes", "n", "median", "p75", "worst", "best",
   // run
   "run", "from", "clicked", "selector", "source", "error", "hoverMs", "requestsDuringHover", "serverCallsDuringHover",
   "finalPath", "redirectedTo", "documentTtfbMs", "documentLoadMs", "documentHeaders", "prefetchBeforeClick",
   // action
   "navigationType", "clickToFeedbackMs", "clickToUrlChangeMs", "clickToPendingMs", "pendingKind", "clickToMarkedFeedbackMs",
   "clickToFirstMutationMs", "clickToContentMs", "clickToUsableMs", "timedOut", "contentPath", "contentHeadingChanged",
   "navRequests", "requestCount", "requestsByType", "scriptRequests", "prefetchAfterClick", "failed", "longTasks", "serverApiCalls",
   "url", "type", "method", "prefetch", "startMs", "headersMs", "ttfbMs", "endMs", "transfer", "streamCancelled", "headers",
   "count", "totalMs", "maxMs",
   // rsp-input-probe.mjs
   "mode", "pendingMs", "urlChangeMs",
   // resource types (requestsByType keys)
   "document", "stylesheet", "image", "media", "font", "script", "texttrack", "xhr", "fetch", "eventsource", "websocket", "manifest", "other", "ping", "preflight",
   ...KEEP_HEADERS,
]);

// v3.1: what a string under each key may be. A key with no policy here has no string values in the harness's output;
// should one appear, it gets `text` (safeString, embedded paths templated).
const ERROR_LABEL = /^(?:net::ERR_[A-Z_]{1,60}|timeout|navigation|selector|target-closed|other)$/;
const enumOf = (...labels) => (s) => labels.includes(s);
const POLICY = {
   // URL and path fields: re-templated here, whatever the caller did.
   url: "url", path: "url", from: "url", clicked: "url", finalPath: "url", contentPath: "url", redirectedTo: "url", location: "url", base: "url",
   // Fixed labels.
   error: ERROR_LABEL.test.bind(ERROR_LABEL),
   streamCancelled: ERROR_LABEL.test.bind(ERROR_LABEL),
   status: ERROR_LABEL.test.bind(ERROR_LABEL), // a number normally; a string only for a failed warm-up
   pendingKind: enumOf("link", "route"),
   navigationType: enumOf("client-transition", "full-document-load"),
   navigationTypes: enumOf("client-transition", "full-document-load"),
   kind: enumOf("click", "history", "repeat"),
   type: enumOf("document", "stylesheet", "image", "media", "font", "script", "texttrack", "xhr", "fetch", "eventsource", "websocket", "manifest", "other", "ping", "preflight"),
   method: enumOf("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"),
   mode: enumOf("keyboard", "touch"),
   id: (s) => /^J\d{1,2}$/.test(s),
   started: (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s),
   finished: (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s),
   // Operator-chosen run labels (CLI): one short token, no spaces, so no sentence or title fits.
   env: (s) => /^[A-Za-z0-9._-]{1,64}$/.test(s),
   label: (s) => /^[A-Za-z0-9._-]{1,64}$/.test(s),
   variant: (s) => /^[A-Za-z0-9._-]{1,64}$/.test(s),
   // Free text the harness itself writes (journey names, selectors, notes): only the caller's registered constants.
   name: "constant", selector: "constant", notExercised: "constant", note: "constant", profile: "constant", tool: "constant",
};
for (const header of KEEP_HEADERS) if (header !== "location") POLICY[header] = "text";

// Keys whose value is a URL or path must leave in the sanitized shape; anything else is omitted.
const URL_SHAPE = /^(?:https?:\/\/[a-z0-9.-]+(?::\d+)?|\[other-origin\])?(?:\/[a-z0-9._\-[\]]*)*(?:\?[A-Za-z_[\]]+(?:&[A-Za-z_[\]]+)*)?$|^<unparseable>$/;
const MAX_DEPTH = 12;
const MAX_ITEMS = 500;

function safeValue(key, s, constants) {
   const policy = POLICY[key] ?? "text";
   if (policy === "url") {
      const out = anonymizeUrlField(s);
      return out.length <= MAX_STRING && URL_SHAPE.test(out) ? out : "[omitted]";
   }
   if (policy === "constant") return constants.has(s) ? s : "[omitted]";
   if (policy === "text") return safeString(s);
   return policy(s) ? s : "[omitted]";
}

function gate(value, key, constants, depth) {
   if (value === null || value === undefined) return null;
   if (typeof value === "number") return Number.isFinite(value) ? value : null;
   if (typeof value === "boolean") return value;
   if (typeof value === "string") return safeValue(key, value, constants);
   if (depth >= MAX_DEPTH) return "[omitted]";
   if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => gate(v, key, constants, depth + 1));
   if (typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value)) if (SAFE_KEYS.has(k)) out[k] = gate(v, k, constants, depth + 1);
      return out;
   }
   return "[omitted]";
}

/**
 * The final gate for anything written. Unknown keys are dropped; every string passes its key's policy (POLICY).
 * `constants`: the fixed free-text strings the caller itself wrote (journey names, selectors, notes); any other
 * free text under those keys is omitted, so a page title can never pass as a "name".
 * @param {unknown} value
 * @param {{ constants?: string[] }} [options]
 */
export function safeOutput(value, { constants = [] } = {}) {
   return gate(value, undefined, new Set(constants), 0);
}

/**
 * One value under `key`'s policy, for a console line or any single field written outside safeOutput.
 * @param {string} key
 * @param {unknown} value
 * @param {string[]} [constants]
 */
export function safeField(key, value, constants = []) {
   return typeof value === "string" ? safeValue(key, value, new Set(constants)) : value;
}

/** A console line: fixed text from the harness plus values that pass safeString (embedded paths templated). */
export function safeLine(template, ...values) {
   return template.reduce((line, part, i) => line + part + (i < values.length ? (typeof values[i] === "number" ? values[i] : safeString(values[i] ?? "")) : ""), "");
}
