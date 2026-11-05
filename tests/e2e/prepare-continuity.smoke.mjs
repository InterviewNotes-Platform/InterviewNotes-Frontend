// Standalone smoke for the Continue card and bookmarks list on /prepare (P7-T48). Not part of `playwright test`.
// Run from the repo root: node tests/e2e/prepare-continuity.smoke.mjs   (SMOKE_SHOTS=<dir> also saves screenshots)
// It starts the catalog/auth double, a small /me/prep double that follows api-contract §15, and one Next dev server,
// then stops only the processes it started.
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";

const fixture = JSON.parse(readFileSync(new URL("./catalog/fixture.json", import.meta.url), "utf8"));
const [CATALOG_PORT, AUTH_PORT, PREP_PORT, WEB_PORT] = [3171, 3172, 3173, 3174];
const CATALOG = `http://127.0.0.1:${CATALOG_PORT}`;
const AUTH = `http://127.0.0.1:${AUTH_PORT}`;
const PREP = `http://127.0.0.1:${PREP_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const LESSON = "lesson.p3-seq-one";
const PROBLEM = "problem.p3-seq-check";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const SENTINEL_TIME = "2026-11-05T10:11:12Z";
const children = [];
const failures = [];

const state = { continuity: true, rows: [], fail: false, log: [] };
const reset = () => Object.assign(state, { continuity: true, fail: false, log: [], rows: [
   { content_id: PROBLEM, completed_at: null, last_visited_at: "2026-11-05T09:00:00Z", bookmarked_at: SENTINEL_TIME, note: null, version: 1 },
   { content_id: LESSON, completed_at: null, last_visited_at: "2026-11-05T11:00:00Z", bookmarked_at: "2026-11-05T08:00:00Z", note: null, version: 1 },
] });

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PATCH, OPTIONS" };
const send = (res, status, body) => res.writeHead(status, { ...CORS, "content-type": "application/json", "cache-control": "private, no-store" }).end(JSON.stringify(body));

function list(url, column) {
   const limit = Number(url.searchParams.get("limit") ?? 50);
   const offset = Number(url.searchParams.get("offset") ?? 0);
   const rows = state.rows.filter((row) => row[column]).sort((a, b) => b[column].localeCompare(a[column]) || a.content_id.localeCompare(b.content_id));
   return { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset };
}

const prep = createServer((req, res) => {
   const url = new URL(req.url, PREP);
   if (req.method === "OPTIONS") return res.writeHead(204, CORS).end();
   if (url.pathname === "/__state") {
      for (const [key, value] of url.searchParams) {
         if (key === "continuity") state.continuity = value === "1";
         if (key === "fail") state.fail = value === "1";
         if (key === "empty") state.rows = value === "1" ? [] : state.rows;
         if (key === "reset") reset();
      }
      return send(res, 200, { ok: true });
   }
   if (url.pathname === "/__log") return send(res, 200, state.log);
   state.log.push(`${req.method} ${url.pathname}${url.search}`);
   if (!req.headers.authorization?.startsWith("Bearer ")) return send(res, 401, { code: "unauthenticated", detail: "no" });
   switch (url.pathname) {
      case "/me/prep/answers":
         return send(res, 200, { items: [], total: 0, limit: 100, offset: 0 });
      case "/me/prep/features":
         return send(res, 200, { item_state_available: state.continuity });
      case "/me/prep/item-state/recent":
      case "/me/prep/item-state/bookmarks":
         if (!state.continuity) return send(res, 404, { code: "not_found", detail: "Not found" });
         if (state.fail) return send(res, 500, { code: "internal_error", detail: "boom" });
         return send(res, 200, list(url, url.pathname.endsWith("recent") ? "last_visited_at" : "bookmarked_at"));
      default:
         return send(res, 404, { code: "not_found", detail: "Not found" });
   }
});

function start(command, args, env) {
   children.push(spawn(command, args, { env: { ...process.env, ...env }, stdio: "ignore", detached: true }));
}

function stopAll() {
   prep.close();
   for (const { pid } of children) {
      try {
         process.kill(-pid, "SIGTERM");
      } catch {
         // already gone
      }
   }
}

async function waitFor(url) {
   for (let i = 0; i < 180; i++) {
      try {
         if ((await fetch(url, { redirect: "manual" })).status > 0) return;
      } catch {
         // not up yet
      }
      await new Promise((r) => setTimeout(r, 1000));
   }
   throw new Error(`${url} did not come up`);
}

function check(name, ok, detail = "") {
   console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
   if (!ok) failures.push(name);
}

const control = (query) => fetch(`${PREP}/__state?${query}`);
const requestsMade = async () => (await (await fetch(`${PREP}/__log`)).json()).filter((line) => !line.startsWith("OPTIONS"));
const apiPaths = (lines) => lines.map((line) => line.split(" ")[1]);

const { token, user } = fixture.identities.unentitled;
const session = { access_token: token, refresh_token: "unused", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user };
const cookie = { name: `sb-${new URL(AUTH).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url: WEB };

async function openWorkspace(browser, viewport, signedIn = true) {
   const context = await browser.newContext({ viewport });
   if (signedIn) await context.addCookies([cookie]);
   const page = await context.newPage();
   const catalogCalls = [];
   page.on("request", (request) => {
      if (request.url().startsWith(CATALOG)) catalogCalls.push(request.url());
   });
   return { context, page, catalogCalls };
}

async function run() {
   reset();
   await new Promise((resolve) => prep.listen(PREP_PORT, "127.0.0.1", resolve));
   const env = { NEXT_DIST_DIR: ".next-smoke-t48", NEXT_TELEMETRY_DISABLED: "1", API_URL: CATALOG, NEXT_PUBLIC_API_URL: PREP, CATALOG_PREVIEW_TOKEN: "", NEXT_PUBLIC_SUPABASE_URL: AUTH, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "smoke-key", NEXT_PUBLIC_PREP_ENABLED: "true" };
   start("node", ["tests/e2e/catalog/fake-api.mjs", String(CATALOG_PORT), String(AUTH_PORT)], {});
   start("npx", ["next", "dev", "--webpack", "-p", String(WEB_PORT)], env);
   await Promise.all([waitFor(`${CATALOG}/health`), waitFor(`${WEB}/login`)]);

   const browser = await chromium.launch();
   try {
      for (const [label, viewport] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]]) {
         await control("reset=1");
         const { context, page, catalogCalls } = await openWorkspace(browser, viewport);
         await page.goto(`${WEB}/prepare`);
         const continueCard = page.getByRole("region", { name: "Continue" });
         const bookmarks = page.getByRole("region", { name: "Bookmarks" });
         await continueCard.getByRole("link", { name: "P3 Sequence One" }).waitFor({ timeout: 30000 });
         await bookmarks.getByRole("link", { name: "P3 Sequence Check" }).waitFor({ timeout: 15000 });
         if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/continuity-${label}.png`, fullPage: true });

         check(`${label}: Continue links the newest visit to its Lesson route`, (await continueCard.getByRole("link").getAttribute("href")) === "/lessons/p3-seq-one");
         const marked = await bookmarks.getByRole("link").evaluateAll((links) => links.map((link) => `${link.textContent} ${link.getAttribute("href")}`));
         check(`${label}: Bookmarks list newest first with reader routes`, JSON.stringify(marked) === JSON.stringify(["P3 Sequence Check /problems/p3-seq-check", "P3 Sequence One /lessons/p3-seq-one"]), JSON.stringify(marked));
         check(`${label}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

         const made = apiPaths(await requestsMade());
         const allowed = /^\/me\/prep\/(answers\?limit=100|features|item-state\/(recent\?limit=50|bookmarks\?limit=20))$/;
         check(`${label}: only the answers list, the capability read and the two lists were requested`, made.length > 0 && made.every((path) => allowed.test(path)), JSON.stringify(made));
         check(`${label}: the browser asked the catalog for nothing (titles came from the server)`, catalogCalls.length === 0, JSON.stringify(catalogCalls));

         const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }));
         check(`${label}: no browser storage written`, storage.local === 0 && storage.session === 0 && !/last_visited|bookmarked|P3 Sequence/.test(storage.cookies), JSON.stringify(storage));
         check(`${label}: the address carries no item state`, new URL(page.url()).search === "" && new URL(page.url()).hash === "");

         const found = await new AxeBuilder({ page }).withTags(TAGS).analyze();
         check(`${label}: axe finds no WCAG A/AA violation with both sections loaded`, found.violations.length === 0, found.violations.map((v) => `${v.id} (${v.nodes.length})`).join(", "));

         if (label === "1440") {
            await page.getByRole("link", { name: "Answer a question" }).focus();
            let reached = false;
            for (let i = 0; i < 12 && !reached; i++) {
               await page.keyboard.press("Tab");
               reached = await continueCard.getByRole("link").evaluate((link) => link === document.activeElement);
            }
            check("1440: the Continue link is reachable by keyboard", reached);
            await page.keyboard.press("Enter");
            await page.waitForURL(/\/lessons\/p3-seq-one$/, { timeout: 30000 });
            check("1440: Enter opens the Lesson on the same origin (a preview stays on its own host)", new URL(page.url()).origin === WEB);

            const html = await (await context.request.get(`${WEB}/prepare`)).text();
            const rsc = await (await context.request.get(`${WEB}/prepare`, { headers: { RSC: "1" } })).text();
            const leaks = [SENTINEL_TIME, "last_visited_at", "bookmarked_at", "item_state_available", "body marker", "prompt marker", "Synthetic P3"].filter((needle) => html.includes(needle) || rsc.includes(needle));
            check("1440: the HTML and RSC payload carry no item state, no Lesson or Problem body and no summary", leaks.length === 0, leaks.join(", "));
         }
         await context.close();
      }

      await control("reset=1&fail=1");
      let ctx = await openWorkspace(browser, { width: 1440, height: 900 });
      await ctx.page.goto(`${WEB}/prepare`);
      await ctx.page.getByRole("button", { name: "Try again to load Continue" }).waitFor({ timeout: 30000 });
      check("failure: both sections show an error, never an empty state", (await ctx.page.getByText(/Nothing to continue yet|No bookmarks yet/).count()) === 0 && (await ctx.page.getByRole("alert").filter({ hasText: /could not load/ }).count()) === 2);
      const failed = await new AxeBuilder({ page: ctx.page }).withTags(TAGS).analyze();
      check("failure: axe finds no WCAG A/AA violation", failed.violations.length === 0, failed.violations.map((v) => `${v.id} (${v.nodes.length})`).join(", "));
      await control("fail=0");
      await ctx.page.getByRole("button", { name: "Try again to load bookmarks" }).click();
      await ctx.page.getByRole("region", { name: "Bookmarks" }).getByRole("link", { name: "P3 Sequence Check" }).waitFor({ timeout: 15000 });
      check("failure: retry recovers the bookmarks", true);
      await ctx.context.close();

      await control("reset=1&empty=1");
      ctx = await openWorkspace(browser, { width: 1440, height: 900 });
      await ctx.page.goto(`${WEB}/prepare`);
      await ctx.page.getByText(/No bookmarks yet/).waitFor({ timeout: 30000 });
      check("empty: both sections show their empty states", (await ctx.page.getByText(/Nothing to continue yet/).count()) === 1);
      const empty = await new AxeBuilder({ page: ctx.page }).withTags(TAGS).analyze();
      check("empty: axe finds no WCAG A/AA violation", empty.violations.length === 0, empty.violations.map((v) => `${v.id} (${v.nodes.length})`).join(", "));
      await ctx.context.close();

      await control("reset=1&continuity=0");
      ctx = await openWorkspace(browser, { width: 1440, height: 900 });
      await ctx.page.goto(`${WEB}/prepare`);
      await ctx.page.getByText("No answers in progress.").waitFor({ timeout: 30000 });
      await ctx.page.waitForTimeout(500);
      const off = apiPaths(await requestsMade());
      check("M2 off: no item-state request and no sections", !off.some((path) => path.includes("item-state")) && off.includes("/me/prep/features") && (await ctx.page.getByRole("region", { name: /Continue|Bookmarks/ }).count()) === 0, JSON.stringify(off));
      await ctx.context.close();

      await control("reset=1");
      ctx = await openWorkspace(browser, { width: 1440, height: 900 }, false);
      await ctx.page.goto(`${WEB}/prepare`);
      const out = await requestsMade();
      check("signed out: sent to sign-in and no /me/prep request is made", new URL(ctx.page.url()).pathname === "/login" && out.length === 0, JSON.stringify(out));
      await ctx.context.close();
   } finally {
      await browser.close();
   }
}

try {
   await run();
} catch (error) {
   console.log(`FAIL harness — ${error.message}`);
   failures.push("harness");
} finally {
   stopAll();
}
console.log(failures.length ? `\n${failures.length} failed` : "\nall passed");
process.exit(failures.length ? 1 : 0);
