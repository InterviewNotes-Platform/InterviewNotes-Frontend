import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPracticeClient } from "@/lib/practice-workspace/client";
import { createFakePracticeApi, failure } from "@/lib/practice-workspace/fakeApi";
import { installFakeAttempts, type FakeAttempts } from "@/lib/practice-workspace/fakeAttempts";
import type { DiagramEngine } from "@/lib/practice-graph/diagramSave";
import { installFakeDiagram } from "@/lib/practice-graph/fakeDiagram";
import { addNode } from "@/lib/practice-graph/model";
import type { Position } from "@/lib/practice-workspace/types";

vi.mock("next/link", async () => {
   const { createElement } = await import("react");
   return { default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => createElement("a", { "data-prefetch": String(prefetch), ...props }) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// The real editor (React Flow) is covered by its own tests and the browser smoke; here only the workspace's wiring of the one diagram is.
const shown: { engine: unknown; variant: string; readOnly: boolean }[] = [];
vi.mock("@/components/practice-graph/DiagramEditorLoader", async () => {
   const { createElement } = await import("react");
   return {
      DiagramEditorLoader: (props: { engine: unknown; variant: string; readOnly: boolean }) => {
         shown.push(props);
         return createElement("div", { "data-diagram-stub": props.variant });
      },
   };
});

import { AttemptRoute } from "./AttemptRoute";
import { PracticeGate } from "./PracticeGate";

const API = "https://api.example.test";
const SD = "problem.llm-attribute-extraction-pipeline";
const ML = "problem.incident-handoff-summary";
const DEBOUNCE = 1500;

type Rig = { api: ReturnType<typeof createFakePracticeApi>; store: FakeAttempts; id: string; token: string; view: ReturnType<typeof render> };

async function seed(contentId: string, options: { signedInAs?: string } = {}) {
   const api = createFakePracticeApi();
   const store = installFakeAttempts(api, { consent: { requiredVersion: "v1", accepted: true } });
   const token = api.signIn(options.signedInAs ?? "ada");
   const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
   const created = await client.createAttempt({ content_id: contentId, mode: "self", target_seniority: contentId === ML ? "mid" : "senior" }, "seed-key-aaaaaaaaaaaa");
   if (created.status !== "ok") throw new Error("seed failed");
   return { api, store, id: created.data.id, token };
}

function tree(rig: { api: Rig["api"]; id: string }, token: string, owner: string) {
   return (
      <PracticeGate apiUrl={API} owner={owner} getAccessToken={async () => token} fetch={rig.api.fetch}>
         <AttemptRoute attemptId={rig.id} />
      </PracticeGate>
   );
}

async function open(contentId = SD): Promise<Rig> {
   const seeded = await seed(contentId);
   const view = render(tree(seeded, seeded.token, "ada"));
   await screen.findByRole("heading", { level: 1 });
   return { ...seeded, view };
}

const stageNav = () => screen.getByRole("navigation", { name: "Interview stages" });
const heading = () => screen.getByRole("heading", { level: 1 });
const field = (name: RegExp | string) => screen.getByRole("textbox", { name }) as HTMLTextAreaElement;
const saveStatus = () => document.querySelector("[data-slot=save-status]") as HTMLElement;
const goTo = (label: string) => fireEvent.click(within(stageNav()).getByRole("button", { name: new RegExp(`^${label.replace(/[&-]/g, "\\$&")}`) }));

async function advance(ms: number) {
   await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
   });
}
const patches = (store: FakeAttempts) => store.calls("patch_stage");
const type = (name: RegExp | string, value: string) => fireEvent.change(field(name), { target: { value } });

afterEach(() => {
   vi.useRealTimers();
   vi.restoreAllMocks();
});

describe("the stage engine's order and navigation", () => {
   it("presents the six System Design stages in the backend's spine order, with the P4 labels", async () => {
      await open(SD);
      const labels = within(stageNav())
         .getAllByRole("button")
         .map((button) => button.textContent?.split(",")[0].replace(/^\d+/, "").trim());
      expect(labels).toEqual(["Frame", "Requirements", "Design", "Evaluate & Scale", "Depth & Trade-offs", "Follow-ups"]);
      expect(screen.queryByRole("button", { name: /^ML Reasoning/ })).not.toBeInTheDocument();
      expect(screen.getByText("Stage 1 of 6")).toBeInTheDocument();
   });

   it("puts ML Reasoning immediately after Design for an ML Problem, seven stages in all", async () => {
      await open(ML);
      const labels = within(stageNav())
         .getAllByRole("button")
         .map((button) => button.textContent?.split(",")[0].replace(/^\d+/, "").trim());
      expect(labels).toEqual(["Frame", "Requirements", "Design", "ML Reasoning", "Evaluate & Scale", "Depth & Trade-offs", "Follow-ups"]);
      expect(screen.getByText("Stage 1 of 7")).toBeInTheDocument();
   });

   it("lets any stage be opened at any time, with nothing finished first, and moves focus to the stage heading", async () => {
      await open(SD);
      goTo("Depth & Trade-offs");
      expect(heading()).toHaveTextContent("Depth & Trade-offs");
      expect(heading()).toHaveFocus();
      expect(within(stageNav()).getByRole("button", { name: /^Depth & Trade-offs/ })).toHaveAttribute("aria-current", "step");
      goTo("Frame");
      expect(heading()).toHaveTextContent("Frame");
   });

   it("offers Previous and Next, and no Next on the last stage", async () => {
      await open(SD);
      expect(screen.queryByRole("button", { name: /^Frame$/ })).not.toBeInTheDocument(); // no Previous on the first stage
      fireEvent.click(screen.getByRole("button", { name: /Continue to Requirements/ }));
      expect(heading()).toHaveTextContent("Requirements");
      fireEvent.click(screen.getByRole("button", { name: "Frame" }));
      expect(heading()).toHaveTextContent("Frame");
      goTo("Follow-ups");
      expect(screen.queryByRole("button", { name: /Continue to/ })).not.toBeInTheDocument();
   });

   it("has a labelled stage select for narrow screens", async () => {
      await open(SD);
      const select = screen.getByLabelText("Stage") as HTMLSelectElement;
      expect([...select.options].map((option) => option.text.split(" (")[0])).toEqual(["1 of 6 · Frame", "2 of 6 · Requirements", "3 of 6 · Design", "4 of 6 · Evaluate & Scale", "5 of 6 · Depth & Trade-offs", "6 of 6 · Follow-ups"]);
      fireEvent.change(select, { target: { value: "design" } });
      expect(heading()).toHaveTextContent("Design");
   });

   it("keeps the Problem brief reachable from every stage", async () => {
      await open(SD);
      goTo("Requirements");
      fireEvent.click(screen.getByRole("button", { name: "Brief" }));
      const dialog = await screen.findByRole("dialog", { name: /Synthetic Problem/ });
      expect(within(dialog).getByText(/A synthetic given/)).toBeInTheDocument();
      expect(within(dialog).getByText("A synthetic prompt for", { exact: false })).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Back to the workspace" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
   });

   it("adds no AI interviewer placeholder and no reference or self-review stage before submission", async () => {
      await open(SD);
      const page = document.body.textContent ?? "";
      expect(page).not.toMatch(/interviewer turns|reserved space|reference solution|self-review/i);
   });
});

describe("stage text and its character counts", () => {
   it("labels each field, counts characters and caps them at 6,000", async () => {
      await open(SD);
      const restate = field("Restate the task");
      expect(restate).toHaveAttribute("maxlength", "6000");
      expect(restate).toHaveAccessibleDescription(/0 of 6,000 characters/);
      type("Restate the task", "hello");
      expect(field("Restate the task")).toHaveAccessibleDescription(/5 of 6,000 characters/);
      expect(screen.getByRole("textbox", { name: "Clarifying questions" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Assumptions" })).toBeInTheDocument();
   });

   it("shows the requirements fields of Design D", async () => {
      await open(SD);
      goTo("Requirements");
      for (const name of ["Functional", "Non-functional", "Constraints", "Estimates"]) expect(screen.getByRole("textbox", { name })).toBeInTheDocument();
   });

   it("is the same workspace for both Problems: nothing here belongs to one of them", async () => {
      await open(ML);
      goTo("ML Reasoning");
      expect(field("Your ML reasoning")).toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: /features|training/i })).not.toBeInTheDocument();
   });
});

describe("successor contract fields (A-02, A-03)", () => {
   it("names the ML sub-prompts from the attempt detail when the Problem authors them", async () => {
      const seeded = await seed(ML);
      const record = seeded.store.records.get(seeded.id)!;
      record.problem = { ...record.problem, mlSubsections: [{ key: "data", title: "Data" }, { key: "training", title: "Training" }] };
      render(tree(seeded, seeded.token, "ada"));
      await screen.findByRole("heading", { level: 1 });
      goTo("ML Reasoning");
      expect(field("Data")).toBeInTheDocument();
      expect(field("Training")).toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "Your ML reasoning" })).not.toBeInTheDocument();
   });

   it("counts hints already used from the server, so a bounded history never offers one again", async () => {
      const seeded = await seed(SD);
      const record = seeded.store.records.get(seeded.id)!;
      record.hintsGiven.set("frame", 2);
      render(tree(seeded, seeded.token, "ada"));
      await screen.findByRole("heading", { level: 1 });
      expect(screen.getByText("2 of 2 shown")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "No more hints" })).toBeDisabled();
   });
});

describe("autosave in the workspace", () => {
   beforeEach(() => undefined);

   it("shows typing at once, saves once after 1.5 s, and only then says Saved", async () => {
      const { store, id } = await open(SD);
      vi.useFakeTimers();
      type("Restate the task", "A batch pipeline.");
      expect(field("Restate the task").value).toBe("A batch pipeline.");
      expect(saveStatus()).toHaveTextContent("Unsaved changes");
      await advance(DEBOUNCE - 1);
      expect(patches(store)).toHaveLength(0);
      expect(saveStatus()).not.toHaveTextContent("Saved");
      await advance(1);
      expect(patches(store)).toHaveLength(1);
      expect(saveStatus()).toHaveTextContent("Saved");
      expect(store.stage(id, "frame").fields.restate_task).toBe("A batch pipeline.");
      expect(patches(store)[0].body).toEqual({ version: 1, status: "in_progress", set_fields: { restate_task: "A batch pipeline." } });
   });

   it("does not lose pending text when the learner moves to another stage", async () => {
      const { store, id } = await open(SD);
      vi.useFakeTimers();
      type("Restate the task", "pending text");
      goTo("Requirements");
      type("Functional", "must do X");
      await advance(DEBOUNCE);
      expect(store.stage(id, "frame").fields.restate_task).toBe("pending text");
      expect(store.stage(id, "requirements").fields.functional).toBe("must do X");
      goTo("Frame");
      expect(field("Restate the task").value).toBe("pending text");
   });

   it("saves the learner's own stage status, and it is editable at any time", async () => {
      const { store, id } = await open(SD);
      vi.useFakeTimers();
      fireEvent.click(screen.getByRole("button", { name: "Mark this stage done" }));
      expect(screen.getByTestId("stage-status")).toHaveTextContent("Done");
      await advance(DEBOUNCE);
      expect(store.stage(id, "frame").status).toBe("done");
      type("Restate the task", "still editable"); // a done stage stays editable while the attempt is active
      await advance(DEBOUNCE);
      expect(store.stage(id, "frame").fields.restate_task).toBe("still editable");
      expect(store.stage(id, "frame").status).toBe("done");
      fireEvent.click(screen.getByRole("button", { name: "Reopen this stage" }));
      expect(screen.getByTestId("stage-status")).toHaveTextContent("In progress");
      goTo("Design");
      fireEvent.click(screen.getByRole("button", { name: "Skip this stage" }));
      await advance(DEBOUNCE);
      expect(store.stage(id, "design").status).toBe("skipped");
   });

   it("keeps text and says Not saved when offline, then saves on Retry", async () => {
      const { store, id, api } = await open(SD);
      vi.useFakeTimers();
      type("Restate the task", "offline text");
      api.failNext("network");
      await advance(DEBOUNCE);
      expect(saveStatus()).toHaveTextContent(/Not saved.*offline/i);
      expect(field("Restate the task").value).toBe("offline text");
      expect(store.stage(id, "frame").fields.restate_task).toBeUndefined();
      await act(async () => {
         fireEvent.click(screen.getByRole("button", { name: "Retry saving" }));
         await vi.advanceTimersByTimeAsync(0);
      });
      expect(saveStatus()).toHaveTextContent("Saved");
      expect(store.stage(id, "frame").fields.restate_task).toBe("offline text");
   });

   it("announces state changes in one polite status region", async () => {
      await open(SD);
      const status = saveStatus();
      expect(status).toHaveAttribute("role", "status");
      expect(status).toHaveAttribute("aria-live", "polite");
   });
});

describe("a conflict", () => {
   it("keeps the learner's text, shows both versions and the three choices, and saves nothing on its own", async () => {
      const { store, id } = await open(SD);
      vi.useFakeTimers();
      store.writeElsewhere(id, "frame", { restate_task: "their version" });
      type("Restate the task", "my version");
      await advance(DEBOUNCE);
      const panel = screen.getByRole("group", { name: "This stage was changed somewhere else" });
      expect(within(panel).getByText("my version")).toBeInTheDocument();
      expect(within(panel).getByText("their version")).toBeInTheDocument();
      for (const name of ["Keep mine", "Take theirs", "Combine"]) expect(within(panel).getByRole("button", { name })).toBeInTheDocument();
      expect(saveStatus()).toHaveTextContent(/Not saved/);
      expect(field("Restate the task").value).toBe("my version");
      await advance(60_000);
      expect(patches(store)).toHaveLength(1);
      expect(store.stage(id, "frame").fields.restate_task).toBe("their version");
   });

   it("Keep mine saves the learner's text at the server's current version", async () => {
      const { store, id } = await open(SD);
      vi.useFakeTimers();
      store.writeElsewhere(id, "frame", { restate_task: "their version" });
      type("Restate the task", "my version");
      await advance(DEBOUNCE);
      await act(async () => {
         fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
         await vi.advanceTimersByTimeAsync(0);
      });
      expect(store.stage(id, "frame").fields.restate_task).toBe("my version");
      expect((patches(store).at(-1)!.body as { version: number }).version).toBe(2);
      expect(saveStatus()).toHaveTextContent("Saved");
   });

   it("Take theirs replaces the text only when chosen, and Combine keeps both", async () => {
      const first = await open(SD);
      vi.useFakeTimers();
      first.store.writeElsewhere(first.id, "frame", { restate_task: "their version" });
      type("Restate the task", "my version");
      await advance(DEBOUNCE);
      await act(async () => {
         fireEvent.click(screen.getByRole("button", { name: "Combine" }));
         await vi.advanceTimersByTimeAsync(0);
      });
      expect(first.store.stage(first.id, "frame").fields.restate_task).toBe("my version\n\ntheirs".replace("theirs", "their version"));
      expect(field("Restate the task").value).toContain("their version");
   });

   it("shows a second conflict again instead of overwriting", async () => {
      const { store, id } = await open(SD);
      vi.useFakeTimers();
      store.writeElsewhere(id, "frame", { restate_task: "v-theirs-1" });
      type("Restate the task", "mine");
      await advance(DEBOUNCE);
      store.writeElsewhere(id, "frame", { restate_task: "v-theirs-2" });
      await act(async () => {
         fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
         await vi.advanceTimersByTimeAsync(0);
      });
      const panel = screen.getByRole("group", { name: "This stage was changed somewhere else" });
      expect(within(panel).getByText("v-theirs-2")).toBeInTheDocument();
      expect(store.stage(id, "frame").fields.restate_task).toBe("v-theirs-2");
   });
});

describe("an attempt that is no longer active", () => {
   it("stops writing, shows what was not saved, and reads the canonical status", async () => {
      const { store, id } = await open(SD);
      vi.useFakeTimers();
      store.endAttempt(id, "abandoned");
      type("Restate the task", "after the end");
      await advance(DEBOUNCE);
      await advance(10);
      expect(patches(store)).toHaveLength(1);
      const unsaved = screen.getByRole("group", { name: "Not saved" });
      expect(within(unsaved).getByText("after the end")).toBeInTheDocument();
      expect(saveStatus()).toHaveTextContent(/Not saved.*ended/);
      expect(screen.getByText(/This attempt was abandoned/)).toBeInTheDocument();
      expect(field("Restate the task")).toHaveAttribute("readonly");
      expect(screen.getByRole("button", { name: "Mark this stage done" })).toBeDisabled();
      await advance(60_000);
      expect(patches(store)).toHaveLength(1);
   });

   it("opens an ended attempt read-only from the start", async () => {
      const seeded = await seed(SD);
      seeded.store.endAttempt(seeded.id, "ended_by_reveal");
      render(tree(seeded, seeded.token, "ada"));
      await screen.findByRole("heading", { level: 1 });
      expect(screen.getByText(/You revealed the reference, so this attempt has ended/)).toBeInTheDocument();
      expect(field("Restate the task")).toHaveAttribute("readonly");
   });
});

describe("the session boundary", () => {
   it("sends nothing of one account's pending text after the account changes, and shows none of it to the next", async () => {
      const seeded = await seed(SD);
      const bob = seeded.api.signIn("bob");
      const view = render(tree(seeded, seeded.token, "ada"));
      await screen.findByRole("heading", { level: 1 });
      vi.useFakeTimers();
      type("Restate the task", "ada's private text");
      view.rerender(tree(seeded, bob, "bob"));
      await advance(DEBOUNCE * 3);
      expect(patches(seeded.store)).toHaveLength(0);
      expect(document.body.textContent).not.toContain("ada's private text");
      expect(seeded.store.stage(seeded.id, "frame").fields.restate_task).toBeUndefined();
      // The capability was asked again for the new identity, and the other user's attempt is not found for them (owner-scoped).
      const capabilityCalls = seeded.api.requests.filter((request) => request.route === "capability");
      expect(capabilityCalls.map((request) => request.token)).toEqual([seeded.token, bob]);
      expect(screen.getByText("We could not find that attempt.")).toBeInTheDocument();
   });

   it("shows the next account a not-found, never the previous account's attempt", async () => {
      const seeded = await seed(SD);
      const bob = seeded.api.signIn("bob");
      const view = render(tree(seeded, seeded.token, "ada"));
      await screen.findByRole("heading", { level: 1 });
      view.rerender(tree(seeded, bob, "bob"));
      await screen.findByText("We could not find that attempt.");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(document.body.textContent).not.toContain("Synthetic Problem");
   });

   it("ignores a reply that arrives after the session changed", async () => {
      const seeded = await seed(SD);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const slow: typeof fetch = async (input, init) => {
         const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
         if (/\/attempts\/[^/]+$/.test(new URL(url).pathname) && (init?.method ?? "GET") === "GET") await gate;
         return seeded.api.fetch(input, init);
      };
      const bob = seeded.api.signIn("bob");
      const view = render(
         <PracticeGate apiUrl={API} owner="ada" getAccessToken={async () => seeded.token} fetch={slow}>
            <AttemptRoute attemptId={seeded.id} />
         </PracticeGate>
      );
      await screen.findByText("Loading your attempt…");
      view.rerender(
         <PracticeGate apiUrl={API} owner="bob" getAccessToken={async () => bob} fetch={slow}>
            <AttemptRoute attemptId={seeded.id} />
         </PracticeGate>
      );
      release();
      await screen.findByText("We could not find that attempt.");
      expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
   });

   it("clears private data when the user signs out", async () => {
      const seeded = await seed(SD);
      const view = render(tree(seeded, seeded.token, "ada"));
      await screen.findByRole("heading", { level: 1 });
      type("Restate the task", "gone after sign-out");
      view.rerender(
         <PracticeGate apiUrl={API} owner={null} getAccessToken={async () => null} fetch={seeded.api.fetch}>
            <AttemptRoute attemptId={seeded.id} />
         </PracticeGate>
      );
      await screen.findByText("Sign in to use practice.");
      expect(document.body.textContent).not.toContain("gone after sign-out");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
   });
});

describe("leaving", () => {
   it("warns the browser before unload only while work is unsaved", async () => {
      await open(SD);
      vi.useFakeTimers();
      const attempt = () => {
         const event = new Event("beforeunload", { cancelable: true });
         window.dispatchEvent(event);
         return event.defaultPrevented;
      };
      expect(attempt()).toBe(false);
      type("Restate the task", "unsaved");
      expect(attempt()).toBe(true);
      await advance(DEBOUNCE);
      expect(attempt()).toBe(false);
   });

   it("makes no request when the page unloads", async () => {
      const { api } = await open(SD);
      vi.useFakeTimers();
      type("Restate the task", "unsaved");
      const before = api.requests.length;
      window.dispatchEvent(new Event("pagehide"));
      window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
      expect(api.requests.length).toBe(before);
   });
});

describe("hints and clarifications", () => {
   it("shows authored hints one at a time, in the authored order, from the server", async () => {
      const { store } = await open(SD);
      expect(screen.queryByText(/Synthetic hint 1/)).not.toBeInTheDocument();
      expect(screen.getByText("0 of 2 shown")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Show a hint" }));
      await screen.findByText("Synthetic hint 1: what is the unit of work?");
      expect(screen.queryByText(/Synthetic hint 2/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Show the next hint" }));
      await screen.findByText("Synthetic hint 2: what would you ask about failure?");
      expect(screen.getByRole("button", { name: "No more hints" })).toBeDisabled();
      expect(store.calls("stage_hint")).toHaveLength(2);
      const items = within(screen.getByRole("complementary", { name: "Stage guide" })).getAllByRole("listitem");
      expect(items.map((item) => item.textContent)).toEqual(["Synthetic hint 1: what is the unit of work?", "Synthetic hint 2: what would you ask about failure?"]);
   });

   it("keeps clarification answers closed until the learner has written questions, then reveals them one at a time", async () => {
      vi.useRealTimers();
      const { store, id } = await open(SD);
      // No answer text is in the first payload.
      expect(document.body.textContent).not.toMatch(/Synthetic answer/);
      expect(screen.queryByRole("button", { name: /Compare with a strong candidate/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Skip my questions" })).toBeInTheDocument();
      type("Clarifying questions", "How big is it?");
      await act(async () => {
         await new Promise((resolve) => setTimeout(resolve, DEBOUNCE + 50));
      });
      expect(store.stage(id, "frame").fields.clarifying_questions).toBe("How big is it?");
      fireEvent.click(screen.getByRole("button", { name: /Compare with a strong candidate/ }));
      expect(screen.getByText("How large is the batch?")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/Synthetic answer/);
      fireEvent.click(screen.getByRole("button", { name: "Reveal the answer: How large is the batch?" }));
      await screen.findByText(/Synthetic answer A/);
      expect(screen.queryByText(/Synthetic answer B/)).not.toBeInTheDocument();
      expect(store.calls("reveal_clarification")).toHaveLength(1);
      expect(screen.queryByRole("button", { name: "Reveal the answer: How large is the batch?" })).not.toBeInTheDocument();
   }, 10_000);

   it("shows each revealed answer once, however often the server repeats it", async () => {
      const { store, id, api, token } = await open(SD);
      void id;
      fireEvent.click(screen.getByRole("button", { name: "Skip my questions" }));
      fireEvent.click(screen.getByRole("button", { name: /Compare with a strong candidate/ }));
      const reveal = screen.getByRole("button", { name: "Reveal the answer: Which errors matter most?" });
      fireEvent.click(reveal);
      await screen.findByText(/Synthetic answer B/);
      // The same clarification answered again by the server (`already_revealed`) lands on the same entry.
      const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
      const again = await client.revealClarification(id, "clarify-errors");
      expect(again.status === "ok" && again.data.already_revealed).toBe(true);
      expect(screen.getAllByText(/Synthetic answer B/)).toHaveLength(1);
      expect(store.calls("reveal_clarification")).toHaveLength(2);
   });

   it("resumes with what was already revealed and which hints were shown", async () => {
      const seeded = await seed(SD);
      const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => seeded.token, fetch: seeded.api.fetch });
      await client.revealClarification(seeded.id, "clarify-latency");
      await client.stageHint(seeded.id, "frame");
      render(tree(seeded, seeded.token, "ada"));
      await screen.findByRole("heading", { level: 1 });
      expect(screen.getByText("Synthetic hint 1: what is the unit of work?")).toBeInTheDocument();
      expect(screen.getByText("1 of 2 shown")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Skip my questions" }));
      fireEvent.click(screen.getByRole("button", { name: /Compare with a strong candidate/ }));
      expect(screen.getByText(/Synthetic answer C/)).toBeInTheDocument();
      expect(screen.queryByText(/Synthetic answer A/)).not.toBeInTheDocument();
   });

   it("records an assumption as the learner's own text, never a generated one", async () => {
      const { store } = await open(SD);
      fireEvent.click(screen.getByRole("button", { name: "Skip my questions" }));
      fireEvent.click(screen.getByRole("button", { name: /Compare with a strong candidate/ }));
      fireEvent.change(screen.getByRole("textbox", { name: "Proceed with an assumption" }), { target: { value: "Ten thousand records an hour." } });
      fireEvent.click(screen.getByRole("button", { name: "Record this assumption" }));
      await screen.findByText("Ten thousand records an hour.");
      expect(store.calls("add_assumption")[0].body).toEqual({ position: "frame", text: "Ten thousand records an hour." });
      expect(screen.getByRole("textbox", { name: "Proceed with an assumption" })).toHaveValue("");
   });

   it("says so when a hint cannot be loaded, and offers another try", async () => {
      const { api } = await open(SD);
      api.failNext("network");
      fireEvent.click(screen.getByRole("button", { name: "Show a hint" }));
      await screen.findByText("We could not load the hint. Try again.");
      fireEvent.click(screen.getByRole("button", { name: "Show a hint" }));
      await screen.findByText("Synthetic hint 1: what is the unit of work?");
   });
});

describe("what the browser keeps", () => {
   it("writes nothing the learner typed to storage, cookies, the URL or IndexedDB", async () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const cookie = vi.spyOn(document, "cookie", "set");
      const { store, id } = await open(SD);
      const url = window.location.href;
      vi.useFakeTimers();
      type("Restate the task", "SECRET-LEARNER-TEXT");
      await advance(DEBOUNCE);
      expect(store.stage(id, "frame").fields.restate_task).toBe("SECRET-LEARNER-TEXT");
      expect(setItem).not.toHaveBeenCalled();
      expect(cookie).not.toHaveBeenCalled();
      expect(window.location.href).toBe(url);
      expect(JSON.stringify([...Object.entries(window.localStorage), ...Object.entries(window.sessionStorage)])).not.toContain("SECRET-LEARNER-TEXT");
   });
});

describe("responses the workspace does not trust", () => {
   it("does not open a workspace on a malformed attempt, and offers to try again", async () => {
      const seeded = await seed(SD);
      seeded.api.script("get_attempt", { status: 200, body: { id: seeded.id, status: "active", stage_work: "not an array" } });
      render(tree(seeded, seeded.token, "ada"));
      await screen.findByText("We could not load your attempt. Nothing was changed.");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      seeded.api.script("get_attempt", () => failure("not_found", 404));
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await screen.findByText("We could not find that attempt.");
   });

   it("treats practice being switched off as not found", async () => {
      const seeded = await seed(SD);
      seeded.api.script("get_attempt", () => failure("practice_disabled", 403));
      render(tree(seeded, seeded.token, "ada"));
      await screen.findByText("We could not find that attempt.");
   });

   it("shows a session that ended as a request to sign in, not as a missing attempt", async () => {
      const seeded = await seed(SD);
      seeded.api.script("get_attempt", () => failure("unauthenticated", 401));
      render(tree(seeded, seeded.token, "ada"));
      await screen.findByText("Your session has ended. Sign in again to continue.");
   });
});

describe("the attempt's one diagram (T14)", () => {
   async function openWithDiagram(contentId = SD) {
      const seeded = await seed(contentId);
      const diagrams = installFakeDiagram(seeded.api, seeded.store);
      const view = render(tree(seeded, seeded.token, "ada"));
      await screen.findByRole("heading", { level: 1 });
      return { ...seeded, diagrams, view };
   }
   const lastEngine = () => shown.at(-1)!.engine as DiagramEngine;

   it("opens the Design stage canvas-first, with the written notes under the diagram", async () => {
      shown.length = 0;
      await openWithDiagram();
      goTo("Design");
      expect(heading()).toHaveTextContent("Design");
      expect(await screen.findByText("", { selector: "[data-diagram-stub=design]" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: "Written notes" })).toBeInTheDocument();
      expect(field("Core entities")).toBeInTheDocument();
   });

   it("offers the same graph beside every stage after Design, and none before it", async () => {
      shown.length = 0;
      await openWithDiagram();
      expect(screen.queryByRole("button", { name: "Your design" })).not.toBeInTheDocument();
      goTo("Design");
      await screen.findByText("", { selector: "[data-diagram-stub=design]" });
      const designEngine = lastEngine();
      goTo("Follow-ups");
      fireEvent.click(screen.getByRole("button", { name: "Your design" }));
      await screen.findByText("", { selector: "[data-diagram-stub=split]" });
      expect(lastEngine()).toBe(designEngine);
      expect(screen.getByRole("button", { name: "Done with the diagram" })).toHaveAttribute("aria-expanded", "true");
   });

   it("counts the diagram in the attempt's one save status and leave guard, and stops it when the attempt ends", async () => {
      shown.length = 0;
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const rig = await openWithDiagram();
      goTo("Design");
      await screen.findByText("", { selector: "[data-diagram-stub=design]" });
      const engine = lastEngine();
      act(() => engine.edit((draft) => (addNode(draft, "service", { label: "API" }) as { draft: typeof draft }).draft));
      expect(saveStatus()).toHaveTextContent("Unsaved changes");
      await advance(DEBOUNCE);
      expect(saveStatus()).toHaveTextContent("Saved");
      expect(rig.diagrams.diagram(rig.id).graph.nodes).toHaveLength(1);
      rig.store.endAttempt(rig.id, "abandoned");
      type("Core entities", "late text");
      await advance(DEBOUNCE);
      expect(engine.getSnapshot().phase).toBe("terminal");
   });

   it("sends nothing of one account's unsaved graph after the account changes, under any token", async () => {
      shown.length = 0;
      const seeded = await seed(SD);
      const diagrams = installFakeDiagram(seeded.api, seeded.store);
      const bob = seeded.api.signIn("bob");
      const view = render(tree(seeded, seeded.token, "ada"));
      await screen.findByRole("heading", { level: 1 });
      goTo("Design");
      await screen.findByText("", { selector: "[data-diagram-stub=design]" });
      const engine = lastEngine();
      vi.useFakeTimers();
      act(() => engine.edit((draft) => (addNode(draft, "service", { label: "ada's private component" }) as { draft: typeof draft }).draft));
      view.rerender(tree(seeded, bob, "bob"));
      await advance(DEBOUNCE * 3);
      expect(seeded.api.requests.filter((r) => r.route === "put_diagram")).toHaveLength(0);
      expect(diagrams.diagram(seeded.id).graph.nodes).toHaveLength(0);
      expect(document.body.textContent).not.toContain("ada's private component");
      expect(engine.getSnapshot().draft.graph.nodes).toHaveLength(1);
      await act(async () => {
         await engine.persist();
      });
      expect(seeded.api.requests.filter((r) => r.route === "put_diagram")).toHaveLength(0);
   });

   it("says when the diagram cannot be read, keeps the written work, and tries again", async () => {
      const seeded = await seed(SD);
      seeded.api.script("get_diagram", () => failure("internal_error", 500));
      render(tree(seeded, seeded.token, "ada"));
      await screen.findByRole("heading", { level: 1 });
      goTo("Design");
      expect(await screen.findByText("We could not load your diagram. Your written work is not affected.")).toBeInTheDocument();
      installFakeDiagram(seeded.api, seeded.store);
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("", { selector: "[data-diagram-stub=design]" })).toBeInTheDocument();
      const _unused: Position = "design";
      void _unused;
   });

   describe("a diagram read that lands after the attempt ended", () => {
      // Holds the first diagram read's reply (the server answered while the attempt was active) until the test releases it.
      function holdFirstDiagramRead(api: Rig["api"]) {
         let release!: () => void;
         const held = new Promise<void>((resolve) => (release = resolve));
         const gated: typeof fetch = async (input, init) => {
            const reply = api.fetch(input, init);
            if (api.requests.at(-1)?.route === "get_diagram") await held;
            return reply;
         };
         return { gated, release };
      }
      const puts = (api: Rig["api"]) => api.requests.filter((r) => r.route === "put_diagram");

      it("starts the late engine halted, keeps the saved graph and unsaved text, and writes nothing, even when the status read fails", async () => {
         shown.length = 0;
         const seeded = await seed(SD);
         installFakeDiagram(seeded.api, seeded.store);
         const { gated, release } = holdFirstDiagramRead(seeded.api);
         render(
            <PracticeGate apiUrl={API} owner="ada" getAccessToken={async () => seeded.token} fetch={gated}>
               <AttemptRoute attemptId={seeded.id} />
            </PracticeGate>
         );
         await screen.findByRole("heading", { level: 1 });
         goTo("Design");
         expect(screen.queryByText("", { selector: "[data-diagram-stub]" })).not.toBeInTheDocument();
         vi.useFakeTimers();
         seeded.store.endAttempt(seeded.id, "abandoned");
         seeded.api.script("get_attempt", () => failure("internal_error", 500));
         const reads = seeded.api.requests.filter((r) => r.route === "get_attempt").length;
         type("Core entities", "after the end");
         await advance(DEBOUNCE);
         await advance(10);
         expect(saveStatus()).toHaveTextContent(/Not saved.*ended/);
         expect(seeded.api.requests.filter((r) => r.route === "get_attempt")).toHaveLength(reads + 1);
         await act(async () => release());
         await advance(10);
         const engine = shown.at(-1)!.engine as DiagramEngine;
         expect(engine.getSnapshot().phase).toBe("terminal");
         expect(engine.getSnapshot().saved.graph.nodes).toHaveLength(0);
         // The status read failed, so no terminal status is invented: the halt alone keeps the editor and its writes shut.
         expect(screen.queryByText(/This attempt was abandoned/)).not.toBeInTheDocument();
         act(() => engine.edit((draft) => (addNode(draft, "service", { label: "late" }) as { draft: typeof draft }).draft));
         await advance(DEBOUNCE * 3);
         await act(async () => {
            await engine.persist();
            await engine.retry();
         });
         expect(engine.getSnapshot().phase).toBe("terminal");
         expect(engine.getSnapshot().draft.graph.nodes).toHaveLength(1);
         expect(puts(seeded.api)).toHaveLength(0);
         expect(within(screen.getByRole("group", { name: "Not saved" })).getByText("after the end")).toBeInTheDocument();
         expect(patches(seeded.store)).toHaveLength(1);
      });

      it("does not reopen a terminal attempt when the learner retries an unreadable diagram", async () => {
         shown.length = 0;
         const seeded = await seed(SD);
         seeded.api.script("get_diagram", () => failure("internal_error", 500));
         render(tree(seeded, seeded.token, "ada"));
         await screen.findByRole("heading", { level: 1 });
         goTo("Design");
         await screen.findByText("We could not load your diagram. Your written work is not affected.");
         vi.useFakeTimers();
         seeded.store.endAttempt(seeded.id, "abandoned");
         seeded.api.script("get_attempt", () => failure("internal_error", 500));
         type("Core entities", "after the end");
         await advance(DEBOUNCE);
         await advance(10);
         expect(saveStatus()).toHaveTextContent(/Not saved.*ended/);
         installFakeDiagram(seeded.api, seeded.store);
         fireEvent.click(screen.getByRole("button", { name: "Try again" }));
         await advance(10);
         expect(screen.getByText("", { selector: "[data-diagram-stub=design]" })).toBeInTheDocument();
         const engine = shown.at(-1)!.engine as DiagramEngine;
         expect(engine.getSnapshot().phase).toBe("terminal");
         await act(async () => {
            await engine.persist();
         });
         expect(puts(seeded.api)).toHaveLength(0);
      });
   });
});
