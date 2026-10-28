/** The Privacy & AI Use page (P7-D-042); the footer, login and signup link here. */
export const PRIVACY_HREF = "/privacy";

/** The consent document (api-contract.md §9.3). The server's `AI_TERMS_VERSION` must equal `PRIVACY_VERSION` exactly. */
export const PRIVACY_DOCUMENT_ID = "privacy-and-ai-use";
export const PRIVACY_VERSION = "2026-10-28";

export const SUPPORT_EMAIL = "support@interviewnotes.io";

/** Which provider processes an AI request, by plan (api-contract.md §9.1). There is no fallback between them. */
export const AI_PROVIDER_BY_PLAN = [
   { plan: "Free", provider: "Groq" },
   { plan: "Premium", provider: "OpenAI" },
] as const;
