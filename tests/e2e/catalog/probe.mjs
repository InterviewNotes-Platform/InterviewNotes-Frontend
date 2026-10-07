#!/usr/bin/env node
// Headless measurement probe for P3 (dev tool, not a Playwright Test spec). It drives an already running
// production build and fake API, and prints one JSON document on stdout; diagnostics go to stderr.
//
//   node tests/e2e/catalog/probe.mjs <mode>[,<mode>...] --routes /lessons/p3-seq-one,/tracks/p3-sequence
//     [--base http://localhost:3100] [--api http://127.0.0.1:3101]
//     [--viewports 390,768,1024,1440] [--themes light,dark] [--settle 500] [--body-selector <css>] [--strict]
//
// Modes: overflow, requests, offset, console, panel, syntax, expand. Add a mode by writing an async function in MODES; no new loop script.
// `requests` reads the fake API's /__catalog-log. The production build caches catalog reads, so a route
// whose count is 0 was served from that cache (`cached: true`); start from a cold cache for real counts.
import { chromium } from "@playwright/test";

const DEFAULTS = {
   base: "http://localhost:3100",
   api: "http://127.0.0.1:3101",
   viewports: "390,768,1024,1440",
   themes: "light,dark",
   settle: "500",
   // Lesson layout: main > grid > body column > CatalogBody wrapper > first body element.
   "body-selector": "main > div > div:last-child > div > :first-child",
};
const GUTTER_EXPAND = 16;
const HYDRATION = /minified react error #(?:418|419|422|423|425)|hydrat/i;
const list = (value) => value.split(",").map((part) => part.trim()).filter(Boolean);

function parseArgs(argv) {
   const options = { ...DEFAULTS };
   const positional = [];
   for (let index = 0; index < argv.length; index++) {
      const arg = argv[index];
      if (arg === "--strict") options.strict = true;
      else if (arg.startsWith("--")) options[arg.slice(2)] = argv[++index];
      else positional.push(arg);
   }
   return { options, modes: positional.flatMap(list) };
}

/** A fresh page at one viewport and theme (next-themes reads `theme` from localStorage). */
async function open(browser, { width = 1280, height = 900, theme = "light" } = {}) {
   const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
   await context.addInitScript((value) => localStorage.setItem("theme", value), theme);
   return { page: await context.newPage(), close: () => context.close() };
}

/** Loads a route and returns its status and the console errors raised while it settled. */
async function visit(page, config, route) {
   const errors = [];
   const onConsole = (message) => void (message.type() === "error" && errors.push(message.text()));
   const onError = (error) => void errors.push(error.message);
   page.on("console", onConsole);
   page.on("pageerror", onError);
   const response = await page.goto(new URL(route, config.base).href, { waitUntil: "load" });
   await page.waitForTimeout(Number(config.settle));
   page.off("console", onConsole);
   page.off("pageerror", onError);
   return { status: response?.status() ?? null, errors };
}

async function catalogLog(config) {
   return (await fetch(new URL("/__catalog-log", config.api))).json();
}

/** The kind of catalog request. Only `item_read` fetches an item body, which is a Git read in the backend. */
function kindOf(path) {
   if (path === "/catalog/tracks") return "track_list";
   if (path.startsWith("/catalog/tracks/")) return "track_outline";
   if (path === "/catalog/items") return "item_list";
   if (path.endsWith("/meta")) return "item_meta";
   if (path.endsWith("/related")) return "item_related";
   return "item_read";
}

const MODES = {
   async overflow({ browser, config, routes }) {
      const rows = [];
      for (const width of list(config.viewports).map(Number)) {
         for (const theme of list(config.themes)) {
            const { page, close } = await open(browser, { width, theme });
            for (const route of routes) {
               const { status } = await visit(page, config, route);
               const m = await page.evaluate(() => ({
                  scrollWidth: document.documentElement.scrollWidth,
                  clientWidth: document.documentElement.clientWidth,
                  dark: document.documentElement.classList.contains("dark"),
               }));
               const overflowPx = Math.max(0, m.scrollWidth - m.clientWidth);
               const themeApplied = m.dark === (theme === "dark");
               rows.push({ route, width, theme, status, themeApplied, scrollWidth: m.scrollWidth, clientWidth: m.clientWidth, overflowPx, overflows: overflowPx > 0 });
            }
            await close();
         }
      }
      return rows;
   },

   async requests({ browser, config, routes }) {
      const { page, close } = await open(browser);
      const rows = [];
      for (const route of routes) {
         const since = (await catalogLog(config)).length;
         const { status } = await visit(page, config, route);
         const calls = (await catalogLog(config)).slice(since).map(({ path, query }) => ({ kind: kindOf(path), path, query }));
         const byKind = {};
         for (const { kind } of calls) byKind[kind] = (byKind[kind] ?? 0) + 1;
         rows.push({ route, status, catalog: calls.length, gitReads: byKind.item_read ?? 0, cached: calls.length === 0, byKind, calls });
      }
      await close();
      return rows;
   },

   async offset({ browser, config, routes }) {
      const { page, close } = await open(browser, { width: 390, height: 844 });
      const rows = [];
      for (const route of routes) {
         const { status } = await visit(page, config, route);
         const found = await page.evaluate((selector) => {
            const top = (element) => Math.round((element.getBoundingClientRect().top + window.scrollY) * 100) / 100;
            const body = document.querySelector(selector);
            const heading = document.querySelector("main h1");
            return { h1Top: heading && top(heading), tag: body?.tagName.toLowerCase() ?? null, top: body ? top(body) : null };
         }, config["body-selector"]);
         rows.push({ route, width: 390, status, matched: found.tag !== null, firstBodyElement: found.tag, bodyTop: found.top, h1Top: found.h1Top });
      }
      await close();
      return rows;
   },

   /** P3-T7: opens the first Knowledge toggle of each route and measures the panel against the viewport, the column and the reference. */
   async panel({ browser, config, routes }) {
      const GUTTER = 16;
      const rows = [];
      for (const width of list(config.viewports).map(Number)) {
         for (const theme of list(config.themes)) {
            const { page, close } = await open(browser, { width, height: 900, theme });
            for (const route of routes) {
               const { status, errors } = await visit(page, config, route);
               const toggles = page.getByRole("button", { name: /^About / });
               const row = { route, width, theme, status, toggles: await toggles.count(), errors: errors.length };
               if (row.toggles === 0) {
                  rows.push({ ...row, opened: false });
                  continue;
               }
               const toggle = toggles.first();
               for (let attempt = 0; attempt < 20 && (await toggle.getAttribute("aria-expanded")) !== "true"; attempt++) {
                  await toggle.click();
                  await page.waitForTimeout(150);
               }
               const m = await page.evaluate(() => {
                  const toggle = document.querySelector('button[aria-label^="About "]');
                  const wrapper = toggle.parentElement;
                  const panel = wrapper.querySelector('[role="group"]');
                  const link = wrapper.previousElementSibling;
                  const box = (rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
                  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
                  if (!panel) return { opened: false };
                  const p = box(panel.getBoundingClientRect());
                  const column = box(toggle.closest("[data-catalog-body]").getBoundingClientRect());
                  const reference = [...link.getClientRects(), toggle.getBoundingClientRect()].map(box);
                  const block = toggle.closest("p, li, td, blockquote");
                  const withToggle = block.getBoundingClientRect().height;
                  wrapper.style.display = "none";
                  const without = block.getBoundingClientRect().height;
                  wrapper.style.display = "";
                  const style = getComputedStyle(panel);
                  return {
                     opened: true,
                     panel: { left: p.left, right: p.right, top: p.top, width: p.right - p.left },
                     viewportWidth: document.documentElement.clientWidth,
                     overflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
                     coversReference: reference.some((r) => hit(p, r)),
                     belowReference: p.top >= Math.max(...reference.map((r) => r.bottom)) - 0.5,
                     column: { left: column.left, right: column.right },
                     paragraphDeltaPx: Math.round((withToggle - without) * 100) / 100,
                     insidePhrasing: !panel.closest("p") || ![...panel.querySelectorAll("*")].some((e) => /^(DIV|P|UL|OL|SECTION)$/.test(e.tagName)),
                     transition: style.transitionDuration,
                     animation: style.animationName,
                  };
               });
               const fit = m.opened && {
                  withinViewport: m.panel.left >= GUTTER - 0.5 && m.panel.right <= m.viewportWidth - GUTTER + 0.5,
                  withinColumn: m.panel.left >= m.column.left - 0.5 && m.panel.right <= m.column.right + 0.5,
               };
               const oneOpen = row.toggles > 1 ? await (async () => {
                  await toggles.nth(1).click();
                  await page.waitForTimeout(150);
                  return (await page.getByRole("group", { name: /^About / }).count()) === 1;
               })() : null;
               if (oneOpen !== null) await toggles.nth(0).click(); // reopen the first; the second closes
               await page.keyboard.press("Escape");
               await page.waitForTimeout(100);
               const escapeClosed = (await page.getByRole("group", { name: /^About / }).count()) === 0;
               const focusReturned = await page.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("About ") ?? false);
               await toggle.click();
               await page.waitForTimeout(100);
               await page.locator("main h1").click();
               await page.waitForTimeout(100);
               const outsideClosed = (await page.getByRole("group", { name: /^About / }).count()) === 0;
               rows.push({ ...row, ...m, ...fit, oneOpen, escapeClosed, focusReturned, outsideClosed });
            }
            await close();
         }
      }
      return rows;
   },

   /** P3-T9: contrast of every --syntax-* token, and of each token colour actually rendered, against the code surface. */
   async syntax({ browser, config, routes }) {
      const rows = [];
      for (const theme of list(config.themes)) {
         const { page, close } = await open(browser, { theme });
         for (const route of routes) {
            const { status, errors } = await visit(page, config, route);
            const m = await page.evaluate(() => {
               const rgb = (css) => {
                  const probe = document.createElement("span");
                  probe.style.color = css;
                  document.body.append(probe);
                  const channels = getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
                  probe.remove();
                  return channels;
               };
               const luminance = (channels) => {
                  const [r, g, b] = channels.map((value) => ((value /= 255) <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
                  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
               };
               const contrast = (a, b) => {
                  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
                  return Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100;
               };
               const surface = rgb(getComputedStyle(document.documentElement).getPropertyValue("--code-surface"));
               const names = new Set();
               for (const sheet of document.styleSheets) {
                  for (const rule of sheet.cssRules) {
                     for (const name of rule.style ?? []) if (name.startsWith("--syntax-")) names.add(name);
                  }
               }
               const tokens = [...names].sort().map((name) => {
                  const color = rgb(`var(${name})`);
                  return { name, color: color.join(","), contrast: contrast(color, surface) };
               });
               const rendered = new Map();
               for (const span of document.querySelectorAll("code.hljs span[class^='hljs-']")) {
                  const color = rgb(getComputedStyle(span).color);
                  const entry = rendered.get(span.className) ?? { class: span.className, count: 0, color: color.join(","), contrast: contrast(color, surface) };
                  entry.count++;
                  rendered.set(span.className, entry);
               }
               const text = (selector) => [...document.querySelectorAll(selector)].map((code) => contrast(rgb(getComputedStyle(code).color), surface));
               return {
                  dark: document.documentElement.classList.contains("dark"),
                  surface: surface.join(","),
                  tokens,
                  rendered: [...rendered.values()],
                  highlightedBlocks: document.querySelectorAll("code.hljs").length,
                  plainBlocksWithTokens: [...document.querySelectorAll("pre code:not(.hljs)")].filter((code) => code.querySelector("span")).length,
                  plainTextContrast: Math.min(...text("pre code"), 21),
               };
            });
            const all = [...m.tokens, ...m.rendered].map((entry) => entry.contrast);
            rows.push({ route, theme, status, errors: errors.length, themeApplied: m.dark === (theme === "dark"), ...m, minContrast: Math.min(...all, m.plainTextContrast) });
         }
         await close();
      }
      return rows;
   },

   /** P3-T10: expands the first overflowing diagram of each route and measures the dialog, its focus, ids, theme and requests. */
   async expand({ browser, config, routes }) {
      const rows = [];
      for (const width of list(config.viewports).map(Number)) {
         for (const theme of list(config.themes)) {
            // No stored theme: next-themes follows the emulated colour scheme, so it can flip while the dialog is open.
            const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: theme });
            const page = await context.newPage();
            for (const route of routes) {
               const { status, errors } = await visit(page, config, route);
               const expandButtons = page.getByRole("button", { name: "Expand diagram" });
               const figures = await page.locator("figure:has(svg)").count();
               const row = { route, width, theme, status, figures, expandButtons: await expandButtons.count() };
               const fitting = await page.locator("figure:has(svg):not(:has(button))").evaluateAll((all) => all.map((f) => f.querySelectorAll("button, [tabindex]").length));
               if (row.expandButtons === 0) {
                  rows.push({ ...row, fittingTabStops: fitting, opened: false, errors: errors.length });
                  continue;
               }
               const trigger = page.locator("button", { hasText: "Expand diagram" }).first();
               const logBefore = (await catalogLog(config)).length;
               const requests = [];
               const interactionErrors = [];
               const onRequest = (request) => void requests.push(request.url());
               const onConsole = (message) => void (message.type() === "error" && interactionErrors.push(message.text()));
               page.on("request", onRequest);
               page.on("console", onConsole);
               page.on("pageerror", (error) => interactionErrors.push(error.message));
               await trigger.scrollIntoViewIfNeeded();
               await trigger.focus();
               await page.keyboard.press("Enter");
               const dialog = page.getByRole("dialog");
               await dialog.waitFor();
               await page.waitForFunction(() => document.querySelector("[role=dialog] svg"));
               const before = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, y: window.scrollY }));

               const open = await page.evaluate(() => {
                  const dialog = document.querySelector("[role=dialog]");
                  const region = dialog.querySelector("[role=region]");
                  const svg = dialog.querySelector("svg");
                  const box = dialog.getBoundingClientRect();
                  const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
                  const touch = [dialog, ...dialog.querySelectorAll("*")].map((e) => getComputedStyle(e).touchAction).filter((v) => v !== "auto");
                  const root = document.documentElement;
                  const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
                  return {
                     viewport: { width: root.clientWidth, height: window.innerHeight },
                     dialog: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
                     title: dialog.getAttribute("aria-labelledby") && document.getElementById(dialog.getAttribute("aria-labelledby"))?.textContent,
                     regionName: region.getAttribute("aria-label"),
                     regionFocused: document.activeElement === region,
                     regionScrolls: { x: region.scrollWidth > region.clientWidth, y: region.scrollHeight > region.clientHeight },
                     svgWidth: Math.round(svg.getBoundingClientRect().width),
                     viewBoxWidth: Number(svg.getAttribute("viewBox").split(/\s+/)[2]),
                     duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
                     idCount: ids.length,
                     svgCount: document.querySelectorAll("svg[id^=mermaid]").length,
                     touchActions: touch,
                     viewportMeta: viewport,
                     userScalingDisabled: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(viewport),
                     bodyLocked: getComputedStyle(document.body).overflow === "hidden",
                     overflowX: root.scrollWidth > root.clientWidth,
                  };
               });
               // The page behind, as assistive technology sees it. Radix keeps every aria-live region's ancestor chain
               // (the Copy status), so empty code groups remain; anything with content or a control would be a finding.
               const behind = (await page.locator("body").ariaSnapshot()).split(/^- dialog/m)[0];
               const exposed = { lines: behind.split("\n").filter(Boolean).length, withContentOrControl: behind.split("\n").filter((line) => /\b(heading|link|button|textbox|paragraph|listitem|img|text)\b/.test(line)).length };
               // The page must not scroll behind the dialog, by wheel or by keyboard.
               await page.mouse.move(2, 2);
               await page.mouse.wheel(0, 600);
               await page.keyboard.press("Tab");
               const afterTab = await page.evaluate(() => ({ inside: !!document.activeElement?.closest("[role=dialog]"), name: document.activeElement?.textContent?.trim() }));
               for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
               const trapped = await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"));
               const after = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, y: window.scrollY }));

               // Theme change while open (system preference): the dialog and the inline diagram both redraw.
               const mark = (dark) => page.evaluate((hex) => ({ dialog: document.querySelector("[role=dialog] svg").outerHTML.toLowerCase().includes(hex), inline: [...document.querySelectorAll("main svg")].some((s) => !s.closest("[role=dialog]") && s.outerHTML.toLowerCase().includes(hex)) }), dark ? "#1e3a5f" : "#dbeafe");
               const first = await mark(theme === "dark");
               await page.emulateMedia({ colorScheme: theme === "dark" ? "light" : "dark" });
               await page.waitForFunction((dark) => document.documentElement.classList.contains("dark") === dark, theme !== "dark");
               await page.waitForFunction((hex) => document.querySelector("[role=dialog] svg")?.outerHTML.toLowerCase().includes(hex), theme === "dark" ? "#dbeafe" : "#1e3a5f", { timeout: 5000 }).catch(() => {});
               await page.waitForTimeout(300);
               const flipped = await mark(theme !== "dark");
               const stillOpen = await dialog.count();
               await page.emulateMedia({ colorScheme: theme });
               await page.waitForTimeout(300);

               if (width === 390) {
                  const session = await context.newCDPSession(page);
                  const region = await page.locator("[role=dialog] [role=region]").boundingBox();
                  await session.send("Input.synthesizeScrollGesture", { x: region.x + region.width / 2, y: region.y + region.height / 2, xDistance: -150, yDistance: 0, gestureSourceType: "touch", speed: 800 });
                  await page.waitForTimeout(300);
               }
               const touchScrollLeft = await page.locator("[role=dialog] [role=region]").evaluate((e) => e.scrollLeft);

               // Each way of closing returns focus to the Expand button.
               const closers = {};
               const refocused = async () => (await page.waitForTimeout(150), trigger.evaluate((e) => e === document.activeElement));
               await page.keyboard.press("Escape");
               await dialog.waitFor({ state: "detached" });
               closers.escape = await refocused();
               await trigger.click();
               await dialog.waitFor();
               await page.getByRole("button", { name: "Close" }).click();
               await dialog.waitFor({ state: "detached" });
               closers.close = await refocused();
               await trigger.click();
               await dialog.waitFor();
               await page.mouse.click(2, 2);
               await dialog.waitFor({ state: "detached" });
               closers.backdrop = await refocused();
               page.off("request", onRequest);
               page.off("console", onConsole);
               rows.push({
                  ...row, fittingTabStops: fitting, opened: true, errors: errors.length + interactionErrors.length, errorTexts: [...errors, ...interactionErrors], ...open, exposed, afterTab, trapped,
                  pageScrolledBehind: after.y !== before.y, documentGrew: after.w > before.w || after.h > before.h,
                  themeFlip: { before: first, flipped, stillOpen: stillOpen === 1 },
                  touchScrollLeft, closers,
                  requestsWhileOpen: requests.length, requests,
                  catalogRequests: (await catalogLog(config)).length - logBefore,
               });
            }
            await context.close();
         }
      }
      return rows;
   },

   async console({ browser, config, routes }) {
      const { page, close } = await open(browser);
      const rows = [];
      for (const route of routes) {
         const { status, errors } = await visit(page, config, route);
         rows.push({ route, status, errors, hydrationErrors: errors.filter((text) => HYDRATION.test(text)).length });
      }
      await close();
      return rows;
   },
};

/** A finding is a row the caller should look at; `--strict` turns any finding into a non-zero exit. */
const FINDING = {
   overflow: (row) => row.overflows || !row.themeApplied,
   requests: () => false,
   offset: (row) => !row.matched,
   console: (row) => row.errors.length > 0,
   // P2 contrast standard: 4.5:1 for text.
   syntax: (row) => row.errors > 0 || !row.themeApplied || row.minContrast < 4.5 || row.plainBlocksWithTokens > 0 || row.tokens.length === 0,
   expand: (row) => {
      if (row.errors > 0) return true;
      if (!row.opened) return row.fittingTabStops.some((stops) => stops > 0);
      const { dialog: d, viewport: v } = row;
      return !(
         d.left >= GUTTER_EXPAND - 0.5 && d.right <= v.width - GUTTER_EXPAND + 0.5 && d.top >= GUTTER_EXPAND - 0.5 && d.bottom <= v.height - GUTTER_EXPAND + 0.5 &&
         !row.overflowX && !row.documentGrew && !row.pageScrolledBehind && row.bodyLocked && row.regionFocused && row.trapped && row.afterTab.inside &&
         row.svgWidth === row.viewBoxWidth && row.duplicateIds.length === 0 && row.touchActions.length === 0 && !row.userScalingDisabled &&
         row.exposed.withContentOrControl === 0 && row.closers.escape && row.closers.close && row.closers.backdrop && row.requestsWhileOpen === 0 && row.catalogRequests === 0 &&
         row.themeFlip.before.dialog && row.themeFlip.flipped.dialog && row.themeFlip.flipped.inline && row.themeFlip.stillOpen
      );
   },
   panel: (row) =>
      row.errors > 0 ||
      (row.toggles > 0 &&
         !(row.opened && row.withinViewport && row.withinColumn && !row.coversReference && row.belowReference && row.overflowPx === 0 && row.insidePhrasing && row.escapeClosed && row.focusReturned && row.outsideClosed && row.oneOpen !== false)),
};

const { options: config, modes } = parseArgs(process.argv.slice(2));
const routes = list(config.routes ?? "");
const unknown = modes.filter((mode) => !(mode in MODES));
if (modes.length === 0 || unknown.length > 0 || routes.length === 0) {
   console.error(`usage: probe.mjs <${Object.keys(MODES).join("|")}>[,...] --routes /a,/b${unknown.length ? ` (unknown mode: ${unknown})` : ""}`);
   process.exit(2);
}

const browser = await chromium.launch();
const output = { probe: "p3-probe/1", base: config.base, api: config.api, routes, results: {}, findings: 0 };
try {
   for (const mode of modes) {
      console.error(`probe: ${mode} (${routes.length} routes)`);
      output.results[mode] = await MODES[mode]({ browser, config, routes });
      output.findings += output.results[mode].filter(FINDING[mode]).length;
   }
} finally {
   await browser.close();
}
console.log(JSON.stringify(output, null, 2));
process.exit(config.strict && output.findings > 0 ? 1 : 0);
