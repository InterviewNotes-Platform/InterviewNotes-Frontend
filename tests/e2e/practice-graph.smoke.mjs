// Standalone smoke for the diagram editor (P9-T14). Not part of `playwright test`.
// Run from the repo root:  node tests/e2e/practice-graph.smoke.mjs
//   SMOKE_SHOTS=<dir>   saves the evidence screenshots
//   SMOKE_PROD=1        uses `next start` on an existing production build in `.next` (bundle isolation and performance need it)
//   SMOKE_REUSE=1       uses servers already listening on the three ports below instead of starting them
//   SMOKE_ONLY=<a,b>    runs only the named scenarios
//   SMOKE_JSON=<file>   writes the measurements (bundle, latency, frames) as JSON
// LOCAL only. One headless browser, one isolated context per scenario. Every `/me/practice` request is answered in the browser from the
// in-memory fake service of `src/lib/practice-workspace` and `src/lib/practice-graph/fakeDiagram.ts` (bundled here with esbuild): no real
// backend, Supabase, provider or learner is reached. It stops only what it started.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";
import { build } from "esbuild";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const fixture = JSON.parse(readFileSync(new URL("./catalog/fixture.json", import.meta.url), "utf8"));
const [API_PORT, AUTH_PORT, APP_PORT] = [3191, 3192, 3193];
const API = `http://127.0.0.1:${API_PORT}`;
const AUTH = `http://127.0.0.1:${AUTH_PORT}`;
const APP = `http://localhost:${APP_PORT}`;
const SHOTS = process.env.SMOKE_SHOTS;
const PROD = process.env.SMOKE_PROD === "1";
const ONLY = process.env.SMOKE_ONLY ? new Set(process.env.SMOKE_ONLY.split(",")) : null;
const children = [];
const failures = [];
const results = {};

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

async function loadFakes() {
   const out = mkdtempSync(join(tmpdir(), "p9-t14-fakes-"));
   const file = join(out, "fakes.mjs");
   await build({
      stdin: {
         contents: `export * from "./src/lib/practice-workspace/fakeApi"; export * from "./src/lib/practice-workspace/fakeAttempts"; export * from "./src/lib/practice-graph/fakeDiagram"; export * as model from "./src/lib/practice-graph/model"; export * as canonical from "./src/lib/practice-graph/canonical";`,
         resolveDir: ROOT,
         loader: "ts",
      },
      bundle: true,
      format: "esm",
      platform: "node",
      outfile: file,
      alias: { "@": join(ROOT, "src") },
      logLevel: "error",
   });
   return import(pathToFileURL(file).href);
}

const identity = fixture.identities.unentitled;
const session = { access_token: identity.token, refresh_token: "unused", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: identity.user };
const cookie = { name: `sb-${new URL(AUTH).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url: APP };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const SD = "problem.llm-attribute-extraction-pipeline";

/** One scenario's server: a fresh in-memory service, the browser's token mapped to one learner, every request logged. */
function makeServer(fakes) {
   const api = fakes.createFakePracticeApi();
   const own = api.signIn("learner");
   const store = fakes.installFakeAttempts(api, { consent: { requiredVersion: "draft-1", accepted: true } });
   const diagrams = fakes.installFakeDiagram(api, store);
   const log = [];
   const state = { offline: false };
   async function handle(route) {
      const request = route.request();
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      if (state.offline) return route.abort("internetdisconnected");
      const headers = {};
      for (const [name, value] of Object.entries(request.headers())) {
         headers[name === "authorization" ? "Authorization" : name === "idempotency-key" ? "Idempotency-Key" : name] = name === "authorization" ? `Bearer ${own}` : value;
      }
      const response = await api.fetch(request.url(), { method: request.method(), headers, body: request.postData() ?? undefined });
      log.push(`${request.method()} ${new URL(request.url()).pathname}`);
      return route.fulfill({ status: response.status, headers: { ...CORS, "content-type": "application/json" }, body: await response.text() });
   }
   async function seed(contentId = SD) {
      const response = await api.fetch(`${API}/me/practice/attempts`, { method: "POST", headers: { Authorization: `Bearer ${own}`, "Idempotency-Key": `seed-${Math.random().toString(36).slice(2, 14)}-key` }, body: JSON.stringify({ content_id: contentId, mode: "self", target_seniority: "senior" }) });
      return (await response.json()).id;
   }
   return { api, store, diagrams, log, state, handle, seed };
}

const axeScan = async (page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map((v) => `${v.id} (${v.nodes.length}: ${v.nodes[0]?.target?.join(" ")})`);
const overflows = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const PRE_EXISTING = /Detected `scroll-behavior: smooth`/;
/** Desktop evidence is the editor itself (with any save-trouble panel); phones are the whole viewport, as a learner sees it. */
async function shot(page, name, options = {}) {
   if (!SHOTS) return;
   const width = page.viewportSize()?.width ?? 1280;
   if (width >= 768) {
      // Park the editor just under the sticky workspace header, so nothing overlays it in the capture.
      await page.evaluate(() => {
         const editor = document.querySelector("[data-diagram-editor]");
         const header = document.querySelector("[data-practice-workspace] header");
         if (editor) window.scrollBy(0, editor.getBoundingClientRect().top - (header?.getBoundingClientRect().bottom ?? 0) - 8);
      });
      await page.waitForTimeout(150);
      await page.locator("[data-diagram-editor]").screenshot({ path: `${SHOTS}/${name}.png`, ...options });
   }
   else await page.screenshot({ path: `${SHOTS}/${name}.png`, ...options });
}

async function newPage(browser, fakes, viewport, scheme = "light") {
   const server = makeServer(fakes);
   const context = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion: "reduce", hasTouch: viewport.width < 768 });
   await context.addCookies([cookie]);
   await context.route(`${API}/me/practice**`, server.handle);
   const page = await context.newPage();
   const problems = [];
   page.on("pageerror", (error) => problems.push(`pageerror ${error.message}`));
   page.on("console", (message) => ["error", "warning"].includes(message.type()) && !/Failed to load resource|favicon|Download the React DevTools/.test(message.text()) && !PRE_EXISTING.test(message.text()) && problems.push(`${message.type()} ${message.text().slice(0, 240)}`));
   return { server, context, page, problems };
}

async function audit(page, label) {
   check(`${label}: no horizontal page overflow`, !(await overflows(page)));
   const violations = await axeScan(page);
   check(`${label}: axe finds no WCAG A/AA violation`, violations.length === 0, violations.join(", "));
   // Every control the editor owns (not React Flow's zoom buttons or attribution link) is at least 44 px tall; a checkbox counts by its label row.
   const small = await page.evaluate(() =>
      [...document.querySelectorAll("[data-diagram-editor] :is(button, select, a[href], summary, .pg-check, .pg-toggle, input:not([type=checkbox]):not([type=radio]))")]
         .filter((el) => el.getBoundingClientRect().width > 0 && !el.closest(".react-flow__controls, .react-flow__attribution"))
         .map((el) => ({ name: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || "").trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height) }))
         .filter((item) => item.h < 44)
   );
   check(`${label}: editor controls are at least 44 px tall`, small.length === 0, JSON.stringify(small.slice(0, 4)));
}

/** The representative graph of Design D, built through the real model functions and stored as another device would. */
function representative(fakes, server, id) {
   const { model } = fakes;
   let d = model.EMPTY_DRAFT;
   const ids = {};
   const node = (key, type, label, x, y, explanation = "") => {
      const r = model.addNode(d, type, { label, at: { x, y } });
      d = model.updateNode(r.draft, r.id, { explanation }).draft;
      ids[key] = r.id;
   };
   const edge = (from, to, kind, tag, explanation = "") => {
      const r = model.addEdge(d, ids[from], ids[to], kind);
      d = model.updateEdge(r.draft, r.id, { tag, explanation }).draft;
      ids[`${from}-${to}`] = r.id;
   };
   node("web", "client", "Web app", 40, 180, "Sends the question and shows the answer with its sources.");
   node("gw", "gateway", "API gateway", 290, 180, "Authenticates and rate-limits each request.");
   node("svc", "service", "Answer service", 540, 180, "Retrieves passages, then asks the model.");
   node("model", "model", "Answer model", 800, 170, "Writes an answer from the passages only.");
   node("index", "database", "Passage index", 548, 360);
   node("queue", "queue", "Ingest queue", 280, 372, "Buffers new documents for indexing.");
   edge("web", "gw", "request", "question", "The question and a session token; the answer comes back.");
   edge("gw", "svc", "request", "ask", "The authenticated question; the answer comes back.");
   edge("svc", "index", "read", "top passages");
   edge("svc", "model", "request", "prompt", "The question with the passages; a draft answer comes back.");
   edge("gw", "queue", "async_message", "new document");
   edge("queue", "index", "write", "chunks", "Chunks and their embeddings.");
   const b = model.addBoundary(d, "trust", "Private network");
   d = b.draft;
   for (const key of ["svc", "index", "queue"]) d = model.updateNode(d, ids[key], { boundary: b.id }).draft;
   const layout = fakes.canonical.wireLayout(d);
   server.diagrams.writeElsewhere(id, () => fakes.canonical.wireGraph(d.graph), layout);
   return ids;
}

/** A dense graph of `n` components and `m` connections on a grid (the T03 maximum case is 60 and 120). */
function dense(fakes, server, id, n, m) {
   const { model } = fakes;
   const types = ["client", "service", "gateway", "database", "queue", "model", "cache", "object_store", "worker", "external"];
   let d = model.EMPTY_DRAFT;
   const nodes = [];
   for (let i = 0; i < n; i++) {
      const r = model.addNode(d, types[i % types.length], { label: `C${i + 1}`, at: { x: (i % 10) * 200, y: Math.floor(i / 10) * 140 } });
      d = r.draft;
      nodes.push(r.id);
   }
   let made = 0;
   for (let step = 1; made < m; step++) {
      for (let i = 0; i < n && made < m; i++) {
         const j = (i + step) % n;
         const r = model.addEdge(d, nodes[i], nodes[j], "request");
         if (r.ok && !r.existing) {
            d = model.updateEdge(r.draft, r.id, { explanation: `Edge ${made + 1}` }).draft;
            made++;
         }
      }
   }
   server.diagrams.writeElsewhere(id, () => fakes.canonical.wireGraph(d.graph), fakes.canonical.wireLayout(d));
   return d;
}

async function openDesign(page, id) {
   await page.goto(`${APP}/practice/attempts/${id}`);
   await page.getByRole("heading", { level: 1 }).waitFor();
   const narrow = (page.viewportSize()?.width ?? 1280) < 768;
   if (narrow) await page.locator("#practice-stage-select").selectOption("design");
   else await page.getByRole("navigation", { name: "Interview stages" }).getByRole("button", { name: /^\d*\s*Design/ }).click();
   await page.locator("[data-diagram-editor]").waitFor({ timeout: 60_000 });
   await page.waitForTimeout(400);
}

const stored = (server, id) => server.diagrams.diagram(id);
async function waitSaved(page) {
   try {
      await page.locator("[data-slot=save-status][data-status=saved]").waitFor({ timeout: 10_000 });
   } catch (error) {
      const status = await page.locator("[data-slot=save-status]").innerText().catch(() => "?");
      const trouble = await page.locator("[data-diagram-trouble]").innerText().catch(() => "none");
      throw new Error(`not saved: status "${status}", trouble "${trouble}"`, { cause: error });
   }
}
const connectForm = (outline) => outline.locator("form", { has: outline.page().getByRole("heading", { name: "Connect two components" }) });
const addForm = (outline) => outline.locator("form", { has: outline.page().getByRole("heading", { name: "Add a component" }) });

// --- scenario: probe (one screenshot, for development) ---
async function probe(browser, fakes) {
   const { server, context, page, problems } = await newPage(browser, fakes, { width: Number(process.env.PROBE_W ?? 1280), height: 900 }, process.env.PROBE_SCHEME ?? "light");
   const id = await server.seed();
   representative(fakes, server, id);
   await openDesign(page, id);
   await page.screenshot({ path: process.env.PROBE_SHOT ?? join(tmpdir(), "p9-t14-probe.png") });
   console.log(problems.join("\n"));
   await context.close();
}

const node = (page, id) => page.locator(`.react-flow__node[data-id="${id}"]`);
const announcer = (page) => page.locator("[data-pg-announcer]");
const canvasText = (page) => page.locator("[data-diagram-editor] .react-flow").innerText();

// --- scenario: canvas editing on a desktop (1280, light) ---
async function desktop(browser, fakes) {
   const label = "desktop 1280 light";
   const { server, context, page, problems } = await newPage(browser, fakes, { width: 1280, height: 900 });
   const id = await server.seed();
   const ids = representative(fakes, server, id);
   await openDesign(page, id);
   await audit(page, `${label} (editor)`);
   await shot(page, "P9-T14-desktop-editor-light-1280");
   check(`${label}: React Flow attribution is visible`, await page.locator(".react-flow__attribution a").isVisible());
   check(`${label}: six shapes and six directed connections with arrowheads`, (await page.locator(".react-flow__node-shape").count()) === 6 && (await page.locator(".react-flow__edge path[marker-end]").count()) === 6);

   // Select a component: the Inspector shows its type and fields; the canvas never shows explanations.
   await node(page, ids.svc).click();
   await page.locator("[data-fields=node]").waitFor();
   check(`${label}: selecting a component drives the Inspector`, (await page.locator("[data-pg-inspector-title]").innerText()) === "Answer service");
   const explanation = "Owns retrieval and prompt assembly. On a model timeout it returns the passages alone.";
   await page.locator('[data-fields=node] [name="explanation"]').fill(explanation);
   check(`${label}: explanations never render on the canvas (AC-13.6)`, !(await canvasText(page)).includes("Owns retrieval"));
   const hostile = `<img src=x onerror="window.__pwned=1">`;
   await page.locator('[data-fields=node] [name="label"]').fill(hostile);
   await page.waitForTimeout(300);
   check(`${label}: hostile learner text renders as text on the canvas and runs nothing`, (await canvasText(page)).includes(hostile) && (await page.locator("[data-diagram-editor] img").count()) === 0 && (await page.evaluate(() => window.__pwned)) === undefined);
   await page.locator('[data-fields=node] [name="label"]').fill("Answer service");
   await audit(page, `${label} (node Inspector)`);
   await shot(page, "P9-T14-node-inspector-light-1280");

   // Select a connection by clicking its tag on the curve: the Inspector shows From, To, Kind, Tag, Explanation and Swap.
   const tag = page.locator(".pg-edge-tag", { hasText: "top passages" });
   const box = await tag.boundingBox();
   await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
   await page.locator("[data-fields=edge]").waitFor();
   check(`${label}: selecting a connection drives the Inspector`, (await page.locator("[data-pg-inspector-title]").innerText()) === "Answer service to Passage index");
   await page.locator('[data-fields=edge] [name="explanation"]').fill("The question embedding and a tenant filter; the top passage identifiers come back.");
   await shot(page, "P9-T14-edge-inspector-light-1280");
   await page.getByRole("button", { name: "Swap direction" }).click();
   check(`${label}: swap keeps the connection and reverses it`, (await page.locator("[data-pg-inspector-title]").innerText()) === "Passage index to Answer service");
   await page.getByRole("button", { name: "Swap direction" }).click();
   await audit(page, `${label} (edge Inspector)`);

   // Add from the palette: the new component is selected and its Name field focused.
   await page.getByRole("button", { name: "Add cache" }).click();
   await page.locator('[data-fields=node] [name="label"]').waitFor();
   const focused = await page.waitForFunction(() => document.activeElement?.matches('[data-fields=node] [name="label"]'), null, { timeout: 3000 }).then(() => true, () => false);
   check(`${label}: a palette add focuses the Name field`, focused);
   await page.keyboard.type("Answer cache");
   const cacheId = await page.evaluate(() => document.querySelector(".react-flow__node.selected")?.getAttribute("data-id"));
   // Typing in a field never triggers canvas shortcuts (AC-13.4).
   const before = await page.locator(".react-flow__node-shape").count();
   await page.keyboard.type(" c1/");
   check(`${label}: shortcuts never intercept typing in the Inspector`, (await page.locator(".react-flow__node-shape").count()) === before && (await page.locator('[data-fields=node] [name="label"]').inputValue()) === "Answer cache c1/");
   await page.locator('[data-fields=node] [name="label"]').fill("Answer cache");
   // Escape returns to the component on the canvas; C opens the connect picker; typing a name and Enter connects.
   await page.keyboard.press("Escape");
   await page.waitForFunction((cid) => document.activeElement?.getAttribute("data-id") === cid, cacheId);
   await page.keyboard.press("c");
   await page.getByRole("combobox", { name: "Target component" }).waitFor();
   await page.keyboard.type("Answer serv");
   await page.keyboard.press("Enter");
   await page.locator("[data-fields=edge]").waitFor();
   check(`${label}: C then a name connects, and the connection is announced`, (await announcer(page).innerText()).startsWith("Connected Answer cache to Answer service"));
   // Drag from a handle to another component.
   await node(page, ids.model).click();
   const handle = await page.locator(`.react-flow__node[data-id="${ids.model}"] .react-flow__handle-bottom`).boundingBox();
   const target = await node(page, ids.index).boundingBox();
   const edgesBefore = await page.locator(".react-flow__edge").count();
   await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
   await page.mouse.down();
   await page.mouse.move(target.x + target.width / 2, target.y + 10, { steps: 12 });
   await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
   await page.mouse.up();
   await page.waitForFunction((n) => document.querySelectorAll(".react-flow__edge").length === n, edgesBefore + 1, { timeout: 3000 }).catch(() => undefined);
   check(`${label}: dragging from a handle to a component creates a directed connection`, (await page.locator(".react-flow__edge").count()) === edgesBefore + 1 && (await page.locator("[data-fields=edge]").count()) === 1);
   // Move a component: layout only.
   await waitSaved(page);
   const hash = stored(server, id).graph_hash;
   const queue = await node(page, ids.queue).boundingBox();
   await page.mouse.move(queue.x + 20, queue.y + queue.height / 2);
   await page.mouse.down();
   await page.mouse.move(queue.x - 30, queue.y + queue.height / 2 + 60, { steps: 10 });
   await page.mouse.up();
   await page.waitForTimeout(1700);
   await waitSaved(page);
   check(`${label}: moving a component saves layout and leaves graph_hash unchanged`, stored(server, id).graph_hash === hash && stored(server, id).layout.nodes[ids.queue].y !== 372);
   // Delete with the keyboard, undo with Cmd/Ctrl+Z.
   await node(page, ids.model).focus();
   await page.keyboard.press("Enter");
   await page.keyboard.press("Delete");
   check(`${label}: Delete removes the component and its connections`, (await node(page, ids.model).count()) === 0);
   await page.keyboard.press("ControlOrMeta+z");
   await node(page, ids.model).waitFor();
   await page.waitForFunction((n) => document.querySelectorAll(".react-flow__edge").length === n, edgesBefore + 1, { timeout: 3000 }).catch(() => undefined);
   const undone = { node: await node(page, ids.model).count(), edges: await page.locator(".react-flow__edge").count() };
   check(`${label}: Cmd/Ctrl+Z restores it with the same ID`, undone.node === 1 && undone.edges === edgesBefore + 1, JSON.stringify({ ...undone, expected: edgesBefore + 1 }));
   // Single-key shortcuts can be turned off.
   await page.getByText("View settings").click();
   await page.getByLabel("Single-key shortcuts on the canvas").uncheck();
   await page.locator(".pg-canvas").focus();
   const count = await page.locator(".react-flow__node-shape").count();
   await page.keyboard.press("2");
   check(`${label}: with single-key shortcuts off, 2 adds nothing`, (await page.locator(".react-flow__node-shape").count()) === count);
   await page.getByLabel("Single-key shortcuts on the canvas").check();
   await page.locator(".pg-canvas").focus();
   await page.keyboard.press("2");
   check(`${label}: with shortcuts on, 2 adds a service`, (await page.locator(".react-flow__node-shape").count()) === count + 1);
   await page.keyboard.press("Escape");
   await page.waitForTimeout(1700);
   await waitSaved(page);
   const saved = stored(server, id);
   check(`${label}: the server holds the canvas work`, saved.graph.nodes.length === 8 && saved.graph.edges.length === 8 && saved.graph.nodes.some((n) => n.explanation === explanation));
   check(`${label}: only practice routes were called, and no AI route`, server.log.every((line) => /\/me\/practice\/(attempts|capability)/.test(line)) && !server.log.some((line) => /turn|hint|check/.test(line)), [...new Set(server.log)].join(" "));
   await context.close();
   check(`${label}: no console error, warning or uncaught error`, problems.length === 0, problems.join(" | "));
}

/** Keyboard-only construction through the Outline: no pointer event at all (focus moves by Tab or a field's own focus, values by typing). */
async function outlineKeyboard(browser, fakes) {
   const label = "Outline keyboard-only 1280";
   const { server, context, page, problems } = await newPage(browser, fakes, { width: 1280, height: 900 });
   const id = await server.seed();
   await openDesign(page, id);
   let pointer = 0;
   await page.exposeFunction("__pointerSeen", () => (pointer += 1));
   await page.evaluate(() => ["pointerdown", "mousedown", "click"].forEach((type) => document.addEventListener(type, (e) => e.isTrusted && e.detail > 0 && window.__pointerSeen(), true)));
   // "/" on the canvas opens the Outline search.
   await page.locator(".pg-canvas").focus();
   await page.keyboard.press("/");
   await page.waitForFunction(() => document.activeElement?.getAttribute("type") === "search");
   const outline = page.locator(".pg-outline");
   const names = ["Web app", "Mobile app", "API gateway", "Auth service", "Answer service", "Ingest worker", "Document store", "Passage index", "Answer cache", "Ingest queue", "Answer model", "Embedding model"];
   const types = ["Client", "Client", "Gateway", "Service", "Service", "Worker", "Object store", "Database", "Cache", "Queue", "Model", "Model"];
   for (let i = 0; i < names.length; i++) {
      await addForm(outline).getByLabel("Type", { exact: true }).focus();
      await page.keyboard.type(types[i]);
      await page.keyboard.press("Tab");
      await page.keyboard.type(names[i]);
      await page.keyboard.press("Enter");
   }
   const edges = [
      [0, 2, "Request"], [1, 2, "Request"], [2, 3, "Request"], [2, 4, "Request"], [4, 7, "Read"], [4, 10, "Request"], [4, 8, "Read"], [4, 8, "Write"],
      [2, 9, "Async message"], [9, 5, "Async message"], [5, 6, "Write"], [5, 11, "Request"], [5, 7, "Write"], [3, 4, "Request"], [6, 5, "Read"],
   ];
   for (const [from, to, kind] of edges) {
      const form = connectForm(outline);
      await form.getByLabel("From", { exact: true }).focus();
      await page.keyboard.type(names[from]);
      await form.getByLabel("To", { exact: true }).focus();
      await page.keyboard.type(names[to]);
      await form.getByLabel("Kind", { exact: true }).focus();
      await page.keyboard.type(kind);
      await form.getByRole("button", { name: "Connect", exact: true }).focus();
      await page.keyboard.press("Enter");
      const area = outline.locator("li.is-open [data-fields=edge] [name=explanation]");
      await area.waitFor();
      await area.focus();
      await page.keyboard.type(`Why ${names[from]} sends ${kind.toLowerCase()} to ${names[to]}.`);
   }
   await page.waitForTimeout(1700);
   await waitSaved(page);
   const saved = stored(server, id);
   check(`${label}: 12 components and 15 connections built from the Outline alone (AC-13.1)`, saved.graph.nodes.length === 12 && saved.graph.edges.length === 15, `${saved.graph.nodes.length}/${saved.graph.edges.length}`);
   check(`${label}: every connection explained`, saved.graph.edges.every((e) => e.explanation.startsWith("Why ")));
   const byName = new Map(saved.graph.nodes.map((n) => [n.id, n.label]));
   const want = edges.map(([f, t, k]) => `${names[f]}>${names[t]}:${k.toLowerCase().replace(" ", "_")}`).sort();
   const got = saved.graph.edges.map((e) => `${byName.get(e.from)}>${byName.get(e.to)}:${e.kind}`).sort();
   check(`${label}: every connection has the chosen ends, direction and kind`, JSON.stringify(got) === JSON.stringify(want), got.join(" "));
   check(`${label}: no pointer event was used`, pointer === 0, String(pointer));
   check(`${label}: connections are announced`, (await announcer(page).innerText()).length > 0);
   await audit(page, `${label} (Outline)`);
   await shot(page, "P9-T14-outline-light-1280");
   results.outlineBuild = { nodes: saved.graph.nodes.length, edges: saved.graph.edges.length, pointerEvents: pointer };
   await context.close();
   check(`${label}: no console error, warning or uncaught error`, problems.length === 0, problems.join(" | "));
}

/** The same small diagram through the canvas and through the Outline gives identical graphs apart from IDs (AC-13.2). */
async function parity(browser, fakes) {
   const label = "canvas versus Outline";
   const normal = (graph) => {
      const name = new Map(graph.nodes.map((n) => [n.id, n.label]));
      const bname = new Map(graph.boundaries.map((b) => [b.id, b.label]));
      return JSON.stringify({
         nodes: graph.nodes.map((n) => ({ ...n, id: n.label, boundary: n.boundary ? bname.get(n.boundary) : null })).sort((a, b) => a.id.localeCompare(b.id)),
         edges: graph.edges.map((e) => ({ ...e, id: `${name.get(e.from)}>${name.get(e.to)}`, from: name.get(e.from), to: name.get(e.to) })).sort((a, b) => a.id.localeCompare(b.id)),
         boundaries: graph.boundaries.map((b) => ({ ...b, id: b.label })),
      });
   };
   // Canvas path: palette, Inspector, C picker, Inspector.
   const a = await newPage(browser, fakes, { width: 1280, height: 900 });
   const ida = await a.server.seed();
   await openDesign(a.page, ida);
   const pageA = a.page;
   for (const [type, nameText, sub] of [["client", "Web", "Web"], ["service", "API", "API"], ["database", "Store", "Relational"]]) {
      await pageA.getByRole("button", { name: `Add a ${type}` }).click();
      await pageA.locator('[data-fields=node] [name="label"]').fill(nameText);
      await pageA.locator("[data-fields=node]").getByLabel("Subtype").selectOption({ label: sub });
      await pageA.locator('[data-fields=node] [name="explanation"]').fill(`${nameText} explained.`);
   }
   const nodeIdOf = async (text) => pageA.evaluate((t) => [...document.querySelectorAll(".react-flow__node-shape")].find((n) => n.textContent === t)?.getAttribute("data-id"), text);
   for (const [from, to, kind, tagText] of [["Web", "API", "Request", "ask"], ["API", "Store", "Read", "rows"]]) {
      await node(pageA, await nodeIdOf(from)).focus();
      await pageA.keyboard.press("Enter");
      await pageA.keyboard.press("c");
      await pageA.keyboard.type(to);
      await pageA.keyboard.press("Enter");
      await pageA.locator("[data-fields=edge]").getByLabel("Kind").selectOption({ label: kind });
      await pageA.locator('[data-fields=edge] [name="tag"]').fill(tagText);
      await pageA.locator('[data-fields=edge] [name="explanation"]').fill(`${from} to ${to}.`);
   }
   await pageA.waitForTimeout(1700);
   await waitSaved(pageA);
   // Outline path.
   const b = await newPage(browser, fakes, { width: 1280, height: 900 });
   const idb = await b.server.seed();
   await openDesign(b.page, idb);
   const pageB = b.page;
   await pageB.getByRole("button", { name: "Outline", exact: true }).click();
   const outline = pageB.locator(".pg-outline");
   for (const [type, nameText, sub] of [["Client", "Web", "Web"], ["Service", "API", "API"], ["Database", "Store", "Relational"]]) {
      await addForm(outline).getByLabel("Type", { exact: true }).selectOption({ label: type });
      await addForm(outline).getByLabel("Name", { exact: true }).fill(nameText);
      await addForm(outline).getByRole("button", { name: "Add component" }).click();
      await outline.locator("li.is-open [data-fields=node]").getByLabel("Subtype").selectOption({ label: sub });
      await outline.locator('li.is-open [data-fields=node] [name="explanation"]').fill(`${nameText} explained.`);
   }
   for (const [from, to, kind, tagText] of [["Web", "API", "Request", "ask"], ["API", "Store", "Read", "rows"]]) {
      await connectForm(outline).getByLabel("From", { exact: true }).selectOption({ label: from });
      await connectForm(outline).getByLabel("To", { exact: true }).selectOption({ label: to });
      await connectForm(outline).getByLabel("Kind", { exact: true }).selectOption({ label: kind });
      await connectForm(outline).getByRole("button", { name: "Connect", exact: true }).click();
      await outline.locator('li.is-open [data-fields=edge] [name="tag"]').fill(tagText);
      await outline.locator('li.is-open [data-fields=edge] [name="explanation"]').fill(`${from} to ${to}.`);
   }
   await pageB.waitForTimeout(1700);
   await waitSaved(pageB);
   const ga = stored(a.server, ida).graph;
   const gb = stored(b.server, idb).graph;
   check(`${label}: identical graphs apart from IDs (AC-13.2)`, normal(ga) === normal(gb), `${normal(ga)}\n vs ${normal(gb)}`);
   await a.context.close();
   await b.context.close();
   check(`${label}: no console error, warning or uncaught error`, a.problems.length + b.problems.length === 0, [...a.problems, ...b.problems].join(" | "));
}

/** Delete, autosave, reload, restore from Recently deleted; delete, autosave, undo (AC-11.3 to 11.5). */
async function restore(browser, fakes) {
   const label = "restore 1280";
   const { server, context, page, problems } = await newPage(browser, fakes, { width: 1280, height: 900 });
   const id = await server.seed();
   const ids = representative(fakes, server, id);
   await openDesign(page, id);
   const before = stored(server, id).graph;
   await node(page, ids.svc).click();
   await page.getByRole("button", { name: "Delete component" }).click();
   await page.waitForTimeout(1700);
   await waitSaved(page);
   check(`${label}: one tombstone group holds the component and its 3 connections`, stored(server, id).tombstones.length === 4 && new Set(stored(server, id).tombstones.map((t) => t.group)).size === 1);
   await page.reload();
   await page.getByRole("heading", { level: 1 }).waitFor();
   await page.getByRole("navigation", { name: "Interview stages" }).getByRole("button", { name: /^\d*\s*Design/ }).click();
   await page.locator("[data-diagram-editor]").waitFor();
   await page.getByRole("button", { name: "Outline", exact: true }).click();
   await page.locator("[data-recently-deleted]").scrollIntoViewIfNeeded();
   await shot(page, "P9-T14-recently-deleted-light-1280");
   await audit(page, `${label} (Recently deleted)`);
   await page.getByRole("button", { name: /^Restore Answer service/ }).click();
   await page.waitForTimeout(1700);
   await waitSaved(page);
   const after = stored(server, id);
   check(`${label}: restore after reload brings back the same IDs and explanations (AC-11.4, 11.5)`, after.tombstones.length === 0 && JSON.stringify(after.graph) === JSON.stringify(before));
   // Delete a connection, let it save, then undo: the server restores the same element.
   await page.getByRole("button", { name: "Inspector", exact: true }).click();
   const tag = await page.locator(".pg-edge-tag", { hasText: "prompt" }).boundingBox();
   await page.mouse.click(tag.x + tag.width / 2, tag.y + tag.height / 2);
   await page.getByRole("button", { name: "Delete connection" }).click();
   await page.waitForTimeout(1700);
   await waitSaved(page);
   check(`${label}: the deleted connection is a tombstone`, stored(server, id).tombstones.length === 1);
   await page.locator(".pg-canvas").focus();
   await page.keyboard.press("ControlOrMeta+z");
   await page.waitForTimeout(1700);
   await waitSaved(page);
   check(`${label}: undo after autosave restores it, with its explanation (AC-11.3)`, stored(server, id).tombstones.length === 0 && JSON.stringify(stored(server, id).graph) === JSON.stringify(before));
   // Restore of a retired element: offered as new elements.
   await node(page, ids.model).click();
   await page.getByRole("button", { name: "Delete component" }).click();
   await page.waitForTimeout(1700);
   await waitSaved(page);
   server.diagrams.retire(id, stored(server, id).tombstones.map((t) => t.id));
   await page.locator(".pg-canvas").focus();
   await page.keyboard.press("ControlOrMeta+z");
   await page.locator("[data-diagram-trouble=invalid]").waitFor({ timeout: 10_000 });
   check(`${label}: a retired restoration says it can no longer be undone`, (await page.locator("[data-diagram-trouble]").innerText()).includes("can no longer be undone"));
   await page.getByRole("button", { name: "Add them again as new" }).click();
   await page.waitForTimeout(1700);
   await waitSaved(page);
   const final = stored(server, id).graph;
   check(`${label}: re-added as new elements with the same text`, final.nodes.some((n) => n.label === "Answer model" && n.id !== ids.model) && final.edges.length === 6);
   await context.close();
   check(`${label}: no console error, warning or uncaught error`, problems.length === 0, problems.join(" | "));
}

/** 409 conflicts, an attempt ended during a save, and a network interruption (AC-11.6 and 15.1, UI side). */
async function conflicts(browser, fakes) {
   const label = "conflicts 1280";
   const { server, context, page, problems } = await newPage(browser, fakes, { width: 1280, height: 900 });
   const id = await server.seed();
   const ids = representative(fakes, server, id);
   await openDesign(page, id);
   const touch = (nodeId, explanation) => (graph) => ({ ...graph, nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, explanation } : n)) });
   // Edit versus edit: keep local work, offer the three choices, Review element by element.
   server.diagrams.writeElsewhere(id, touch(ids.gw, "Edited on the other device."));
   await node(page, ids.gw).click();
   await page.locator('[data-fields=node] [name="explanation"]').fill("Edited here.");
   await page.locator("[data-diagram-trouble=conflict]").waitFor({ timeout: 10_000 });
   await page.getByRole("button", { name: "Keep mine" }).waitFor();
   check(`${label}: the attempt status says the diagram is not saved`, (await page.locator("[data-slot=save-status]").innerText()).includes("Not saved (Diagram)"));
   check(`${label}: local text is kept while the learner chooses`, (await page.locator('[data-fields=node] [name="explanation"]').inputValue()) === "Edited here.");
   await audit(page, `${label} (conflict)`);
   await shot(page, "P9-T14-conflict-light-1280");
   await page.getByRole("button", { name: "Review" }).click();
   const review = page.locator("[data-diagram-trouble=conflict]");
   check(`${label}: Review lists the one differing element with both versions`, (await review.locator("fieldset").count()) === 1 && (await review.innerText()).includes("Edited on the other device."));
   await review.getByLabel(/Other version/).check();
   await review.getByRole("button", { name: "Save this version" }).click();
   await waitSaved(page);
   check(`${label}: the reviewed choice is saved`, stored(server, id).graph.nodes.find((n) => n.id === ids.gw).explanation === "Edited on the other device.");
   // Delete versus edit: Keep mine restores the deleted component with my edit.
   server.diagrams.writeElsewhere(id, (graph) => ({ ...graph, nodes: graph.nodes.filter((n) => n.id !== ids.model), edges: graph.edges.filter((e) => e.to !== ids.model && e.from !== ids.model) }));
   await node(page, ids.model).click();
   await page.locator('[data-fields=node] [name="explanation"]').fill("My edit to the model.");
   await page.getByRole("button", { name: "Keep mine" }).waitFor({ timeout: 10_000 });
   await page.getByRole("button", { name: "Keep mine" }).click();
   await waitSaved(page);
   check(`${label}: delete versus edit, Keep mine restores it with my edit`, stored(server, id).graph.nodes.find((n) => n.id === ids.model)?.explanation === "My edit to the model." && stored(server, id).tombstones.length === 0);
   // Delete versus new connection: Take theirs discards the connection; nothing dangling is ever sent.
   server.diagrams.writeElsewhere(id, (graph) => ({ ...graph, nodes: graph.nodes.filter((n) => n.id !== ids.index), edges: graph.edges.filter((e) => e.to !== ids.index && e.from !== ids.index) }));
   await node(page, ids.web).click();
   await page.keyboard.press("c");
   await page.keyboard.type("Passage");
   await page.keyboard.press("Enter");
   await page.getByRole("button", { name: "Take theirs" }).waitFor({ timeout: 10_000 });
   await page.getByRole("button", { name: "Take theirs" }).click();
   await waitSaved(page);
   check(`${label}: delete versus new connection, Take theirs leaves no dangling connection`, !stored(server, id).graph.nodes.some((n) => n.id === ids.index) && stored(server, id).graph.edges.every((e) => stored(server, id).graph.nodes.some((n) => n.id === e.to)));
   check(`${label}: no PUT ever carried a dangling connection`, server.api.requests.filter((r) => r.route === "put_diagram").every((r) => r.body.graph.edges.every((e) => r.body.graph.nodes.some((n) => n.id === e.from) && r.body.graph.nodes.some((n) => n.id === e.to))));
   // Network interruption: kept in memory, then saved.
   server.state.offline = true;
   await node(page, ids.web).click();
   await page.locator('[data-fields=node] [name="label"]').fill("Web client");
   await page.locator("[data-diagram-trouble=offline]").waitFor({ timeout: 10_000 });
   check(`${label}: offline keeps the work and says so`, (await page.locator("[data-diagram-trouble=offline]").innerText()).includes("Your text is still here"));
   server.state.offline = false;
   await page.getByRole("button", { name: "Try again now" }).click();
   await waitSaved(page);
   check(`${label}: back online, the change is saved`, stored(server, id).graph.nodes.some((n) => n.label === "Web client"));
   // The attempt ended elsewhere: writes stop for good, the graph stays visible.
   server.store.endAttempt(id, "submitted");
   await page.locator('[data-fields=node] [name="label"]').fill("Web client two");
   await page.locator("[data-diagram-trouble=terminal]").waitFor({ timeout: 10_000 });
   const puts = server.api.requests.filter((r) => r.route === "put_diagram").length;
   await page.waitForTimeout(2500);
   check(`${label}: an ended attempt halts the diagram; nothing more is sent`, server.api.requests.filter((r) => r.route === "put_diagram").length === puts && (await page.locator(".react-flow__node-shape").count()) > 0);
   await context.close();
   check(`${label}: no console error, warning or uncaught error`, problems.length === 0, problems.join(" | "));
}

/** Phones: view, pan and select on the canvas; every semantic edit through the Outline; the Inspector as a bottom sheet (AC-13.3). */
async function mobile(browser, fakes) {
   for (const width of [390, 320]) {
      const label = `phone ${width}`;
      const { server, context, page, problems } = await newPage(browser, fakes, { width, height: 780 });
      const id = await server.seed();
      const ids = representative(fakes, server, id);
      await openDesign(page, id);
      check(`${label}: the canvas is view and select only (no palette, no handles)`, (await page.locator(".pg-palette").count()) === 0 && (await page.locator(".react-flow__handle.connectable").count()) === 0 && (await page.locator(".react-flow__edge path[marker-end]").count()) === 6);
      await page.getByText("View settings").click();
      const settingsBox = await page.locator(".pg-settings-panel").boundingBox();
      check(`${label}: the settings panel stays inside the viewport`, settingsBox !== null && settingsBox.x >= 0 && settingsBox.x + settingsBox.width <= width, settingsBox ? `x ${settingsBox.x}, right ${settingsBox.x + settingsBox.width}, width ${width}` : "not visible");
      await page.getByText("View settings").click();
      check(`${label}: mobile copy says to edit through the Outline`, await page.getByText("On a phone, use the Outline below to add, connect and explain.").isVisible());
      await node(page, ids.svc).tap();
      await page.locator(".pg-side.is-sheet [data-fields=node]").waitFor();
      if (width === 390) await shot(page, "P9-T14-mobile-canvas-light-390");
      await audit(page, `${label} (canvas with Inspector sheet)`);
      await page.getByRole("button", { name: "Close the Inspector" }).click();
      await page.locator(".pg-switch").getByRole("button", { name: "Outline" }).click();
      const outline = page.locator(".pg-outline");
      await addForm(outline).getByLabel("Type", { exact: true }).selectOption({ label: "Cache" });
      await addForm(outline).getByLabel("Name", { exact: true }).fill("Answer cache");
      await addForm(outline).getByRole("button", { name: "Add component" }).click();
      await outline.locator('li.is-open [data-fields=node] [name="explanation"]').fill("Keeps recent answers.");
      await connectForm(outline).getByLabel("From", { exact: true }).selectOption({ label: "Answer service" });
      await connectForm(outline).getByLabel("To", { exact: true }).selectOption({ label: "Answer cache" });
      await connectForm(outline).getByLabel("Kind", { exact: true }).selectOption({ label: "Read" });
      await connectForm(outline).getByRole("button", { name: "Connect", exact: true }).click();
      await outline.locator('li.is-open [data-fields=edge] [name="explanation"]').fill("Looks up a cached answer first.");
      await outline.locator("li.is-open").getByRole("button", { name: "Swap direction" }).click();
      await outline.locator("li.is-open").getByRole("button", { name: "Delete connection" }).click();
      await outline.getByRole("button", { name: "Undo" }).click();
      await page.waitForTimeout(1700);
      await waitSaved(page);
      const saved = stored(server, id).graph;
      const made = saved.edges.find((e) => e.explanation === "Looks up a cached answer first.");
      const status = await page.locator("[data-slot=save-status]").boundingBox();
      check(`${label}: the save state is visible on screen while editing in the Outline`, status !== null && status.y >= 0 && status.y < 780 && (await page.locator("[data-slot=save-status]").innerText()).includes("Saved"));
      check(`${label}: create, connect, set direction, explain and undo a delete through the Outline`, saved.nodes.length === 7 && made && saved.nodes.find((n) => n.id === made.from)?.label === "Answer cache");
      if (width === 390) await shot(page, "P9-T14-mobile-outline-light-390", { fullPage: false });
      await audit(page, `${label} (Outline)`);
      await context.close();
      check(`${label}: no console error, warning or uncaught error`, problems.length === 0, problems.join(" | "));
   }
}

/** Light and dark, and the remaining widths: axe, overflow, targets, a screenshot of dark (AC-14.1, 14.2). */
async function themes(browser, fakes) {
   for (const [width, scheme] of [[1280, "dark"], [320, "dark"], [768, "light"], [1920, "light"], [768, "dark"]]) {
      const label = `${width} ${scheme}`;
      const { server, context, page, problems } = await newPage(browser, fakes, { width, height: 900 }, scheme);
      const id = await server.seed();
      const ids = representative(fakes, server, id);
      await openDesign(page, id);
      if (width >= 768) await node(page, ids.svc).click();
      await audit(page, `${label} (editor)`);
      if (width === 1280) await shot(page, "P9-T14-editor-dark-1280");
      if (width >= 768) {
         await page.getByRole("button", { name: "Outline", exact: true }).click();
         await audit(page, `${label} (Outline)`);
      }
      await context.close();
      check(`${label}: no console error, warning or uncaught error`, problems.length === 0, problems.join(" | "));
   }
}

// Content markers (T03's method): a file is editor code only if its content holds one of these, never by its name.
const MARK = {
   xyflow: ["react-flow__renderer", "react-flow__edgelabel-renderer", ".react-flow__node", ".react-flow__handle"],
   editor: ["Why does this connection exist?", "Find in the outline", ".pg-shape-label", ".pg-edge-tag"],
};
const classify = (text) => ({ xyflow: MARK.xyflow.some((m) => text.includes(m)), editor: MARK.editor.some((m) => text.includes(m)) });
const pct = (values, p) => {
   if (values.length === 0) return null;
   const sorted = [...values].sort((a, b) => a - b);
   return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

/** Records every script and stylesheet a page receives, with its gzip size and its classification. */
function recorder(page) {
   const loaded = [];
   page.on("response", async (response) => {
      const url = response.url();
      if (!/\.(js|css)(\?|$)/.test(new URL(url).pathname) || !url.startsWith(APP)) return;
      try {
         const body = await response.body();
         loaded.push({ url: new URL(url).pathname, type: url.includes(".css") ? "css" : "js", raw: body.length, gzip: gzipSync(body, { level: 9 }).length, ...classify(body.toString("utf8")) });
      } catch {
         // a redirect or an aborted prefetch has no body
      }
   });
   return loaded;
}

/** Zero editor code on non-practice pages, after load, idle, scrolling and hovering every link (prefetch), and the editor's own size. */
async function bundle(browser, fakes) {
   if (!PROD) return check("bundle: needs SMOKE_PROD=1 (a production build)", false);
   const pages = {
      home: "/",
      catalog: "/tracks",
      track: "/tracks/catalog-e2e-home",
      "knowledge catalog": "/knowledge",
      "lesson reader": "/lessons/catalog-e2e-free",
      "knowledge reader": "/knowledge/p2-t6-attention",
      "problem reader (with the practice entry)": "/problems/catalog-e2e-related",
      prepare: "/prepare",
      "practice history": "/practice/history",
   };
   results.bundle = { pages: {} };
   for (const [name, path] of Object.entries(pages)) {
      const { server, context, page } = await newPage(browser, fakes, { width: 1280, height: 900 });
      void server;
      const loaded = recorder(page);
      await page.goto(`${APP}${path}`, { waitUntil: "load" });
      await page.waitForTimeout(1200);
      await page.evaluate(async () => {
         for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
         }
      });
      for (const link of await page.locator("a[href^='/']").all()) await link.hover({ timeout: 500 }).catch(() => undefined);
      await page.waitForTimeout(1500);
      const html = await page.content();
      const editorFiles = loaded.filter((f) => f.xyflow || f.editor);
      results.bundle.pages[name] = { path, files: loaded.length, jsGzip: loaded.filter((f) => f.type === "js").reduce((n, f) => n + f.gzip, 0), editorFiles: editorFiles.map((f) => f.url) };
      check(`bundle: ${name} (${path}) receives no React Flow or editor code, prefetch included`, editorFiles.length === 0 && !classify(html).xyflow, `${loaded.length} files`);
      await context.close();
   }
   // The attempt route: the editor arrives only when a stage that shows the diagram opens.
   const { server, context, page, problems } = await newPage(browser, fakes, { width: 1280, height: 900 });
   const id = await server.seed();
   representative(fakes, server, id);
   const loaded = recorder(page);
   await page.goto(`${APP}/practice/attempts/${id}`, { waitUntil: "load" });
   await page.getByRole("heading", { level: 1 }).waitFor();
   await page.waitForTimeout(1500);
   const beforeDesign = loaded.filter((f) => f.xyflow || f.editor).length;
   const early = loaded.filter((f) => f.xyflow || f.editor).map((f) => `${f.url} (${f.type}, ${f.gzip} B gzip, xyflow ${f.xyflow}, editor ${f.editor})`);
   results.bundle.attemptBeforeDiagram = early;
   // The workspace holds the diagram's autosave engine from the start (one resource per attempt), so the graph model may load with it;
   // React Flow and the editor's components may not, until a stage that shows the diagram opens.
   check("bundle: the attempt route loads no React Flow code before a diagram stage opens", loaded.filter((f) => f.xyflow).length === 0, early.join("; "));
   void beforeDesign;
   await page.getByRole("navigation", { name: "Interview stages" }).getByRole("button", { name: /^\d*\s*Design/ }).click();
   await page.locator("[data-diagram-editor] .react-flow__node-shape").first().waitFor();
   await page.waitForTimeout(800);
   // Everything the attempt route received that carries editor or React Flow content counts toward the budget (an upper bound: a shared chunk counts whole).
   const editor = loaded.filter((f) => f.xyflow || f.editor);
   const js = editor.filter((f) => f.type === "js");
   const css = editor.filter((f) => f.type === "css");
   const jsGzip = js.reduce((n, f) => n + f.gzip, 0);
   const cssGzip = css.reduce((n, f) => n + f.gzip, 0);
   results.bundle.editor = { js: js.map(({ url, raw, gzip }) => ({ url, raw, gzip })), css: css.map(({ url, raw, gzip }) => ({ url, raw, gzip })), jsGzip, cssGzip, budgetJsGzip: 120 * 1024, budgetCssGzip: 8 * 1024 };
   check(`bundle: editor JS ${jsGzip} B gzip is within 120 KiB (${120 * 1024} B)`, jsGzip > 0 && jsGzip <= 120 * 1024, `${js.length} files`);
   check(`bundle: editor CSS ${cssGzip} B gzip is within 8 KiB (${8 * 1024} B)`, cssGzip > 0 && cssGzip <= 8 * 1024, `${css.length} files`);
   await context.close();
   check("bundle: no console error on the attempt route", problems.length === 0, problems.join(" | "));
}

/** Input-to-next-frame and long animation frames, representative and maximum graphs, at 1x and 4x CPU (T03's headless method). */
async function perf(browser, fakes) {
   if (!PROD) return check("perf: needs SMOKE_PROD=1 (a production build)", false);
   results.perf = {};
   for (const size of ["representative", "maximum"]) {
      for (const throttle of [1, 4]) {
         const label = `perf ${size} ${throttle}x`;
         const { server, context, page, problems } = await newPage(browser, fakes, { width: 1440, height: 900 });
         const id = await server.seed();
         const ids = size === "representative" ? representative(fakes, server, id) : null;
         if (!ids) dense(fakes, server, id, 60, 120);
         await openDesign(page, id);
         await page.waitForTimeout(800);
         const cdp = await context.newCDPSession(page);
         await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
         await page.evaluate(() => {
            const m = { frames: [], lat: [], loaf: [], input: null, on: true };
            window.__pgT14Perf = m;
            for (const type of ["pointerdown", "pointermove", "pointerup", "keydown"]) document.addEventListener(type, (e) => (m.input ??= e.timeStamp), { capture: true });
            m.obs = new PerformanceObserver((list) => m.loaf.push(...list.getEntries().map((x) => ({ d: x.duration, b: x.blockingDuration }))));
            m.obs.observe({ type: "long-animation-frame" });
            let last = performance.now();
            const loop = (t) => {
               m.frames.push(t - last);
               last = t;
               if (m.input !== null) {
                  m.lat.push(t - m.input);
                  m.input = null;
               }
               if (m.on) requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
         });
         const shapes = page.locator(".react-flow__node-shape");
         const count = await shapes.count();
         // Select ten components, type into the Inspector, then drag one component across the canvas.
         for (let i = 0; i < 10; i++) {
            // A dense graph puts connection hit areas over small shapes; the click still goes through the real pointer path.
            await shapes.nth((i * 7) % count).click({ force: true });
            await page.waitForTimeout(40);
         }
         const field = page.locator('[data-fields=node] [name="explanation"]');
         await field.click();
         await page.keyboard.type("Typing in the Inspector while the graph is large.", { delay: 30 });
         await page.keyboard.press("Escape");
         const target = shapes.nth(Math.floor(count / 2));
         const box = await target.boundingBox();
         const ox = box.x + box.width / 2;
         const oy = box.y + box.height / 2;
         await page.mouse.move(ox, oy);
         await page.mouse.down();
         for (let i = 1; i <= 60; i++) {
            const t = i / 60;
            await page.mouse.move(ox + Math.sin(t * Math.PI * 2) * 160, oy + t * 120);
            await page.waitForTimeout(16);
         }
         await page.mouse.up();
         await page.waitForTimeout(600);
         const { frames, lat, loaf } = await page.evaluate(() => {
            const m = window.__pgT14Perf;
            m.on = false;
            m.obs.disconnect();
            return { frames: m.frames.slice(1), lat: m.lat, loaf: m.loaf };
         });
         await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
         const routed = await page.evaluate(() => [...document.querySelectorAll(".react-flow__edge-path.pg-edge")].map((p) => p.getAttribute("data-route")));
         const r = {
            nodes: count,
            edges: await page.locator(".react-flow__edge").count(),
            inputs: lat.length,
            inputToFrameP50: pct(lat, 50),
            inputToFrameP95: pct(lat, 95),
            inputToFrameMax: lat.length ? Math.max(...lat) : null,
            frames: frames.length,
            frameP95: pct(frames, 95),
            longAnimationFrames: loaf.length,
            longestAnimationFrame: loaf.length ? Math.max(...loaf.map((x) => x.d)) : 0,
            framesOver200: frames.filter((f) => f > 200).length,
            routes: { clear: routed.filter((x) => x === "clear").length, fallback: routed.filter((x) => x === "fallback").length },
         };
         results.perf[`${size}-${throttle}x`] = r;
         const reference = throttle === 4;
         check(
            `${label}: input-to-next-frame p95 ${r.inputToFrameP95?.toFixed(1)} ms ≤ 50 ms${reference ? " and no animation frame over 200 ms" : ""}`,
            r.inputToFrameP95 !== null && r.inputToFrameP95 <= 50 && (!reference || r.longestAnimationFrame <= 200),
            `${r.nodes} nodes, ${r.edges} edges, ${r.inputs} inputs, longest frame ${r.longestAnimationFrame.toFixed(1)} ms, fallbacks ${r.routes.fallback}`
         );
         await context.close();
         check(`${label}: no console error`, problems.length === 0, problems.join(" | "));
      }
   }
}

const SCENARIOS = { probe, desktop, outlineKeyboard, parity, restore, conflicts, mobile, themes, bundle, perf };

async function run() {
   const fakes = await loadFakes();
   if (process.env.SMOKE_REUSE !== "1") {
      start("node", ["tests/e2e/catalog/fake-api.mjs", String(API_PORT), String(AUTH_PORT)], {});
      const env = {
         NEXT_TELEMETRY_DISABLED: "1",
         API_URL: API,
         NEXT_PUBLIC_API_URL: API,
         CATALOG_PREVIEW_TOKEN: "",
         NEXT_PUBLIC_SUPABASE_URL: AUTH,
         NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "smoke-key",
         NEXT_PUBLIC_PRACTICE_ENABLED: "true",
      };
      if (PROD) start("npx", ["next", "start", "-p", String(APP_PORT)], env);
      else start("npx", ["next", "dev", "--webpack", "-p", String(APP_PORT)], { ...env, NEXT_DIST_DIR: ".next-preview" });
   }
   await Promise.all([waitFor(`${API}/health`), waitFor(`${APP}/login`)]);
   const browser = await chromium.launch();
   try {
      for (const [name, scenario] of Object.entries(SCENARIOS)) {
         if (ONLY ? !ONLY.has(name) : name === "probe") continue;
         console.log(`\n# ${name}`);
         await scenario(browser, fakes);
      }
   } finally {
      await browser.close();
   }
   if (process.env.SMOKE_JSON) writeFileSync(process.env.SMOKE_JSON, `${JSON.stringify(results, null, 2)}\n`);
}

try {
   await run();
} catch (error) {
   console.log(`FAIL harness — ${error.stack ?? error.message}`);
   failures.push("harness");
} finally {
   stopAll();
}
console.log(failures.length ? `\n${failures.length} failed` : "\nall passed");
process.exit(failures.length ? 1 : 0);
