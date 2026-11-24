import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePracticeApi, failure } from "@/lib/practice-workspace/fakeApi";
import { installFakeAttempts } from "@/lib/practice-workspace/fakeAttempts";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

import { PracticeEntry } from "./PracticeEntry";

const API = "https://api.example.test";
const CONTENT = "problem.llm-attribute-extraction-pipeline";
const SENIORITIES = ["senior", "staff"];

function rig(options: { consent?: { requiredVersion: string | null; accepted?: boolean } } = {}) {
   const api = createFakePracticeApi();
   const store = installFakeAttempts(api, { consent: options.consent ?? { requiredVersion: "draft-1", accepted: false } });
   const token = api.signIn("ada");
   const ui = (props: Partial<ComponentProps<typeof PracticeEntry>> = {}) => (
      <PracticeEntry contentId={CONTENT} apiUrl={API} seniorities={SENIORITIES} owner="ada" getAccessToken={async () => token} fetch={api.fetch} {...props} />
   );
   return { api, store, token, ui };
}

const control = () => screen.queryByRole("button", { name: "Practise this Problem" });
const dialog = () => screen.getByRole("dialog");
async function settle() {
   await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
   });
}

beforeEach(() => {
   vi.stubEnv("NEXT_PUBLIC_PRACTICE_ENABLED", "true");
   push.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("when the entry appears", () => {
   it("appears when the backend says practice is ready for this Problem", async () => {
      const { ui } = rig();
      render(ui());
      expect(await screen.findByRole("button", { name: "Practise this Problem" })).toBeInTheDocument();
   });

   it("renders nothing, and asks nothing, with the frontend flag off", async () => {
      vi.stubEnv("NEXT_PUBLIC_PRACTICE_ENABLED", "false");
      const { ui, api } = rig();
      render(ui());
      await settle();
      expect(control()).not.toBeInTheDocument();
      expect(api.requests).toHaveLength(0);
   });

   it("renders nothing, and asks nothing, for a signed-out visitor: the reader is as it was", async () => {
      const { ui, api } = rig();
      render(ui({ owner: null, getAccessToken: async () => null }));
      await settle();
      expect(control()).not.toBeInTheDocument();
      expect(api.requests).toHaveLength(0);
   });

   it.each([
      ["the backend's practice flag is off", (api: ReturnType<typeof rig>["api"]) => api.setEnabled(false)],
      ["the caller is outside the rollout", (api: ReturnType<typeof rig>["api"]) => api.setAdmitted(false)],
      ["the Problem is not ready", (api: ReturnType<typeof rig>["api"]) => api.script("capability", { status: 200, body: { practice_available: true, practice_ready: false, ai_available: false, voice_available: false, plan: "free", consent: { practice_data: "required", practice_ai: "required" }, limits: null } })],
      ["practice is not available", (api: ReturnType<typeof rig>["api"]) => api.script("capability", { status: 200, body: { practice_available: false, practice_ready: true, ai_available: false, voice_available: false, plan: "free", consent: { practice_data: "required", practice_ai: "required" }, limits: null } })],
      ["the answer is malformed", (api: ReturnType<typeof rig>["api"]) => api.script("capability", { status: 200, body: { practice_available: "yes" } })],
      ["the network fails", (api: ReturnType<typeof rig>["api"]) => api.failNext("network")],
   ])("does not appear when %s, whatever the frontend flag says", async (_name, break_) => {
      const { ui, api } = rig();
      break_(api);
      render(ui());
      await settle();
      expect(control()).not.toBeInTheDocument();
   });

   it("does not appear when the Problem names no targeted seniority (it cannot say which bar applies)", async () => {
      const { ui, api } = rig();
      render(ui({ seniorities: [] }));
      await settle();
      expect(control()).not.toBeInTheDocument();
      expect(api.requests).toHaveLength(0);
   });

   it("is not inferred from the Problem's category, tags or entitlement: only the capability answer shows it", async () => {
      const { ui, api } = rig({});
      api.script("capability", (request) => {
         void request;
         return { status: 200, body: { practice_available: true, practice_ready: false, ai_available: false, voice_available: false, plan: "premium", consent: { practice_data: "accepted", practice_ai: "required" }, limits: null } };
      });
      render(ui());
      await settle();
      expect(control()).not.toBeInTheDocument();
   });

   it("asks the capability for this Problem only, and fetches no reference material", async () => {
      const { ui, api } = rig();
      render(ui());
      await screen.findByRole("button", { name: "Practise this Problem" });
      expect(api.requests.map((request) => request.route)).toEqual(["capability", "list_attempts"]);
      expect(api.requests[0].query).toEqual({ content_id: CONTENT });
      expect(api.requests.some((request) => request.route === "get_reference")).toBe(false);
   });

   it("offers to resume an active attempt on the Problem, without prefetching it", async () => {
      const { ui, api, token, store } = rig({ consent: { requiredVersion: "draft-1", accepted: true } });
      const { createPracticeClient } = await import("@/lib/practice-workspace/client");
      const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
      const created = await client.createAttempt({ content_id: CONTENT, mode: "self", target_seniority: "senior" }, "resume-key-aaaaaaaaaa");
      render(ui());
      const link = await screen.findByRole("link", { name: "Resume your attempt" });
      expect(link).toHaveAttribute("href", `/practice/attempts/${created.status === "ok" ? created.data.id : ""}`);
      expect(link).toHaveAttribute("data-prefetch", "false");
      void store;
   });
});

describe("choosing a seniority", () => {
   it("offers only the seniorities the Problem targets and starts nothing until one is chosen", async () => {
      const { ui, store } = rig();
      render(ui());
      fireEvent.click(await screen.findByRole("button", { name: "Practise this Problem" }));
      const radios = within(dialog()).getAllByRole("radio");
      expect(radios.map((radio) => (radio as HTMLInputElement).value)).toEqual(["senior", "staff"]);
      expect(within(dialog()).queryByRole("radio", { name: /Mid|Principal/ })).not.toBeInTheDocument();
      fireEvent.click(within(dialog()).getByRole("button", { name: "Start practice" }));
      await settle();
      expect(store.calls("get_consent")).toHaveLength(0);
      expect(store.calls("create_attempt")).toHaveLength(0);
   });

   it("preselects the only targeted seniority", async () => {
      const { ui } = rig();
      render(ui({ seniorities: ["staff"] }));
      fireEvent.click(await screen.findByRole("button", { name: "Practise this Problem" }));
      expect(within(dialog()).getByRole("radio", { name: "Staff" })).toBeChecked();
   });
});

describe("the practice-data acknowledgement", () => {
   async function toNotice(r: ReturnType<typeof rig>, seniority = "Senior") {
      render(r.ui());
      fireEvent.click(await screen.findByRole("button", { name: "Practise this Problem" }));
      fireEvent.click(within(dialog()).getByRole("radio", { name: seniority }));
      fireEvent.click(within(dialog()).getByRole("button", { name: "Start practice" }));
      await within(dialog()).findByRole("heading", { name: "Before you practise" });
   }

   it("is shown before anything is created and records nothing until the learner accepts", async () => {
      const r = rig();
      await toNotice(r);
      expect(within(dialog()).getByText(/Draft notice for local development/)).toBeInTheDocument();
      expect(within(dialog()).getByRole("link", { name: /notice version draft-1/ })).toHaveAttribute("href", "/privacy");
      expect(r.store.calls("post_consent")).toHaveLength(0);
      expect(r.store.calls("create_attempt")).toHaveLength(0);
   });

   it("says nothing about hosting region, retention or provider retention, and has no AI or voice consent", async () => {
      const r = rig();
      await toNotice(r);
      const text = dialog().textContent ?? "";
      expect(text).not.toMatch(/region|retention|retain|backup|days|voice|microphone|Groq|OpenAI/i);
      expect(r.store.calls("get_consent")).toHaveLength(1);
      expect(r.api.requests.some((request) => (request.body as { document_id?: string } | undefined)?.document_id === "practice-ai")).toBe(false);
   });

   it("accepts the applicable version, creates one self-guided attempt and opens the workspace", async () => {
      const r = rig();
      await toNotice(r);
      fireEvent.click(within(dialog()).getByRole("button", { name: "Accept and start" }));
      await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
      expect(r.store.calls("post_consent")[0].body).toEqual({ document_id: "practice-data", document_version: "draft-1" });
      const create = r.store.calls("create_attempt");
      expect(create).toHaveLength(1);
      expect(create[0].body).toEqual({ content_id: CONTENT, mode: "self", target_seniority: "senior" });
      expect(create[0].headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
      expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/practice\/attempts\/00000000-0000-4000-8000-/));
   });

   it("declining leaves the reader usable: nothing recorded, nothing created, focus back on the entry", async () => {
      const r = rig();
      await toNotice(r);
      fireEvent.click(within(dialog()).getByRole("button", { name: "Decline" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(r.store.calls("post_consent")).toHaveLength(0);
      expect(r.store.calls("create_attempt")).toHaveLength(0);
      expect(push).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Practise this Problem" })).toBeInTheDocument();
   });

   it("fails closed when no notice version is required: nothing is accepted and nothing is created", async () => {
      const r = rig({ consent: { requiredVersion: null } });
      render(r.ui());
      fireEvent.click(await screen.findByRole("button", { name: "Practise this Problem" }));
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Senior" }));
      fireEvent.click(within(dialog()).getByRole("button", { name: "Start practice" }));
      await within(dialog()).findByText("Practice is not available right now.");
      expect(r.store.calls("post_consent")).toHaveLength(0);
      expect(r.store.calls("create_attempt")).toHaveLength(0);
      expect(within(dialog()).queryByRole("heading", { name: "Before you practise" })).not.toBeInTheDocument();
   });

   it("does not start when the notice status cannot be read", async () => {
      const r = rig();
      r.api.script("get_consent", { status: 200, body: { practice_data: "oops" } });
      render(r.ui());
      fireEvent.click(await screen.findByRole("button", { name: "Practise this Problem" }));
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Senior" }));
      fireEvent.click(within(dialog()).getByRole("button", { name: "Start practice" }));
      await within(dialog()).findByText(/could not check the practice notice, so nothing was started/);
      expect(r.store.calls("create_attempt")).toHaveLength(0);
   });

   it("asks again with the new version when the notice changed while the dialog was open", async () => {
      const r = rig();
      await toNotice(r);
      r.store.setConsent({ requiredVersion: "draft-2" });
      fireEvent.click(within(dialog()).getByRole("button", { name: "Accept and start" }));
      await within(dialog()).findByRole("link", { name: /notice version draft-2/ });
      expect(r.store.calls("create_attempt")).toHaveLength(0);
      fireEvent.click(within(dialog()).getByRole("button", { name: "Accept and start" }));
      await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
      expect(r.store.calls("post_consent").at(-1)!.body).toEqual({ document_id: "practice-data", document_version: "draft-2" });
   });

   it("skips the notice when the applicable version was already accepted", async () => {
      const r = rig({ consent: { requiredVersion: "draft-1", accepted: true } });
      render(r.ui());
      fireEvent.click(await screen.findByRole("button", { name: "Practise this Problem" }));
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Staff" }));
      fireEvent.click(within(dialog()).getByRole("button", { name: "Start practice" }));
      await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
      expect(r.store.calls("post_consent")).toHaveLength(0);
      expect((r.store.calls("create_attempt")[0].body as { target_seniority: string }).target_seniority).toBe("staff");
   });
});

describe("creating the attempt", () => {
   it("never creates a second attempt from rapid clicks", async () => {
      const r = rig({ consent: { requiredVersion: "draft-1", accepted: true } });
      render(r.ui());
      fireEvent.click(await screen.findByRole("button", { name: "Practise this Problem" }));
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Senior" }));
      const start = within(dialog()).getByRole("button", { name: "Start practice" });
      fireEvent.click(start);
      fireEvent.click(start);
      fireEvent.click(start);
      await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
      expect(r.store.calls("create_attempt")).toHaveLength(1);
      expect(r.store.records.size).toBe(1);
   });

   it("retries a lost reply with the same idempotency key, so only one attempt exists", async () => {
      const r = rig({ consent: { requiredVersion: "draft-1", accepted: true } });
      render(r.ui());
      fireEvent.click(await screen.findByRole("button", { name: "Practise this Problem" }));
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Senior" }));
      // The server makes the attempt, then the reply is lost.
      const original = r.api.fetch;
      let lose = true;
      const fetchLosingFirst: typeof fetch = async (input, init) => {
         const response = await original(input, init);
         if (lose && (init?.method ?? "GET") === "POST" && String(input).endsWith("/me/practice/attempts")) {
            lose = false;
            throw new TypeError("reply lost");
         }
         return response;
      };
      cleanup();
      render(r.ui({ fetch: fetchLosingFirst }));
      fireEvent.click(await screen.findByRole("button", { name: "Practise this Problem" }));
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Senior" }));
      fireEvent.click(within(dialog()).getByRole("button", { name: "Start practice" }));
      await within(dialog()).findByText(/could not confirm that your attempt started/);
      expect(push).not.toHaveBeenCalled();
      fireEvent.click(within(dialog()).getByRole("button", { name: "Try again" }));
      await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
      const keys = r.store.calls("create_attempt").map((request) => request.headers["Idempotency-Key"]);
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
      expect(r.store.records.size).toBe(1);
   });

   it("says when the server refuses the seniority, and keeps the reader as it was", async () => {
      const r = rig({ consent: { requiredVersion: "draft-1", accepted: true } });
      r.api.script("create_attempt", () => failure("validation_error", 422));
      render(r.ui());
      fireEvent.click(await screen.findByRole("button", { name: "Practise this Problem" }));
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Senior" }));
      fireEvent.click(within(dialog()).getByRole("button", { name: "Start practice" }));
      await within(dialog()).findByText("That bar is not available for this Problem. Choose another.");
      expect(push).not.toHaveBeenCalled();
   });

   it("points to the learner's attempts when the server's active-attempt limit is reached", async () => {
      const r = rig({ consent: { requiredVersion: "draft-1", accepted: true } });
      r.api.script("create_attempt", () => failure("attempt_limit_reached", 409));
      render(r.ui());
      fireEvent.click(await screen.findByRole("button", { name: "Practise this Problem" }));
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Senior" }));
      fireEvent.click(within(dialog()).getByRole("button", { name: "Start practice" }));
      const link = await within(dialog()).findByRole("link", { name: "Your attempts" });
      expect(link).toHaveAttribute("href", "/practice/history");
      expect(link).toHaveAttribute("data-prefetch", "false");
   });
});

describe("a change of user", () => {
   it("asks the capability again for the new identity and shows nothing of the previous one", async () => {
      const r = rig();
      const bob = r.api.signIn("bob");
      const view = render(r.ui());
      await screen.findByRole("button", { name: "Practise this Problem" });
      view.rerender(r.ui({ owner: "bob", getAccessToken: async () => bob }));
      await settle();
      await screen.findByRole("button", { name: "Practise this Problem" });
      expect(r.api.requests.filter((request) => request.route === "capability").map((request) => request.token)).toEqual([r.token, bob]);
      view.rerender(r.ui({ owner: null, getAccessToken: async () => null }));
      expect(control()).not.toBeInTheDocument();
   });
});
