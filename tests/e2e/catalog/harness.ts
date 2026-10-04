import { test as base, expect, type Page, type Request, type Response, type Route } from "@playwright/test";
import { CATALOG_CANARY } from "../../leak/canaries";
import { inlinedRsc } from "../../leak/scanner";
import fixture from "./fixture.json";

export const FAKE_API_PORT = 3101;
export const FAKE_AUTH_PORT = 3102;
/** Server-only (`API_URL`): the browser must never call or see it. */
export const FAKE_API_ORIGIN = `http://127.0.0.1:${FAKE_API_PORT}`;
/** Public (`NEXT_PUBLIC_SUPABASE_URL`): the fake Supabase Auth user endpoint. */
export const FAKE_AUTH_ORIGIN = `http://127.0.0.1:${FAKE_AUTH_PORT}`;

/** The preview deployment: a second build of the app, served beside production and wired to a preview API double. */
export const PREVIEW_PORT = 3103;
export const PREVIEW_API_PORT = 3104;
export const REJECTED_PORT = 3105;
export const EMPTY_PORT = 3108;
export const PREVIEW_ORIGIN = `http://localhost:${PREVIEW_PORT}`;
export const PREVIEW_API_ORIGIN = `http://127.0.0.1:${PREVIEW_API_PORT}`;
/** Same build as the preview, but holding a credential the preview API does not recognise. */
export const REJECTED_ORIGIN = `http://localhost:${REJECTED_PORT}`;
/** Same build again, holding a credential the preview API accepts for a catalog with nothing published. */
export const EMPTY_ORIGIN = `http://localhost:${EMPTY_PORT}`;
/** The default `baseURL`: the production deployment, which holds no preview credential. */
export const PRODUCTION_ORIGIN = "http://localhost:3100";
export const PREVIEW_DIST = ".next-preview";

/** Synthetic credentials only. Neither is the beta secret; each must never reach a browser. */
export const PREVIEW_TOKEN = "e2e-synthetic-preview-token-0123456789abcdef";
export const REJECTED_TOKEN = "e2e-synthetic-rejected-token-fedcba9876543210";
export const EMPTY_TOKEN = "e2e-synthetic-empty-token-0f1e2d3c4b5a69788796";
const PREVIEW_TOKENS = [PREVIEW_TOKEN, REJECTED_TOKEN, EMPTY_TOKEN];
const SERVER_ONLY_ORIGINS = [FAKE_API_ORIGIN, PREVIEW_API_ORIGIN];

/** Present only in premium bodies/sections of fixture.json; every canary is registered in tests/leak. */
export const CANARY = CATALOG_CANARY;

export interface FixtureSection {
   id: string;
   title: string;
   access: string;
   text: string;
}

export interface FixtureItem {
   id: string;
   type: string;
   slug: string;
   title: string;
   access: string;
   home: string;
   sections?: FixtureSection[];
   relations?: Partial<Record<string, string[]>>;
}

export interface FixtureTrack {
   id: string;
   slug: string;
   title: string;
   summary: string;
   modules: { key: string; title: string; items: string[] }[];
}

const items: FixtureItem[] = fixture.items;
const tracks: FixtureTrack[] = fixture.tracks;
export const legacyCourse = fixture.legacy.courses[0];

export function item(id: string): FixtureItem {
   const found = items.find((candidate) => candidate.id === id);
   if (!found) throw new Error(`fixture has no item ${id}`);
   return found;
}

export function track(slug: string): FixtureTrack {
   const found = tracks.find((candidate) => candidate.slug === slug);
   if (!found) throw new Error(`fixture has no track ${slug}`);
   return found;
}

/** The Tracks that place an item, in fixture order. */
export function tracksOf(id: string): FixtureTrack[] {
   return tracks.filter((candidate) => candidate.modules.some((module) => module.items.includes(id)));
}

const ROUTE_ROOT: Record<string, string> = {
   lesson: "/lessons",
   problem: "/problems",
   knowledge: "/knowledge",
   track: "/tracks",
};

/** D7's canonical URL for a typed id such as `lesson.foo`. */
export function canonical(id: string): string {
   const [type, slug] = id.split(".");
   return `${ROUTE_ROOT[type]}/${slug}`;
}

export type Identity = "signed-out" | keyof typeof fixture.identities;

/** A Supabase SSR session cookie the fake Auth server accepts; it never expires during a run. */
function sessionCookie(identity: Exclude<Identity, "signed-out">, url: string) {
   const { token, user } = fixture.identities[identity];
   const session = {
      access_token: token,
      refresh_token: "e2e-unused-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: 4102444800,
      user,
   };
   const name = `sb-${new URL(FAKE_AUTH_ORIGIN).hostname.split(".")[0]}-auth-token`;
   return { name, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url };
}

type Kind = "document" | "rsc" | "other";

export interface Received {
   url: string;
   kind: Kind;
   /** null when a document or RSC body could not be read, which counts as a failure. */
   text: string | null;
}

function kindOf(resourceType: string, contentType: string): Kind {
   if (resourceType === "document") return "document";
   return contentType.includes("text/x-component") ? "rsc" : "other";
}

/** A document or static resource, read back from the browser once loaded. */
async function read(response: Response): Promise<Received> {
   const url = response.url();
   const kind = kindOf(response.request().resourceType(), response.headers()["content-type"] ?? "");
   if (response.status() >= 300 && response.status() < 400) return { url, kind, text: "" };
   try {
      return { url, kind, text: (await response.body()).toString("utf8") };
   } catch {
      return { url, kind, text: kind === "other" ? "" : null };
   }
}

/** Fetches an app request on the browser's behalf, recording the full body; a failed fetch delivers nothing. */
async function passThrough(route: Route): Promise<Received> {
   const url = route.request().url();
   try {
      const response = await route.fetch({ maxRedirects: 0 });
      const body = await response.body();
      await route.fulfill({ response, body }).catch(() => undefined); // the page may have cancelled it
      return { url, kind: kindOf("fetch", response.headers()["content-type"] ?? ""), text: body.toString("utf8") };
   } catch {
      await route.abort().catch(() => undefined);
      return { url, kind: "other", text: "" };
   }
}

export interface Traffic {
   requests: string[];
   /** Every response the page has received so far, with its body. */
   responses(): Promise<Received[]>;
}

export const test = base.extend<{ identity: Identity; traffic: Traffic }>({
   identity: ["signed-out", { option: true }],
   context: async ({ context, identity, baseURL }, provide) => {
      if (identity !== "signed-out") await context.addCookies([sessionCookie(identity, baseURL!)]);
      await provide(context);
   },
   traffic: [
      async ({ page, baseURL }, provide) => {
         const origin = new URL(baseURL!).origin;
         const isAppFetch = (request: Request) => request.resourceType() === "fetch" && request.url().startsWith(origin);
         const requests: string[] = [];
         const requestHeaders: [string, string][] = [];
         const reads: Promise<Received>[] = [];
         const consoleErrors: string[] = [];

         // Next cancels RSC prefetch streams once it has what it needs, and the browser then drops the body.
         // App fetches (RSC) therefore pass through here, recording the full body the server sent.
         await page.route("**/*", async (route) => {
            if (!isAppFetch(route.request())) return route.continue();
            const passed = passThrough(route);
            reads.push(passed);
            await passed;
         });
         page.on("request", (request) => {
            requests.push(request.url());
            requestHeaders.push(...Object.entries(request.headers()));
         });
         page.on("response", (response) => void (isAppFetch(response.request()) || reads.push(read(response))));
         page.on("console", (message) => void (message.type() === "error" && consoleErrors.push(message.text())));
         page.on("pageerror", (error) => void consoleErrors.push(error.message));

         const traffic = { requests, responses: () => Promise.all(reads) };
         await provide(traffic);

         const received = await traffic.responses();
         const apiCalls = requests.filter((url) => SERVER_ONLY_ORIGINS.some((origin) => url.startsWith(origin)));
         expect(apiCalls, "the browser called the server-only content API").toEqual([]);
         const apiMentions = received.filter((r) => SERVER_ONLY_ORIGINS.some((origin) => r.text?.includes(origin)));
         expect(apiMentions.map((r) => r.url), "a response revealed the server-only API_URL").toEqual([]);

         const isToken = (text: string | null) => PREVIEW_TOKENS.some((token) => text?.includes(token));
         expect(requests.filter(isToken), "a preview token reached a URL the browser requested").toEqual([]);
         const headers = requestHeaders.filter(([name, value]) => name === "x-preview-token" || isToken(value));
         expect(headers.map(([name]) => name), "the browser sent a preview credential").toEqual([]);
         expect(received.filter((r) => isToken(r.text)).map((r) => r.url), "a response revealed a preview token").toEqual([]);
         expect(consoleErrors, "browser console errors").toEqual([]);
      },
      { auto: true },
   ],
});

export { expect };

export { inlinedRsc };

export type Channel = "HTML" | "RSC" | "DOM" | "network";

export interface Exposure {
   channel: Channel;
   url: string;
}

/** Every channel through which `needle` reached the browser. DOM excludes scripts, so it is what is rendered. */
export async function exposures(page: Page, received: Received[], needle: string): Promise<Exposure[]> {
   const found: Exposure[] = [];
   for (const { url, kind, text } of received) {
      const channel: Channel = kind === "document" ? "HTML" : kind === "rsc" ? "RSC" : "network";
      if (text === null) found.push({ channel, url: `${url} (body unreadable)` });
      else if (text.includes(needle)) found.push({ channel, url });
      if (kind === "document" && text !== null && inlinedRsc(text).includes(needle)) {
         found.push({ channel: "RSC", url: `${url} (inlined in HTML)` });
      }
   }
   const dom = await page.evaluate(() => {
      const root = document.documentElement.cloneNode(true) as HTMLElement;
      root.querySelectorAll("script").forEach((script) => script.remove());
      return root.outerHTML;
   });
   if (dom.includes(needle)) found.push({ channel: "DOM", url: page.url() });
   return found;
}

/**
 * The premium canary is absent from every HTML document, RSC response (fetched or inlined), rendered DOM and
 * other response this page received, and `route` itself was inspected so the check cannot pass vacuously.
 */
export async function expectNoCanary(page: Page, traffic: Traffic, route: string, identity: Identity) {
   const received = await traffic.responses();
   const inspected = received.filter((r) => r.kind !== "other" && new URL(r.url).pathname === route);
   expect(inspected.length, `${route} as ${identity}: no HTML or RSC response was captured`).toBeGreaterThan(0);
   for (const document of inspected.filter((r) => r.kind === "document")) {
      expect(inlinedRsc(document.text ?? ""), `${route} as ${identity}: no inlined RSC payload decoded`).not.toBe("");
   }
   const leaks = await exposures(page, received, CANARY);
   expect(leaks, `${route} as ${identity}: premium canary reached the browser`).toEqual([]);
}
