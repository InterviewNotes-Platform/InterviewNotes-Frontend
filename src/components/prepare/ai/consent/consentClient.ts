import { isRecord } from "@/lib/prep/guards";
import type { PrepClientConfig } from "@/lib/prep/client";
import { PRIVACY_DOCUMENT_ID } from "@/lib/privacy";

/** The consent status object of api-contract.md §9.3. */
export type ConsentStatus = {
   document_id: string;
   /** The terms version the server requires now; null only when the server has none configured (AI is then unavailable). */
   required_version: string | null;
   accepted: boolean;
   accepted_at: string | null;
   withdrawn_at: string | null;
   ai_available: boolean;
};

/** `failed.code` is the envelope's `code` when the API sent one (for example `ai_disabled` or `consent_version_stale`). */
export type ConsentResult =
   | { status: "ok"; data: ConsentStatus }
   | { status: "unauthenticated" }
   | { status: "failed"; code: string | null };

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

function isConsentStatus(value: unknown): value is ConsentStatus {
   return (
      isRecord(value) &&
      typeof value.document_id === "string" &&
      isNullableString(value.required_version) &&
      typeof value.accepted === "boolean" &&
      isNullableString(value.accepted_at) &&
      isNullableString(value.withdrawn_at) &&
      typeof value.ai_available === "boolean"
   );
}

/** Consent is in force only for the document and version the server requires now, and only when the server says so. */
export function consentInForce(status: ConsentStatus): boolean {
   return status.accepted && status.required_version !== null && status.document_id === PRIVACY_DOCUMENT_ID;
}

/**
 * A typed client for the consent endpoints under `/me/prep/ai/consent` (api-contract.md §9.3): the user's bearer token and,
 * for accepting, the document and version. Declining is not an operation, so there is no call for it. Nothing is stored here.
 */
export function createConsentClient(config: PrepClientConfig) {
   const base = `${config.baseUrl.replace(/\/$/, "")}/me/prep/ai/consent`;
   const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
   const timeoutMs = config.timeoutMs ?? 30_000;

   async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<ConsentResult> {
      const token = await config.getAccessToken().catch(() => null);
      if (!token) return { status: "unauthenticated" };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
         const response = await doFetch(`${base}${path}`, {
            method,
            headers: {
               Authorization: `Bearer ${token}`,
               Accept: "application/json",
               ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            cache: "no-store",
            credentials: "omit",
            signal: controller.signal,
         });
         if (response.status === 401) return { status: "unauthenticated" };
         let payload: unknown = null;
         try {
            payload = await response.json();
         } catch {
            // An unreadable body is an uncoded failure (non-2xx) or a malformed answer (2xx), handled below.
         }
         if (!response.ok) return { status: "failed", code: isRecord(payload) && typeof payload.code === "string" ? payload.code : null };
         return isConsentStatus(payload) ? { status: "ok", data: payload } : { status: "failed", code: null };
      } catch {
         return { status: "failed", code: null };
      } finally {
         clearTimeout(timer);
      }
   }

   return {
      /** What the server requires now and whether this caller has accepted it. Asked at the user's own AI action, never at load. */
      status: () => call("GET", ""),
      /** Records acceptance of exactly `version`, the one the status named. Idempotent on the server. */
      accept: (version: string) => call("POST", "", { document_id: PRIVACY_DOCUMENT_ID, version }),
      /** Records the withdrawal for the caller; the next AI action asks again. */
      withdraw: () => call("POST", "/withdraw"),
   };
}

export type ConsentClient = ReturnType<typeof createConsentClient>;
