// Standalone axe check of the M2 disclosure pages /privacy and /prepare/data (P7-T48). Not part of `playwright test`.
// Run from the repo root: node tests/e2e/disclosures.axe.smoke.mjs
// It starts the catalog/auth double, a tiny /me/prep double and one Next dev server, then stops only what it started.
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";

const fixture = JSON.parse(readFileSync(new URL("./catalog/fixture.json", import.meta.url), "utf8"));
const [CATALOG_PORT, AUTH_PORT, PREP_PORT, WEB_PORT] = [3181, 3182, 3183, 3184];
const CATALOG = `http://127.0.0.1:${CATALOG_PORT}`;
const AUTH = `http://127.0.0.1:${AUTH_PORT}`;
const PREP = `http://127.0.0.1:${PREP_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const children = [];
const failures = [];

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PATCH, OPTIONS" };
const prep = createServer((req, res) => {
   if (req.method === "OPTIONS") return res.writeHead(204, CORS).end();
   const path = new URL(req.url, PREP).pathname;
   const body = path === "/me/prep/preferences" ? { target_level: null, version: 0, updated_at: null } : { code: "not_found", detail: "Not found" };
   res.writeHead(path === "/me/prep/preferences" ? 200 : 404, { ...CORS, "content-type": "application/json" }).end(JSON.stringify(body));
});

const start = (command, args, env) => children.push(spawn(command, args, { env: { ...process.env, ...env }, stdio: "ignore", detached: true }));
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

const { token, user } = fixture.identities.unentitled;
const session = { access_token: token, refresh_token: "unused", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user };
const cookie = { name: `sb-${new URL(AUTH).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url: WEB };
const violations = async (page) => (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => `${v.id} (${v.nodes.length})`).join(", ");

async function run() {
   await new Promise((resolve) => prep.listen(PREP_PORT, "127.0.0.1", resolve));
   const env = { NEXT_DIST_DIR: ".next-smoke-t48-axe", NEXT_TELEMETRY_DISABLED: "1", API_URL: CATALOG, NEXT_PUBLIC_API_URL: PREP, CATALOG_PREVIEW_TOKEN: "", NEXT_PUBLIC_SUPABASE_URL: AUTH, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "smoke-key", NEXT_PUBLIC_PREP_ENABLED: "true" };
   start("node", ["tests/e2e/catalog/fake-api.mjs", String(CATALOG_PORT), String(AUTH_PORT)], {});
   start("npx", ["next", "dev", "--webpack", "-p", String(WEB_PORT)], env);
   await Promise.all([waitFor(`${CATALOG}/health`), waitFor(`${WEB}/login`)]);

   const browser = await chromium.launch();
   try {
      for (const width of [390, 1440]) {
         for (const scheme of ["light", "dark"]) {
            const label = `${width}px ${scheme}`;
            const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
            await context.addCookies([cookie]);
            const page = await context.newPage();

            await page.goto(`${WEB}/privacy`);
            await page.getByRole("heading", { level: 3, name: "Your Lesson and Problem progress" }).waitFor({ timeout: 60000 });
            check(`${label}: /privacy renders the ${scheme} theme`, (await page.evaluate(() => document.documentElement.classList.contains("dark"))) === (scheme === "dark"));
            check(`${label}: /privacy has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
            check(`${label}: /privacy axe finds no WCAG A/AA violation`, (await violations(page)) === "", await violations(page));

            await page.goto(`${WEB}/prepare/data`);
            await page.getByRole("button", { name: "Save target level" }).waitFor({ timeout: 60000 });
            check(`${label}: /prepare/data has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
            check(`${label}: /prepare/data axe finds no WCAG A/AA violation`, (await violations(page)) === "", await violations(page));

            await page.getByRole("button", { name: "Delete all my data…" }).click();
            await page.getByRole("alertdialog", { name: "Delete all your preparation data?" }).waitFor();
            check(`${label}: /prepare/data axe finds no violation with the delete dialog open`, (await violations(page)) === "", await violations(page));
            await context.close();
         }
      }
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
