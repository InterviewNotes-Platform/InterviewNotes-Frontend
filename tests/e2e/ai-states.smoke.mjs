// Standalone smoke for the AI error states, the disclosure line and the mobile result sheet at 390px and 1440px, light and dark (P7-T32). Not part of `playwright test`.
// Run from the repo root: node tests/e2e/ai-states.smoke.mjs   (SMOKE_SHOTS=<dir> also saves screenshots)
// It starts its own fake auth and one Next dev server (preparation and AI build settings on) and answers every request in the browser itself; no real service is reached.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const fixture = JSON.parse(readFileSync(new URL("./catalog/fixture.json", import.meta.url), "utf8"));
const [API_PORT, AUTH_PORT, APP_PORT] = [3161, 3162, 3163];
const API = `http://127.0.0.1:${API_PORT}`;
const AUTH = `http://127.0.0.1:${AUTH_PORT}`;
const APP = `http://localhost:${APP_PORT}`;
const children = [];
const failures = [];

const start = (command, args, env) => children.push(spawn(command, args, { env: { ...process.env, ...env }, stdio: "ignore", detached: true }));
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
const cookie = { name: `sb-${new URL(AUTH).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url: APP };

const ANSWER_ID = "5b1d2c3e-0000-4000-8000-000000000001";
const answerRow = (over = {}) => ({ id: ANSWER_ID, source: "custom", content_id: null, question_id: null, question_snapshot: "Tell me about a time you were stuck.", snapshot_fallback: false, framework: "star", fields: {}, body: null, status: "in_progress", tags: [], story_ids: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", version: 1, ...over });
const DRAFT = { action: "draft", result: { framework: "star", fields: { situation: "Generated situation.", action: "Generated action." }, body: null, questions_to_ask_yourself: ["What was the impact?"] } };

/** One user whose consent is already in force; `mode` is what the Draft route answers next. */
function makeServer() {
   const state = { ai: 0, patches: [], answer: answerRow(), mode: { status: 200, body: DRAFT } };
   const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
   const reply = (route, status, body) => route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
   async function handle(route) {
      const request = route.request();
      const { pathname } = new URL(request.url());
      const method = request.method();
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (pathname === "/me/prep/ai/consent") return reply(route, 200, { document_id: "privacy-and-ai-use", required_version: "2026-10-28", accepted: true, accepted_at: "2026-10-30T00:00:00Z", withdrawn_at: null, ai_available: true });
      if (pathname === "/me/prep/ai/draft") {
         state.ai += 1;
         return reply(route, state.mode.status, state.mode.body);
      }
      if (pathname === `/me/prep/answers/${ANSWER_ID}`) {
         if (method === "PATCH") {
            state.patches.push(request.postDataJSON());
            state.answer = answerRow({ ...state.answer, ...request.postDataJSON(), version: state.answer.version + 1 });
         }
         return reply(route, 200, state.answer);
      }
      if (pathname.startsWith("/me/prep/")) return reply(route, 200, { items: [], total: 0, limit: 100, offset: 0 });
      return reply(route, 404, { code: "not_found" });
   }
   return { state, handle };
}

const axeScan = async (page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map((v) => `${v.id} (${v.nodes.length})`);
const overflows = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const inert = (page) => page.evaluate(() => Array.from(document.body.children).some((el) => el.hasAttribute("inert")));

const STATES = [
   { code: "ai_quota_exhausted", status: 429, extra: { window: "day", resets_at: "2026-10-31T00:00:00Z" }, text: /used today's AI help.*It renews at/ },
   { code: "ai_busy", status: 429, extra: { retry_after_seconds: 20 }, text: /busy.*in about 20 seconds/ },
   { code: "ai_unavailable", status: 503, extra: {}, text: /unavailable.*try again later/ },
   { code: "ai_input_too_large", status: 413, extra: {}, text: /too long for AI help/ },
   { code: "ai_disabled", status: 403, extra: {}, text: /isn't available right now/ },
   { code: "ai_not_entitled", status: 403, extra: {}, text: /isn't included in your plan/ },
];

async function scenario(browser, viewport, scheme) {
   const label = `${viewport.width} ${scheme}`;
   const narrow = viewport.width < 768;
   const shot = async (page, name) => process.env.SMOKE_SHOTS && (await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/ai-states-${viewport.width}-${scheme}-${name}.png` }));
   const server = makeServer();
   const context = await browser.newContext({ viewport, colorScheme: scheme });
   await context.addCookies([cookie]);
   await context.route(`${API}/**`, server.handle);
   const page = await context.newPage();
   const problems = [];
   page.on("pageerror", (error) => problems.push(`pageerror ${error.message}`));
   // The browser logs every non-2xx answer; the 403, 413, 429 and 503 here are the error states this script asks the fake API for. Nothing else is excused.
   const asked = /Failed to load resource: the server responded with a status of (403|413|429|503)\b/;
   page.on("console", (message) => ["error", "warning"].includes(message.type()) && !message.text().includes("API_URL is not set") && !asked.test(message.text()) && problems.push(`${message.type()} ${message.text().slice(0, 200)}`));
   await page.goto(`${APP}/prepare/answers/${ANSWER_ID}`);
   await page.getByRole("heading", { name: "Your answer", exact: true, level: 1 }).waitFor({ timeout: 30000 });
   // `next dev` draws its own indicator at the bottom left, over the sheet's first button; it is not part of the product build.
   await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
   check(`${label}: the page really is ${scheme}`, (await page.evaluate(() => document.documentElement.classList.contains("dark"))) === (scheme === "dark"));
   await page.getByRole("textbox", { name: "Situation" }).fill("Our build kept failing.");

   const ai = page.getByRole("region", { name: "AI help" });
   const disclosure = (await ai.textContent()) ?? "";
   check(`${label}: the disclosure names Groq on Free and OpenAI on Premium and does not say either is available`, disclosure.includes("Groq on Free, OpenAI on Premium") && !/is available|are available/.test(disclosure));
   check(`${label}: the disclosure links the Privacy & AI Use page in a new tab`, (await ai.getByRole("link", { name: /Privacy & AI Use/ }).getAttribute("href")) === "/privacy");

   const draft = page.getByRole("button", { name: "Draft from my notes" });
   for (const { code, status, extra, text } of STATES) {
      server.state.mode = { status, body: { detail: "provider said something private", code, ...extra } };
      const before = server.state.ai;
      await draft.click();
      const alert = page.locator("[data-ai-state]");
      await alert.waitFor();
      const shown = (await alert.textContent()) ?? "";
      check(`${label}: ${code} renders its own state, with no upgrade prompt or leaked provider text`, text.test(shown) && !/upgrade|premium|pricing|subscribe|private/i.test(shown) && (await alert.getByRole("link").count()) === 0 && (await alert.getAttribute("data-ai-state")) === code, shown.slice(0, 160));
      const kept = await page.getByRole("textbox", { name: "Situation" }).inputValue();
      check(`${label}: ${code}: one request, no sheet, page not inert, text kept`, server.state.ai === before + 1 && (await page.getByRole("dialog").count()) === 0 && !(await inert(page)) && kept === "Our build kept failing.", `requests ${server.state.ai - before}, dialogs ${await page.getByRole("dialog").count()}, inert ${await inert(page)}, text "${kept}"`);
      if (code === "ai_quota_exhausted" || code === "ai_busy") {
         check(`${label}: no horizontal overflow in the ${code} state`, !(await overflows(page)));
         const violations = await axeScan(page);
         check(`${label}: axe finds no WCAG A/AA violation in the ${code} state`, violations.length === 0, violations.join(", "));
         await shot(page, code);
      }
   }
   check(`${label}: no link to the planned pricing in the AI help section`, (await ai.locator('a[href*="pricing"]').count()) === 0);
   check(`${label}: no failed request saved anything`, server.state.patches.every((patch) => !JSON.stringify(patch).includes("Generated")));

   server.state.mode = { status: 200, body: DRAFT };
   await draft.focus();
   await draft.click();
   if (!narrow) {
      await page.getByRole("region", { name: "Draft preview" }).waitFor();
      check(`${label}: wide screens keep the preview inline, with no sheet and the page usable`, (await page.getByRole("dialog").count()) === 0 && !(await inert(page)));
      check(`${label}: no horizontal overflow with the preview`, !(await overflows(page)));
      await shot(page, "inline");
      await page.getByRole("button", { name: "Discard draft" }).click();
   } else {
      const sheet = page.getByRole("dialog", { name: "Draft preview" });
      await sheet.waitFor();
      check(`${label}: the draft opens in a sheet, the page behind is inert and the title has focus`, (await inert(page)) && (await sheet.evaluate((el) => el.contains(document.activeElement) && document.activeElement?.getAttribute("data-slot") === "sheet-title")));
      await page.waitForTimeout(800);
      const box = await sheet.boundingBox();
      check(`${label}: the sheet sits on the bottom edge, inside the viewport, at most 85% tall`, box !== null && box.x >= 0 && Math.abs(box.y + box.height - viewport.height) < 2 && box.width <= viewport.width && box.height <= viewport.height * 0.86, JSON.stringify(box));
      check(`${label}: no horizontal overflow with the sheet open`, !(await overflows(page)));
      const violations = await axeScan(page);
      check(`${label}: axe finds no WCAG A/AA violation with the sheet open`, violations.length === 0, violations.join(", "));
      await shot(page, "sheet");
      let trapped = true;
      for (let i = 0; i < 8; i++) {
         await page.keyboard.press("Tab");
         trapped &&= await sheet.evaluate((el) => el.contains(document.activeElement));
      }
      await page.keyboard.press("Shift+Tab");
      trapped &&= await sheet.evaluate((el) => el.contains(document.activeElement));
      check(`${label}: Tab and Shift+Tab stay inside the sheet`, trapped);
      const clicked = await page.getByRole("textbox", { name: "Task" }).click({ timeout: 1000, trial: true }).then(() => true, () => false);
      check(`${label}: the page behind cannot be clicked while the sheet is open`, !clicked);

      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "detached" });
      check(`${label}: Escape hides the sheet: page released, focus back on Draft, result kept, nothing applied or saved`, !(await inert(page)) && (await draft.evaluate((el) => el === document.activeElement)) && (await page.getByRole("textbox", { name: "Situation" }).inputValue()) === "Our build kept failing." && (await page.getByRole("button", { name: "Show draft preview" }).count()) === 1);
      await page.waitForTimeout(1500);
      check(`${label}: dismissing saved nothing generated`, server.state.patches.every((patch) => !JSON.stringify(patch).includes("Generated")));
      await page.getByRole("button", { name: "Show draft preview" }).click();
      await sheet.waitFor();
      check(`${label}: reopening the sheet makes the page inert again`, await inert(page));

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole("region", { name: "Draft preview" }).waitFor();
      check(`${label}: growing to desktop width with the sheet open releases the page and shows the preview inline`, !(await inert(page)) && (await page.getByRole("dialog").count()) === 0);
      await page.setViewportSize(viewport);
      await sheet.waitFor({ state: "detached" }).catch(() => {});
      check(`${label}: growing to desktop width puts focus on the visible Draft control, not on the body`, await draft.evaluate((el) => el === document.activeElement && el.getBoundingClientRect().height > 0));
      check(`${label}: shrinking back does not leave the page inert`, !(await inert(page)));

      const reopen = page.getByRole("button", { name: "Show draft preview" });
      await reopen.click().catch(() => {});
      await page.getByRole("dialog", { name: "Draft preview" }).waitFor();
      await page.getByRole("button", { name: "Apply draft" }).click();
      await page.getByRole("dialog").waitFor({ state: "detached" });
      check(`${label}: Apply is explicit: it fills the fields, releases the page and returns focus to Draft`, (await page.getByRole("textbox", { name: "Situation" }).inputValue()).includes("Generated situation.") && !(await inert(page)) && (await draft.evaluate((el) => el === document.activeElement)));
      await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 10000 });
      check(`${label}: the applied text is saved by the normal save only after Apply`, server.state.patches.some((patch) => JSON.stringify(patch).includes("Generated situation.")));
   }
   await context.close();
   check(`${label}: no console error, warning or uncaught error`, problems.length === 0, problems.join(" | "));
}

async function run() {
   start("node", ["tests/e2e/catalog/fake-api.mjs", String(API_PORT), String(AUTH_PORT)], {});
   start("npx", ["next", "dev", "--webpack", "-p", String(APP_PORT)], { NEXT_DIST_DIR: `.next-smoke-${APP_PORT}`, NEXT_TELEMETRY_DISABLED: "1", API_URL: "", NEXT_PUBLIC_API_URL: API, CATALOG_PREVIEW_TOKEN: "", NEXT_PUBLIC_SUPABASE_URL: AUTH, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "smoke-key", NEXT_PUBLIC_PREP_ENABLED: "true", NEXT_PUBLIC_AI_ENABLED: "true" });
   await Promise.all([waitFor(`${API}/health`), waitFor(`${APP}/login`)]);
   const browser = await chromium.launch();
   try {
      for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) for (const scheme of ["light", "dark"]) if (!process.env.SMOKE_ONLY || process.env.SMOKE_ONLY === `${viewport.width} ${scheme}`) await scenario(browser, viewport, scheme);
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
