// Standalone smoke for the self-guided practice workspace (P9-T13). Not part of `playwright test`.
// Run from the repo root: node tests/e2e/practice-workspace.smoke.mjs   (SMOKE_SHOTS=<dir> also saves the screenshots)
// LOCAL only. It starts the fake catalog and auth server and one Next dev server (practice flag on), and answers every `/me/practice` request in the
// browser from the in-memory fake service of `src/lib/practice-workspace` (bundled here with esbuild): no real backend, Supabase, provider or learner
// is reached. It reuses one headless browser, checks axe and horizontal overflow at 320, 768, 1280 and 1920 px, and stops only what it started.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";
import { build } from "esbuild";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const fixture = JSON.parse(readFileSync(new URL("./catalog/fixture.json", import.meta.url), "utf8"));
const [API_PORT, AUTH_PORT, APP_PORT] = [3171, 3172, 3173];
const API = `http://127.0.0.1:${API_PORT}`;
const AUTH = `http://127.0.0.1:${AUTH_PORT}`;
const APP = `http://localhost:${APP_PORT}`;
const SHOTS = process.env.SMOKE_SHOTS;
const children = [];
const failures = [];

function start(command, args, env) {
   children.push(spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: "ignore", detached: true }));
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
   for (let i = 0; i < 240; i++) {
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

// --- the fake service, bundled from the project's own TypeScript ---
async function loadFakes() {
   const out = mkdtempSync(join(tmpdir(), "p9-t13-fakes-"));
   const file = join(out, "fakes.mjs");
   await build({
      stdin: { contents: `export * from "./src/lib/practice-workspace/fakeApi"; export * from "./src/lib/practice-workspace/fakeAttempts";`, resolveDir: ROOT, loader: "ts" },
      bundle: true,
      format: "esm",
      platform: "node",
      outfile: file,
      alias: { "@": join(ROOT, "src") },
      logLevel: "error",
   });
   return import(pathToFileURL(file).href);
}

const { identity } = { identity: fixture.identities.unentitled };
const session = { access_token: identity.token, refresh_token: "unused", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: identity.user };
const cookie = { name: `sb-${new URL(AUTH).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url: APP };

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const READER = "problem.p4-sd-complete";
const SD = "problem.llm-attribute-extraction-pipeline";
const ML = "problem.incident-handoff-summary";

/** One scenario's server: a fresh in-memory service, the browser's token mapped to one of its users, every request logged. */
function makeServer(fakes, options = {}) {
   const api = fakes.createFakePracticeApi();
   const own = api.signIn("learner");
   const problems = { ...fakes.FAKE_PROBLEMS, [READER]: { ...fakes.FAKE_PROBLEMS[SD], contentId: READER, seniorities: ["senior", "staff"] } };
   const store = fakes.installFakeAttempts(api, { problems, consent: options.consent ?? { requiredVersion: "draft-1", accepted: false } });
   const log = [];
   const state = { offline: false };
   async function handle(route) {
      const request = route.request();
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      // Routed requests never touch the network, so "offline" is the request failing the way a lost connection does.
      if (state.offline) return route.abort("internetdisconnected");
      const headers = {};
      for (const [name, value] of Object.entries(request.headers())) {
         headers[name === "authorization" ? "Authorization" : name === "idempotency-key" ? "Idempotency-Key" : name] = name === "authorization" ? `Bearer ${own}` : value;
      }
      const response = await api.fetch(request.url(), { method: request.method(), headers, body: request.postData() ?? undefined });
      log.push(`${request.method()} ${new URL(request.url()).pathname}`);
      return route.fulfill({ status: response.status, headers: { ...CORS, "content-type": "application/json" }, body: await response.text() });
   }
   /** Make an attempt directly in the service, as the learner. */
   async function seed(contentId, seniority, key) {
      const response = await api.fetch(`${API}/me/practice/attempts`, { method: "POST", headers: { Authorization: `Bearer ${own}`, "Idempotency-Key": key }, body: JSON.stringify({ content_id: contentId, mode: "self", target_seniority: seniority }) });
      return (await response.json()).id;
   }
   return { api, store, log, state, handle, seed };
}

const axeScan = async (page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map((v) => `${v.id} (${v.nodes.length})`);
const overflows = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const WIDTHS = [320, 768, 1280, 1920];

async function newPage(browser, fakes, viewport, scheme, options) {
   const server = makeServer(fakes, options);
   const context = await browser.newContext({ viewport, colorScheme: scheme });
   await context.addCookies([cookie]);
   await context.route(`${API}/me/practice**`, server.handle);
   const page = await context.newPage();
   const problems = [];
   page.on("pageerror", (error) => problems.push(`pageerror ${error.message}`));
   page.on("console", (message) => ["error", "warning"].includes(message.type()) && !/Failed to load resource|favicon|Download the React DevTools/.test(message.text()) && !PRE_EXISTING.test(message.text()) && problems.push(`${message.type()} ${message.text().slice(0, 200)}`));
   return { server, context, page, problems };
}

// Two messages every in-app navigation of the site logs in development, with the practice flag off too (checked on the reader's own "Practice" link): not from T13.
const PRE_EXISTING = /useInsertionEffect must not schedule updates|Detected `scroll-behavior: smooth`/;
const shot = async (page, name) => SHOTS && (await page.screenshot({ path: `${SHOTS}/${name}.png` }));

async function audit(page, label, viewport) {
   check(`${label}: no horizontal page overflow`, !(await overflows(page)));
   const violations = await axeScan(page);
   check(`${label}: axe finds no WCAG A/AA violation`, violations.length === 0, violations.join(", "));
   // Touch targets: every visible button, link and the stage select that T13 owns (the workspace, the entry, the history and the dialogs, not the site header) is at least 44 px tall.
   const small = await page.evaluate(() =>
      [...document.querySelectorAll("[data-practice-workspace] :is(button, select, a[href], summary), [data-practice-entry] :is(button, a[href]), [role=dialog] :is(button, a[href], label)")]
         .filter((el) => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("header[class*=sticky]")?.hasAttribute("data-site-header") && !el.closest("[data-site-nav], nav[aria-label=Primary], footer"))
         .map((el) => ({ name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height) }))
         .filter((item) => item.h < 44)
   );
   check(`${label}: controls are at least 44 px tall`, small.length === 0, JSON.stringify(small.slice(0, 4)));
   void viewport;
}

// --- scenario 1: the reader entry, the dialog, the notice and the first attempt ---
async function entryFlow(browser, fakes, viewport, scheme) {
   const label = `entry ${viewport.width} ${scheme}`;
   const { server, context, page, problems } = await newPage(browser, fakes, viewport, scheme);
   await page.goto(`${APP}/problems/p4-sd-complete`);
   const entry = page.getByRole("button", { name: "Practise this Problem" });
   await entry.waitFor({ timeout: 60000 });
   check(`${label}: the reader shows "Practise this Problem" only after the capability answer`, server.log[0] === "GET /me/practice/capability");
   check(`${label}: the reader page is unchanged in structure (its challenge is still on the page)`, (await page.getByRole("heading", { level: 1 }).count()) > 0);
   await entry.click();
   const dialog = page.getByRole("dialog", { name: "Practise this Problem" });
   await dialog.waitFor();
   const offered = await dialog.getByRole("radio").evaluateAll((radios) => radios.map((radio) => radio.value));
   check(`${label}: only the seniorities the Problem's bars target are offered`, JSON.stringify(offered) === JSON.stringify(["senior", "staff"]) || JSON.stringify(offered) === JSON.stringify(["mid", "senior", "staff"]), JSON.stringify(offered));
   if (viewport.width === 1280 && scheme === "light") await shot(page, "P9-T13-entry-seniority-light-1280");
   await audit(page, `${label} (seniority)`, viewport);
   await dialog.getByRole("radio", { name: "Senior" }).check();
   await dialog.getByRole("button", { name: "Start practice" }).click();
   const notice = page.getByRole("dialog", { name: "Before you practise" });
   await notice.waitFor();
   check(`${label}: nothing is recorded or created before the learner accepts`, !server.log.some((entry) => entry.startsWith("POST /me/practice/consent") || entry.startsWith("POST /me/practice/attempts")), server.log.join(" | "));
   if (viewport.width === 1280 && scheme === "light") await shot(page, "P9-T13-entry-consent-light-1280");
   await audit(page, `${label} (acknowledgement)`, viewport);
   // Decline leaves the reader usable.
   await notice.getByRole("button", { name: "Decline" }).click();
   await page.getByRole("dialog").waitFor({ state: "detached" });
   check(`${label}: declining leaves the reader and the entry in place, with nothing created`, (await entry.isVisible()) && !server.log.some((entry) => entry.startsWith("POST /me/practice/attempts")));
   // Accept and start.
   await entry.click();
   await dialog.getByRole("radio", { name: "Senior" }).check();
   await dialog.getByRole("button", { name: "Start practice" }).click();
   await notice.getByRole("button", { name: "Accept and start" }).click();
   await page.waitForURL(/\/practice\/attempts\/[0-9a-f-]{36}$/, { timeout: 30000 });
   await page.getByRole("heading", { level: 1, name: "Frame" }).waitFor({ timeout: 30000 });
   check(`${label}: accepting creates exactly one self-guided attempt and opens the workspace`, server.log.filter((entry) => entry === "POST /me/practice/attempts").length === 1);
   check(`${label}: the attempt URL holds only the attempt's id`, new URL(page.url()).search === "" && new URL(page.url()).hash === "");
   await context.close();
   check(`${label}: no console error, warning or uncaught error`, problems.length === 0, problems.join(" | "));
}

// --- scenario 2: the workspace at one width ---
async function workspaceFlow(browser, fakes, viewport, scheme, deep) {
   const label = `workspace ${viewport.width} ${scheme}`;
   const { server, context, page, problems } = await newPage(browser, fakes, viewport, scheme, { consent: { requiredVersion: "draft-1", accepted: true } });
   const sd = await server.seed(SD, "senior", "smoke-key-sd-aaaaaaaa");
   const ml = await server.seed(ML, "mid", "smoke-key-ml-aaaaaaaa");
   const response = await page.goto(`${APP}/practice/attempts/${sd}`);
   check(`${label}: the attempt page is private and not stored`, /no-store/.test(response.headers()["cache-control"] ?? ""), response.headers()["cache-control"]);
   await page.getByRole("heading", { level: 1, name: "Frame" }).waitFor({ timeout: 60000 });
   check(`${label}: the page really is ${scheme}`, (await page.evaluate(() => document.documentElement.classList.contains("dark"))) === (scheme === "dark"));

   // Typing saves and the status says so only afterwards.
   const restate = page.getByRole("textbox", { name: "Restate the task" });
   await restate.fill("A batch pipeline that extracts attributes from listings.");
   check(`${label}: the status says unsaved while typing`, /Unsaved changes/.test(await page.locator("[data-slot=save-status]").innerText()));
   await page.getByText("Saved", { exact: true }).waitFor({ timeout: 8000 });
   check(`${label}: after 1.5 s the text is saved on the server`, server.store.stage(sd, "frame").fields.restate_task === "A batch pipeline that extracts attributes from listings.");
   check(`${label}: nothing the learner typed is in the URL, storage or cookies`, await page.evaluate(() => !location.href.includes("batch") && !JSON.stringify({ ...localStorage, ...sessionStorage }).includes("batch") && !document.cookie.includes("batch")));
   if (viewport.width === 1280 && scheme === "light") await shot(page, "P9-T13-workspace-frame-light-1280");
   if (viewport.width === 1280 && scheme === "dark") await shot(page, "P9-T13-workspace-frame-dark-1280");
   if (viewport.width === 320 && scheme === "light") await shot(page, "P9-T13-workspace-phone-light-320");
   await audit(page, `${label} (Frame)`, viewport);

   // Any stage, at any time, including the stage select on narrow screens.
   if (viewport.width < 768) await page.locator("#practice-stage-select").selectOption("design");
   else await page.getByRole("navigation", { name: "Interview stages" }).getByRole("button", { name: /^Design/ }).click();
   await page.getByRole("heading", { level: 1, name: "Design" }).waitFor();
   check(`${label}: any stage opens at any time and the heading takes focus`, await page.getByRole("heading", { level: 1, name: "Design" }).evaluate((el) => el === document.activeElement));
   await audit(page, `${label} (Design)`, viewport);

   // The brief, from this stage.
   await page.getByRole("button", { name: "Brief" }).click();
   const brief = page.getByRole("dialog");
   await brief.waitFor();
   await audit(page, `${label} (Brief)`, viewport);
   await page.keyboard.press("Escape");
   await brief.waitFor({ state: "detached" });
   await page.waitForTimeout(200);
   check(`${label}: Escape closes the brief and focus returns to it`, await page.getByRole("button", { name: "Brief" }).evaluate((el) => el === document.activeElement));

   if (deep) {
      // Keyboard: Tab reaches the stage navigation and the fields in a sensible order, with a visible focus ring.
      await page.goto(`${APP}/practice/attempts/${sd}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      const order = [];
      for (let i = 0; i < 12; i++) {
         await page.keyboard.press("Tab");
         order.push(await page.evaluate(() => (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || document.activeElement?.tagName || "").trim().slice(0, 24)));
      }
      check(`${label}: Tab walks the header, stage navigation and fields`, order.some((name) => /Brief/.test(name)) && order.some((name) => /Frame|Requirements|Design/.test(name)), order.join(" > "));
      const ring = await page.evaluate(() => {
         const style = getComputedStyle(document.activeElement);
         return style.outlineStyle !== "none" || style.boxShadow !== "none";
      });
      check(`${label}: the focused control shows a focus ring`, ring);

      // ML Reasoning right after Design for an ML Problem.
      await page.goto(`${APP}/practice/attempts/${ml}`);
      await page.getByRole("heading", { level: 1, name: "Frame" }).waitFor();
      const narrow = viewport.width < 768;
      const stages = narrow
         ? await page.locator("#practice-stage-select option").evaluateAll((options) => options.map((option) => option.textContent.replace(/^\d+ of \d+ · /, "").replace(/ \(.*$/, "")))
         : await page.getByRole("navigation", { name: "Interview stages" }).getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.textContent.split(",")[0].replace(/^\d+/, "").trim()));
      check(`${label}: the ML Problem presents the seven stages, ML Reasoning right after Design`, JSON.stringify(stages) === JSON.stringify(["Frame", "Requirements", "Design", "ML Reasoning", "Evaluate & Scale", "Depth & Trade-offs", "Follow-ups"]), stages.join(" > "));
      if (narrow) await page.locator("#practice-stage-select").selectOption("ml_reasoning");
      else await page.getByRole("navigation", { name: "Interview stages" }).getByRole("button", { name: /^ML Reasoning/ }).click();
      await page.getByRole("heading", { level: 1, name: "ML Reasoning" }).waitFor();
      await page.getByRole("textbox", { name: "Your ML reasoning" }).fill("Predict whether a summary is still current; labels come from edits.");
      await page.getByText("Saved", { exact: true }).waitFor({ timeout: 8000 });
      if (viewport.width === 1280 && scheme === "light") await shot(page, "P9-T13-workspace-ml-reasoning-light-1280");
      await audit(page, `${label} (ML Reasoning)`, viewport);

      // Hints and clarifications in Frame.
      await page.goto(`${APP}/practice/attempts/${sd}`);
      await page.getByRole("heading", { level: 1, name: "Frame" }).waitFor();
      await page.getByRole("button", { name: "Show a hint" }).click();
      await page.getByText("Synthetic hint 1: what is the unit of work?").waitFor();
      check(`${label}: a hint appears only on request and the next one stays hidden`, (await page.getByText("Synthetic hint 2").count()) === 0);
      check(`${label}: no clarification answer is on the page before it is revealed`, !(await page.locator("body").innerText()).includes("Synthetic answer"));

      // A conflict, offline and the ended attempt.
      server.store.writeElsewhere(sd, "frame", { restate_task: "Another device wrote this." });
      await page.getByRole("textbox", { name: "Restate the task" }).fill("The learner's own version.");
      const conflict = page.getByRole("group", { name: "This stage was changed somewhere else" });
      await conflict.waitFor({ timeout: 10000 });
      check(`${label}: a conflict keeps the learner's text and offers Keep mine, Take theirs and Combine`, (await conflict.getByRole("button").count()) === 3 && (await page.getByRole("textbox", { name: "Restate the task" }).inputValue()) === "The learner's own version.");
      if (viewport.width === 1280 && scheme === "light") await shot(page, "P9-T13-conflict-light-1280");
      await audit(page, `${label} (conflict)`, viewport);
      await conflict.getByRole("button", { name: "Combine" }).click();
      await page.getByText("Saved", { exact: true }).waitFor({ timeout: 8000 });
      check(`${label}: Combine kept both versions on the server`, /^The learner's own version\.\n\nAnother device wrote this\./.test(server.store.stage(sd, "frame").fields.restate_task));

      server.state.offline = true;
      await page.getByRole("textbox", { name: "Assumptions" }).fill("Ten thousand listings an hour.");
      await page.locator("[data-slot=save-status]").getByText(/Not saved/).waitFor({ timeout: 8000 });
      check(`${label}: offline the text stays and the status says Not saved`, (await page.getByRole("textbox", { name: "Assumptions" }).inputValue()) === "Ten thousand listings an hour." && (await page.getByRole("button", { name: "Retry saving" }).count()) === 1);
      server.state.offline = false;
      await page.getByRole("button", { name: "Retry saving" }).click();
      await page.getByText("Saved", { exact: true }).waitFor({ timeout: 8000 });
      check(`${label}: Retry saves it`, server.store.stage(sd, "frame").fields.assumptions === "Ten thousand listings an hour.");

      // History.
      server.store.endAttempt(ml, "ended_by_reveal");
      await page.goto(`${APP}/practice/history`);
      await page.getByRole("heading", { level: 1, name: "Your practice attempts" }).waitFor();
      await page.getByRole("link", { name: /Resume/ }).waitFor();
      check(`${label}: history lists the active attempt to resume and the ended one to open`, (await page.getByRole("link", { name: /Resume/ }).count()) === 1 && (await page.getByRole("link", { name: /^Open/ }).count()) === 1);
      if (viewport.width === 1280 && scheme === "light") await shot(page, "P9-T13-history-light-1280");
      await audit(page, `${label} (history)`, viewport);
      await page.getByRole("link", { name: /Resume/ }).click();
      await page.getByRole("heading", { level: 1 }).waitFor();
      check(`${label}: Resume opens the saved attempt with its saved text`, (await page.getByRole("textbox", { name: "Restate the task" }).inputValue()).includes("The learner's own version."));

      // An ended attempt opens read-only.
      await page.goto(`${APP}/practice/attempts/${ml}`);
      await page.getByText(/You revealed the reference, so this attempt has ended/).waitFor();
      check(`${label}: an ended attempt is read-only`, (await page.getByRole("textbox", { name: "Restate the task" }).getAttribute("readonly")) !== null);
   }
   await context.close();
   check(`${label}: no console error, warning or uncaught error`, problems.length === 0, problems.join(" | "));
}

async function run() {
   const fakes = await loadFakes();
   start("node", ["tests/e2e/catalog/fake-api.mjs", String(API_PORT), String(AUTH_PORT)], {});
   start("npx", ["next", "dev", "--webpack", "-p", String(APP_PORT)], {
      NEXT_DIST_DIR: `.next-smoke-${APP_PORT}`,
      NEXT_TELEMETRY_DISABLED: "1",
      API_URL: API,
      NEXT_PUBLIC_API_URL: API,
      CATALOG_PREVIEW_TOKEN: "",
      NEXT_PUBLIC_SUPABASE_URL: AUTH,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "smoke-key",
      NEXT_PUBLIC_PRACTICE_ENABLED: "true",
   });
   await Promise.all([waitFor(`${API}/health`), waitFor(`${APP}/login`)]);

   const browser = await chromium.launch();
   try {
      await entryFlow(browser, fakes, { width: 1280, height: 900 }, "light");
      await entryFlow(browser, fakes, { width: 320, height: 700 }, "light");
      for (const width of WIDTHS) await workspaceFlow(browser, fakes, { width, height: width === 320 ? 700 : 900 }, "light", true);
      await workspaceFlow(browser, fakes, { width: 1280, height: 900 }, "dark", false);
      await workspaceFlow(browser, fakes, { width: 320, height: 700 }, "dark", false);
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
