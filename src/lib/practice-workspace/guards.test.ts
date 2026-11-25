import { describe, expect, it } from "vitest";
import { createPracticeClient } from "./client";
import { createFakePracticeApi } from "./fakeApi";
import { installFakeAttempts } from "./fakeAttempts";
import { isAssumption, isAttempt, isAttemptDetail, isAttemptListPage, isClarificationReveal, isConsentOut, isConsentStatus, isHint, isStageWork } from "./guards";

const API = "https://api.example.test";

async function sample() {
   const api = createFakePracticeApi();
   installFakeAttempts(api, { consent: { requiredVersion: "v1", accepted: true } });
   const token = api.signIn("ada");
   const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
   const created = await client.createAttempt({ content_id: "problem.incident-handoff-summary", mode: "self", target_seniority: "mid" }, "guard-key-aaaaaaaaaa");
   if (created.status !== "ok") throw new Error("seed");
   const detail = await client.getAttempt(created.data.id);
   if (detail.status !== "ok") throw new Error("seed");
   return { api, token, client, attempt: created.data, detail: detail.data };
}

describe("the response guards", () => {
   it("accept what the frozen contract's service answers", async () => {
      const { client, attempt, detail } = await sample();
      expect(isAttempt(attempt)).toBe(true);
      expect(isAttemptDetail(detail)).toBe(true);
      expect(isStageWork(detail.stage_work[0])).toBe(true);
      expect(isAttemptListPage({ items: [], next_cursor: null })).toBe(true);
      const hint = await client.stageHint(attempt.id, "frame");
      expect(hint.status === "ok" && isHint(hint.data)).toBe(true);
      const reveal = await client.revealClarification(attempt.id, "clarify-order");
      expect(reveal.status === "ok" && isClarificationReveal(reveal.data)).toBe(true);
      const assumption = await client.addAssumption(attempt.id, { position: "frame", text: "x" });
      expect(assumption.status === "ok" && isAssumption(assumption.data)).toBe(true);
   });

   it("refuse a body that is not an object, or lacks or mistypes a member a screen reads", async () => {
      const { attempt, detail } = await sample();
      for (const bad of [null, undefined, 1, "x", [], {}]) {
         expect(isAttempt(bad)).toBe(false);
         expect(isAttemptDetail(bad)).toBe(false);
         expect(isStageWork(bad)).toBe(false);
      }
      expect(isAttempt({ ...attempt, status: "paused" })).toBe(false);
      expect(isAttempt({ ...attempt, spine: ["frame", "review_surface"] })).toBe(false);
      expect(isAttempt({ ...attempt, version: "2" })).toBe(false);
      expect(isAttemptDetail({ ...detail, stage_work: [{ ...detail.stage_work[0], fields: { a: 1 } }] })).toBe(false);
      expect(isAttemptDetail({ ...detail, challenge: { title: 1 } })).toBe(false);
      expect(isAttemptDetail({ ...detail, history: [{ kind: "interviewer" }] })).toBe(false);
      expect(isStageWork({ ...detail.stage_work[0], version: Number.NaN })).toBe(false);
      expect(isAttemptListPage({ items: [{ id: 1 }], next_cursor: null })).toBe(false);
      expect(isConsentStatus({ practice_data: { state: "maybe" }, practice_ai: {} })).toBe(false);
      expect(isConsentOut({ document_id: "x" })).toBe(false);
   });

   it("accept an additive member the contract does not list", async () => {
      const { attempt } = await sample();
      expect(isAttempt({ ...attempt, something_new: true })).toBe(true);
   });
});

describe("the client with a guard and a signal", () => {
   it("answers a malformed body as unavailable (malformed), never as data", async () => {
      const { api, client, attempt } = await sample();
      api.script("get_attempt", { status: 200, body: { ...attempt, stage_work: null } });
      expect(await client.getAttempt(attempt.id)).toEqual({ status: "unavailable", cause: "malformed" });
      api.script("patch_stage", { status: 200, body: { position: "frame" } });
      expect(await client.patchStage(attempt.id, "frame", { version: 1 })).toEqual({ status: "unavailable", cause: "malformed" });
   });

   it("sends nothing for a signal that has already ended, and drops the answer of one that ends in flight", async () => {
      const { api, client, attempt } = await sample();
      const before = api.requests.length;
      const ended = new AbortController();
      ended.abort();
      expect(await client.getAttempt(attempt.id, { signal: ended.signal })).toEqual({ status: "unavailable", cause: "aborted" });
      expect(api.requests.length).toBe(before);
      const later = new AbortController();
      const pending = client.getAttempt(attempt.id, { signal: later.signal });
      later.abort();
      expect(await pending).toEqual({ status: "unavailable", cause: "aborted" });
   });

   it("keeps the documented refusals distinct", async () => {
      const { api, client, attempt } = await sample();
      const failures: [number, string][] = [[409, "version_conflict"], [409, "attempt_not_active"], [409, "consent_version_stale"], [403, "practice_disabled"], [404, "not_found"], [401, "unauthenticated"], [503, "entitlement_unavailable"]];
      const seen: string[] = [];
      for (const [status, code] of failures) {
         api.script("patch_stage", { status, body: { detail: code, code, current_version: 3, document_id: "practice-data", required_version: "v2" } });
         const result = await client.patchStage(attempt.id, "frame", { version: 1 });
         seen.push(result.status === "failed" ? (result.code ?? "?") : result.status);
      }
      expect(seen).toEqual(["version_conflict", "attempt_not_active", "consent_version_stale", "disabled", "notFound", "unauthenticated", "entitlement_unavailable"]);
   });
});
