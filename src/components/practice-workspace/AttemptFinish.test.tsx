import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPracticeClient } from "@/lib/practice-workspace/client";
import { createFakePracticeApi, failure, type FakeReply } from "@/lib/practice-workspace/fakeApi";
import { installFakeAttempts, type FakeAttempts } from "@/lib/practice-workspace/fakeAttempts";
import { installFakeDiagram } from "@/lib/practice-graph/fakeDiagram";
import type { Position, ReferenceOut, SubmitIn } from "@/lib/practice-workspace/types";

vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace }) }));
const shown: { engine: { hasPendingWork: boolean }; readOnly: boolean; variant: string }[] = [];
vi.mock("@/components/practice-graph/DiagramEditorLoader", async () => {
   const { createElement } = await import("react");
   return {
      DiagramEditorLoader: (props: { engine: { hasPendingWork: boolean }; variant: string; readOnly: boolean }) => {
         shown.push(props);
         return createElement("div", { "data-diagram-stub": props.variant, "data-readonly": String(props.readOnly) });
      },
   };
});

import { AttemptRoute } from "./AttemptRoute";
import { PracticeGate } from "./PracticeGate";

const API = "https://api.example.test";
const SD = "problem.llm-attribute-extraction-pipeline";

/** The real T09 submit rule as the fake answers it: the client's versions must be the server's, else 409 version_conflict. */
function serveSubmit(api: ReturnType<typeof createFakePracticeApi>, store: FakeAttempts, diagrams: ReturnType<typeof installFakeDiagram>) {
   const seen = new Map<string, FakeReply>();
   api.script("submit_attempt", (request) => {
      const key = request.headers["Idempotency-Key"];
      const done = seen.get(key);
      if (done) return done;
      const id = request.path.split("/")[4];
      const record = store.records.get(id)!;
      if (record.attempt.status !== "active") return failure("attempt_not_active", 409, { status: record.attempt.status });
      const body = request.body as SubmitIn;
      if (body.diagram_version !== diagrams.diagram(id).version) return failure("version_conflict", 409, { current_version: diagrams.diagram(id).version });
      for (const [position, version] of Object.entries(body.stage_versions)) {
         if (store.stage(id, position as Position).version !== version) return failure("version_conflict", 409, { current_version: store.stage(id, position as Position).version });
      }
      store.endAttempt(id, "submitted");
      const reply = { status: 200, body: { status: "submitted", submission_snapshot_id: "snapshot-1", evaluation: null } };
      seen.set(key, reply);
      return reply;
   });
}

const REFERENCE: ReferenceOut = {
   plan: "free",
   sections: [{ kind: "common_mistakes", title: "Common mistakes", body: [{ type: "markdown", text: "Storing the URL twice." }] }],
   rubric: [
      {
         dimension_id: "rubric-framing",
         title: "Does the candidate frame the problem?",
         stage: "frame",
         bar: [{ type: "markdown", text: "Senior bar text." }],
         strong_evidence: [{ type: "markdown", text: "They justify it." }],
         weak_evidence: [{ type: "markdown", text: "They assert it." }],
         self_review: null,
      },
   ],
};

async function rig() {
   shown.length = 0;
   const api = createFakePracticeApi();
   const store = installFakeAttempts(api, { consent: { requiredVersion: "v1", accepted: true } });
   const diagrams = installFakeDiagram(api, store);
   const token = api.signIn("ada");
   const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
   const created = await client.createAttempt({ content_id: SD, mode: "self", target_seniority: "senior" }, "finish-key-aaaaaaaaaa");
   if (created.status !== "ok") throw new Error("seed");
   const id = created.data.id;
   serveSubmit(api, store, diagrams);
   const view = render(
      <PracticeGate apiUrl={API} owner="ada" getAccessToken={async () => token} fetch={api.fetch}>
         <AttemptRoute attemptId={id} />
      </PracticeGate>
   );
   await screen.findByRole("heading", { level: 1 });
   return { api, store, diagrams, id, view, calls: (route: string) => api.requests.filter((r) => r.route === route) };
}

const dialog = () => screen.getByRole("dialog");
const finish = async (button = "Submit attempt") => {
   fireEvent.click(screen.getByRole("button", { name: "Finish" }));
   await screen.findByRole("dialog");
   if (button !== "Submit attempt") fireEvent.click(within(dialog()).getByRole("button", { name: button === "Reveal the reference" ? "Reveal the reference instead" : "Abandon this attempt" }));
   fireEvent.click(within(dialog()).getByRole("button", { name: button }));
};
const field = (label: string) => screen.getByLabelText(label);

afterEach(() => {
   vi.useRealTimers();
});

describe("submitting an attempt (T15)", () => {
   it("settles the unsaved stage text first, then submits the versions the server acknowledged, and opens the review", async () => {
      const r = await rig();
      await screen.findByText("", { selector: "[data-diagram-stub]" }).catch(() => undefined);
      fireEvent.change(field("Restate the task"), { target: { value: "my framing" } });
      await finish();
      await screen.findByRole("heading", { level: 1, name: "Your work and the reference" });
      expect(r.store.stage(r.id, "frame").fields.restate_task).toBe("my framing");
      const [submit] = r.calls("submit_attempt");
      expect((submit.body as SubmitIn).stage_versions.frame).toBe(r.store.stage(r.id, "frame").version);
      expect((submit.body as SubmitIn).diagram_version).toBe(r.diagrams.diagram(r.id).version);
      // The patch reached the server before the submit did.
      const order = r.api.requests.map((q) => q.route);
      expect(order.lastIndexOf("patch_stage")).toBeLessThan(order.indexOf("submit_attempt"));
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
   });

   it("never submits while the diagram is unread, and offers to load it", async () => {
      const r = await rig();
      r.api.script("get_diagram", () => failure("internal_error", 500));
      // A fresh route read whose diagram fails: the workspace is remounted by the conflict path below.
      r.view.unmount();
      render(
         <PracticeGate apiUrl={API} owner="ada" getAccessToken={async () => r.api.signIn("ada")} fetch={r.api.fetch}>
            <AttemptRoute attemptId={r.id} />
         </PracticeGate>
      );
      await screen.findByRole("heading", { level: 1 });
      await screen.findByRole("button", { name: "Finish" });
      await finish();
      await within(dialog()).findByText(/Your diagram could not be read, so nothing was sent/);
      expect(r.calls("submit_attempt")).toHaveLength(0);
      expect(within(dialog()).getByRole("button", { name: "Load the diagram" })).toBeInTheDocument();
   });

   it("keeps one idempotency key and body across an unknown outcome, so checking again cannot submit twice", async () => {
      const r = await rig();
      r.api.failNext("network");
      // The first write of the turn is the submit itself (nothing is pending), so the network failure lands on it.
      await finish();
      await within(dialog()).findByText(/We could not confirm the result/);
      expect(within(dialog()).getByRole("button", { name: "Submit attempt" })).toBeDisabled();
      fireEvent.click(within(dialog()).getByRole("button", { name: "Check again" }));
      await screen.findByRole("heading", { level: 1, name: "Your work and the reference" });
      const submits = r.calls("submit_attempt");
      expect(submits).toHaveLength(2);
      expect(submits[0].headers["Idempotency-Key"]).toBe(submits[1].headers["Idempotency-Key"]);
      expect(submits[0].body).toEqual(submits[1].body);
   });

   it("on a concurrent edit, submits nothing and offers to load the latest saved work", async () => {
      const r = await rig();
      r.store.writeElsewhere(r.id, "frame", { restate_task: "from the other device" });
      await finish();
      await within(dialog()).findByText(/changed in another tab or device/);
      expect(r.store.records.get(r.id)!.attempt.status).toBe("active");
      fireEvent.click(within(dialog()).getByRole("button", { name: "Load the latest saved work" }));
      await screen.findByDisplayValue("from the other device");
   });

   it("halts every engine after the submit: a late edit sends nothing and the diagram is read-only", async () => {
      const r = await rig();
      await finish();
      await screen.findByRole("heading", { level: 1, name: "Your work and the reference" });
      const patches = r.calls("patch_stage").length;
      const puts = r.calls("put_diagram").length;
      await act(async () => {
         await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(r.calls("patch_stage")).toHaveLength(patches);
      expect(r.calls("put_diagram")).toHaveLength(puts);
      const review = shown.filter((s) => s.variant === "split").at(-1);
      expect(review?.readOnly).toBe(true);
   });

   it("treats an attempt already ended elsewhere as ended, reading its canonical status", async () => {
      const r = await rig();
      r.store.endAttempt(r.id, "ended_by_reveal");
      await finish();
      await screen.findByText("Ended by revealing the reference");
   });
});

describe("revealing and abandoning (T15)", () => {
   it("reveals only after an explicit confirmation, then shows the reference and keeps self-review allowed", async () => {
      const r = await rig();
      r.api.script("reveal_attempt", (request) => {
         const id = request.path.split("/")[4];
         expect(request.body).toEqual({ confirm: true });
         r.store.endAttempt(id, "ended_by_reveal");
         return { status: 200, body: { ...r.store.records.get(id)!.attempt } };
      });
      r.api.script("get_reference", () => ({ status: 200, body: REFERENCE }));
      fireEvent.click(screen.getByRole("button", { name: "Finish" }));
      await screen.findByRole("dialog");
      fireEvent.click(within(dialog()).getByRole("button", { name: "Reveal the reference instead" }));
      expect(r.calls("reveal_attempt")).toHaveLength(0);
      fireEvent.click(within(dialog()).getByRole("button", { name: "Reveal the reference" }));
      await screen.findByText("Storing the URL twice.");
      fireEvent.click(screen.getByRole("button", { name: /Dimension 1/ }));
      expect(await screen.findByRole("radio", { name: "Met" })).toBeEnabled();
   });

   it("abandons without deleting, and the attempt reads as abandoned", async () => {
      const r = await rig();
      r.api.script("abandon_attempt", (request) => {
         const id = request.path.split("/")[4];
         r.store.endAttempt(id, "abandoned");
         return { status: 200, body: { ...r.store.records.get(id)!.attempt } };
      });
      await finish("Abandon attempt");
      await screen.findByText("Abandoned");
      expect(r.calls("delete_attempt")).toHaveLength(0);
      expect(r.calls("get_reference")).toHaveLength(0); // never read for an attempt that was not submitted or revealed
   });
});
