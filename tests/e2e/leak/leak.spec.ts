import { appendFileSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROTECTED_CANARIES } from "../../leak/canaries";
import { findMaterializedRoutes, format, prerendered, scanNextBuild, scanResponse, walk } from "../../leak/scanner";
import fixture from "../catalog/fixture.json";
import { PREVIEW_DIST, PREVIEW_ORIGIN, PRODUCTION_ORIGIN, canonical, expect, exposures, inlinedRsc, item, test } from "../catalog/harness";

const sorted = (values: string[]) => [...values].sort();
const holds = (record: object) => PROTECTED_CANARIES.filter((canary) => JSON.stringify(record).includes(canary));

// Every catalog route the fixture serves, with the canaries its own content is meant to carry.
const ROUTES = [...fixture.items, ...fixture.tracks].map((record) => ({
   route: canonical(record.id),
   expected: holds(record),
   premium: "access" in record && record.access === "premium",
}));
const BROWSER_CHUNK = 16;
const BROWSER_CHUNKS = Array.from({ length: Math.ceil(ROUTES.length / BROWSER_CHUNK) }, (_, index) => ROUTES.slice(index * BROWSER_CHUNK, (index + 1) * BROWSER_CHUNK));
const PROBLEM = canonical("problem.t24-premium-solution");
const NEIGHBOURS = ["lesson.t24-premium-body", "knowledge.t24-premium-deep-dive"].map((id) => ({
   route: canonical(id),
   title: item(id).title,
}));

const BUILDS = [
   { name: "production", dist: ".next" },
   { name: "preview", dist: PREVIEW_DIST },
];

test.describe("build output", () => {
   for (const { name, dist } of BUILDS) {
      test.describe(`${name} build (${dist})`, () => {
         test("holds no premium canary, and every class of artifact was read", () => {
            const { findings, scanned } = scanNextBuild(dist);
            expect(format(findings)).toEqual([]);
            for (const kind of ["static", "server-app", "server-chunks", "server-other", "root"]) {
               expect(scanned[kind] ?? 0, `no ${kind} files scanned`).toBeGreaterThan(0);
            }
            expect(scanned.static, "no client JavaScript scanned").toBeGreaterThan(10);
         });

         test("is scanned by a scanner that finds a canary planted in each class of a copy of it", () => {
            const copy = mkdtempSync(join(tmpdir(), "leak-build-"));
            try {
               cpSync(dist, copy, { recursive: true, filter: (source) => !source.startsWith(join(dist, "cache")) });
               const files = walk(copy);
               const targets = [
                  files.find((file) => file.startsWith("static/") && file.endsWith(".js")),
                  files.find((file) => file.startsWith("server/app/") && file.endsWith(".html")),
                  files.find((file) => file.startsWith("server/app/") && file.endsWith(".rsc")),
                  files.find((file) => file.startsWith("server/chunks/") && file.endsWith(".js")),
                  "server/app-paths-manifest.json",
                  "prerender-manifest.json",
               ].map((file, index) => ({ file: file!, canary: PROTECTED_CANARIES[index % PROTECTED_CANARIES.length] }));
               for (const { file, canary } of targets) appendFileSync(join(copy, file), `\n${canary}`);

               const found = scanNextBuild(copy).findings.map(({ location, canary }) => `${location}: ${canary}`);
               expect(sorted(found)).toEqual(sorted(targets.map(({ file, canary }) => `${file}: ${canary}`)));
            } finally {
               rmSync(copy, { recursive: true, force: true });
            }
         });

         test("builds every catalog route dynamic and prerenders none of them", () => {
            expect(findMaterializedRoutes(dist)).toEqual([]);
            const { routes, files } = prerendered(dist);
            expect(routes, "the manifest reader should see the static pages").toEqual(expect.arrayContaining(["/login", "/learn"]));
            expect(files, "the file reader should see the static pages").toEqual(expect.arrayContaining(["login.html", "learn.rsc"]));
         });
      });
   }
});

for (const { name, baseURL } of [
   { name: "production", baseURL: PRODUCTION_ORIGIN },
   { name: "preview", baseURL: PREVIEW_ORIGIN },
]) {
   test.describe(`${name} deployment, unauthorized`, () => {
      const NOTICE = { "signed-out": "Sign in to read this content.", unentitled: "Paid access is not available yet." };

      for (const identity of ["signed-out", "unentitled"] as const) {
         test.describe(identity, () => {
            test.use({ baseURL, identity });

            test("raw HTML and fetched RSC of every catalog route hold no canary", async ({ page }) => {
               for (const { route, premium } of ROUTES) {
                  const where = `${route} as ${identity} on ${name}`;
                  const document = await page.request.get(route);
                  expect(document.status(), where).toBe(200);
                  const html = await document.text();
                  expect(inlinedRsc(html), `${where}: no inlined RSC payload decoded`).not.toBe("");
                  expect(format(scanResponse("html", route, html)), where).toEqual([]);
                  if (premium) expect(html, `${where}: not served as this identity`).toContain(NOTICE[identity]);

                  const flights: Record<string, string>[] = [{ RSC: "1" }, { RSC: "1", "Next-Router-Prefetch": "1" }];
                  for (const headers of flights) {
                     const flight = await page.request.get(route, { headers });
                     expect(flight.headers()["content-type"], where).toContain("text/x-component");
                     const text = await flight.text();
                     expect(text, `${where}: empty RSC payload`).not.toBe("");
                     expect(format(scanResponse("rsc", route, text)), `${where} ${Object.keys(headers)}`).toEqual([]);
                  }
               }
            });

            test("every catalog route is rendered on demand, never shared-cacheable or served from a prerender cache", async ({
               page,
            }) => {
               for (const { route } of ROUTES) {
                  const headers = (await page.request.get(route)).headers();
                  expect(headers["cache-control"] ?? "", route).toMatch(/no-store|private/);
                  expect(headers["cache-control"] ?? "", route).not.toMatch(/public|s-maxage/);
                  expect(headers["x-nextjs-cache"], `${route}: served from the Next cache`).toBeUndefined();
               }
            });

            // Every route is loaded in a browser, a chunk per test, so the loop's cost stays inside one test's budget as the fixture grows.
            BROWSER_CHUNKS.forEach((routes, index) => {
               test(`the browser receives no canary through HTML, RSC, DOM or the network (routes ${index * BROWSER_CHUNK + 1}-${index * BROWSER_CHUNK + routes.length} of ${ROUTES.length})`, async ({ page, traffic }) => {
                  for (const { route } of routes) {
                     await page.goto(route);
                     await page.waitForLoadState("networkidle");
                     const received = await traffic.responses();
                     expect(received.some((r) => r.kind === "document" && new URL(r.url).pathname === route), `${route}: no document captured`).toBe(true);
                     for (const canary of PROTECTED_CANARIES) {
                        expect(await exposures(page, received, canary), `${route} as ${identity}: ${canary}`).toEqual([]);
                     }
                  }
               });
            });

            test("client navigation to a premium neighbour fetches RSC that holds no canary", async ({ page, traffic }) => {
               for (const { route, title } of NEIGHBOURS) {
                  await page.goto(PROBLEM);
                  await page.getByRole("region", { name: "Related content" }).getByRole("link", { name: title }).click();
                  await expect(page).toHaveURL(`${baseURL}${route}`);
                  await page.waitForLoadState("networkidle");
                  const received = await traffic.responses();
                  const fetched = received.filter((r) => r.kind === "rsc" && new URL(r.url).pathname === route);
                  expect(fetched.length, `${route}: client navigation fetched no RSC`).toBeGreaterThan(0);
                  for (const canary of PROTECTED_CANARIES) {
                     expect(await exposures(page, received, canary), `${route} as ${identity}: ${canary}`).toEqual([]);
                  }
               }
            });
         });
      }
   });
}

test.describe("positive control: an entitled reader of the production deployment", () => {
   test.use({ identity: "entitled" });

   test("receives each canary exactly where the fixture places it, in HTML, inlined RSC and fetched RSC", async ({ page }) => {
      const reached = new Set<string>();
      for (const { route, expected } of ROUTES) {
         const html = await (await page.request.get(route)).text();
         const found = scanResponse("html", route, html);
         const via = (channel: string) => sorted(found.filter((f) => f.channel === channel).map((f) => f.canary));
         expect(via("raw"), `${route}: HTML`).toEqual(sorted(expected));
         expect(via("inlined-rsc"), `${route}: inlined RSC`).toEqual(sorted(expected));

         const flight = await (await page.request.get(route, { headers: { RSC: "1" } })).text();
         expect(sorted(scanResponse("rsc", route, flight).map((f) => f.canary)), `${route}: fetched RSC`).toEqual(sorted(expected));
         if (expected.length > 0) expect(format(found), `${route}: the unauthorized check must fail on this`).not.toEqual([]);
         expected.forEach((canary) => reached.add(canary));
      }
      expect(sorted([...reached]), "every protected canary is reachable by someone").toEqual(sorted(PROTECTED_CANARIES));
   });

   test("renders the T24 canaries only inside the premium content the fixture places them in", async ({ page }) => {
      for (const { route, expected } of ROUTES.filter((r) => r.route.includes("t24-"))) {
         await page.goto(route);
         for (const canary of expected) await expect(page.getByRole("main").getByText(canary)).toHaveCount(1);
      }
   });
});
