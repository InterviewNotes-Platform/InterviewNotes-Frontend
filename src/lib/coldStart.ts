/**
 * While the free-tier API is starting (about 30 to 60 s after it has slept), a catalog item or Track page cannot know
 * whether its item exists, is withdrawn or is locked. Rather than wait out the wake, or answer 200 before those checks,
 * Proxy answers such a request with a temporary 503: the same response for every client, carrying `Retry-After`, never
 * indexed or stored, naming nothing about the item. Once the API answers, the page renders as it always has, with its
 * 200, 401, 402, 404 or 410. A retry is a fresh request, so every check runs again.
 */

const ITEM_ROUTE = /^\/(?:lessons|problems|knowledge|tracks)\/[^/]+\/?$/;
const PROBE_PATH = "/content/health";
const DEFAULT_BUDGET_MS = 5000;
/** How long an answer from the API counts as proof it is awake; it sleeps only after about 15 idle minutes. */
const DEFAULT_FRESH_MS = 60_000;
/** A probe outlives the request that started it, so the API keeps waking, but not forever. */
const PROBE_CAP_MS = 90_000;
export const RETRY_AFTER_SECONDS = 15;

export function isItemRoute(pathname: string): boolean {
   return ITEM_ROUTE.test(pathname);
}

function setting(value: string | undefined, fallback: number): number | null {
   if (value === "off") return null;
   const parsed = value === undefined || value === "" ? NaN : Number(value);
   return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

let lastAnswerAt = Number.NEGATIVE_INFINITY;
let inflight: Promise<boolean> | null = null;

/** Test hook: forget what this instance knows about the API. */
export function resetApiReadiness(): void {
   lastAnswerAt = Number.NEGATIVE_INFINITY;
   inflight = null;
}

/** One probe at a time per instance. A 5xx or no answer means the API cannot serve the page yet. */
function probe(base: string): Promise<boolean> {
   inflight ??= fetch(`${base}${PROBE_PATH}`, { cache: "no-store", signal: AbortSignal.timeout(PROBE_CAP_MS) })
      .then(
         (res) => res.status < 500,
         () => false
      )
      .then((up) => {
         if (up) lastAnswerAt = Date.now();
         inflight = null;
         return up;
      });
   return inflight;
}

/** Whether the API answered within `budgetMs`. The probe is never cancelled at the budget. */
export async function apiAnswers(base: string, budgetMs: number, freshMs: number): Promise<boolean> {
   if (Date.now() - lastAnswerAt < freshMs) return true;
   let timer: ReturnType<typeof setTimeout> | undefined;
   const late = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), budgetMs);
   });
   try {
      return await Promise.race([probe(base), late]);
   } finally {
      clearTimeout(timer);
   }
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Starting up · InterviewNotes</title>
<style>
:root{color-scheme:light dark;--bg:#fbf8f1;--fg:#1a1612;--muted:#5c544a;--accent:#8a4b1f}
@media (prefers-color-scheme:dark){:root{--bg:#1a1612;--fg:#f3ede2;--muted:#b8ad9c;--accent:#e0a370}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:36rem;margin:0 auto;padding:12vh 1.5rem 3rem}
h1{font-size:1.5rem;line-height:1.3;margin:0 0 .75rem}
p{margin:0 0 1rem;color:var(--muted)}
a{color:var(--accent);text-underline-offset:3px}
a:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:2px}
.actions{display:flex;gap:1.5rem;flex-wrap:wrap}
</style>
</head>
<body>
<main>
<h1>This page is temporarily unavailable</h1>
<p>The InterviewNotes server is starting, which can take up to a minute.</p>
<p role="status" aria-live="polite" id="retry-status">Try again in a moment.</p>
<noscript><p>Reload this page in a minute to see it.</p></noscript>
<p class="actions"><a href="">Try again</a><a href="/">Go to the homepage</a></p>
</main>
<script>
(function () {
  var delays = [15, 15, 20, 30], key = "in-cold-start-retry:" + location.pathname, now = Date.now(), state;
  try { state = JSON.parse(sessionStorage.getItem(key) || "null"); } catch (e) { state = null; }
  if (!state || now - state.at > 180000) state = { tries: 0, at: now };
  var status = document.getElementById("retry-status");
  if (state.tries >= delays.length) {
    status.textContent = "This is taking longer than usual. Try again, or come back later.";
    try { sessionStorage.removeItem(key); } catch (e) {}
    return;
  }
  var wait = delays[state.tries];
  status.textContent = "This page will reload automatically in " + wait + " seconds.";
  function reload() {
    if (document.hidden) { document.addEventListener("visibilitychange", reload, { once: true }); return; }
    try { sessionStorage.setItem(key, JSON.stringify({ tries: state.tries + 1, at: Date.now() })); } catch (e) {}
    location.reload();
  }
  setTimeout(reload, wait * 1000);
})();
</script>
</body>
</html>
`;

/** The temporary answer: the same for every client, and free of anything about the requested item. */
export function startingResponse(method: string): Response {
   return new Response(method === "HEAD" ? null : PAGE, {
      status: 503,
      headers: {
         "Content-Type": "text/html; charset=utf-8",
         "Cache-Control": "private, no-store",
         "Retry-After": String(RETRY_AFTER_SECONDS),
         "X-Robots-Tag": "noindex, nofollow",
      },
   });
}

/**
 * The 503 when this request is for an item or Track page and the API has not answered within the budget; otherwise
 * null, and the page renders as before. No `API_URL`, `API_WAKE_BUDGET_MS=off` or a non-GET/HEAD request is never gated.
 */
export async function coldStartGate(
   method: string,
   pathname: string,
   env: { API_URL?: string; API_WAKE_BUDGET_MS?: string; API_WAKE_FRESH_MS?: string }
): Promise<Response | null> {
   if ((method !== "GET" && method !== "HEAD") || !isItemRoute(pathname)) return null;
   const base = env.API_URL?.replace(/\/$/, "");
   const budget = setting(env.API_WAKE_BUDGET_MS, DEFAULT_BUDGET_MS);
   if (!base || budget === null) return null;
   const fresh = setting(env.API_WAKE_FRESH_MS, DEFAULT_FRESH_MS) ?? 0;
   return (await apiAnswers(base, budget, fresh)) ? null : startingResponse(method);
}
