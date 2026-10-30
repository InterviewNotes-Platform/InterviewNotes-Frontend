import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_TIMEOUT_MS, createAiClient, type DraftRequest, type RefineRequest, type ReviewRequest } from "./aiClient";

const DRAFT: DraftRequest = { question: "Q?", guidance: null, framework: "star", notes: "I fixed the build.", stories: [] };
const REVIEW: ReviewRequest = { question: "Q?", guidance: null, framework: "free_form", answer: { body: "text", fields: {} }, stories: [] };
const REFINE: RefineRequest = { question: "Q?", guidance: null, framework: "star", answer: { body: null, fields: { situation: "S0" } }, stories: [] };
const REFINE_BODY = { action: "refine", result: { framework: "star", fields: { situation: "S" }, body: null, questions_to_ask_yourself: ["Why?"] } };
const DRAFT_BODY = { action: "draft", result: { framework: "star", fields: { situation: "S" }, body: null, questions_to_ask_yourself: ["Why?"] } };
const REVIEW_BODY = { action: "review", result: { missing: ["a"], weak: [], claims_to_verify: [], questions_to_ask_yourself: [] } };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function client(fetch: typeof globalThis.fetch, token: string | null = "tok", timeoutMs?: number) {
   return createAiClient({ baseUrl: "https://api.example.test/", getAccessToken: async () => token, fetch, timeoutMs });
}

afterEach(() => vi.useRealTimers());

describe("createAiClient", () => {
   it("posts a draft to /me/prep/ai/draft with the bearer token and the body only", async () => {
      const fetch = vi.fn(async () => json(200, DRAFT_BODY));
      const result = await client(fetch).draft(DRAFT);
      expect(result).toEqual({ status: "ok", data: DRAFT_BODY.result });
      const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.example.test/me/prep/ai/draft");
      expect(init).toMatchObject({ method: "POST", cache: "no-store", credentials: "omit" });
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      expect(JSON.parse(init.body as string)).toEqual(DRAFT);
   });

   it("posts a review to /me/prep/ai/review", async () => {
      const fetch = vi.fn(async () => json(200, REVIEW_BODY));
      expect(await client(fetch).review(REVIEW)).toEqual({ status: "ok", data: REVIEW_BODY.result });
      expect((fetch.mock.calls[0] as unknown[])[0]).toBe("https://api.example.test/me/prep/ai/review");
   });

   it("posts a refine to /me/prep/ai/refine with the Review request shape and the bearer token only", async () => {
      const fetch = vi.fn(async () => json(200, REFINE_BODY));
      expect(await client(fetch).refine(REFINE)).toEqual({ status: "ok", data: REFINE_BODY.result });
      const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.example.test/me/prep/ai/refine");
      expect(init).toMatchObject({ method: "POST", cache: "no-store", credentials: "omit" });
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      expect(JSON.parse(init.body as string)).toEqual(REFINE);
   });

   it.each([
      ["a different action", { ...REFINE_BODY, action: "draft" }],
      ["a framework other than the one asked for", { ...REFINE_BODY, result: { ...REFINE_BODY.result, framework: "free_form", fields: {}, body: "x" } }],
      ["text in a section the answer left empty", { ...REFINE_BODY, result: { ...REFINE_BODY.result, fields: { result: "invented" } } }],
      ["a body on a STAR answer", { ...REFINE_BODY, result: { ...REFINE_BODY.result, body: "x" } }],
      ["fields on a free-form answer", { ...REFINE_BODY, result: { framework: "free_form", fields: { situation: "x" }, body: "x", questions_to_ask_yourself: [] } }],
   ])("treats %s in a refine reply as malformed", async (_name, body) => {
      const request = _name.startsWith("fields on") ? { ...REFINE, framework: "free_form" as const } : REFINE;
      expect(await client(async () => json(200, body)).refine(request)).toEqual({ status: "failed", code: null, cause: "malformed" });
   });

   it("keeps the envelope code of a refused refine, and sends it once", async () => {
      const fetch = vi.fn(async () => json(403, { code: "ai_not_entitled", detail: "x" }));
      expect(await client(fetch).refine(REFINE)).toEqual({ status: "failed", code: "ai_not_entitled", cause: "upstream" });
      expect(fetch).toHaveBeenCalledTimes(1);
   });

   it("sends nothing without a token", async () => {
      const fetch = vi.fn();
      expect(await client(fetch as never, null).draft(DRAFT)).toEqual({ status: "unauthenticated" });
      expect(fetch).not.toHaveBeenCalled();
   });

   it("maps a 401 to unauthenticated", async () => {
      expect(await client(async () => json(401, { code: "unauthenticated" })).draft(DRAFT)).toEqual({ status: "unauthenticated" });
   });

   it.each([
      [429, "ai_quota_exhausted"],
      [503, "ai_unavailable"],
      [403, "ai_consent_required"],
   ])("keeps the envelope code of a %s as data and nothing else", async (status, code) => {
      expect(await client(async () => json(status, { detail: "secret provider text", code })).draft(DRAFT)).toEqual({ status: "failed", code, cause: "upstream" });
   });

   it("fails with no code when an error body is unreadable", async () => {
      expect(await client(async () => new Response("<html>", { status: 502 })).review(REVIEW)).toEqual({ status: "failed", code: null, cause: "upstream" });
   });

   it("reports a network failure as transport", async () => {
      const result = await client(async () => Promise.reject(new TypeError("fetch failed"))).draft(DRAFT);
      expect(result).toEqual({ status: "failed", code: null, cause: "transport" });
   });

   it("keeps the quota window, reset time and busy wait from the error envelope, and drops malformed ones", async () => {
      const quota = { detail: "x", code: "ai_quota_exhausted", window: "day", resets_at: "2026-10-31T00:00:00Z" };
      expect(await client(async () => json(429, quota)).draft(DRAFT)).toEqual({ status: "failed", code: "ai_quota_exhausted", cause: "upstream", info: { window: "day", resetsAt: "2026-10-31T00:00:00Z" } });
      const busy = { detail: "x", code: "ai_busy", retry_after_seconds: 12 };
      expect(await client(async () => json(429, busy)).draft(DRAFT)).toEqual({ status: "failed", code: "ai_busy", cause: "upstream", info: { retryAfterSeconds: 12 } });
      const junk = { detail: "x", code: "ai_busy", window: "week", resets_at: "soon", retry_after_seconds: 0 };
      expect(await client(async () => json(429, junk)).draft(DRAFT)).toEqual({ status: "failed", code: "ai_busy", cause: "upstream" });
   });

   it("reports no answer in time as a timeout, at 120 s by default", async () => {
      expect(AI_TIMEOUT_MS).toBe(120_000);
      vi.useFakeTimers();
      const never: typeof fetch = (_url, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      const pending = client(never, "tok", 50).draft(DRAFT);
      await vi.advanceTimersByTimeAsync(50);
      expect(await pending).toEqual({ status: "failed", code: null, cause: "timeout" });
   });

   it.each([
      ["a different action", { action: "review", result: DRAFT_BODY.result }],
      ["a missing result", { action: "draft" }],
      ["a field that is not a STAR key", { action: "draft", result: { ...DRAFT_BODY.result, fields: { mood: "x" } } }],
      ["a non-string question", { action: "draft", result: { ...DRAFT_BODY.result, questions_to_ask_yourself: [1] } }],
      ["a framework the contract does not know", { action: "draft", result: { ...DRAFT_BODY.result, framework: "bullets" } }],
      ["a framework other than the one requested", { action: "draft", result: { ...DRAFT_BODY.result, framework: "free_form", fields: {}, body: "text" } }],
      ["not an object", ["draft"]],
   ])("treats a 200 with %s as malformed", async (_name, body) => {
      expect(await client(async () => json(200, body)).draft(DRAFT)).toEqual({ status: "failed", code: null, cause: "malformed" });
   });

   it("treats an unreadable 200 body as malformed", async () => {
      expect(await client(async () => new Response("nope", { status: 200 })).review(REVIEW)).toEqual({ status: "failed", code: null, cause: "malformed" });
   });
});
