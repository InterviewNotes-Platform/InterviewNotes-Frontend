#!/usr/bin/env node
// Headless measurement probe for P3 (dev tool, not a Playwright Test spec). It drives an already running
// production build and fake API, and prints one JSON document on stdout; diagnostics go to stderr.
//
//   node tests/e2e/catalog/probe.mjs <mode>[,<mode>...] --routes /lessons/p3-seq-one,/tracks/p3-sequence
//     [--base http://localhost:3100] [--api http://127.0.0.1:3101]
//     [--viewports 390,768,1024,1440] [--themes light,dark] [--settle 500] [--body-selector <css>] [--strict]
//
// Modes: overflow, requests, offset, console. Add a mode by writing an async function in MODES; no new loop script.
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
