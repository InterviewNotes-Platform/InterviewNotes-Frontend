// Standalone smoke for the first-use AI consent flow at 390px and 1440px, light and dark (P7-T68). Not part of `playwright test`.
// Run from the repo root: node tests/e2e/consent.smoke.mjs   (SMOKE_SHOTS=<dir> also saves screenshots)
// It starts its own fake auth and one Next dev server (preparation and AI build settings on), answers every preparation, consent and
// AI request in the browser itself (no real service is reached), then stops only what it started.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const fixture = JSON.parse(readFileSync(new URL("./catalog/fixture.json", import.meta.url), "utf8"));
const [API_PORT, AUTH_PORT, APP_PORT] = [3151, 3152, 3153];
const API = `http://127.0.0.1:${API_PORT}`;
const AUTH = `http://127.0.0.1:${AUTH_PORT}`;
const APP = `http://localhost:${APP_PORT}`;
const VERSION_ONE = "2026-10-28";
const VERSION_TWO = "2027-01-15";
const children = [];
const failures = [];

function start(command, args, env) {
   children.push(spawn(command, args, { env: { ...process.env, ...env }, stdio: "ignore", detached: true }));
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
const cookie = { name: `sb-${new URL(AUTH).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url: APP };

const ANSWER_ID = "5b1d2c3e-0000-4000-8000-000000000001";
const answerRow = (over = {}) => ({ id: ANSWER_ID, source: "custom", content_id: null, question_id: null, question_snapshot: "Tell me about a time you were stuck.", snapshot_fallback: false, framework: "star", fields: {}, body: null, status: "in_progress", tags: [], story_ids: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", version: 1, ...over });

/** The server's side of one scenario: one user's consent record, the terms version and every request it saw. */
function makeServer() {
   const state = { version: VERSION_ONE, record: null, consent: [], ai: [], answer: answerRow(), clock: 0 };
   const now = () => new Date(Date.UTC(2026, 9, 30, 0, 0, ++state.clock)).toISOString();
   const inForce = () => Boolean(state.record && state.record.version === state.version && (state.record.withdrawn_at === null || state.record.withdrawn_at < state.record.accepted_at));
   const status = () => ({ document_id: "privacy-and-ai-use", required_version: state.version, accepted: inForce(), accepted_at: state.record?.version === state.version ? state.record.accepted_at : null, withdrawn_at: state.record?.version === state.version ? state.record.withdrawn_at : null, ai_available: true });
   const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
   const reply = (route, status, body) => route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
   async function handle(route) {
      const request = route.request();
      const { pathname } = new URL(request.url());
      const method = request.method();
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (pathname.startsWith("/me/prep/ai/consent")) {
         const path = pathname.slice("/me/prep/ai/consent".length);
         state.consent.push(`${method} ${path || "/"}`);
         if (method === "POST" && path === "") {
            const sent = request.postDataJSON();
            if (sent.version !== state.version) return reply(route, 409, { code: "consent_version_stale", required_version: state.version });
            if (!inForce()) state.record = { version: state.version, accepted_at: now(), withdrawn_at: null };
         }
         if (path === "/withdraw" && state.record && inForce()) state.record.withdrawn_at = now();
         return reply(route, 200, status());
      }
      if (pathname === "/me/prep/ai/draft") {
         state.ai.push(inForce() ? "draft" : "draft-without-consent");
         if (!inForce()) return reply(route, 403, { code: "ai_consent_required" });
         return reply(route, 200, { action: "draft", result: { framework: "star", fields: { situation: "Generated situation." }, body: null, questions_to_ask_yourself: [] } });
      }
      if (pathname === `/me/prep/answers/${ANSWER_ID}`) {
         if (method === "PATCH") state.answer = answerRow({ ...state.answer, ...request.postDataJSON(), version: state.answer.version + 1 });
         return reply(route, 200, state.answer);
      }
      if (pathname.startsWith("/me/prep/")) return reply(route, 200, { items: [], total: 0, limit: 100, offset: 0 });
      return reply(route, 404, { code: "not_found" });
   }
   return { state, handle };
}

const axeScan = async (page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map((v) => `${v.id} (${v.nodes.length})`);
const overflows = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

async function scenario(browser, viewport, scheme) {
   const label = `${viewport.width} ${scheme}`;
   const shot = async (page, name) => process.env.SMOKE_SHOTS && (await page.screenshot({ path: `${process.env.SMOKE_SHOTS}/consent-${viewport.width}-${scheme}-${name}.png` }));
   const server = makeServer();
   const newContext = async () => {
      const context = await browser.newContext({ viewport, colorScheme: scheme });
      await context.addCookies([cookie]);
      await context.route(`${API}/**`, server.handle);
      return context;
   };
   const context = await newContext();
   const page = await context.newPage();
   const problems = [];
   page.on("pageerror", (error) => problems.push(`pageerror ${error.message}`));
   // The harness leaves the server-side catalog URL unset on purpose, and the dev server reports that in every page's console; nothing else is excused.
   page.on("console", (message) => ["error", "warning"].includes(message.type()) && !message.text().includes("API_URL is not set") && problems.push(`${message.type()} ${message.text().slice(0, 200)}`));
   await page.goto(`${APP}/prepare/answers/${ANSWER_ID}`);
   await page.getByRole("heading", { name: "Your answer", exact: true, level: 1 }).waitFor({ timeout: 30000 }).catch(async (error) => {
      throw new Error(`${error.message.split("\n")[0]} — page ${page.url()} says: ${(await page.locator("body").innerText()).slice(0, 400).replace(/\s+/g, " ")}`);
   });
   check(`${label}: the page really is ${scheme}`, (await page.evaluate(() => document.documentElement.classList.contains("dark"))) === (scheme === "dark"));
   await page.getByRole("textbox", { name: "Situation" }).fill("Our build kept failing.");
   await page.waitForTimeout(500);
   check(`${label}: no consent request and no dialog at page load or while typing`, server.state.consent.length === 0 && (await page.getByRole("dialog").count()) === 0 && server.state.ai.length === 0, JSON.stringify(server.state.consent));

   const draft = page.getByRole("button", { name: "Draft from my notes" });
   await draft.click();
   const dialog = page.getByRole("dialog", { name: "Use AI help on your answer?" });
   await dialog.waitFor();
   check(`${label}: first Draft opens the dialog and sends no AI request`, server.state.ai.length === 0);
   check(`${label}: focus moved into the dialog`, await dialog.evaluate((el) => el.contains(document.activeElement)));
   check(`${label}: the page behind is inert`, (await page.evaluate(() => Array.from(document.body.children).some((el) => el.hasAttribute("inert")))) === true);
   const box = await dialog.boundingBox();
   check(`${label}: the dialog fits the viewport`, box !== null && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, JSON.stringify(box));
   check(`${label}: no horizontal overflow with the dialog open`, !(await overflows(page)));
   await shot(page, "dialog");
   const violations = await axeScan(page);
   check(`${label}: axe finds no WCAG A/AA violation with the dialog open`, violations.length === 0, violations.join(", "));
   const privacy = dialog.getByRole("link", { name: /Privacy & AI Use page/ });
   check(`${label}: the dialog links to the Privacy & AI Use page`, (await privacy.getAttribute("href")) === "/privacy");

   let trapped = true;
   for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      trapped &&= await dialog.evaluate((el) => el.contains(document.activeElement));
   }
   await page.keyboard.press("Shift+Tab");
   trapped &&= await dialog.evaluate((el) => el.contains(document.activeElement));
   check(`${label}: Tab and Shift+Tab stay inside the dialog`, trapped);

   await page.keyboard.press("Escape");
   await dialog.waitFor({ state: "detached" });
   check(`${label}: Escape declines: no AI request, nothing stored, page usable again`, server.state.ai.length === 0 && server.state.record === null && (await page.evaluate(() => !Array.from(document.body.children).some((el) => el.hasAttribute("inert")))));
   check(`${label}: focus returns to Draft after declining`, await draft.evaluate((el) => el === document.activeElement));
   await page.getByRole("textbox", { name: "Task" }).fill("Typed after declining.");
   await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 10000 });
   check(`${label}: non-AI editing and saving still work after a decline`, server.state.answer.fields.task === "Typed after declining.", JSON.stringify(server.state.answer.fields));

   await draft.click();
   await dialog.waitFor();
   check(`${label}: a decline is not remembered: the next AI action asks again`, server.state.consent.filter((c) => c.startsWith("POST")).length === 0);
   await dialog.getByRole("button", { name: "Accept and continue" }).focus();
   await page.keyboard.press("Enter");
   await page.getByRole("region", { name: "Draft preview" }).waitFor({ timeout: 15000 });
   await page.waitForTimeout(400);
   check(`${label}: Accept from the keyboard stores consent once, then exactly one Draft request`, server.state.consent.filter((c) => c === "POST /").length === 1 && server.state.ai.join() === "draft", `${server.state.consent.join("; ")} | ${server.state.ai.join()}`);
   check(`${label}: the result is a preview: the answer is unchanged until Apply`, !server.state.answer.fields.situation?.includes("Generated"));
   await shot(page, "preview");
   await page.getByRole("button", { name: "Discard draft" }).click();

   await draft.click();
   await page.getByRole("region", { name: "Draft preview" }).waitFor({ timeout: 15000 });
   check(`${label}: no second dialog once accepted`, (await page.getByRole("dialog").count()) === 0 && server.state.ai.length === 2);
   await page.getByRole("button", { name: "Discard draft" }).click();

   const second = await newContext();
   const other = await second.newPage();
   await other.goto(`${APP}/prepare/answers/${ANSWER_ID}`);
   await other.getByRole("textbox", { name: "Situation" }).fill("Our build kept failing.");
   await other.getByRole("button", { name: "Draft from my notes" }).click();
   await other.getByRole("region", { name: "Draft preview" }).waitFor({ timeout: 15000 });
   check(`${label}: acceptance survives a second browser context (no dialog)`, (await other.getByRole("dialog").count()) === 0 && server.state.ai.length === 3);
   await second.close();

   server.state.version = VERSION_TWO;
   await draft.click();
   await dialog.waitFor();
   check(`${label}: a new configured version asks again and names it`, (await dialog.textContent()).includes(`version ${VERSION_TWO}`) && server.state.ai.length === 3);
   await dialog.getByRole("button", { name: "Accept and continue" }).click();
   await page.getByRole("region", { name: "Draft preview" }).waitFor({ timeout: 15000 });
   check(`${label}: accepting the new version runs the action once`, server.state.ai.length === 4);
   await page.getByRole("button", { name: "Discard draft" }).click();

   await page.goto(`${APP}/privacy`);
   const withdraw = page.getByRole("button", { name: "Withdraw AI consent" });
   await withdraw.waitFor({ timeout: 15000 });
   check(`${label}: the Privacy & AI Use page shows Withdraw AI consent for a user whose consent is recorded`, true);
   check(`${label}: no horizontal overflow on the privacy page`, !(await overflows(page)));
   const privacyViolations = await axeScan(page);
   check(`${label}: axe finds no WCAG A/AA violation on the privacy page with the control`, privacyViolations.length === 0, privacyViolations.join(", "));
   await shot(page, "privacy");
   await withdraw.click();
   await page.getByText("Your AI consent is withdrawn. The next AI action will ask again.").waitFor();
   check(`${label}: withdrawing is recorded by the API`, server.state.consent.includes("POST /withdraw") && server.state.record.withdrawn_at !== null);

   await page.goto(`${APP}/prepare/answers/${ANSWER_ID}`);
   await page.getByRole("textbox", { name: "Situation" }).fill("Our build kept failing.");
   await draft.click();
   await dialog.waitFor();
   check(`${label}: after withdrawing, the next AI action asks again and sends nothing`, server.state.ai.length === 4);
   await page.keyboard.press("Escape");
   await context.close();
   check(`${label}: no console error, warning or uncaught error`, problems.length === 0, problems.join(" | "));
   check(`${label}: no Draft request ever reached the API without consent`, !server.state.ai.includes("draft-without-consent"));
}

async function run() {
   start("node", ["tests/e2e/catalog/fake-api.mjs", String(API_PORT), String(AUTH_PORT)], {});
   start("npx", ["next", "dev", "--webpack", "-p", String(APP_PORT)], { NEXT_DIST_DIR: `.next-smoke-${APP_PORT}`, NEXT_TELEMETRY_DISABLED: "1", API_URL: "", NEXT_PUBLIC_API_URL: API, CATALOG_PREVIEW_TOKEN: "", NEXT_PUBLIC_SUPABASE_URL: AUTH, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "smoke-key", NEXT_PUBLIC_PREP_ENABLED: "true", NEXT_PUBLIC_AI_ENABLED: "true" });
   await Promise.all([waitFor(`${API}/health`), waitFor(`${APP}/login`)]);

   const browser = await chromium.launch();
   try {
      for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) for (const scheme of ["light", "dark"]) await scenario(browser, viewport, scheme);
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
