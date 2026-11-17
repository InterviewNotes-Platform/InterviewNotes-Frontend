// P8-RSP-02 v3 diagnostic, never shipped: does a link acknowledge keyboard activation and a touch tap, and how fast?
//
//   node scripts/perf/rsp-input-probe.mjs --base http://127.0.0.1:3240 --out probe.json [--label B]
//
// On the e2e fixture Track it activates the first curriculum Lesson link with Tab focus + Enter (desktop context),
// and taps it in a touch context (hasTouch, 390 x 844). For each it records ms from the input to the first
// `[data-nav-pending]` marker (its kind: link or route) and to the destination's URL. Signed out; nothing from the
// page is stored, and the results file passes safeOutput.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { safeField, safeLine, safeOutput } from "./rsp-sanitize.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const args = Object.fromEntries(process.argv.slice(2).reduce((p, t, i, a) => (t.startsWith("--") ? [...p, [t.slice(2), a[i + 1]]] : p), []));
const BASE = (args.base ?? "").replace(/\/$/, "");
const RUNS = Number(args.runs ?? 3);
const SOURCE = "/tracks/catalog-e2e-home";
const LINK = 'main ol a[href^="/lessons/"], main ul a[href^="/lessons/"]';

const WATCH = () => {
   const now = () => performance.now();
   const s = (window.__probe = { t0: null, pending: null, kind: null, url: null });
   const start = location.pathname;
   const tick = () => {
      if (s.t0 !== null) {
         const m = document.querySelector("[data-nav-pending]");
         if (m && s.pending === null) { s.pending = now() - s.t0; s.kind = m.getAttribute("data-nav-pending"); }
         if (location.pathname !== start && s.url === null) s.url = now() - s.t0;
      }
      if (s.url === null || s.pending === null) requestAnimationFrame(tick);
   };
   requestAnimationFrame(tick);
};

async function once(browser, mode) {
   const context = await browser.newContext(mode === "touch" ? { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } } : { viewport: { width: 1280, height: 900 } });
   const page = await context.newPage();
   try {
      await page.goto(BASE + SOURCE, { waitUntil: "load" });
      await page.waitForTimeout(800);
      const link = page.locator(LINK).first();
      await link.scrollIntoViewIfNeeded();
      await page.evaluate(WATCH);
      if (mode === "keyboard") {
         await link.focus();
         await page.evaluate(() => (window.__probe.t0 = performance.now()));
         await page.keyboard.press("Enter");
      } else {
         await page.evaluate(() => (window.__probe.t0 = performance.now()));
         await link.tap();
      }
      await page.waitForFunction(() => window.__probe.url !== null, null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(300);
      const p = await page.evaluate(() => window.__probe);
      return { mode, pendingMs: p.pending === null ? null : Math.round(p.pending), pendingKind: p.kind, urlChangeMs: p.url === null ? null : Math.round(p.url) };
   } finally {
      await context.close();
   }
}

const browser = await chromium.launch({ headless: true });
const runs = [];
for (const mode of ["keyboard", "touch"]) for (let i = 0; i < RUNS; i++) {
   const r = await once(browser, mode);
   runs.push(r);
   console.log(safeLine`${safeField("label", args.label ?? "-")} ${mode} pending=${r.pendingMs ?? "-"} kind=${r.pendingKind ? safeField("pendingKind", r.pendingKind) : "-"} url=${r.urlChangeMs ?? "-"}`);
}
await browser.close();
const TOOL = "P8-RSP-02 rsp-input-probe.mjs";
writeFileSync(args.out, JSON.stringify(safeOutput({ tool: TOOL, label: args.label ?? null, runs }, { constants: [TOOL] }), null, 2));
