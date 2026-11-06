import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import type { CatalogQuestion } from "@/lib/prep/questions";
import type { Answer, AnswerCreate } from "@/lib/prep/types";
import { AnswerEditor } from "./AnswerEditor";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const API = "https://api.example.test";
const S1 = "lesson.behavioral-prep-sde-1";
const QUESTION = "Tell me about a time you were stuck.";
const current: CatalogQuestion = { content_id: S1, question_id: "being-stuck", level: "sde-1", text: QUESTION, snapshot_fallback: false };

let api: ReturnType<typeof createFakePrepApi>;
let token: string;

beforeEach(() => {
   nav.push.mockReset();
   api = createFakePrepApi();
   token = api.signIn("user-1");
});

const client = () => createPrepClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });

async function seed(over: Partial<AnswerCreate> & Record<string, unknown> = {}): Promise<Answer> {
   const result = await client().createAnswer({
      source: "catalog",
      content_id: S1,
      question_id: "being-stuck",
      question_snapshot: QUESTION,
      snapshot_fallback: false,
      framework: "star",
      ...over,
   } as AnswerCreate);
   if (result.status !== "ok") throw new Error("seed failed");
   api.requests.length = 0;
   return result.data;
}

async function open(answer: Answer, props: Partial<React.ComponentProps<typeof AnswerEditor>> = {}) {
   const view = render(<AnswerEditor apiUrl={API} answerId={answer.id} catalog={[current]} getAccessToken={async () => token} fetch={api.fetch} {...props} />);
   await screen.findByRole("heading", { name: "Your answer" });
   return view;
}

const field = (name: string | RegExp) => screen.getByRole("textbox", { name }) as HTMLTextAreaElement;
const type = (name: string | RegExp, value: string) => fireEvent.change(field(name), { target: { value } });
const saveButton = () => screen.getByRole("button", { name: "Save changes" });
const status = () => document.querySelector('[data-slot="save-status"]')!.textContent;
const patches = () => api.requests.filter(({ method }) => method === "PATCH");
const stored = async (id: string) => {
   const result = await client().getAnswer(id);
   if (result.status !== "ok") throw new Error("read failed");
   return result.data;
};
async function save() {
   fireEvent.click(saveButton());
   await waitFor(() => expect(status()).not.toBe("Saving…"));
}
const format = (label: string) => fireEvent.click(screen.getByRole("radio", { name: label }));

describe("loading", () => {
   it("shows Loading, then the answer read once with the user's token", async () => {
      const answer = await seed();
      render(<AnswerEditor apiUrl={API} answerId={answer.id} catalog={[current]} getAccessToken={async () => token} fetch={api.fetch} />);
      expect(screen.getByRole("status")).toHaveTextContent("Loading your answer…");
      await screen.findByRole("heading", { name: "Your answer" });
      expect(api.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([`GET /answers/${answer.id}`]);
   });

   it("says the answer cannot be found, with no retry, when the API answers 404", async () => {
      render(<AnswerEditor apiUrl={API} answerId="00000000-0000-4000-8000-0000000000ff" catalog={null} getAccessToken={async () => token} fetch={api.fetch} />);
      expect(await screen.findByRole("alert")).toHaveTextContent("We could not find this answer");
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
   });

   it("offers Try again after a network failure and loads on the retry", async () => {
      const answer = await seed();
      api.failNext("network");
      render(<AnswerEditor apiUrl={API} answerId={answer.id} catalog={null} getAccessToken={async () => token} fetch={api.fetch} />);
      expect(await screen.findByRole("alert")).toHaveTextContent("We could not reach the preparation service.");
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await screen.findByRole("heading", { name: "Your answer" });
   });

   it("asks for sign-in, returning to the same answer, without a session token", async () => {
      const answer = await seed();
      render(<AnswerEditor apiUrl={API} answerId={answer.id} catalog={null} getAccessToken={async () => null} fetch={api.fetch} />);
      expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", `/login?redirect=${encodeURIComponent(`/prepare/answers/${answer.id}`)}`);
      expect(api.requests).toHaveLength(0);
   });

   it("reports a missing API origin without calling anything", () => {
      render(<AnswerEditor apiUrl={null} answerId="x" catalog={null} />);
      expect(screen.getByRole("alert")).toHaveTextContent("not configured");
   });
});

describe("the question and the Lesson guidance", () => {
   it("shows the saved question and a guidance link to its own section, opening in a new tab", async () => {
      await open(await seed());
      expect(screen.getByText(QUESTION)).toBeInTheDocument();
      const link = screen.getByRole("link", { name: /Read the Lesson guidance/ });
      expect(link).toHaveAttribute("href", "/lessons/behavioral-prep-sde-1#being-stuck");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
      expect(screen.queryByRole("note")).toBeNull();
   });

   it("says when the Lesson now words the question differently, and keeps the saved text", async () => {
      await open(await seed(), { catalog: [{ ...current, text: "Describe being blocked." }] });
      expect(screen.getByText(QUESTION)).toBeInTheDocument();
      expect(screen.getByRole("note")).toHaveTextContent("The question changed in the Lesson. It now reads: “Describe being blocked.”");
      expect(screen.getByRole("link", { name: /Read the Lesson guidance/ })).toBeInTheDocument();
   });

   it("says when the question is gone from the Lesson and offers no link", async () => {
      await open(await seed(), { catalog: [{ ...current, question_id: "other" }] });
      expect(screen.getByText(QUESTION)).toBeInTheDocument();
      expect(screen.getByRole("note")).toHaveTextContent("no longer in the Lesson");
      expect(screen.queryByRole("link", { name: /Lesson guidance/ })).toBeNull();
   });

   it("says a heading is standing in when the Lesson had no question line", async () => {
      await open(await seed({ snapshot_fallback: true, question_snapshot: "Being stuck" }));
      expect(screen.getByText(/the section heading/)).toBeInTheDocument();
   });

   it("makes no claim about the Lesson when its questions could not be read, but keeps the link", async () => {
      await open(await seed(), { catalog: null });
      expect(screen.queryByRole("note")).toBeNull();
      expect(screen.getByRole("link", { name: /Lesson guidance/ })).toBeInTheDocument();
   });

   it("takes the link from the stored pair, not from the text: another Lesson's identical text links to its own", async () => {
      const answer = await seed({ content_id: "lesson.behavioral-prep-sde-2", question_id: "being-stuck" });
      await open(answer, { catalog: [{ ...current, content_id: "lesson.behavioral-prep-sde-2", level: "sde-2" }] });
      expect(screen.getByRole("link", { name: /Lesson guidance/ })).toHaveAttribute("href", "/lessons/behavioral-prep-sde-2#being-stuck");
   });

   it("gives a custom answer an editable question and no Lesson link", async () => {
      const answer = await seed({ source: "custom", content_id: null, question_id: null, question_snapshot: "My own question?" });
      await open(answer);
      expect(screen.queryByRole("link", { name: /Lesson guidance/ })).toBeNull();
      type(/Your question/, "My better question?");
      await save();
      expect(patches()[0].body).toEqual({ version: 1, question_snapshot: "My better question?" });
      expect((await stored(answer.id)).question_snapshot).toBe("My better question?");
   });

   it("blocks saving a blank custom question and says why, sending nothing", async () => {
      await open(await seed({ source: "custom", content_id: null, question_id: null, question_snapshot: "My own question?" }));
      type(/Your question/, "   ");
      fireEvent.click(saveButton());
      expect(screen.getByText("Enter the question.")).toBeInTheDocument();
      expect(patches()).toHaveLength(0);
   });

   it("never lets a catalog answer's question be edited", async () => {
      await open(await seed());
      expect(screen.queryByRole("textbox", { name: /question/i })).toBeNull();
   });
});

describe("STAR and free-form", () => {
   it("edits every STAR field and saves them in one update with the version it read", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "The build broke.");
      type("Task", "Find the cause.");
      type("Action", "I bisected it.");
      type("Result", "Fixed in a day.");
      expect(status()).toBe("Unsaved changes");
      await save();
      expect(patches()).toHaveLength(1);
      expect(patches()[0].body).toEqual({ version: 1, fields: { situation: "The build broke.", task: "Find the cause.", action: "I bisected it.", result: "Fixed in a day." } });
      expect(status()).toBe("Saved");
      expect(await stored(answer.id)).toMatchObject({ version: 2, fields: { result: "Fixed in a day." } });
   });

   it("edits the free-form body and saves it", async () => {
      const answer = await seed({ framework: "free_form" });
      await open(answer);
      type("Your answer", "I was stuck on a flaky test.");
      await save();
      expect(patches()[0].body).toEqual({ version: 1, body: "I was stuck on a flaky test." });
      expect((await stored(answer.id)).body).toBe("I was stuck on a flaky test.");
   });

   it("loses no text going STAR to free-form and back, saved or not", async () => {
      await open(await seed({ fields: { situation: "S saved" } }));
      type("Action", "A unsaved");
      format("Free-form");
      type("Your answer", "Body unsaved");
      // The STAR text is on screen in the free-form view, read-only.
      expect(field("STAR notes")).toHaveValue("Situation\nS saved\n\nAction\nA unsaved");
      expect(field("STAR notes").readOnly).toBe(true);
      format("STAR");
      expect(field("Situation")).toHaveValue("S saved");
      expect(field("Action")).toHaveValue("A unsaved");
      // The free-form text is on screen in the STAR view, read-only.
      expect(field("Free-form text")).toHaveValue("Body unsaved");
      format("Free-form");
      expect(field("Your answer")).toHaveValue("Body unsaved");
   });

   it("saves both representations, and a reload shows all of it", async () => {
      const answer = await seed({ fields: { situation: "S saved" } });
      const view = await open(answer);
      format("Free-form");
      type("Your answer", "Body text");
      await save();
      expect(patches()[0].body).toEqual({ version: 1, framework: "free_form", body: "Body text" });
      expect(await stored(answer.id)).toMatchObject({ framework: "free_form", body: "Body text", fields: { situation: "S saved" } });
      view.unmount();
      await open(answer);
      expect(field("Your answer")).toHaveValue("Body text");
      expect(field("STAR notes")).toHaveValue("Situation\nS saved");
      format("STAR");
      expect(field("Situation")).toHaveValue("S saved");
      expect(field("Free-form text")).toHaveValue("Body text");
   });

   it("saving only a framework switch sends only the framework", async () => {
      await open(await seed({ fields: { situation: "S" }, body: "B" }));
      format("Free-form");
      await save();
      expect(patches()[0].body).toEqual({ version: 1, framework: "free_form" });
   });

   it("shows a STAR answer's labels and a free-form answer's field with the right names", async () => {
      await open(await seed());
      expect(screen.getAllByRole("textbox").map((box) => (box as HTMLTextAreaElement).labels?.[0].textContent)).toEqual(["Situation", "Task", "Action", "Result", "Tags"]);
      expect(screen.getByRole("radio", { name: "STAR" })).toBeChecked();
   });

   it("clearing a field removes it from the stored answer", async () => {
      const answer = await seed({ fields: { situation: "S", task: "T" } });
      await open(answer);
      type("Task", "");
      await save();
      expect((await stored(answer.id)).fields).toEqual({ situation: "S" });
   });
});

describe("status", () => {
   it("moves through In progress and Ready, one saved version each", async () => {
      const answer = await seed();
      await open(answer);
      fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "in_progress" } });
      await save();
      expect(await stored(answer.id)).toMatchObject({ status: "in_progress", version: 2 });
      fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "ready" } });
      await save();
      expect(await stored(answer.id)).toMatchObject({ status: "ready", version: 3 });
      fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "draft" } });
      await save();
      expect(await stored(answer.id)).toMatchObject({ status: "draft", version: 4 });
      expect(patches().map(({ body }) => body)).toEqual([
         { version: 1, status: "in_progress" },
         { version: 2, status: "ready" },
         { version: 3, status: "draft" },
      ]);
   });

   it("saves a status change together with the text in one update", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "S");
      fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "ready" } });
      await save();
      expect(patches()).toHaveLength(1);
      expect(await stored(answer.id)).toMatchObject({ status: "ready", fields: { situation: "S" }, version: 2 });
   });

   it("changes nothing until Save, and an untouched form sends nothing", async () => {
      const answer = await seed();
      await open(answer);
      fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "ready" } });
      expect((await stored(answer.id)).status).toBe("draft");
      fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "draft" } });
      expect(saveButton()).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(saveButton());
      expect(patches()).toHaveLength(0);
      expect(status()).toBe("");
   });
});

describe("failures never claim a save", () => {
   it("keeps the text and names the field when the server rejects it", async () => {
      await open(await seed());
      type("Situation", "x".repeat(20_001));
      await save();
      expect(status()).toContain("Couldn't save");
      expect(status()).not.toContain("Saved");
      expect(field("Situation")).toHaveValue("x".repeat(20_001));
      expect(field("Situation")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("This is too long to save.")).toBeInTheDocument();
      // Editing clears the rejection and the reader can save again.
      type("Situation", "short");
      await save();
      expect(status()).toBe("Saved");
   });

   it("reports a stale version as a conflict: nothing applied, text kept, saving blocked", async () => {
      const answer = await seed();
      await open(answer);
      await client().updateAnswer(answer.id, { version: 1, status: "ready" });
      type("Situation", "Mine");
      await save();
      expect(status()).toContain("changed somewhere else");
      expect(field("Situation")).toHaveValue("Mine");
      expect(saveButton()).toHaveAttribute("aria-disabled", "true");
      expect((await stored(answer.id)).fields).toEqual({});
      fireEvent.click(saveButton());
      // The other writer's update and this editor's one rejected attempt; the blocked click sent nothing.
      expect(patches()).toHaveLength(2);
   });

   it("says the answer is gone when it was deleted elsewhere, and keeps the text", async () => {
      const answer = await seed();
      await open(answer);
      await client().deleteAnswer(answer.id);
      type("Situation", "Mine");
      await save();
      expect(status()).toContain("no longer exists");
      expect(field("Situation")).toHaveValue("Mine");
   });

   it("asks to sign in again when the session ended, and keeps the text", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "Mine");
      api.failNext(401);
      await save();
      expect(status()).toContain("session has ended");
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", expect.stringContaining(encodeURIComponent(`/prepare/answers/${answer.id}`)));
      expect(field("Situation")).toHaveValue("Mine");
   });

   it("treats a lost request as unknown, blocks a blind retry, and recovers by re-reading", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "Mine");
      api.failNext("network");
      await save();
      expect(status()).toBe("We could not confirm whether your changes were saved.");
      expect(status()).not.toContain("Saved");
      fireEvent.click(saveButton());
      expect(patches()).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "Check the saved answer" }));
      await waitFor(() => expect(status()).toContain("did not go through"));
      expect(field("Situation")).toHaveValue("Mine");
      await save();
      expect(status()).toBe("Saved");
      expect(patches().map(({ body }) => (body as { version: number }).version)).toEqual([1, 1]);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Mine" });
   });

   it("adopts the server's copy when the lost request had in fact been applied, and never re-sends", async () => {
      const answer = await seed();
      const lost: typeof fetch = async (input, init) => {
         const response = await api.fetch(input, init);
         if (init?.method !== "PATCH") return response;
         throw new TypeError("response lost");
      };
      await open(answer, { fetch: lost });
      type("Situation", "Mine");
      await save();
      expect(status()).toBe("We could not confirm whether your changes were saved.");
      await act(async () => {
         fireEvent.click(screen.getByRole("button", { name: "Check the saved answer" }));
      });
      await waitFor(() => expect(status()).toBe("Saved"));
      expect(patches()).toHaveLength(1);
      expect(await stored(answer.id)).toMatchObject({ version: 2, fields: { situation: "Mine" } });
   });

   it("stays unknown, not saved, when the check itself cannot reach the server", async () => {
      await open(await seed());
      type("Situation", "Mine");
      api.failNext("network");
      await save();
      api.failNext("network");
      fireEvent.click(screen.getByRole("button", { name: "Check the saved answer" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Check the saved answer" })).toBeEnabled());
      expect(status()).toBe("We could not confirm whether your changes were saved.");
   });

   it("keeps text typed while a save is in flight and shows it as unsaved afterwards", async () => {
      const answer = await seed();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const slow: typeof fetch = async (input, init) => {
         if (init?.method === "PATCH") await gate;
         return api.fetch(input, init);
      };
      await open(answer, { fetch: slow });
      type("Situation", "First");
      fireEvent.click(saveButton());
      await waitFor(() => expect(status()).toBe("Saving…"));
      type("Situation", "First, then more");
      await act(async () => release());
      await waitFor(() => expect(status()).toBe("Unsaved changes"));
      expect(field("Situation")).toHaveValue("First, then more");
      expect((await stored(answer.id)).fields).toEqual({ situation: "First" });
      await save();
      expect(patches().map(({ body }) => (body as { version: number }).version)).toEqual([1, 2]);
   });

   it("warns before the page unloads only while there are unsaved changes", async () => {
      await open(await seed());
      const probe = () => {
         const event = new Event("beforeunload", { cancelable: true });
         window.dispatchEvent(event);
         return event.defaultPrevented;
      };
      expect(probe()).toBe(false);
      type("Situation", "Mine");
      expect(probe()).toBe(true);
      await save();
      expect(probe()).toBe(false);
   });
});

describe("duplicate", () => {
   it("creates a draft copy with the same question and content, then opens it", async () => {
      const original = await seed({ fields: { situation: "S" }, body: "B", status: "ready", framework: "free_form" });
      await open(original);
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      const copyId = nav.push.mock.calls[0][0].replace("/prepare/answers/", "");
      expect(copyId).not.toBe(original.id);
      expect(api.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([`GET /answers/${original.id}`, `POST /answers/${original.id}/duplicate`]);
      const copy = await stored(copyId);
      expect(copy).toMatchObject({
         source: "catalog",
         content_id: S1,
         question_id: "being-stuck",
         question_snapshot: QUESTION,
         snapshot_fallback: false,
         framework: "free_form",
         fields: { situation: "S" },
         body: "B",
         status: "draft",
         version: 1,
      });
   });

   it("shares nothing mutable: editing the original leaves the copy as it was, and the reverse", async () => {
      const original = await seed({ fields: { situation: "S" }, body: "B" });
      await open(original);
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      await waitFor(() => expect(nav.push).toHaveBeenCalled());
      const copyId = nav.push.mock.calls[0][0].replace("/prepare/answers/", "");
      type("Situation", "S edited");
      await save();
      expect((await stored(copyId)).fields).toEqual({ situation: "S" });
      await client().updateAnswer(copyId, { version: 1, body: "B copy", fields: { situation: "S copy" } });
      expect(await stored(original.id)).toMatchObject({ fields: { situation: "S edited" }, body: "B" });
   });

   it("is unavailable while there are unsaved changes, so a copy never pretends to hold them", async () => {
      await open(await seed());
      type("Situation", "Mine");
      expect(screen.getByRole("button", { name: "Duplicate" })).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText(/Save your changes before duplicating/)).toBeInTheDocument();
      await save();
      expect(screen.getByRole("button", { name: "Duplicate" })).toHaveAttribute("aria-disabled", "false");
   });

   it("after a 401 offers sign-in, sends nothing, and a retry once authentication is back makes the copy", async () => {
      const original = await seed();
      let signedIn = true;
      await open(original, { getAccessToken: async () => (signedIn ? token : null) });
      signedIn = false;
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      expect(await screen.findByText(/no copy was made. Sign in again to continue/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", `/login?redirect=${encodeURIComponent(`/prepare/answers/${original.id}`)}`);
      expect(api.requests.filter(({ method }) => method === "POST")).toHaveLength(0);
      expect(nav.push).not.toHaveBeenCalled();
      // The reader signs in again (here: a fresh token) and deliberately tries once more.
      signedIn = true;
      expect(screen.getByRole("button", { name: "Duplicate" })).toHaveAttribute("aria-disabled", "false");
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      expect(api.requests.filter(({ method }) => method === "POST")).toHaveLength(1);
      expect(await client().listAnswers()).toMatchObject({ status: "ok", data: { total: 2 } });
   });

   it("also treats a 401 the server itself sends as a refusal that may be retried", async () => {
      await open(await seed());
      api.failNext(401);
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Duplicate" })).toHaveAttribute("aria-disabled", "false");
   });

   it("treats a server error on a copy as unconfirmed, not as a definite failure", async () => {
      await open(await seed());
      api.failNext(500);
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      expect(await screen.findByText(/could not confirm that the copy was made/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Duplicate" })).toHaveAttribute("aria-disabled", "true");
   });

   it.each([
      ["a 422 validation_error", 422, { detail: "x", code: "validation_error", fields: [{ field: "x", reason: "invalid_value" }] }],
      ["a 409 version_conflict", 409, { detail: "x", code: "version_conflict", current_version: 3 }],
      ["a 2xx body the client cannot read", 201, { not: "an answer" }],
      ["an unexpected 418", 418, { detail: "teapot" }],
   ])("treats %s on a copy as unconfirmed: the request may have made it, so no retry unlocks", async (_name, status, body) => {
      const original = await seed();
      const odd: typeof fetch = async (input, init) => {
         if (init?.method !== "POST") return api.fetch(input, init);
         await api.fetch(input, init);
         return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
      };
      await open(original, { fetch: odd });
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      expect(await screen.findByText(/could not confirm that the copy was made/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Duplicate" })).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      expect(api.requests.filter(({ method }) => method === "POST")).toHaveLength(1);
      expect(nav.push).not.toHaveBeenCalled();
   });

   it("says the answer is gone instead of offering a copy of it", async () => {
      const original = await seed();
      await open(original);
      await client().deleteAnswer(original.id);
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      expect(await screen.findByText(/no longer exists, so it could not be duplicated/)).toBeInTheDocument();
   });

   it("reports an unconfirmed copy and blocks a second attempt until the reader says no copy exists", async () => {
      const original = await seed();
      await open(original);
      api.failNext("network");
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      expect(await screen.findByText(/could not confirm that the copy was made/)).toBeInTheDocument();
      const duplicate = () => screen.getByRole("button", { name: "Duplicate" });
      expect(duplicate()).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(duplicate());
      expect(nav.push).not.toHaveBeenCalled();
      expect(api.requests.filter(({ method }) => method === "POST")).toHaveLength(1);
      // Only the reader's explicit statement re-enables it, and then one more copy is made.
      fireEvent.click(screen.getByRole("button", { name: /no copy exists/ }));
      expect(duplicate()).toHaveAttribute("aria-disabled", "false");
      expect(screen.queryByText(/could not confirm that the copy/)).toBeNull();
      fireEvent.click(duplicate());
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      expect(api.requests.filter(({ method }) => method === "POST")).toHaveLength(2);
   });

   it("is blocked while a copy is being made and after it was made", async () => {
      const original = await seed();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const slow: typeof fetch = async (input, init) => {
         if (init?.method === "POST") await gate;
         return api.fetch(input, init);
      };
      await open(original, { fetch: slow });
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      await screen.findByText("Duplicating…");
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      await act(async () => release());
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      expect(api.requests.filter(({ method }) => method === "POST")).toHaveLength(1);
   });
});

describe("tags", () => {
   const tagBox = () => screen.getByRole("textbox", { name: "Tags" }) as HTMLInputElement;
   const addTag = (text: string) => {
      fireEvent.change(tagBox(), { target: { value: text } });
      fireEvent.keyDown(tagBox(), { key: "Enter" });
   };

   it("adds tags as they will be stored, saves exactly those and sends nothing else", async () => {
      const answer = await seed();
      await open(answer);
      addTag(" Leadership , conflict, LEADERSHIP");
      const list = screen.getByRole("list", { name: "Tags on this answer" });
      expect(list).toHaveTextContent("leadership");
      expect(list).toHaveTextContent("conflict");
      await save();
      expect((await stored(answer.id)).tags).toEqual(["leadership", "conflict"]);
      expect(patches().map(({ body }) => body)).toEqual([{ version: 1, tags: ["leadership", "conflict"] }]);
      expect(status()).toBe("Saved");
   });

   it("keeps a tag typed but not yet confirmed when the field loses focus", async () => {
      const answer = await seed();
      await open(answer);
      fireEvent.change(tagBox(), { target: { value: "migration" } });
      fireEvent.blur(tagBox());
      await waitFor(() => expect(status()).toBe("Saved"));
      expect((await stored(answer.id)).tags).toEqual(["migration"]);
   });

   it("removes one tag and keeps the others", async () => {
      const answer = await seed({ tags: ["a", "b"] });
      await open(answer);
      fireEvent.click(screen.getByRole("button", { name: "Remove tag a" }));
      await save();
      expect((await stored(answer.id)).tags).toEqual(["b"]);
   });

   it("refuses a twenty-first tag in words that name an answer", async () => {
      const answer = await seed({ tags: Array.from({ length: 20 }, (_, i) => `t${i}`) });
      await open(answer);
      addTag("one more");
      expect(screen.getByText("An answer can have at most 20 tags.")).toBeInTheDocument();
      expect(patches()).toHaveLength(0);
   });
});

describe("delete", () => {
   const deleteAnswer = async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete…" }));
      await screen.findByRole("alertdialog");
      fireEvent.click(screen.getByRole("button", { name: "Delete answer" }));
   };

   it("replaces the form with the server's confirmation, moves focus to it and leaves nothing stored", async () => {
      const answer = await seed();
      await open(answer);
      await deleteAnswer();
      const heading = await screen.findByRole("heading", { name: "Answer deleted" });
      expect(heading).toHaveFocus();
      expect(screen.getByRole("status")).toHaveTextContent("The server confirmed that this answer was deleted.");
      expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
      expect(screen.getByRole("link", { name: "Answer a question" })).toHaveAttribute("href", "/prepare/new");
      expect((await client().getAnswer(answer.id)).status).toBe("notFound");
   });

   it("opens the confirmation even when the click that opens it also starts an autosave", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "Typed just before the click.");
      fireEvent.blur(field("Situation")); // what the click's mouse-down does: a blur, which starts the save
      fireEvent.click(screen.getByRole("button", { name: "Delete…" }));
      await screen.findByRole("alertdialog");
      fireEvent.click(screen.getByRole("button", { name: "Delete answer" }));
      await screen.findByRole("heading", { name: "Answer deleted" });
      expect((await client().getAnswer(answer.id)).status).toBe("notFound");
   });

   it("lets go of unsaved edits: the page no longer warns about leaving once the answer is gone", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "Typed, not yet saved.");
      const beforeDelete = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(beforeDelete);
      expect(beforeDelete.defaultPrevented).toBe(true);
      await deleteAnswer();
      await screen.findByRole("heading", { name: "Answer deleted" });
      const afterDelete = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(afterDelete);
      expect(afterDelete.defaultPrevented).toBe(false);
      expect(patches()).toHaveLength(0);
   });

   it("keeps the form and the reader's text when the deletion fails", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "Still here.");
      fireEvent.click(screen.getByRole("button", { name: "Delete…" }));
      await screen.findByRole("alertdialog");
      api.failNext(500);
      fireEvent.click(screen.getByRole("button", { name: "Delete answer" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was deleted.");
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(field("Situation").value).toBe("Still here.");
      expect((await stored(answer.id)).id).toBe(answer.id);
   });

   it("says the answer was not found, and deleted nothing, when it was already gone", async () => {
      const answer = await seed();
      await open(answer);
      await client().deleteAnswer(answer.id);
      await deleteAnswer();
      expect(await screen.findByRole("heading", { name: "Answer not found" })).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("this request deleted nothing");
   });
});
