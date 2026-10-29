import type { AiErrorInfo } from "./aiClient";

type Action = "draft" | "review";

const KEPT = "Your text is unchanged and nothing was saved from this.";

function renewal({ window, resetsAt }: AiErrorInfo) {
   const at = resetsAt ? new Date(resetsAt) : null;
   if (!at || Number.isNaN(at.getTime())) return "";
   return window === "month" ? ` It renews on ${at.toLocaleDateString(undefined, { day: "numeric", month: "long" })}.` : ` It renews at ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`;
}

function wait(seconds: number | undefined) {
   if (!seconds) return "in a moment";
   return seconds < 60 ? `in about ${seconds} seconds` : `in about ${Math.ceil(seconds / 60)} minutes`;
}

/**
 * What the reader is told for each error code of the AI contract (acceptance-plan.md §4). No state links anywhere: no upgrade route exists
 * (P6-R-110, `PREMIUM_HREF` sells nothing), so `ai_quota_exhausted` and `ai_not_entitled` get no prompt either. `ai_consent_required` is handled by the caller.
 */
export function failureMessage(code: string | null | undefined, action: Action, info: AiErrorInfo = {}): string {
   const what = action === "draft" ? "write a draft" : "review your answer";
   switch (code) {
      case "ai_quota_exhausted":
         return `You've used ${info.window === "month" ? "this month's" : info.window === "day" ? "today's" : "your"} AI help, so we couldn't ${what}.${renewal(info)} ${KEPT} You can try again after it renews.`;
      case "ai_busy":
         return `AI help is busy, so we couldn't ${what} just now. ${KEPT} You can try again ${wait(info.retryAfterSeconds)}.`;
      case "ai_unavailable":
         return `AI help is unavailable, so we couldn't ${what} just now. ${KEPT} You can try again later.`;
      case "ai_input_too_large":
         return `This is too long for AI help to read, so we couldn't ${what}. ${KEPT} Shorten your text, then try again.`;
      case "ai_not_entitled":
         return `This AI action isn't included in your plan, so we couldn't ${what}. ${KEPT}`;
      case "ai_disabled":
         return `AI help isn't available right now, so we couldn't ${what}. ${KEPT}`;
      case "ai_consent_required":
         return "Your AI consent has changed, so nothing was sent. Choose the action again to continue. Your text is unchanged.";
      default:
         return `We couldn't ${what} just now. ${KEPT} You can try again.`;
   }
}

/** The codes above, for the `data-ai-state` marker: an unknown code is reported as a plain error and never echoed. */
export const KNOWN_CODES = ["ai_quota_exhausted", "ai_busy", "ai_unavailable", "ai_input_too_large", "ai_not_entitled", "ai_disabled", "ai_consent_required"];
