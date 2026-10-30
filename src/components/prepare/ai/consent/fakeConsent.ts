import { PRIVACY_DOCUMENT_ID, PRIVACY_VERSION } from "@/lib/privacy";
import type { ConsentStatus } from "./consentClient";

type Entry = { version: string; accepted_at: string; withdrawn_at: string | null };

/**
 * An in-memory stand-in for the consent endpoints of api-contract.md §9.3, for tests only (the real API is verified in P7-T39).
 * Records are kept per bearer token, so two browser contexts holding the same token are the same user. Time is a counter, so
 * "withdrawn after accepted" is exact. It is not a model of the AI guards: tests mock the Draft and Review routes themselves.
 */
export function createFakeConsentApi(options: { version?: string | null; aiAvailable?: boolean; refineAvailable?: boolean } = {}) {
   const records = new Map<string, Entry[]>();
   let tick = 0;
   const now = () => new Date(Date.UTC(2026, 9, 30, 0, 0, ++tick)).toISOString();
   const api = {
      /** The version the server requires; null models `AI_TERMS_VERSION` unset. Change it to model a new terms version. */
      version: options.version === undefined ? PRIVACY_VERSION : options.version,
      aiAvailable: options.aiAvailable ?? true,
      /** Models the server's Refine checks (P7-D-059): independent of consent, and false whenever AI itself is unavailable. */
      refineAvailable: options.refineAvailable ?? false,
      /** Fields to put over every status the fake sends; an `undefined` value removes the field. Models an older or malformed server answer. */
      override: {} as Record<string, unknown>,
      /** Every consent call the browser made, in order. */
      requests: [] as { method: string; path: string; body: unknown }[],
      /** Make the next call of this kind fail with a 503. */
      failNext: null as null | "GET" | "accept" | "withdraw",
      status(token: string): ConsentStatus {
         const current = (records.get(token) ?? []).find((record) => record.version === api.version);
         const inForce = Boolean(current && api.version !== null && (current.withdrawn_at === null || current.withdrawn_at < current.accepted_at));
         const sent: Record<string, unknown> = {
            document_id: PRIVACY_DOCUMENT_ID,
            required_version: api.version,
            accepted: inForce,
            accepted_at: api.version !== null && current ? current.accepted_at : null,
            withdrawn_at: api.version !== null && current ? current.withdrawn_at : null,
            ai_available: api.aiAvailable && api.version !== null,
            refine_available: api.refineAvailable && api.aiAvailable && api.version !== null,
            ...api.override,
         };
         for (const key of Object.keys(sent)) if (sent[key] === undefined) delete sent[key];
         return sent as ConsentStatus;
      },
      /** Puts the user in a state of having accepted the current version, without a request: setup for tests that are not about consent. */
      grant(token: string) {
         if (api.version === null) return;
         records.set(token, [...(records.get(token) ?? []), { version: api.version, accepted_at: now(), withdrawn_at: null }]);
      },
      /** Answers a consent URL, or returns null when it is not one so the caller can route it elsewhere. */
      handle(url: string, init: RequestInit | undefined): Response | null {
         const at = url.indexOf("/me/prep/ai/consent");
         if (at < 0) return null;
         const path = url.slice(at + "/me/prep/ai/consent".length);
         const method = init?.method ?? "GET";
         const body = init?.body ? JSON.parse(String(init.body)) : undefined;
         api.requests.push({ method, path, body });
         const header = new Headers(init?.headers).get("Authorization");
         const token = header?.replace(/^Bearer /, "");
         const reply = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
         if (!token) return reply(401, { code: "unauthenticated" });
         const kind = method === "GET" ? "GET" : path === "/withdraw" ? "withdraw" : "accept";
         if (api.failNext === kind) {
            api.failNext = null;
            return reply(503, { code: "ai_unavailable" });
         }
         const list = records.get(token) ?? [];
         if (kind === "accept") {
            if (!api.aiAvailable || api.version === null) return reply(403, { code: "ai_disabled" });
            if (body?.version !== api.version) return reply(409, { code: "consent_version_stale", required_version: api.version });
            const existing = list.find((record) => record.version === api.version);
            if (!existing) list.push({ version: api.version, accepted_at: now(), withdrawn_at: null });
            else if (!(existing.withdrawn_at === null || existing.withdrawn_at < existing.accepted_at)) existing.accepted_at = now();
            records.set(token, list);
         }
         if (kind === "withdraw") {
            for (const record of list) if (record.withdrawn_at === null || record.withdrawn_at < record.accepted_at) record.withdrawn_at = now();
         }
         return reply(200, api.status(token));
      },
   };
   return api;
}
