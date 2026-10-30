import { describe, expect, it } from "vitest";
import { PRIVACY_DOCUMENT_ID, PRIVACY_VERSION } from "@/lib/privacy";
import { consentInForce, createConsentClient, refineOffered, type ConsentStatus } from "./consentClient";
import { createFakeConsentApi } from "./fakeConsent";

const make = (token: string | null = "t", fake = createFakeConsentApi()) => ({
   fake,
   client: createConsentClient({ baseUrl: "https://api.example.test/", getAccessToken: async () => token, fetch: async (input, init) => fake.handle(String(input), init)! }),
});

describe("consent client", () => {
   it("reads the status from GET /me/prep/ai/consent with the bearer token and no body", async () => {
      const { client, fake } = make();
      const result = await client.status();
      expect(result).toMatchObject({ status: "ok", data: { required_version: PRIVACY_VERSION, accepted: false, ai_available: true } });
      expect(fake.requests).toEqual([{ method: "GET", path: "", body: undefined }]);
   });

   it("offers Refine only for the literal true, and a bad field leaves the rest of the status usable", async () => {
      const read = async (override: Record<string, unknown>) => {
         const { client, fake } = make("t", createFakeConsentApi({ refineAvailable: true }));
         fake.override = override;
         return client.status();
      };
      const offered = async (override: Record<string, unknown>) => {
         const result = await read(override);
         return result.status === "ok" && refineOffered(result.data);
      };
      expect(await offered({})).toBe(true);
      expect(await offered({ refine_available: false })).toBe(false);
      for (const bad of [undefined, null, "true", 1, {}, []]) expect(await offered({ refine_available: bad })).toBe(false);
      // An answer without the field is still a usable status: consent works, Refine is simply not offered.
      expect(await read({ refine_available: undefined })).toMatchObject({ status: "ok", data: { ai_available: true } });
   });

   it("reads the Refine signal the same way from GET, accept and withdraw, and does not tie it to consent", async () => {
      const { client } = make("t", createFakeConsentApi({ refineAvailable: true }));
      const flags = async (call: Promise<{ status: string; data?: ConsentStatus }>) => ((await call).data as ConsentStatus).refine_available;
      expect(await flags(client.status())).toBe(true);
      expect(await flags(client.accept(PRIVACY_VERSION))).toBe(true);
      expect(await flags(client.withdraw())).toBe(true);
   });

   it("accepts exactly the version it names, with the document id", async () => {
      const { client, fake } = make();
      const result = await client.accept(PRIVACY_VERSION);
      expect(result.status === "ok" && consentInForce(result.data)).toBe(true);
      expect(fake.requests[0].body).toEqual({ document_id: PRIVACY_DOCUMENT_ID, version: PRIVACY_VERSION });
   });

   it("reports a stale version with the server's code, and records nothing", async () => {
      const { client, fake } = make();
      expect(await client.accept("old")).toEqual({ status: "failed", code: "consent_version_stale" });
      expect(fake.status("t").accepted).toBe(false);
   });

   it("withdraws through POST /withdraw", async () => {
      const { client, fake } = make();
      await client.accept(PRIVACY_VERSION);
      const result = await client.withdraw();
      expect(result.status === "ok" && consentInForce(result.data)).toBe(false);
      expect(fake.requests.at(-1)).toMatchObject({ method: "POST", path: "/withdraw" });
   });

   it("makes no request without a token, and maps 401 to unauthenticated", async () => {
      const none = make(null);
      expect(await none.client.status()).toEqual({ status: "unauthenticated" });
      expect(none.fake.requests).toEqual([]);
      const unauthorized = createConsentClient({ baseUrl: "https://x.test", getAccessToken: async () => "t", fetch: async () => new Response("{}", { status: 401 }) });
      expect(await unauthorized.status()).toEqual({ status: "unauthenticated" });
   });

   it.each([
      ["a transport error", async () => { throw new TypeError("offline"); }],
      ["a malformed 200", async () => new Response(JSON.stringify({ accepted: "yes" }), { status: 200 })],
      ["an unreadable 503", async () => new Response("<html>", { status: 503 })],
   ])("fails closed on %s", async (_name, fetch) => {
      const client = createConsentClient({ baseUrl: "https://x.test", getAccessToken: async () => "t", fetch: fetch as typeof globalThis.fetch });
      expect(await client.status()).toEqual({ status: "failed", code: null });
   });

   it("never treats consent as in force when the server has no required version", () => {
      expect(consentInForce({ document_id: PRIVACY_DOCUMENT_ID, required_version: null, accepted: true, accepted_at: "x", withdrawn_at: null, ai_available: false })).toBe(false);
   });
});
