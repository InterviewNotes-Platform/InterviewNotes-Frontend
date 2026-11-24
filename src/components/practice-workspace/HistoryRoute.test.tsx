import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createPracticeClient } from "@/lib/practice-workspace/client";
import { createFakePracticeApi, failure } from "@/lib/practice-workspace/fakeApi";
import { installFakeAttempts } from "@/lib/practice-workspace/fakeAttempts";

vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});

import { HistoryRoute } from "./HistoryRoute";
import { PracticeGate } from "./PracticeGate";

const API = "https://api.example.test";

async function rig() {
   const api = createFakePracticeApi();
   const store = installFakeAttempts(api, { consent: { requiredVersion: "v1", accepted: true } });
   const ada = api.signIn("ada");
   const bob = api.signIn("bob");
   const client = (token: string) => createPracticeClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
   const make = async (token: string, contentId: string, seniority: "mid" | "senior" | "staff", key: string) => {
      const result = await client(token).createAttempt({ content_id: contentId, mode: "self", target_seniority: seniority }, key);
      if (result.status !== "ok") throw new Error("seed");
      return result.data.id;
   };
   const ui = (token: string, owner: string) => (
      <PracticeGate apiUrl={API} owner={owner} getAccessToken={async () => token} fetch={api.fetch}>
         <HistoryRoute />
      </PracticeGate>
   );
   return { api, store, ada, bob, make, ui };
}

describe("the attempt history", () => {
   it("says it is loading, then shows an empty state with a way to the Problems", async () => {
      const r = await rig();
      render(r.ui(r.ada, "ada"));
      await screen.findByText("Loading your attempts…");
      await screen.findByText(/You have not started a practice attempt yet/);
      expect(screen.getByRole("link", { name: "Browse Problems" })).toHaveAttribute("href", "/practice");
   });

   it("lists active attempts to resume and ended ones to open, each link without prefetch", async () => {
      const r = await rig();
      const first = await r.make(r.ada, "problem.llm-attribute-extraction-pipeline", "senior", "history-key-aaaaaaa1");
      const second = await r.make(r.ada, "problem.incident-handoff-summary", "mid", "history-key-aaaaaaa2");
      r.store.endAttempt(second, "ended_by_reveal");
      render(r.ui(r.ada, "ada"));
      const active = await screen.findByRole("region", { name: "In progress" }).catch(() => null);
      void active;
      const resume = await screen.findByRole("link", { name: /Resume/ });
      expect(resume).toHaveAttribute("href", `/practice/attempts/${first}`);
      expect(resume).toHaveAttribute("data-prefetch", "false");
      const open = screen.getByRole("link", { name: /^Open/ });
      expect(open).toHaveAttribute("href", `/practice/attempts/${second}`);
      expect(open).toHaveAttribute("data-prefetch", "false");
      expect(screen.getByText(/Ended, reference revealed · Mid bar/)).toBeInTheDocument();
      expect(screen.getByText(/In progress · Senior bar · 0 of 6 stages done/)).toBeInTheDocument();
      const back = screen.getAllByRole("link", { name: /The Problem/ });
      expect(back.map((link) => link.getAttribute("href"))).toEqual(["/problems/llm-attribute-extraction-pipeline", "/problems/incident-handoff-summary"]);
   });

   it("holds no stage text and puts nothing private in a link", async () => {
      const r = await rig();
      const id = await r.make(r.ada, "problem.llm-attribute-extraction-pipeline", "senior", "history-key-aaaaaaa3");
      r.store.writeElsewhere(id, "frame", { restate_task: "PRIVATE-STAGE-TEXT" });
      render(r.ui(r.ada, "ada"));
      await screen.findByRole("link", { name: /Resume/ });
      expect(document.body.textContent).not.toContain("PRIVATE-STAGE-TEXT");
      for (const link of screen.getAllByRole("link")) expect(link.getAttribute("href")).not.toMatch(/PRIVATE|\?|#/);
   });

   it("shows only the signed-in learner's attempts", async () => {
      const r = await rig();
      await r.make(r.ada, "problem.llm-attribute-extraction-pipeline", "senior", "history-key-aaaaaaa4");
      await r.make(r.bob, "problem.incident-handoff-summary", "mid", "history-key-aaaaaaa5");
      render(r.ui(r.bob, "bob"));
      await screen.findAllByText(/Incident handoff summary/);
      expect(screen.queryByText(/Llm attribute extraction pipeline/)).not.toBeInTheDocument();
   });

   it("offers a retry after a failure and recovers", async () => {
      const r = await rig();
      await r.make(r.ada, "problem.llm-attribute-extraction-pipeline", "senior", "history-key-aaaaaaa6");
      const real = r.api.fetch;
      let failed = false;
      const flaky: typeof fetch = async (input, init) => {
         if (!failed && String(input).includes("/me/practice/attempts")) {
            failed = true;
            throw new TypeError("offline");
         }
         return real(input, init);
      };
      render(
         <PracticeGate apiUrl={API} owner="ada" getAccessToken={async () => r.ada} fetch={flaky}>
            <HistoryRoute />
         </PracticeGate>
      );
      await screen.findByText("We could not load your attempts. Nothing was changed.");
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await screen.findByRole("link", { name: /Resume/ });
   });

   it("does not trust a malformed list", async () => {
      const r = await rig();
      r.api.script("list_attempts", { status: 200, body: { items: [{ id: 1 }], next_cursor: null } });
      render(r.ui(r.ada, "ada"));
      await screen.findByText("We could not load your attempts. Nothing was changed.");
      expect(screen.queryByRole("link", { name: /Resume/ })).not.toBeInTheDocument();
   });

   it("asks a learner whose session ended to sign in, and offers no retry", async () => {
      const r = await rig();
      r.api.script("list_attempts", () => failure("unauthenticated", 401));
      render(r.ui(r.ada, "ada"));
      await screen.findByText("Your session has ended. Sign in again to see your attempts.");
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
   });

   it("pages without repeating an attempt", async () => {
      const r = await rig();
      const a = await r.make(r.ada, "problem.llm-attribute-extraction-pipeline", "senior", "history-key-aaaaaaa7");
      const b = await r.make(r.ada, "problem.incident-handoff-summary", "mid", "history-key-aaaaaaa8");
      const pages: Record<string, unknown> = {};
      r.api.script("list_attempts", (request) => {
         const item = (id: string, content: string) => ({ id, content_id: content, mode: "self", target_seniority: "senior", status: "active", stages_done: 0, stages_total: 6, updated_at: "2026-11-24T10:00:00Z", submitted_at: null });
         pages.last = request.query.cursor;
         return request.query.cursor ? { status: 200, body: { items: [item(a, "problem.llm-attribute-extraction-pipeline"), item(b, "problem.incident-handoff-summary")], next_cursor: null } } : { status: 200, body: { items: [item(a, "problem.llm-attribute-extraction-pipeline")], next_cursor: "next-page" } };
      });
      render(r.ui(r.ada, "ada"));
      await screen.findByRole("button", { name: "Show more" });
      fireEvent.click(screen.getByRole("button", { name: "Show more" }));
      await screen.findAllByText(/Incident handoff summary/);
      expect(screen.getAllByRole("link", { name: /Resume/ })).toHaveLength(2);
      expect(pages.last).toBe("next-page");
      expect(within(document.body).queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
   });
});
