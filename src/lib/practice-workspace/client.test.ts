import { afterEach, describe, expect, it, vi } from "vitest";
import { availabilityOf } from "./availability";
import { createPracticeClient, newIdempotencyKey, pathOf, PRACTICE_TIMEOUT_MS, type PracticeClient } from "./client";
import { IDEMPOTENCY_KEY_PATTERN, ROUTE, type RouteId } from "./contract";
import { createFakePracticeApi, failure } from "./fakeApi";
import type { ArchGraph } from "./types";

const BASE = "https://api.example.test";

function setup(options: Parameters<typeof createFakePracticeApi>[0] & { user?: string | null; timeoutMs?: number } = {}) {
   const api = createFakePracticeApi(options);
   const token = options.user === null ? null : api.signIn(options.user ?? "ada");
   const client = createPracticeClient({ baseUrl: `${BASE}/`, getAccessToken: async () => token, fetch: api.fetch, timeoutMs: options.timeoutMs });
   return { api, client };
}

const KEY = newIdempotencyKey();
const ID = "3f2c9d5e-0000-4000-8000-000000000001";
const GRAPH: ArchGraph = { schema: "in.arch-graph/1", nodes: [], edges: [], boundaries: [] };

/** One call per frozen route, in the manifest's order, each with a valid request. */
const CALLS: Record<RouteId, (client: PracticeClient) => Promise<unknown>> = {
   capability: (c) => c.capability("a-problem"),
   create_attempt: (c) => c.createAttempt({ content_id: "a-problem", mode: "self", target_seniority: "senior" }, KEY),
   list_attempts: (c) => c.listAttempts({ contentId: "a-problem", status: "active", limit: 5, cursor: "abc" }),
   get_attempt: (c) => c.getAttempt(ID),
   patch_stage: (c) => c.patchStage(ID, "frame", { version: 1 }),
   get_diagram: (c) => c.getDiagram(ID),
   put_diagram: (c) => c.putDiagram(ID, { version: 1, graph: GRAPH }),
   stage_hint: (c) => c.stageHint(ID, "frame"),
   reveal_clarification: (c) => c.revealClarification(ID, "c1"),
   add_assumption: (c) => c.addAssumption(ID, { position: "frame", text: "x" }),
   stage_turn: (c) => c.stageTurn(ID, "frame", { text: "x" }, KEY),
   submit_attempt: (c) => c.submitAttempt(ID, { diagram_version: 1, stage_versions: { frame: 1 } }, KEY),
   reveal_attempt: (c) => c.revealAttempt(ID, { confirm: true }),
   abandon_attempt: (c) => c.abandonAttempt(ID),
   get_reference: (c) => c.getReference(ID),
   put_self_review: (c) => c.putSelfReview(ID, "d1", { version: 1, mark: "met" }),
   delete_attempt: (c) => c.deleteAttempt(ID),
   export_attempt: (c) => c.exportAttempt(ID),
   get_preference: (c) => c.getPreference(),
   put_preference: (c) => c.putPreference({ default_seniority: null, version: null }),
   export_all: (c) => c.exportAll(),
   delete_all: (c) => c.deleteAll(),
   get_consent: (c) => c.getConsent(),
   post_consent: (c) => c.postConsent({ document_id: "practice-data", document_version: "v1" }),
   withdraw_consent: (c) => c.withdrawConsent({ document_id: "practice-ai" }),
};

afterEach(() => vi.restoreAllMocks());

describe("every frozen route has one typed method that sends exactly that route", () => {
   it.each(Object.keys(CALLS) as RouteId[])("%s", async (id) => {
      const { api, client } = setup();
      const result = (await CALLS[id](client)) as { status: string };
      const [request] = api.requests;
      expect(api.requests).toHaveLength(1);
      expect(request.route).toBe(id);
      expect(request.method).toBe(ROUTE[id].method);
      expect(request.path.startsWith("/me/practice")).toBe(true);
      expect(request.headers["Idempotency-Key"] !== undefined).toBe(ROUTE[id].idempotencyKey);
      expect(request.headers.Accept).toBe(ROUTE[id].mediaType);
      // Nothing but the capability is implemented: a shell answers not_found, never a success.
      expect(result.status).toBe(id === "capability" ? "ok" : "notFound");
   });
});

describe("what a request carries", () => {
   it("is the bearer token, no cookies and no cache, and a body only when there is one", async () => {
      const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ detail: "x", code: "not_found" }), { status: 404 }));
      const client = createPracticeClient({ baseUrl: BASE, getAccessToken: async () => "tok", fetch: fetchSpy as unknown as typeof fetch });
      await client.getAttempt(ID);
      await client.addAssumption(ID, { position: "frame", text: "x" });
      const [get, post] = fetchSpy.mock.calls as unknown as [string, RequestInit][][] as unknown as [[string, RequestInit], [string, RequestInit]];
      expect(get[0]).toBe(`${BASE}/me/practice/attempts/${ID}`);
      expect(get[1]).toMatchObject({ method: "GET", cache: "no-store", credentials: "omit" });
      expect(get[1].headers).toEqual({ Authorization: "Bearer tok", Accept: "application/json" });
      expect(get[1].body).toBeUndefined();
      expect(post[1].headers).toMatchObject({ "Content-Type": "application/json" });
      expect(post[1].body).toBe(JSON.stringify({ position: "frame", text: "x" }));
   });

   it("sends nothing without a token", async () => {
      const { api, client } = setup({ user: null });
      expect(await client.capability()).toEqual({ status: "unauthenticated" });
      expect(api.requests).toHaveLength(0);
   });

   it("encodes path parameters and drops empty query values", () => {
      expect(pathOf(ROUTE.get_attempt, { attempt_id: "a/b?c" })).toBe("/me/practice/attempts/a%2Fb%3Fc");
      expect(pathOf(ROUTE.delete_all)).toBe("/me/practice");
      expect(() => pathOf(ROUTE.get_attempt)).toThrow("missing path parameter");
   });

   it("makes idempotency keys the backend accepts", () => {
      expect(newIdempotencyKey()).toMatch(IDEMPOTENCY_KEY_PATTERN);
      expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
   });

   it("stores nothing: no storage, no cookie, no URL change", async () => {
      const { client } = setup();
      const before = window.location.href;
      for (const call of Object.values(CALLS)) await call(client);
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
      expect(document.cookie).toBe("");
      expect(window.location.href).toBe(before);
   });
});

describe("what the backend answers", () => {
   it("capability: ok, with the plan the backend resolved", async () => {
      const { client, api } = setup({ plan: "premium" });
      const result = await client.capability();
      expect(result).toMatchObject({ status: "ok", data: { practice_available: false, plan: "premium", ai_available: false } });
      expect(api.requests[0].query).toEqual({});
   });

   it("a disabled flag and a caller outside the rollout are both `disabled`, not a failure", async () => {
      expect(await setup({ enabled: false }).client.capability()).toEqual({ status: "disabled" });
      expect(await setup({ admitted: false }).client.capability()).toEqual({ status: "disabled" });
   });

   it("a signed-out answer is `unauthenticated`", async () => {
      const api = createFakePracticeApi();
      const client = createPracticeClient({ baseUrl: BASE, getAccessToken: async () => "not-a-fake-token", fetch: api.fetch });
      expect(await client.capability()).toEqual({ status: "unauthenticated" });
   });

   it("reads the members a screen may use and never the detail", async () => {
      const { api, client } = setup();
      api.script("patch_stage", failure("version_conflict", 409, { current_version: 7 }));
      expect(await client.patchStage(ID, "frame", { version: 1 })).toEqual({ status: "failed", httpStatus: 409, code: "version_conflict", currentVersion: 7 });
      api.script("create_attempt", failure("request_in_progress", 409, { retry_after_seconds: 3 }));
      expect(await client.createAttempt({ content_id: "a", mode: "self", target_seniority: "mid" }, KEY)).toMatchObject({ code: "request_in_progress", retryAfterSeconds: 3 });
      api.script("put_diagram", { status: 422, body: { detail: "x", code: "validation_error", fields: [{ field: "version", reason: "required" }, { nope: 1 }] } });
      expect(await client.putDiagram(ID, { version: 1, graph: GRAPH })).toMatchObject({ code: "validation_error", fields: [{ field: "version", reason: "required" }] });
   });

   it("reads a stale consent version with the document and the version it now requires", async () => {
      const { api, client } = setup();
      api.script("post_consent", failure("consent_version_stale", 409, { document_id: "practice-ai", required_version: "2" }));
      expect(await client.postConsent({ document_id: "practice-ai", document_version: "1" })).toEqual({
         status: "failed",
         httpStatus: 409,
         code: "consent_version_stale",
         documentId: "practice-ai",
         requiredVersion: "2",
      });
   });

   it("sends the reveal confirmation in the body and abandon with none", async () => {
      const { api, client } = setup();
      await client.revealAttempt(ID, { confirm: true });
      await client.abandonAttempt(ID);
      expect(api.requests[0].body).toEqual({ confirm: true });
      expect(api.requests[1]).toMatchObject({ route: "abandon_attempt", method: "POST", body: undefined });
   });

   it("an unregistered code is a failure with no code, and a non-envelope body is unusable", async () => {
      const { api, client } = setup();
      api.script("get_attempt", { status: 409, body: { detail: "x", code: "made_up" } });
      expect(await client.getAttempt(ID)).toEqual({ status: "failed", httpStatus: 409, code: null });
      api.script("get_attempt", { status: 502, body: "<html>" });
      expect(await client.getAttempt(ID)).toEqual({ status: "unavailable", cause: "upstream" });
      api.script("get_attempt", { status: 200, body: "plain" });
      expect(await client.getAttempt(ID)).toEqual({ status: "unavailable", cause: "malformed" });
   });

   it("a transport error, an abort and a slow server are `unavailable`", async () => {
      const { api, client } = setup();
      api.failNext("network");
      expect(await client.capability()).toEqual({ status: "unavailable", cause: "transport" });
      api.failNext(503);
      expect(await client.capability()).toEqual({ status: "failed", httpStatus: 503, code: "internal_error" });

      const slow = createPracticeClient({
         baseUrl: BASE,
         getAccessToken: async () => "tok",
         timeoutMs: 10,
         fetch: ((_: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof fetch,
      });
      expect(await slow.capability()).toEqual({ status: "unavailable", cause: "timeout" });
      expect(PRACTICE_TIMEOUT_MS).toBe(60_000);
   });

   it("an exported attempt is text, a delete has no body", async () => {
      const { api, client } = setup();
      api.script("export_attempt", { status: 200, body: { type: "header" } });
      api.script("delete_attempt", { status: 204 });
      const exported = await client.exportAttempt(ID);
      expect(exported.status === "ok" && typeof exported.data === "string" && exported.data.includes("header")).toBe(true);
      expect(await client.deleteAttempt(ID)).toEqual({ status: "ok", data: undefined });
   });
});

describe("availability is the backend's answer alone", () => {
   it("is available only on a 200 that says practice_available", async () => {
      const { api, client } = setup();
      expect(availabilityOf(await client.capability())).toEqual({ state: "unavailable", reason: "not_ready" });
      api.setCapability({ practice_available: true });
      expect(availabilityOf(await client.capability())).toMatchObject({ state: "available" });
   });

   it("is unavailable for every other answer", async () => {
      expect(availabilityOf({ status: "disabled" })).toEqual({ state: "unavailable", reason: "disabled" });
      expect(availabilityOf({ status: "notFound" })).toEqual({ state: "unavailable", reason: "disabled" });
      expect(availabilityOf({ status: "unauthenticated" })).toEqual({ state: "signed_out" });
      for (const result of [{ status: "failed", httpStatus: 500, code: null }, { status: "unavailable", cause: "transport" }] as const) {
         expect(availabilityOf(result)).toEqual({ state: "unavailable", reason: "error" });
      }
   });
});
