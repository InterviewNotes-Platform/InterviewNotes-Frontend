import { describe, expect, it } from "vitest";
import { failureMessage } from "./aiStates";

const CODES = ["ai_quota_exhausted", "ai_busy", "ai_unavailable", "ai_input_too_large", "ai_not_entitled", "ai_disabled", "ai_consent_required", null];

describe("failureMessage", () => {
   it("gives every code its own message", () => {
      const messages = CODES.map((code) => failureMessage(code, "draft"));
      expect(new Set(messages).size).toBe(CODES.length);
   });

   it("treats a code it does not know like an uncoded failure, and names the action", () => {
      expect(failureMessage("something_new", "review")).toBe(failureMessage(null, "review"));
      expect(failureMessage(null, "review")).toContain("review your answer");
      expect(failureMessage(null, "draft")).toContain("write a draft");
   });

   it("never mentions an upgrade, a plan change or pricing, for any code", () => {
      for (const code of CODES) expect(failureMessage(code, "draft", { window: "day", resetsAt: "2026-10-31T00:00:00Z" })).not.toMatch(/upgrade|premium|pricing|subscribe|buy|purchase/i);
   });

   it("says every failure left the reader's text alone, except the consent notice that sent nothing", () => {
      for (const code of CODES) expect(failureMessage(code, "draft")).toMatch(/unchanged/);
   });

   it("names the quota window and when it renews", () => {
      const day = failureMessage("ai_quota_exhausted", "draft", { window: "day", resetsAt: "2026-10-31T00:00:00Z" });
      const month = failureMessage("ai_quota_exhausted", "draft", { window: "month", resetsAt: "2026-11-01T00:00:00Z" });
      expect(day).toContain("today's AI help");
      expect(day).toMatch(/It renews at /);
      expect(month).toContain("this month's AI help");
      expect(month).toMatch(/It renews on /);
      expect(failureMessage("ai_quota_exhausted", "draft")).not.toMatch(/renews (at|on)/);
      expect(failureMessage("ai_quota_exhausted", "draft", { window: "day", resetsAt: "soon" })).not.toMatch(/renews (at|on)|Invalid/);
   });

   it("gives a wait only when the API gave one", () => {
      expect(failureMessage("ai_busy", "draft")).toContain("in a moment");
      expect(failureMessage("ai_busy", "draft", { retryAfterSeconds: 20 })).toContain("in about 20 seconds");
      expect(failureMessage("ai_busy", "draft", { retryAfterSeconds: 90 })).toContain("in about 2 minutes");
   });
});
