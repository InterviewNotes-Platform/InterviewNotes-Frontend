/**
 * A typed client for the frozen M1 `/me/practice` contract (P9-T06). A shell: it sends the user's bearer token and
 * nothing else, stores nothing (no cookie, storage or URL state) and decides nothing about availability, which the
 * backend alone does. Later tasks add response guards for the routes their screens read; until then a body is trusted
 * only as far as `pending` checks (a JSON object or array), and every route's body is a model of the frozen manifest.
 */

import {
   IDEMPOTENCY_KEY_PATTERN,
   PRACTICE_PREFIX,
   ROUTE,
   isPracticeErrorCode,
   type PracticeErrorCode,
   type RouteDef,
   type RouteId,
} from "./contract";
import type {
   AssumptionIn,
   AssumptionOut,
   AttemptDetailOut,
   AttemptListPage,
   AttemptOut,
   CapabilityOut,
   ClarificationRevealOut,
   ConsentIn,
   ConsentOut,
   ConsentStatusOut,
   ConsentWithdrawIn,
   ConsentWithdrawOut,
   CreateAttemptIn,
   DiagramOut,
   DiagramPutIn,
   HintOut,
   PreferenceIn,
   PreferenceOut,
   ReferenceOut,
   RevealIn,
   SelfReviewIn,
   SelfReviewOut,
   StagePatchIn,
   StageWorkOut,
   SubmitIn,
   SubmitOut,
   TurnIn,
   TurnOut,
   AttemptStatus,
} from "./types";

/** Browser-to-API timeout; a starting value, not a measurement (the prep client's). */
export const PRACTICE_TIMEOUT_MS = 60_000;

export type PracticeClientConfig = {
   /** The API origin as the browser reaches it. The caller supplies it; this module reads no environment. */
   baseUrl: string;
   /** The signed-in user's Supabase access token, or null when signed out. Called per request, never stored. */
   getAccessToken: () => Promise<string | null>;
   fetch?: typeof fetch;
   timeoutMs?: number;
};

/** What an error envelope `{detail, code, ...members}` carries that a screen may use. `detail` is never read. */
export type PracticeFailure = {
   status: "failed";
   httpStatus: number;
   /** The registered code, or null for a code this contract does not register. */
   code: PracticeErrorCode | null;
   currentVersion?: number;
   /** `consent_version_stale` and `ai_consent_required`: which document, and the version it now requires. */
   documentId?: string;
   requiredVersion?: string;
   retryAfterSeconds?: number;
   fields?: { field: string; reason: string }[];
};

/**
 * `ok`; signed out (401, or no token so nothing was sent); `disabled` (403 `practice_disabled`: the flag is off or the
 * caller is outside the rollout); `notFound` (404 `not_found`, which is also what an unimplemented route answers);
 * any other registered or unregistered refusal; or the service could not be used.
 */
export type PracticeResult<T> =
   | { status: "ok"; data: T }
   | { status: "unauthenticated" }
   | { status: "disabled" }
   | { status: "notFound" }
   | PracticeFailure
   | { status: "unavailable"; cause: "transport" | "timeout" | "upstream" | "malformed" };

type Reader<T> = (response: Response) => Promise<{ value: T } | null>;

function isObjectOrArray(body: unknown): boolean {
   return typeof body === "object" && body !== null;
}

/** A JSON object or array, nothing more; the owning task replaces it with a guard when a screen reads the route. */
function pending<T>(): Reader<T> {
   return async (response) => {
      try {
         const body: unknown = await response.json();
         return isObjectOrArray(body) ? { value: body as T } : null;
      } catch {
         return null;
      }
   };
}

export function isCapability(body: unknown): body is CapabilityOut {
   if (typeof body !== "object" || body === null) return false;
   const value = body as Record<string, unknown>;
   const consent = value.consent as Record<string, unknown> | null | undefined;
   return (
      typeof value.practice_available === "boolean" &&
      typeof value.practice_ready === "boolean" &&
      typeof value.ai_available === "boolean" &&
      typeof value.voice_available === "boolean" &&
      (value.plan === "free" || value.plan === "premium" || value.plan === "unknown") &&
      typeof consent === "object" &&
      consent !== null &&
      typeof consent.practice_data === "string" &&
      typeof consent.practice_ai === "string"
   );
}

const capabilityReader: Reader<CapabilityOut> = async (response) => {
   try {
      const body: unknown = await response.json();
      return isCapability(body) ? { value: body } : null;
   } catch {
      return null;
   }
};

const textReader: Reader<string> = async (response) => {
   try {
      return { value: await response.text() };
   } catch {
      return null;
   }
};

const noBody: Reader<void> = async () => ({ value: undefined });

function search(params: Record<string, string | number | undefined>): string {
   const query = new URLSearchParams();
   for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") query.append(name, String(value));
   }
   const text = query.toString();
   return text ? `?${text}` : "";
}

/** The path of a route with its parameters filled and encoded; a missing parameter is a programming error. */
export function pathOf(route: RouteDef, params: Record<string, string> = {}): string {
   return (
      PRACTICE_PREFIX +
      route.path.replace(/\{(\w+)\}/g, (_, name: string) => {
         const value = params[name];
         if (value === undefined) throw new Error(`missing path parameter ${name} for ${route.id}`);
         return encodeURIComponent(value);
      })
   );
}

/** A fresh `Idempotency-Key` (16 to 64 characters of `A-Za-z0-9_-`): a UUID's hyphens are allowed, so one fits. */
export function newIdempotencyKey(): string {
   const key = globalThis.crypto.randomUUID();
   if (!IDEMPOTENCY_KEY_PATTERN.test(key)) throw new Error("unusable idempotency key");
   return key;
}

type Call<T> = {
   route: RouteId;
   params?: Record<string, string>;
   query?: Record<string, string | number | undefined>;
   body?: unknown;
   key?: string;
   read: Reader<T>;
};

/** A typed client for `/me/practice`; every method is one frozen M1 route. */
export function createPracticeClient(config: PracticeClientConfig) {
   const base = config.baseUrl.replace(/\/$/, "");
   const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
   const timeoutMs = config.timeoutMs ?? PRACTICE_TIMEOUT_MS;

   async function call<T>({ route: id, params, query, body, key, read }: Call<T>): Promise<PracticeResult<T>> {
      const route = ROUTE[id];
      const token = await config.getAccessToken().catch(() => null);
      if (!token) return { status: "unauthenticated" };

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
         timedOut = true;
         controller.abort();
      }, timeoutMs);
      try {
         const response = await doFetch(`${base}${pathOf(route, params)}${search(query ?? {})}`, {
            method: route.method,
            headers: {
               Authorization: `Bearer ${token}`,
               Accept: route.mediaType,
               ...(body === undefined ? {} : { "Content-Type": "application/json" }),
               ...(key === undefined ? {} : { "Idempotency-Key": key }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            cache: "no-store",
            credentials: "omit",
            signal: controller.signal,
         });
         return await interpret(response, read);
      } catch {
         return { status: "unavailable", cause: timedOut ? "timeout" : "transport" };
      } finally {
         clearTimeout(timer);
      }
   }

   async function interpret<T>(response: Response, read: Reader<T>): Promise<PracticeResult<T>> {
      if (response.ok) {
         const read_ = await read(response);
         return read_ ? { status: "ok", data: read_.value } : { status: "unavailable", cause: "malformed" };
      }
      if (response.status === 401) return { status: "unauthenticated" };
      const envelope = await readEnvelope(response);
      if (!envelope) return { status: "unavailable", cause: response.status >= 500 ? "upstream" : "malformed" };
      if (envelope.code === "practice_disabled" && response.status === 403) return { status: "disabled" };
      if (envelope.code === "not_found" && response.status === 404) return { status: "notFound" };
      return { ...envelope.failure, httpStatus: response.status };
   }

   const attempt = (attemptId: string, extra: Record<string, string> = {}) => ({ attempt_id: attemptId, ...extra });

   return {
      capability: (contentId?: string) => call({ route: "capability", query: { content_id: contentId }, read: capabilityReader }),

      createAttempt: (body: CreateAttemptIn, key: string) => call<AttemptOut>({ route: "create_attempt", body, key, read: pending() }),
      listAttempts: (params: { contentId?: string; status?: AttemptStatus; limit?: number; cursor?: string } = {}) =>
         call<AttemptListPage>({ route: "list_attempts", query: { content_id: params.contentId, status: params.status, limit: params.limit, cursor: params.cursor }, read: pending() }),
      getAttempt: (id: string) => call<AttemptDetailOut>({ route: "get_attempt", params: attempt(id), read: pending() }),
      patchStage: (id: string, position: string, body: StagePatchIn) =>
         call<StageWorkOut>({ route: "patch_stage", params: attempt(id, { position }), body, read: pending() }),

      getDiagram: (id: string) => call<DiagramOut>({ route: "get_diagram", params: attempt(id), read: pending() }),
      putDiagram: (id: string, body: DiagramPutIn) => call<DiagramOut>({ route: "put_diagram", params: attempt(id), body, read: pending() }),

      stageHint: (id: string, position: string) => call<HintOut>({ route: "stage_hint", params: attempt(id, { position }), read: pending() }),
      revealClarification: (id: string, clarificationId: string) =>
         call<ClarificationRevealOut>({ route: "reveal_clarification", params: attempt(id, { clarification_id: clarificationId }), read: pending() }),
      addAssumption: (id: string, body: AssumptionIn) => call<AssumptionOut>({ route: "add_assumption", params: attempt(id), body, read: pending() }),
      stageTurn: (id: string, position: string, body: TurnIn, key: string) =>
         call<TurnOut>({ route: "stage_turn", params: attempt(id, { position }), body, key, read: pending() }),

      submitAttempt: (id: string, body: SubmitIn, key: string) => call<SubmitOut>({ route: "submit_attempt", params: attempt(id), body, key, read: pending() }),
      /** Ends the attempt; `body` must be `{ confirm: true }` (explicit confirmation). Returns the attempt, never the reference (that is `getReference`). */
      revealAttempt: (id: string, body: RevealIn) => call<AttemptOut>({ route: "reveal_attempt", params: attempt(id), body, read: pending() }),
      /** Active to abandoned; saved work stays. A repeat answers the same state. */
      abandonAttempt: (id: string) => call<AttemptOut>({ route: "abandon_attempt", params: attempt(id), read: pending() }),
      getReference: (id: string) => call<ReferenceOut>({ route: "get_reference", params: attempt(id), read: pending() }),
      putSelfReview: (id: string, dimensionId: string, body: SelfReviewIn) =>
         call<SelfReviewOut>({ route: "put_self_review", params: attempt(id, { dimension_id: dimensionId }), body, read: pending() }),

      deleteAttempt: (id: string) => call<void>({ route: "delete_attempt", params: attempt(id), read: noBody }),
      /** One attempt as NDJSON text (`application/x-ndjson`); streaming is the export task's. */
      exportAttempt: (id: string) => call<string>({ route: "export_attempt", params: attempt(id), read: textReader }),

      getPreference: () => call<PreferenceOut>({ route: "get_preference", read: pending() }),
      putPreference: (body: PreferenceIn) => call<PreferenceOut>({ route: "put_preference", body, read: pending() }),

      exportAll: () => call<string>({ route: "export_all", read: textReader }),
      deleteAll: () => call<void>({ route: "delete_all", read: noBody }),

      getConsent: () => call<ConsentStatusOut>({ route: "get_consent", read: pending() }),
      postConsent: (body: ConsentIn) => call<ConsentOut>({ route: "post_consent", body, read: pending() }),
      withdrawConsent: (body: ConsentWithdrawIn) => call<ConsentWithdrawOut>({ route: "withdraw_consent", body, read: pending() }),
   };
}

export type PracticeClient = ReturnType<typeof createPracticeClient>;

async function readEnvelope(response: Response): Promise<{ code: string; failure: Omit<PracticeFailure, "httpStatus"> & { httpStatus?: number } } | null> {
   let body: unknown;
   try {
      body = await response.json();
   } catch {
      return null;
   }
   if (typeof body !== "object" || body === null) return null;
   const value = body as Record<string, unknown>;
   if (typeof value.code !== "string" || typeof value.detail !== "string") return null;
   const failure: Omit<PracticeFailure, "httpStatus"> & { httpStatus?: number } = {
      status: "failed",
      code: isPracticeErrorCode(value.code) ? value.code : null,
   };
   if (typeof value.current_version === "number") failure.currentVersion = value.current_version;
   if (typeof value.document_id === "string") failure.documentId = value.document_id;
   if (typeof value.required_version === "string") failure.requiredVersion = value.required_version;
   if (typeof value.retry_after_seconds === "number") failure.retryAfterSeconds = value.retry_after_seconds;
   if (Array.isArray(value.fields)) {
      failure.fields = value.fields
         .filter((item): item is { field: string; reason: string } => typeof item === "object" && item !== null && typeof (item as { field?: unknown }).field === "string" && typeof (item as { reason?: unknown }).reason === "string")
         .map(({ field, reason }) => ({ field, reason }));
   }
   return { code: value.code, failure };
}
