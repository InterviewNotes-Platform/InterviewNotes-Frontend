import { isRecord } from "@/lib/prep/guards";
import type { PrepClientConfig } from "@/lib/prep/client";
import type { FrameworkInput, PrepFields } from "@/lib/prep/types";

/** Browser-to-API timeout for AI actions (api-contract.md §8.1, §8.2). */
export const AI_TIMEOUT_MS = 120_000;

/** A story the reader selected; the server reads no preparation table to build the prompt (contract §9.2). */
export type AiStory = { title: string; notes: string; fields: PrepFields };

export type DraftRequest = {
   question: string;
   guidance: string | null;
   framework: FrameworkInput;
   notes: string;
   stories: AiStory[];
};

export type ReviewRequest = {
   question: string;
   guidance: string | null;
   framework: FrameworkInput;
   answer: { body: string | null; fields: PrepFields };
   stories: AiStory[];
};

export type DraftResult = { framework: string; fields: PrepFields; body: string | null; questions_to_ask_yourself: string[] };
export type ReviewResult = { missing: string[]; weak: string[]; claims_to_verify: string[]; questions_to_ask_yourself: string[] };

/** The envelope's optional numbers, kept only when well formed (api-contract.md §9.5): the quota window and its reset, or the wait for a busy answer. */
export type AiErrorInfo = { window?: "day" | "month"; resetsAt?: string; retryAfterSeconds?: number };

/**
 * `failed` carries the envelope's `code` when the API sent one, so the editor can tell quota from busy from
 * unavailable; `cause` is `upstream` for any non-2xx answer and `malformed` for a 2xx body this client cannot use.
 */
export type AiResult<T> =
   | { status: "ok"; data: T }
   | { status: "unauthenticated" }
   | { status: "failed"; code: string | null; cause: "transport" | "timeout" | "upstream" | "malformed"; info?: AiErrorInfo };

const STAR = ["situation", "task", "action", "result"];

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

function isStarFields(value: unknown): value is PrepFields {
   return isRecord(value) && Object.entries(value).every(([key, text]) => STAR.includes(key) && typeof text === "string");
}

function errorInfo(payload: Record<string, unknown>): AiErrorInfo | undefined {
   const info: AiErrorInfo = {};
   if (payload.window === "day" || payload.window === "month") info.window = payload.window;
   if (typeof payload.resets_at === "string" && !Number.isNaN(Date.parse(payload.resets_at))) info.resetsAt = payload.resets_at;
   if (Number.isInteger(payload.retry_after_seconds) && (payload.retry_after_seconds as number) >= 1) info.retryAfterSeconds = payload.retry_after_seconds as number;
   return Object.keys(info).length > 0 ? info : undefined;
}

function isDraftResult(value: unknown): value is DraftResult {
   return (
      isRecord(value) &&
      (value.framework === "star" || value.framework === "free_form") &&
      isStarFields(value.fields) &&
      (value.body === null || typeof value.body === "string") &&
      isStrings(value.questions_to_ask_yourself)
   );
}

function isReviewResult(value: unknown): value is ReviewResult {
   return isRecord(value) && isStrings(value.missing) && isStrings(value.weak) && isStrings(value.claims_to_verify) && isStrings(value.questions_to_ask_yourself);
}

/** A typed client for `/me/prep/ai`: the user's bearer token and the request body only. It stores nothing and is never called by autosave. */
export function createAiClient(config: PrepClientConfig) {
   const base = config.baseUrl.replace(/\/$/, "");
   const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
   const timeoutMs = config.timeoutMs ?? AI_TIMEOUT_MS;

   async function post<T>(action: "draft" | "review", body: unknown, isResult: (value: unknown) => value is T): Promise<AiResult<T>> {
      const token = await config.getAccessToken().catch(() => null);
      if (!token) return { status: "unauthenticated" };

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
         timedOut = true;
         controller.abort();
      }, timeoutMs);
      const lost = (): AiResult<T> => ({ status: "failed", code: null, cause: timedOut ? "timeout" : "transport" });
      try {
         let response: Response;
         try {
            response = await doFetch(`${base}/me/prep/ai/${action}`, {
               method: "POST",
               headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
               body: JSON.stringify(body),
               cache: "no-store",
               credentials: "omit",
               signal: controller.signal,
            });
         } catch {
            return lost();
         }
         if (response.status === 401) return { status: "unauthenticated" };
         let payload: unknown = null;
         try {
            payload = await response.json();
         } catch {
            // An unreadable body is handled below as malformed (2xx) or an uncoded failure.
         }
         if (!response.ok) {
            const code = isRecord(payload) && typeof payload.code === "string" ? payload.code : null;
            const info = isRecord(payload) ? errorInfo(payload) : undefined;
            return { status: "failed", code, cause: "upstream", ...(info && { info }) };
         }
         return isRecord(payload) && payload.action === action && isResult(payload.result)
            ? { status: "ok", data: payload.result }
            : { status: "failed", code: null, cause: "malformed" };
      } catch {
         return lost();
      } finally {
         clearTimeout(timer);
      }
   }

   return {
      /** A draft whose framework is not the one asked for is malformed: it would land in the wrong field. */
      draft: (body: DraftRequest): Promise<AiResult<DraftResult>> =>
         post("draft", body, (value): value is DraftResult => isDraftResult(value) && value.framework === body.framework),
      review: (body: ReviewRequest): Promise<AiResult<ReviewResult>> => post("review", body, isReviewResult),
   };
}

export type AiClient = ReturnType<typeof createAiClient>;
