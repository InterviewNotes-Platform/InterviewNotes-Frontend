// Standalone smoke for the /prepare workspace at 390px and 1440px (P7-T15). Not part of `playwright test`.
// Run from the repo root: node tests/e2e/prepare.smoke.mjs   (SMOKE_SHOTS=<dir> also saves screenshots)
// It starts its own fake API/Auth and two Next dev servers (flag on, flag off), then stops only what it started.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const fixture = JSON.parse(readFileSync(new URL("./catalog/fixture.json", import.meta.url), "utf8"));
const [API_PORT, AUTH_PORT, ON_PORT, OFF_PORT] = [3141, 3142, 3143, 3144];
const API = `http://127.0.0.1:${API_PORT}`;
const AUTH = `http://127.0.0.1:${AUTH_PORT}`;
const ON = `http://localhost:${ON_PORT}`;
const OFF = `http://localhost:${OFF_PORT}`;
const children = [];
const failures = [];

function start(command, args, env) {
   const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: "ignore", detached: true });
   children.push(child);
}

function stopAll() {
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
const cookie = (origin) => ({
   name: `sb-${new URL(AUTH).hostname.split(".")[0]}-auth-token`,
   value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
   url: origin,
});
const body = { items: [{ id: "a1", source: "custom", content_id: null, question_id: null, question_snapshot: "Tell me about a conflict.", snapshot_fallback: false, framework: "free_form", fields: {}, body: null, status: "in_progress", tags: [], story_ids: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", version: 1 }], total: 1, limit: 100, offset: 0 };

async function signedIn(browser, viewport) {
   const context = await browser.newContext({ viewport });
   await context.addCookies([cookie(ON)]);
   return context;
}

async function run() {
   const dev = (port, flag) => ({ NEXT_DIST_DIR: `.next-smoke-${port}`, NEXT_TELEMETRY_DISABLED: "1", API_URL: "", NEXT_PUBLIC_API_URL: API, CATALOG_PREVIEW_TOKEN: "", NEXT_PUBLIC_SUPABASE_URL: AUTH, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "smoke-key", NEXT_PUBLIC_PREP_ENABLED: flag });
   start("node", ["tests/e2e/catalog/fake-api.mjs", String(API_PORT), String(AUTH_PORT)], {});
   start("npx", ["next", "dev", "--webpack", "-p", String(ON_PORT)], dev(ON_PORT, "true"));
   start("npx", ["next", "dev", "--webpack", "-p", String(OFF_PORT)], dev(OFF_PORT, ""));
   await Promise.all([waitFor(`${API}/health`), waitFor(`${ON}/login`), waitFor(`${OFF}/login`)]);

   const browser = await chromium.launch();
   try {
      const off = await (await browser.newContext()).newPage();
      await (await off.context()).addCookies([cookie(OFF)]);
      const offResponse = await off.goto(`${OFF}/prepare`);
      check("flag off: /prepare is not found, even signed in", offResponse.status() === 404);
      await off.goto(`${OFF}/`);
      check("flag off: no Prepare link in the navigation", (await off.getByRole("link", { name: "Prepare" }).count()) === 0);

      for (const [label, viewport] of [["390", { width: 390, height: 844 }], ["1440", { width: 1440, height: 900 }]]) {
         const anonymous = await (await browser.newContext({ viewport })).newPage();
         await anonymous.goto(`${ON}/prepare`);
         check(`${label}: signed out is sent to sign-in with the return path`, new URL(anonymous.url()).pathname === "/login" && new URL(anonymous.url()).searchParams.get("redirect") === "/prepare", anonymous.url());

         const context = await signedIn(browser, viewport);
         const page = await context.newPage();
         let release;
         const gate = new Promise((resolve) => (release = resolve));
         let requests = 0;
         const paths = [];
         await page.route(`${API}/me/prep/**`, async (route) => {
            requests++;
            paths.push(new URL(route.request().url()).pathname + new URL(route.request().url()).search);
            await gate;
            await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
         });
         await page.goto(`${ON}/prepare`);
         const status = page.getByRole("status");
         await status.waitFor({ timeout: 15000 });
         await page.waitForFunction(() => document.readyState === "complete");
         for (let i = 0; i < 100 && requests === 0; i++) await page.waitForTimeout(100);
         const shown = await status.innerText();
         // Next's route announcer is an empty alert, so only an alert with text counts as an error.
         const errors = await page.getByRole("alert").filter({ hasText: /\S/ }).count();
         const empty = await page.getByText("No answers").count();
         check(`${label}: slow first request shows Loading, no error, no empty state`, /Loading your workspace/.test(shown) && errors === 0 && empty === 0, JSON.stringify(shown));
         // `next dev` mounts effects twice (StrictMode), so up to two identical list reads are expected here.
         check(`${label}: only the answers list was requested`, requests >= 1 && requests <= 2 && paths.every((path) => path === "/me/prep/answers?limit=100"), JSON.stringify(paths));
         const action = page.getByRole("button", { name: "Answer a question" });
         const box = await action.boundingBox();
         check(`${label}: Answer a question is the first action, inside the viewport`, box !== null && box.y + box.height <= viewport.height && box.x >= 0 && box.x + box.width <= viewport.width);
         check(`${label}: no horizontal overflow while loading`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

         if (viewport.width >= 768) {
            const nav = page.getByRole("navigation", { name: "Primary" }).first();
            check(`${label}: Prepare is in the primary navigation and marks the current page`, (await nav.getByRole("link", { name: "Prepare" }).getAttribute("aria-current")) === "page");
         } else {
            await page.getByRole("button", { name: "Menu" }).click();
            const link = page.getByRole("dialog").getByRole("link", { name: "Prepare" });
            check(`${label}: Prepare is in the mobile menu and marks the current page`, (await link.getAttribute("aria-current")) === "page");
            await page.keyboard.press("Escape");
         }

         if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/prepare-${label}-loading.png` });
         release();
         await page.getByText("Tell me about a conflict.").waitFor({ timeout: 15000 });
         if (process.env.SMOKE_SHOTS) await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/prepare-${label}-loaded.png` });
         check(`${label}: the result replaces Loading`, (await page.getByRole("status").count()) === 0);
         check(`${label}: no horizontal overflow once loaded`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
         await context.close();
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
