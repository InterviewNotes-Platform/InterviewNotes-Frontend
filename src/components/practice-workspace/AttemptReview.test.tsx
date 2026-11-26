import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createPracticeClient } from "@/lib/practice-workspace/client";
import { createFakePracticeApi, failure } from "@/lib/practice-workspace/fakeApi";
import { installFakeAttempts } from "@/lib/practice-workspace/fakeAttempts";
import { installFakeDiagram } from "@/lib/practice-graph/fakeDiagram";
import type { AttemptStatus, ReferenceOut, SelfReviewIn } from "@/lib/practice-workspace/types";

vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/practice-graph/DiagramEditorLoader", async () => {
   const { createElement } = await import("react");
   return { DiagramEditorLoader: (props: { readOnly: boolean }) => createElement("div", { "data-diagram-stub": "review", "data-readonly": String(props.readOnly) }) };
});

import { AttemptRoute } from "./AttemptRoute";
import { AttemptReview } from "./AttemptReview";
import { PracticeGate } from "./PracticeGate";
import { PracticeSessionContext } from "./practiceSession";

const API = "https://api.example.test";
const SD = "problem.llm-attribute-extraction-pipeline";
const DIM = (over: Partial<ReferenceOut["rubric"][number]> = {}): ReferenceOut["rubric"][number] => ({
   dimension_id: "rubric-framing",
   title: "Does the candidate frame the problem?",
   stage: "frame",
   bar: [{ type: "markdown", text: "Senior bar text." }],
   strong_evidence: [{ type: "markdown", text: "They justify it." }],
   weak_evidence: [{ type: "markdown", text: "They assert it." }],
   self_review: null,
   ...over,
});

/** Holds every self-review PUT until the test releases it, to act while a save is pending. */
function holdSelfReviewPuts(inner: typeof fetch) {
   const held: (() => void)[] = [];
   const fetchImpl: typeof fetch = async (input, init) => {
      if (init?.method === "PUT" && String(input).includes("/self-review/")) await new Promise<void>((release) => held.push(release));
      return inner(input, init);
   };
   return { fetchImpl, release: () => held.splice(0).forEach((go) => go()), pending: () => held.length };
}

async function rig(status: Exclude<AttemptStatus, "active">, reference?: (calls: number) => { status: number; body?: unknown }, wrap: (inner: typeof fetch) => typeof fetch = (inner) => inner) {
   const api = createFakePracticeApi();
   const store = installFakeAttempts(api, { consent: { requiredVersion: "v1", accepted: true } });
   installFakeDiagram(api, store);
   const token = api.signIn("ada");
   const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
   const created = await client.createAttempt({ content_id: SD, mode: "self", target_seniority: "senior" }, "review-key-aaaaaaaaaa");
   if (created.status !== "ok") throw new Error("seed");
   const id = created.data.id;
   store.writeElsewhere(id, "frame", { restate_task: "my framing", model: "notes under an unlisted sub-prompt" });
   store.endAttempt(id, status);
   let n = 0;
   if (reference) api.script("get_reference", () => reference(++n));
   render(
      <PracticeGate apiUrl={API} owner="ada" getAccessToken={async () => token} fetch={wrap(api.fetch)}>
         <AttemptRoute attemptId={id} />
      </PracticeGate>
   );
   await screen.findByRole("heading", { level: 1 });
   return { api, store, id, client, calls: (route: string) => api.requests.filter((r) => r.route === route) };
}

const ok = (body: Partial<ReferenceOut> = {}) => () => ({ status: 200, body: { plan: "free", sections: [], rubric: [], ...body } });

describe("the review of an ended attempt (T15, Design B)", () => {
   it("compares the saved work with the entitled reference, rendering blocks as text only", async () => {
      const r = await rig("submitted", ok({ sections: [{ kind: "reference_design", title: "Reference design", body: [{ type: "markdown", text: "<img src=x onerror=alert(1)> **Keep** state" }] }] }));
      expect((await screen.findByText("Keep")).tagName).toBe("STRONG"); // "/state/" would also match "Restate the task"
      expect(document.querySelector("img")).toBeNull();
      expect(screen.getByText("my framing")).toBeInTheDocument();
      // Saved text under a sub-prompt that is not listed stays visible, under a neutral label.
      expect(screen.getByText("notes under an unlisted sub-prompt")).toBeInTheDocument();
      expect(screen.getByText("Other saved notes")).toBeInTheDocument();
      expect(document.querySelector("[data-diagram-stub]")).toHaveAttribute("data-readonly", "true");
      expect(r.calls("patch_stage")).toHaveLength(0);
   });

   it("says there is nothing to compare for an empty Free answer, and never counts what is withheld", async () => {
      await rig("submitted", ok());
      await screen.findByText("There is no reference to compare with on your plan for this Problem.");
      const reference = screen.getByRole("region", { name: "Reference" });
      expect(reference.textContent).not.toMatch(/locked|withheld|\d+ more|premium/i);
   });

   it("keeps the submission and offers a retry when the reference cannot be read", async () => {
      await rig("submitted", (n) => (n === 1 ? failure("entitlement_unavailable", 503, { retry_after_seconds: 5 }) : ok({ sections: [{ kind: "common_mistakes", title: "Common mistakes", body: [{ type: "markdown", text: "Mistake text" }] }] })()));
      await screen.findByText(/We could not check your plan just now/);
      expect(screen.getByText("Submitted")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await screen.findByText("Mistake text");
   });

   it("shows a withdrawn Problem's attempt with the learner's work and no reference", async () => {
      await rig("submitted", () => failure("content_withdrawn", 410));
      await screen.findByText(/This Problem has been withdrawn/);
      expect(screen.getByText("my framing")).toBeInTheDocument();
   });

   it("never reads the reference for an abandoned attempt", async () => {
      const r = await rig("abandoned", ok());
      await screen.findByText(/An abandoned attempt has no reference comparison/);
      expect(r.calls("get_reference")).toHaveLength(0);
   });

   it("saves a mark with compare-and-set and resolves a conflict only by the learner's choice", async () => {
      const r = await rig("submitted", ok({ rubric: [DIM()] }));
      const puts: SelfReviewIn[] = [];
      r.api.script("put_self_review", (request) => {
         const body = request.body as SelfReviewIn;
         puts.push(body);
         if (puts.length === 2) return failure("version_conflict", 409, { current_version: 3 });
         return { status: 200, body: { dimension_id: "rubric-framing", mark: body.mark, note: body.note ?? null, version: body.version + 1 } };
      });
      fireEvent.click(await screen.findByRole("button", { name: /Dimension 1/ }));
      expect(screen.getByText("Senior bar text.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("radio", { name: "Partly" }));
      await screen.findByText("Saved");
      fireEvent.change(screen.getByLabelText(/Your note/), { target: { value: "my note" } });
      fireEvent.click(screen.getByRole("button", { name: "Save note" }));
      await screen.findByText(/changed in another tab or device/);
      fireEvent.click(screen.getByRole("button", { name: "Keep my mark and note" }));
      await screen.findByText("Saved");
      expect(puts.map((p) => [p.version, p.mark, p.note])).toEqual([
         [0, "partly", null],
         [1, "partly", "my note"],
         [3, "partly", "my note"],
      ]);
      fireEvent.click(screen.getByRole("button", { name: "Summary" }));
      const summary = await screen.findByRole("region", { name: "Your self-review" });
      expect(within(summary).getByText("Partly")).toBeInTheDocument();
      expect(summary.textContent).not.toMatch(/\d+\s*(\/|of|%)\s*\d*/i); // no score, ratio or percentage
      expect(summary.textContent).toMatch(/No score is calculated/);
   });

   it("lists the hints and clarification answers opened, and the reveal, with the target seniority", async () => {
      await rig("ended_by_reveal", ok());
      fireEvent.click(await screen.findByRole("button", { name: "Summary" }));
      expect(await screen.findByText("You revealed the reference before submitting.")).toBeInTheDocument();
      expect(screen.getByText(/Target: Senior bar/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Practise again" })).toHaveAttribute("href", "/problems/llm-attribute-extraction-pipeline");
   });

   describe("guided self-review keeps the learner's notes between steps (v2)", () => {
      const TWO = [DIM(), DIM({ dimension_id: "rubric-tradeoffs", title: "Does the candidate weigh trade-offs?", stage: null })];
      const echo = (puts: SelfReviewIn[]) => (request: { body?: unknown }) => {
         const body = request.body as SelfReviewIn;
         puts.push(body);
         return { status: 200, body: { dimension_id: "rubric-framing", mark: body.mark, note: body.note ?? null, version: body.version + 1 } };
      };
      const note = () => screen.getByLabelText(/Your note/) as HTMLTextAreaElement;

      it("keeps an unsaved note when the learner moves to another dimension and back, and says it is not saved", async () => {
         const r = await rig("submitted", ok({ rubric: TWO }));
         const puts: SelfReviewIn[] = [];
         r.api.script("put_self_review", echo(puts));
         fireEvent.click(await screen.findByRole("button", { name: /Dimension 1/ }));
         fireEvent.click(screen.getByRole("radio", { name: "Partly" }));
         await screen.findByText("Saved");
         fireEvent.change(note(), { target: { value: "draft only" } });
         fireEvent.click(screen.getByRole("button", { name: "Next" }));
         await screen.findByRole("heading", { level: 1, name: "Does the candidate weigh trade-offs?" });
         expect(note().value).toBe("");
         expect(screen.getByRole("button", { name: /Dimension 1, marked Partly, not saved yet/ })).toBeInTheDocument();
         fireEvent.click(screen.getByRole("button", { name: "Summary" }));
         const summary = await screen.findByRole("region", { name: "Your self-review" });
         expect(summary.textContent).toMatch(/Partly · Does the candidate frame the problem\? · Not saved yet/);
         fireEvent.click(screen.getByRole("button", { name: /Dimension 1/ }));
         await screen.findByRole("heading", { level: 1, name: "Does the candidate frame the problem?" });
         expect(note().value).toBe("draft only");
         expect(screen.getByText("Note not saved yet")).toBeInTheDocument();
         expect(screen.getByRole("radio", { name: "Partly" })).toBeChecked();
         expect(puts).toHaveLength(1); // moving between steps never saved or discarded anything by itself
      });

      it("lands a save that finishes after the learner left the step, without overwriting what they typed since", async () => {
         let gate!: ReturnType<typeof holdSelfReviewPuts>;
         const r = await rig("submitted", ok({ rubric: TWO }), (inner) => (gate = holdSelfReviewPuts(inner)).fetchImpl);
         const puts: SelfReviewIn[] = [];
         r.api.script("put_self_review", echo(puts));
         fireEvent.click(await screen.findByRole("button", { name: /Dimension 1/ }));
         fireEvent.click(screen.getByRole("radio", { name: "Partly" }));
         await waitFor(() => expect(gate.pending()).toBe(1));
         act(() => gate.release());
         await screen.findByText("Saved");
         fireEvent.change(note(), { target: { value: "first" } });
         fireEvent.click(screen.getByRole("button", { name: "Save note" }));
         await waitFor(() => expect(gate.pending()).toBe(1));
         fireEvent.change(note(), { target: { value: "first and more" } }); // typed while the save is pending
         fireEvent.click(screen.getByRole("button", { name: "Next" }));
         await screen.findByRole("heading", { level: 1, name: "Does the candidate weigh trade-offs?" });
         act(() => gate.release());
         await waitFor(() => expect(puts).toHaveLength(2));
         fireEvent.click(screen.getByRole("button", { name: "Back" }));
         await screen.findByRole("heading", { level: 1, name: "Does the candidate frame the problem?" });
         expect(note().value).toBe("first and more"); // the late reply never overwrote newer input
         expect(screen.getByText("Note not saved yet")).toBeInTheDocument();
         fireEvent.click(screen.getByRole("button", { name: "Save note" }));
         await waitFor(() => expect(gate.pending()).toBe(1));
         act(() => gate.release());
         await screen.findByText("Saved");
         // The reply that landed after leaving the step moved the version on, so no conflict is created.
         expect(puts.map((p) => [p.version, p.note])).toEqual([
            [0, null],
            [1, "first"],
            [2, "first and more"],
         ]);
      });

      it("keeps a note whose save failed while the learner moves away, and retries it with the same version", async () => {
         const r = await rig("submitted", ok({ rubric: TWO }));
         const puts: SelfReviewIn[] = [];
         r.api.script("put_self_review", echo(puts));
         fireEvent.click(await screen.findByRole("button", { name: /Dimension 1/ }));
         fireEvent.click(screen.getByRole("radio", { name: "Met" }));
         await screen.findByText("Saved");
         fireEvent.change(note(), { target: { value: "kept after a failure" } });
         r.api.failNext("network");
         fireEvent.click(screen.getByRole("button", { name: "Save note" }));
         await screen.findByText(/Check your connection/);
         fireEvent.click(screen.getByRole("button", { name: "Next" }));
         await screen.findByRole("heading", { level: 1, name: "Does the candidate weigh trade-offs?" });
         fireEvent.click(screen.getByRole("button", { name: "Back" }));
         await screen.findByRole("heading", { level: 1, name: "Does the candidate frame the problem?" });
         expect(note().value).toBe("kept after a failure");
         expect(screen.getByText(/Check your connection/)).toBeInTheDocument();
         fireEvent.click(screen.getByRole("button", { name: "Try again" }));
         await screen.findByText("Saved");
         expect(puts.map((p) => [p.version, p.mark, p.note])).toEqual([
            [0, "met", null],
            [1, "met", "kept after a failure"],
         ]);
      });

      it("keeps the other dimensions' drafts when the learner loads another version of one", async () => {
         const r = await rig("submitted", ok({ rubric: TWO }));
         r.api.script("put_self_review", () => failure("version_conflict", 409, { current_version: 4 }));
         fireEvent.click(await screen.findByRole("button", { name: /Dimension 2/ }));
         fireEvent.change(note(), { target: { value: "trade-off draft" } });
         fireEvent.click(screen.getByRole("button", { name: /Dimension 1/ }));
         await screen.findByRole("heading", { level: 1, name: "Does the candidate frame the problem?" });
         fireEvent.click(screen.getByRole("radio", { name: "Partly" }));
         await screen.findByText(/changed in another tab or device/);
         fireEvent.click(screen.getByRole("button", { name: "Load the other version" }));
         await waitFor(() => expect(r.calls("get_reference")).toHaveLength(2));
         fireEvent.click(await screen.findByRole("button", { name: /Dimension 1/ }));
         expect(screen.getByRole("radio", { name: "Partly" })).not.toBeChecked(); // the learner chose to drop this one
         fireEvent.click(screen.getByRole("button", { name: /Dimension 2/ }));
         expect(note().value).toBe("trade-off draft");
      });

      it("starts from nothing for another signed-in user: no private draft carries over", async () => {
         const api = createFakePracticeApi();
         const store = installFakeAttempts(api, { consent: { requiredVersion: "v1", accepted: true } });
         installFakeDiagram(api, store);
         const token = api.signIn("ada");
         const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
         const created = await client.createAttempt({ content_id: SD, mode: "self", target_seniority: "senior" }, "review-key-bbbbbbbbbb");
         if (created.status !== "ok") throw new Error("seed");
         store.endAttempt(created.data.id, "submitted");
         api.script("get_reference", ok({ rubric: TWO }));
         const detail = await client.getAttempt(created.data.id);
         if (detail.status !== "ok") throw new Error("seed");
         const signal = new AbortController().signal;
         const view = (owner: string) => (
            <PracticeSessionContext.Provider value={{ client, signal, owner }}>
               <AttemptReview detail={detail.data} />
            </PracticeSessionContext.Provider>
         );
         const { rerender } = render(view("ada"));
         fireEvent.click(await screen.findByRole("button", { name: /Dimension 1/ }));
         fireEvent.change(note(), { target: { value: "ada's private note" } });
         rerender(view("bob"));
         expect(note().value).toBe("");
         expect(document.body.textContent).not.toContain("ada's private note");
      });
   });
});
