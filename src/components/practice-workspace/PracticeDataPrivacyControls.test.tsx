import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPracticeClient } from "@/lib/practice-workspace/client";
import { createFakePracticeApi } from "@/lib/practice-workspace/fakeApi";
import { installFakeAttempts } from "@/lib/practice-workspace/fakeAttempts";
import { PRACTICE_DELETE_COPY } from "@/lib/practice-terms";

const exportMock = vi.hoisted(() => ({ outcome: null as null | { kind: "incomplete"; reason: "too_large" } }));
vi.mock("@/lib/practice-workspace/exportFile", async (original) => {
   const actual = await original<typeof import("@/lib/practice-workspace/exportFile")>();
   return { ...actual, saveExport: async (...args: Parameters<typeof actual.saveExport>) => exportMock.outcome ?? actual.saveExport(...args) };
});

import { EXPORT_TOO_LARGE } from "./PracticeDataControls";
import { PracticeDataPrivacyControls } from "./PracticeDataPrivacyControls";

const API = "https://api.example.test";

afterEach(() => {
   exportMock.outcome = null;
   vi.restoreAllMocks();
});

async function rig(options: { enabled?: boolean; attempts?: number } = {}) {
   const api = createFakePracticeApi();
   installFakeAttempts(api, { consent: { requiredVersion: "v1", accepted: true } });
   const token = api.signIn("ada");
   const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
   for (let n = 0; n < (options.attempts ?? 2); n += 1) {
      const created = await client.createAttempt({ content_id: "problem.llm-attribute-extraction-pipeline", mode: "self", target_seniority: "senior" }, `privacy-key-${n}-aaaaaaaaaa`);
      if (created.status !== "ok") throw new Error("seed");
   }
   if (options.enabled === false) api.setEnabled(false);
   api.script("delete_attempt", () => ({ status: 204 }));
   const before = api.requests.length;
   render(<PracticeDataPrivacyControls apiUrl={API} owner="ada" getAccessToken={async () => token} fetch={api.fetch} />);
   return { api, routes: () => api.requests.slice(before).map((r) => r.route) };
}

describe("practice data controls on the practice data terms page (T17-INT-1, T15 v2)", () => {
   it("lists the learner's attempts with export and delete, without the practice gate or any practice route", async () => {
      const r = await rig();
      const list = await screen.findByRole("list");
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
      expect(within(list).getAllByRole("button", { name: "Export this attempt" })).toHaveLength(2);
      expect(within(list).getAllByRole("button", { name: "Delete this attempt" })).toHaveLength(2);
      expect(screen.getByRole("button", { name: "Export all practice data" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: PRACTICE_DELETE_COPY.all.confirm })).toBeInTheDocument();
      // A shutdown of ordinary practice must not strand the learner: no capability check, no link into a practice route.
      expect(r.routes()).toEqual(["list_attempts"]);
      expect(document.querySelectorAll("a")).toHaveLength(0);
   });

   it("deletes one attempt after confirmation and removes it from the list", async () => {
      const r = await rig();
      const list = await screen.findByRole("list");
      fireEvent.click(within(list).getAllByRole("button", { name: "Delete this attempt" })[0]);
      fireEvent.click(await screen.findByRole("button", { name: PRACTICE_DELETE_COPY.attempt.confirm }));
      await waitFor(() => expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(1));
      expect(r.routes()).toContain("delete_attempt");
   });

   it("says export and deletion are off when the API refuses practice data access, and shows no controls", async () => {
      await rig({ enabled: false });
      await screen.findByText(/Export and deletion are switched off with practice right now/);
      expect(screen.queryByRole("button")).toBeNull();
   });

   it("explains an export that stopped at the memory bound and offers the per-attempt export right there", async () => {
      await rig();
      exportMock.outcome = { kind: "incomplete", reason: "too_large" };
      fireEvent.click(await screen.findByRole("button", { name: "Export all practice data" }));
      await screen.findByText(EXPORT_TOO_LARGE);
      expect(within(screen.getByRole("list")).getAllByRole("button", { name: "Export this attempt" })).toHaveLength(2);
   });

   it("renders nothing for a signed-out visitor (the terms page says to sign in)", () => {
      const { container } = render(<PracticeDataPrivacyControls apiUrl={API} owner={null} />);
      expect(container).toBeEmptyDOMElement();
   });
});
