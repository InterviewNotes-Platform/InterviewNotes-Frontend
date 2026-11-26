import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakePracticeApi, failure } from "@/lib/practice-workspace/fakeApi";
import { installFakeAttempts } from "@/lib/practice-workspace/fakeAttempts";
import { PRACTICE_TERMS_VERSION, PRACTICE_WITHDRAW_COPY } from "@/lib/practice-terms";

import { PracticeDataAccess } from "./PracticeDataAccess";

const API = "https://api.example.test";

function rig(accepted: boolean, options: { admitted?: boolean } = {}) {
   const api = createFakePracticeApi({ admitted: options.admitted });
   installFakeAttempts(api, { consent: { requiredVersion: PRACTICE_TERMS_VERSION, accepted } });
   const token = api.signIn("ada");
   const ui = (props: Partial<ComponentProps<typeof PracticeDataAccess>> = {}) => <PracticeDataAccess apiUrl={API} owner="ada" getAccessToken={async () => token} fetch={api.fetch} {...props} />;
   return { api, ui };
}

describe("Your practice data: the privacy-only access path (P9-T17)", () => {
   it("never asks capability and offers no practice entry, editing, reference or AI", async () => {
      const r = rig(true);
      render(r.ui());
      await screen.findByRole("button", { name: PRACTICE_WITHDRAW_COPY.action });
      expect(r.api.requests.map((request) => request.route)).toEqual(["get_consent"]);
      expect(screen.queryByRole("button", { name: /start|practise|submit|reveal|hint|AI/i })).not.toBeInTheDocument();
      expect(screen.getByText("Export or delete one attempt, or all of them, below.")).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
   });

   it("withdraws the practice-data acknowledgement only after confirmation, and says that nothing is deleted", async () => {
      const r = rig(true);
      r.api.script("withdraw_consent", { status: 200, body: { document_id: "practice-data", withdrawn_at: "2026-11-25T00:00:00Z", consent: { practice_data: "required", practice_ai: "required" } } });
      render(r.ui());
      fireEvent.click(await screen.findByRole("button", { name: PRACTICE_WITHDRAW_COPY.action }));
      expect(screen.getByRole("group", { name: PRACTICE_WITHDRAW_COPY.title })).toHaveTextContent("This deletes nothing");
      expect(r.api.requests.filter((request) => request.route === "withdraw_consent")).toHaveLength(0);
      fireEvent.click(screen.getByRole("button", { name: PRACTICE_WITHDRAW_COPY.confirm }));
      expect(await screen.findByText(PRACTICE_WITHDRAW_COPY.done)).toHaveAttribute("role", "status");
      const sent = r.api.requests.filter((request) => request.route === "withdraw_consent");
      expect(sent.map((request) => request.body)).toEqual([{ document_id: "practice-data" }]);
      expect(r.api.requests.some((request) => request.route === "delete_all" || request.route === "delete_attempt")).toBe(false);
   });

   it("cancelling the confirmation sends nothing", async () => {
      const r = rig(true);
      render(r.ui());
      fireEvent.click(await screen.findByRole("button", { name: PRACTICE_WITHDRAW_COPY.action }));
      fireEvent.click(screen.getByRole("button", { name: PRACTICE_WITHDRAW_COPY.cancel }));
      expect(screen.getByRole("button", { name: PRACTICE_WITHDRAW_COPY.action })).toBeInTheDocument();
      expect(r.api.requests.filter((request) => request.route === "withdraw_consent")).toHaveLength(0);
   });

   it("has nothing to withdraw when the terms were never accepted", async () => {
      const r = rig(false);
      render(r.ui());
      expect(await screen.findByText(PRACTICE_WITHDRAW_COPY.notAccepted)).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
   });

   it("says practice is off and gives the support address when the API answers practice_disabled", async () => {
      const r = rig(true);
      r.api.script("withdraw_consent", failure("practice_disabled", 403));
      render(r.ui());
      fireEvent.click(await screen.findByRole("button", { name: PRACTICE_WITHDRAW_COPY.action }));
      fireEvent.click(screen.getByRole("button", { name: PRACTICE_WITHDRAW_COPY.confirm }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/switched off right now.*support@interviewnotes\.io/);
   });

   it("asks a signed-out visitor to sign in and sends nothing", () => {
      const r = rig(true);
      render(r.ui({ owner: null }));
      expect(screen.getByText(/Sign in to export, delete or withdraw/)).toBeInTheDocument();
      expect(r.api.requests).toHaveLength(0);
   });

   it("only ever sends the signed-in user's own token, with no cookies", async () => {
      const r = rig(true);
      render(r.ui());
      await screen.findByRole("button", { name: PRACTICE_WITHDRAW_COPY.action });
      expect(r.api.requests.every((request) => request.token !== null && request.path.startsWith("/me/practice"))).toBe(true);
   });
});
