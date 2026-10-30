import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerEditor } from "@/components/prepare/editor/AnswerEditor";
import { AUTOSAVE_DELAY_MS } from "@/components/prepare/editor/useAnswerEditor";
import { createFakeConsentApi } from "@/components/prepare/ai/consent/fakeConsent";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import type { Answer, AnswerCreate } from "@/lib/prep/types";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const API = "https://api.example.test";
const MINE = { situation: "Our build kept failing.", action: "I added a retry." };
const REFINE = {
   action: "refine",
   result: {
      framework: "star",
      fields: { situation: "Our builds failed repeatedly.", action: "I added a retry to the flaky step." },
      body: null,
      questions_to_ask_yourself: ["What changed after the retry?"],
   },
};
const DRAFT = { action: "draft", result: { framework: "star", fields: { situation: "Generated situation." }, body: null, questions_to_ask_yourself: [] } };
const REVIEW = { action: "review", result: { missing: ["No measurable result."], weak: [], claims_to_verify: [], questions_to_ask_yourself: [] } };

let api: ReturnType<typeof createFakePrepApi>;
let consent: ReturnType<typeof createFakeConsentApi>;
let token: string;
/** Every AI request the browser made, in order. */
let ai: { path: string; body: unknown }[];
let aiReply: () => Promise<Response>;
/** When set, the consent status read waits for it, and when `statusReply` is set it answers instead of the fake. */
let statusHold: Promise<void> | null;
let statusReply: (() => Response) | null;

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const routed: typeof fetch = async (input, init) => {
   const url = String(input);
   if (url.endsWith("/me/prep/ai/consent") && (init?.method ?? "GET") === "GET") {
      await statusHold;
      if (statusReply) {
         consent.requests.push({ method: "GET", path: "", body: undefined });
         return statusReply();
      }
   }
   const consented = consent.handle(url, init);
   if (consented) return consented;
   if (url.includes("/me/prep/ai/")) {
      ai.push({ path: url.slice(url.indexOf("/me/prep")), body: JSON.parse(String(init?.body)) });
      return aiReply();
   }
   return api.fetch(input, init);
};

beforeEach(() => {
   vi.stubEnv("NEXT_PUBLIC_AI_ENABLED", "true");
   api = createFakePrepApi();
   token = api.signIn("user-1");
   // Refine is offered by the server and the reader has accepted the current terms, unless a test says otherwise.
   consent = createFakeConsentApi({ refineAvailable: true });
   consent.grant(token);
   ai = [];
   aiReply = reply(200, REFINE);
   statusHold = null;
   statusReply = null;
});
afterEach(() => vi.unstubAllEnvs());

const client = () => createPrepClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });

async function seed(over: Partial<AnswerCreate> & Record<string, unknown> = {}): Promise<Answer> {
   const result = await client().createAnswer({ source: "custom", question_snapshot: "Tell me about a time you were stuck.", framework: "star", ...over } as AnswerCreate);
   if (result.status !== "ok") throw new Error("seed failed");
   api.requests.length = 0;
   return result.data;
}

async function open(answer: Answer) {
   const view = render(<AnswerEditor apiUrl={API} answerId={answer.id} catalog={null} getAccessToken={async () => token} fetch={routed} />);
   await screen.findByRole("heading", { name: "Your answer" });
   return view;
}

const field = (name: string | RegExp) => screen.getByRole("textbox", { name }) as HTMLTextAreaElement;
const type = (name: string | RegExp, value: string) => fireEvent.change(field(name), { target: { value } });
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const patches = () => api.requests.filter(({ method }) => method === "PATCH");
const stored = async (id: string) => {
   const result = await client().getAnswer(id);
   if (result.status !== "ok") throw new Error("read failed");
   return result.data;
};
const refineButton = () => screen.findByRole("button", { name: "Refine my answer" });
const statusReads = () => consent.requests.filter(({ method }) => method === "GET");
const pastAutosave = () => new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 400));
const isInert = () => Array.from(document.body.children).some((element) => element.hasAttribute("inert"));
const fill = () => {
   type("Situation", MINE.situation);
   type("Action", MINE.action);
};
/** Opens an answer with text in it and waits for Refine to be offered. */
async function ready() {
   const answer = await seed();
   await open(answer);
   await refineButton();
   fill();
   return answer;
}
const refineIt = async () => {
   fireEvent.click(await refineButton());
   return screen.findByRole("region", { name: "Refine preview" });
};
const alertAfterRefine = async () => {
   fireEvent.click(await refineButton());
   return screen.findByRole("alert");
};

describe("Refine availability", () => {
   it("draws no Refine control until the status read has answered, then draws it when the server says true", async () => {
      let release!: () => void;
      statusHold = new Promise<void>((resolve) => (release = resolve));
      await open(await seed());
      expect(screen.getByRole("button", { name: "Review my answer" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Refine my answer" })).toBeNull();

      release();
      expect(await refineButton()).toBeInTheDocument();
   });

   it("makes exactly one status read for the mount, and it accepts nothing, opens no dialog, starts no AI request and creates no usage", async () => {
      await open(await seed());
      await refineButton();
      fill();
      await pastAutosave();

      expect(consent.requests.map(({ method, path }) => `${method} ${path}`)).toEqual(["GET "]);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(consent.status(token).accepted).toBe(true);
      expect(ai).toEqual([]);
      expect(isInert()).toBe(false);
   });

   it("makes one status read, not two, when the editor mounts under React Strict Mode, and the control still appears", async () => {
      let release!: () => void;
      statusHold = new Promise<void>((resolve) => (release = resolve));
      const answer = await seed();
      render(
         <StrictMode>
            <AnswerEditor apiUrl={API} answerId={answer.id} catalog={null} getAccessToken={async () => token} fetch={routed} />
         </StrictMode>,
      );
      await screen.findByRole("heading", { name: "Your answer" });
      expect(screen.queryByRole("button", { name: "Refine my answer" })).toBeNull();

      release();
      expect(await refineButton()).toBeInTheDocument();
      await pastAutosave();
      expect(statusReads()).toHaveLength(1);
      expect(consent.requests.map(({ method, path }) => `${method} ${path}`)).toEqual(["GET "]);
      expect(ai).toEqual([]);
   });

   it("stays hidden when the server says false", async () => {
      consent.refineAvailable = false;
      await open(await seed());
      await waitFor(() => expect(statusReads()).toHaveLength(1));
      await pastAutosave();
      expect(screen.queryByRole("button", { name: "Refine my answer" })).toBeNull();
      expect(screen.getByRole("button", { name: "Draft from my notes" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Review my answer" })).toBeInTheDocument();
   });

   it("stays hidden when the field is absent", async () => {
      consent.override = { refine_available: undefined };
      await open(await seed());
      await waitFor(() => expect(statusReads()).toHaveLength(1));
      await pastAutosave();
      expect(screen.queryByRole("button", { name: "Refine my answer" })).toBeNull();
   });

   it.each([["the string true", "true"], ["the number 1", 1], ["null", null], ["an object", { yes: true }], ["an array", [true]]])("stays hidden when the field is %s", async (_name, value) => {
      consent.override = { refine_available: value };
      await open(await seed());
      await waitFor(() => expect(statusReads()).toHaveLength(1));
      await pastAutosave();
      expect(screen.queryByRole("button", { name: "Refine my answer" })).toBeNull();
      expect(screen.getByRole("button", { name: "Draft from my notes" })).toBeInTheDocument();
   });

   it("stays hidden when the status read fails with a server error", async () => {
      consent.failNext = "GET";
      await open(await seed());
      await waitFor(() => expect(statusReads()).toHaveLength(1));
      await pastAutosave();
      expect(screen.queryByRole("button", { name: "Refine my answer" })).toBeNull();
      expect(screen.getByRole("button", { name: "Review my answer" })).toBeInTheDocument();
   });

   it("stays hidden when the reader is not authenticated for the read", async () => {
      statusReply = () => new Response(JSON.stringify({ code: "unauthenticated" }), { status: 401 });
      await open(await seed());
      await waitFor(() => expect(statusReads()).toHaveLength(1));
      await pastAutosave();
      expect(screen.queryByRole("button", { name: "Refine my answer" })).toBeNull();
   });

   it("stays hidden when the network fails, and still draws no error for it", async () => {
      statusReply = () => {
         throw new TypeError("network down");
      };
      await open(await seed());
      await waitFor(() => expect(statusReads()).toHaveLength(1));
      await pastAutosave();
      expect(screen.queryByRole("button", { name: "Refine my answer" })).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
   });

   it("is not hidden by missing consent: the control shows, and nothing is asked until it is chosen", async () => {
      const fresh = createFakeConsentApi({ refineAvailable: true });
      consent = fresh; // no grant: this reader has never accepted
      await open(await seed());
      expect(await refineButton()).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(consent.status(token).accepted).toBe(false);
      expect(ai).toEqual([]);
   });

   it("is not hidden by a withdrawn consent either", async () => {
      await consent.handle(`${API}/me/prep/ai/consent/withdraw`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      consent.requests.length = 0;
      await open(await seed());
      expect(await refineButton()).toBeInTheDocument();
      expect(consent.status(token).accepted).toBe(false);
      expect(screen.queryByRole("dialog")).toBeNull();
   });

   it("makes no status read, and draws nothing, while the build's AI setting is off", async () => {
      vi.stubEnv("NEXT_PUBLIC_AI_ENABLED", "");
      await open(await seed());
      await pastAutosave();
      expect(consent.requests).toEqual([]);
      expect(screen.queryByRole("button", { name: "Refine my answer" })).toBeNull();
   });

   it("names Refine in the provider disclosure only when it is offered", async () => {
      consent.refineAvailable = false;
      const hidden = await open(await seed());
      await waitFor(() => expect(statusReads()).toHaveLength(1));
      expect(screen.getByText(/When you choose Draft or Review, your question/)).toBeInTheDocument();
      hidden.unmount();

      consent.refineAvailable = true;
      await open(await seed());
      await refineButton();
      expect(screen.getByText(/When you choose Draft, Review or Refine, your question/)).toBeInTheDocument();
      expect(screen.getByText(/Refine suggests a rewrite of your own answer as a preview/)).toBeInTheDocument();
      // No plan, price or provider detail beyond the disclosure that Draft and Review already carry.
      expect(screen.getByRole("button", { name: "Refine my answer" })).toHaveAccessibleDescription(/Results are previews.*Refine suggests a rewrite/);
      expect(document.getElementById(button("Refine my answer").getAttribute("aria-describedby")!.split(" ")[1])).not.toHaveTextContent(/premium|upgrade|subscription|plan/i);
   });
});

describe("Refine and consent", () => {
   beforeEach(() => {
      consent = createFakeConsentApi({ refineAvailable: true }); // never accepted
   });

   it("opens the existing consent dialog, sends nothing before acceptance, then sends the Refine request exactly once", async () => {
      await ready();
      fireEvent.click(button("Refine my answer"));
      const box = await screen.findByRole("dialog", { name: "Use AI help on your answer?" });
      expect(ai).toEqual([]);
      expect(isInert()).toBe(true);

      fireEvent.click(within(box).getByRole("button", { name: "Accept and continue" }));
      await screen.findByRole("region", { name: "Refine preview" });
      expect(ai.map(({ path }) => path)).toEqual(["/me/prep/ai/refine"]);
      expect(consent.requests.filter(({ method, path }) => method === "POST" && path === "")).toHaveLength(1);
      expect(screen.queryByRole("dialog", { name: "Use AI help on your answer?" })).toBeNull();
      expect(isInert()).toBe(false);
   });

   it("Decline closes the dialog, stores nothing and sends no Refine request", async () => {
      const answer = await ready();
      fireEvent.click(button("Refine my answer"));
      fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Decline" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(ai).toEqual([]);
      expect(consent.status(token).accepted).toBe(false);
      expect(screen.getByText(/AI help was not used\. Nothing was sent and your answer is unchanged/)).toBeInTheDocument();
      expect(field("Situation")).toHaveValue(MINE.situation);
      expect(screen.getByRole("button", { name: "Refine my answer" })).toBeInTheDocument();
      await pastAutosave();
      expect((await stored(answer.id)).fields).toEqual({ situation: MINE.situation, action: MINE.action });
      expect(isInert()).toBe(false);
   });

   it("asks again after a withdrawal, through the same dialog", async () => {
      consent.grant(token);
      await ready();
      await consent.handle(`${API}/me/prep/ai/consent/withdraw`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });

      fireEvent.click(button("Refine my answer"));
      await screen.findByRole("dialog", { name: "Use AI help on your answer?" });
      expect(ai).toEqual([]);
   });
});

describe("Refine request and preview", () => {
   it("sends the Review request shape to the Refine route, with the typed text and nothing else", async () => {
      aiReply = reply(200, { ...REFINE, result: { ...REFINE.result, fields: { situation: "Our builds failed repeatedly." } } });
      await open(await seed());
      await refineButton();
      type("Situation", MINE.situation);

      await refineIt();

      expect(ai).toHaveLength(1);
      expect(ai[0].path).toBe("/me/prep/ai/refine");
      expect(ai[0].body).toEqual({
         question: "Tell me about a time you were stuck.",
         guidance: null,
         framework: "star",
         answer: { body: null, fields: { situation: MINE.situation } },
         stories: [],
      });
   });

   it("sends nothing when there is no text", async () => {
      await open(await seed());
      fireEvent.click(await refineButton());
      expect(ai).toEqual([]);
   });

   it("announces the wait, keeps the text and ignores a second click while the request runs", async () => {
      await ready();
      let release!: () => void;
      aiReply = () => new Promise((resolve) => (release = () => resolve(new Response(JSON.stringify(REFINE), { status: 200 }))));

      fireEvent.click(button("Refine my answer"));
      const status = await screen.findByText(/Refining your answer/);
      expect(status.closest('[role="status"]')).not.toBeNull();
      expect(button("Refine my answer")).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(button("Refine my answer"));
      fireEvent.click(button("Draft from my notes"));
      fireEvent.click(button("Review my answer"));
      type("Task", "Typed while waiting.");
      expect(ai).toHaveLength(1);
      expect(field("Situation")).toHaveValue(MINE.situation);

      release();
      await screen.findByRole("region", { name: "Refine preview" });
      expect(screen.getByText(/Refinement ready\. Compare it with your text before using it\./)).toBeInTheDocument();
      expect(field("Task")).toHaveValue("Typed while waiting.");
      expect(button("Refine my answer")).not.toHaveAttribute("aria-disabled", "true");
   });

   it("shows the reader's text and the suggestion side by side in words, and changes nothing by opening", async () => {
      const answer = await ready();
      const preview = await refineIt();

      expect(within(preview).getAllByText("Your text now")).toHaveLength(2);
      expect(within(preview).getAllByText("Suggested refinement")).toHaveLength(2);
      expect(within(preview).getByRole("heading", { name: "Situation" })).toBeInTheDocument();
      expect(within(preview).getByRole("heading", { name: "Action" })).toBeInTheDocument();
      expect(within(preview).getByText(MINE.situation)).toBeInTheDocument();
      expect(within(preview).getByText("Our builds failed repeatedly.")).toBeInTheDocument();
      expect(within(preview).getByText("What changed after the retry?")).toBeInTheDocument();
      expect(preview).not.toHaveTextContent(/better|best|guarantee|improves|correct/i);
      for (const name of ["Apply refinement", "Insert refinement", "Discard refinement"]) expect(within(preview).getByRole("button", { name })).toBeInTheDocument();

      expect(field("Situation")).toHaveValue(MINE.situation);
      expect(field("Action")).toHaveValue(MINE.action);
      await pastAutosave();
      // The only write is the reader's own typing; the suggestion arriving saved nothing.
      expect(patches().map(({ body }) => body)).toEqual([expect.objectContaining({ fields: MINE })]);
      expect(JSON.stringify(await stored(answer.id))).not.toContain("Our builds failed repeatedly.");
   });

   it("says plainly when the suggestion leaves a place unchanged", async () => {
      aiReply = reply(200, { ...REFINE, result: { ...REFINE.result, fields: { situation: MINE.situation, action: "I added a retry to the flaky step." } } });
      await ready();
      const preview = await refineIt();
      expect(within(preview).getAllByText("No change suggested here.")).toHaveLength(1);
   });

   it("Apply puts the suggestion in the editor only when chosen, and only then does the normal save write it", async () => {
      const answer = await seed({ fields: { task: "My task." } });
      await open(answer);
      await refineButton();
      fill();
      await refineIt();
      await waitFor(() => expect(patches()).toHaveLength(1), { timeout: AUTOSAVE_DELAY_MS + 2000 });
      api.requests.length = 0;

      fireEvent.click(button("Apply refinement"));

      expect(screen.queryByRole("region", { name: "Refine preview" })).toBeNull();
      expect(field("Situation")).toHaveValue("Our builds failed repeatedly.");
      expect(field("Action")).toHaveValue("I added a retry to the flaky step.");
      expect(field("Task")).toHaveValue("My task.");
      expect(screen.getByRole("button", { name: "Refine my answer" })).toHaveFocus();
      expect(screen.getByText(/Refinement applied\. It is saved with your answer like anything you type\./)).toBeInTheDocument();
      expect(patches()).toEqual([]);
      await waitFor(() => expect(patches()).toHaveLength(1), { timeout: AUTOSAVE_DELAY_MS + 2000 });
      expect((await stored(answer.id)).fields).toEqual({ situation: "Our builds failed repeatedly.", task: "My task.", action: "I added a retry to the flaky step." });
   });

   it("Insert adds the suggestion after the reader's text and removes nothing", async () => {
      await ready();
      await refineIt();

      fireEvent.click(button("Insert refinement"));

      expect(field("Situation")).toHaveValue(`${MINE.situation}\n\nOur builds failed repeatedly.`);
      expect(field("Action")).toHaveValue(`${MINE.action}\n\nI added a retry to the flaky step.`);
      expect(screen.queryByRole("region", { name: "Refine preview" })).toBeNull();
      expect(screen.getByRole("button", { name: "Refine my answer" })).toHaveFocus();
   });

   it("Discard keeps the original, persists nothing from the suggestion, and returns focus", async () => {
      const answer = await ready();
      await refineIt();

      fireEvent.click(button("Discard refinement"));

      expect(screen.queryByRole("region", { name: "Refine preview" })).toBeNull();
      expect(field("Situation")).toHaveValue(MINE.situation);
      expect(field("Action")).toHaveValue(MINE.action);
      expect(screen.getByText("Refinement discarded. Nothing was saved from it.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Refine my answer" })).toHaveFocus();
      await pastAutosave();
      expect(JSON.stringify(await stored(answer.id))).not.toContain("Our builds failed repeatedly.");
   });

   it("refines a free-form answer into its body", async () => {
      aiReply = reply(200, { action: "refine", result: { framework: "free_form", fields: {}, body: "A tighter version of my story.", questions_to_ask_yourself: [] } });
      await open(await seed({ framework: "free_form" }));
      await refineButton();
      type(/Your answer/, "My long story.");
      const preview = await refineIt();
      expect(within(preview).getByText("My long story.")).toBeInTheDocument();
      expect(within(preview).getByText("A tighter version of my story.")).toBeInTheDocument();
      expect(ai[0].body).toMatchObject({ framework: "free_form", answer: { body: "My long story.", fields: {} } });

      fireEvent.click(button("Apply refinement"));
      expect(field(/Your answer/)).toHaveValue("A tighter version of my story.");
   });

   it("offers only Discard when the suggestion is empty", async () => {
      aiReply = reply(200, { action: "refine", result: { framework: "star", fields: {}, body: null, questions_to_ask_yourself: ["What was the result?"] } });
      await ready();
      const preview = await refineIt();
      expect(within(preview).getByText(/Refine suggested no rewrite, so there is nothing to apply/)).toBeInTheDocument();
      expect(within(preview).queryByRole("button", { name: "Apply refinement" })).toBeNull();
      expect(within(preview).queryByRole("button", { name: "Insert refinement" })).toBeNull();
      expect(within(preview).getByRole("button", { name: "Discard refinement" })).toBeInTheDocument();
   });

   it("a second run replaces the first preview and never mixes the two", async () => {
      await ready();
      await refineIt();
      fireEvent.click(button("Discard refinement"));

      aiReply = reply(200, { ...REFINE, result: { ...REFINE.result, fields: { situation: "Second situation.", action: "Second action." }, questions_to_ask_yourself: [] } });
      const preview = await refineIt();

      expect(ai).toHaveLength(2);
      expect(within(preview).getByText("Second situation.")).toBeInTheDocument();
      expect(within(preview).queryByText("Our builds failed repeatedly.")).toBeNull();
      expect(within(preview).queryByText("What changed after the retry?")).toBeNull();
   });

   it("Apply uses what the editor holds when it is clicked, so text typed while the preview is open is not lost where the suggestion is silent", async () => {
      aiReply = reply(200, { ...REFINE, result: { ...REFINE.result, fields: { situation: "Our builds failed repeatedly." } } });
      await ready();
      await refineIt();
      type("Action", "Edited while the preview was open.");
      fireEvent.click(button("Apply refinement"));
      expect(field("Situation")).toHaveValue("Our builds failed repeatedly.");
      expect(field("Action")).toHaveValue("Edited while the preview was open.");
   });

   it("a reply that arrives after the editor is gone changes nothing in the next answer and raises no error", async () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const first = await seed({ question_snapshot: "First question." });
      const second = await seed({ question_snapshot: "Second question." });
      const view = await open(first);
      await refineButton();
      fill();
      let release!: () => void;
      aiReply = () => new Promise((resolve) => (release = () => resolve(new Response(JSON.stringify(REFINE), { status: 200 }))));
      fireEvent.click(button("Refine my answer"));
      await waitFor(() => expect(ai).toHaveLength(1));
      view.unmount();

      await open(second);
      await refineButton();
      release();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(screen.queryByRole("region", { name: "Refine preview" })).toBeNull();
      expect(field("Situation")).toHaveValue("");
      expect(field("Action")).toHaveValue("");
      expect((await stored(second.id)).fields).toEqual({});
      expect(errors).not.toHaveBeenCalled();
      errors.mockRestore();
   });

   it.each([
      ["names a framework the answer does not use", { framework: "free_form", fields: {}, body: "Text." }],
      ["fills a STAR section the reader left empty", { framework: "star", fields: { result: "I invented a result." }, body: null }],
      ["fills a body for a STAR answer", { framework: "star", fields: {}, body: "Extra body." }],
      ["uses a key that is not a STAR key", { framework: "star", fields: { motive: "x" }, body: null }],
      ["is not an object", "refined"],
   ])("treats a reply that %s as malformed output and keeps the text", async (_name, result) => {
      aiReply = reply(200, { action: "refine", result: typeof result === "string" ? result : { questions_to_ask_yourself: [], ...result } });
      const answer = await ready();
      const alert = await alertAfterRefine();
      expect(alert).toHaveTextContent("We couldn't refine your answer just now.");
      expect(alert).toHaveTextContent("Your text is unchanged and nothing was saved from this.");
      expect(screen.queryByRole("region", { name: "Refine preview" })).toBeNull();
      expect(field("Situation")).toHaveValue(MINE.situation);
      await pastAutosave();
      expect((await stored(answer.id)).fields).toEqual(MINE);
   });

   it("rejects a reply whose action is not refine", async () => {
      aiReply = reply(200, DRAFT);
      await ready();
      expect(await alertAfterRefine()).toHaveTextContent("We couldn't refine your answer just now.");
      expect(screen.queryByRole("region", { name: "Refine preview" })).toBeNull();
   });
});

describe("Refine error states", () => {
   const states: [string, number, Record<string, unknown>, RegExp, string][] = [
      ["ai_quota_exhausted", 429, { window: "day", resets_at: "2026-10-31T00:00:00Z" }, /used today's AI help, so we couldn't refine your answer\. It renews at /, "ai_quota_exhausted"],
      ["ai_busy", 429, { retry_after_seconds: 30 }, /AI help is busy, so we couldn't refine your answer just now\..* try again in about 30 seconds\./, "ai_busy"],
      ["ai_unavailable", 503, {}, /AI help is unavailable, so we couldn't refine your answer just now\..* try again later\./, "ai_unavailable"],
      ["ai_input_too_large", 413, {}, /too long for AI help to read, so we couldn't refine your answer/, "ai_input_too_large"],
      ["ai_not_entitled", 403, {}, /isn't included in your plan, so we couldn't refine your answer/, "ai_not_entitled"],
      ["ai_disabled", 403, {}, /AI help isn't available right now, so we couldn't refine your answer/, "ai_disabled"],
      ["a code this build does not know", 500, {}, /We couldn't refine your answer just now/, "error"],
   ];

   it.each(states)("%s (%#) renders its own state, keeps the text, retries nothing and offers no upgrade", async (name, status, extra, expected, marker) => {
      aiReply = reply(status, { detail: "provider said something private", code: name.startsWith("a code") ? "internal_error" : name, ...extra });
      const answer = await ready();

      const alert = await alertAfterRefine();

      expect(alert).toHaveTextContent(expected);
      expect(alert).toHaveAttribute("data-ai-state", marker);
      expect(alert).toHaveTextContent("Your text is unchanged and nothing was saved from this.");
      expect(alert).not.toHaveTextContent(/provider said something private|groq|openai|premium|plan:/i);
      expect(alert).not.toHaveTextContent(/upgrade|pricing|subscribe/i);
      expect(within(alert).queryByRole("link")).toBeNull();
      expect(document.querySelector('a[href*="pricing"]')).toBeNull();
      expect(field("Situation")).toHaveValue(MINE.situation);
      expect(field("Action")).toHaveValue(MINE.action);
      expect(screen.queryByRole("region", { name: "Refine preview" })).toBeNull();
      // Nothing retries on its own, and the control stays for the reader's own next attempt.
      await new Promise((resolve) => setTimeout(resolve, 1300));
      expect(ai).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Refine my answer" })).not.toHaveAttribute("aria-disabled", "true");
      await pastAutosave();
      expect((await stored(answer.id)).fields).toEqual(MINE);
   });

   it("a consent change reported by the route asks the same gate once more and sends nothing else", async () => {
      aiReply = reply(403, { code: "ai_consent_required" });
      await ready();
      const alert = await alertAfterRefine();
      expect(alert).toHaveTextContent("Your AI consent has changed, so nothing was sent. Choose the action again to continue.");
      expect(ai).toHaveLength(1);
      expect(field("Situation")).toHaveValue(MINE.situation);
   });

   it("a network failure keeps the text and shows the ordinary failure", async () => {
      aiReply = async () => {
         throw new TypeError("network down");
      };
      const answer = await ready();
      const alert = await alertAfterRefine();
      expect(alert).toHaveTextContent("We couldn't refine your answer just now.");
      expect(alert).toHaveAttribute("data-ai-state", "error");
      expect(field("Situation")).toHaveValue(MINE.situation);
      expect(ai).toHaveLength(1);
      await pastAutosave();
      expect((await stored(answer.id)).fields).toEqual(MINE);
   });

   it("a stale true does not bypass the server: a Free reader's request ends in the not-entitled state with no upsell", async () => {
      consent.refineAvailable = true;
      aiReply = reply(403, { code: "ai_not_entitled" });
      await ready();
      const alert = await alertAfterRefine();
      expect(alert).toHaveAttribute("data-ai-state", "ai_not_entitled");
      expect(ai.map(({ path }) => path)).toEqual(["/me/prep/ai/refine"]);
      expect(within(alert).queryByRole("link")).toBeNull();
   });

   it("an ended session says so and links to sign in, with the text kept", async () => {
      aiReply = async () => new Response("{}", { status: 401 });
      await ready();
      const alert = await alertAfterRefine();
      expect(alert).toHaveTextContent("Your session has ended. Your answer remains unchanged");
      expect(within(alert).getByRole("link", { name: "Sign in" })).toBeInTheDocument();
      expect(field("Situation")).toHaveValue(MINE.situation);
   });
});

describe("Refine beside Draft and Review", () => {
   it("keeps the three previews apart and Draft and Review as they were", async () => {
      const answer = await ready();

      aiReply = reply(200, DRAFT);
      fireEvent.click(button("Draft from my notes"));
      const draft = await screen.findByRole("region", { name: "Draft preview" });
      expect(within(draft).getByText("Generated situation.")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Refine preview" })).toBeNull();
      fireEvent.click(button("Discard draft"));

      aiReply = reply(200, REVIEW);
      fireEvent.click(button("Review my answer"));
      const review = await screen.findByRole("region", { name: "Review preview" });
      expect(within(review).getByText("No measurable result.")).toBeInTheDocument();
      fireEvent.click(button("Discard review"));

      aiReply = reply(200, REFINE);
      const refine = await refineIt();
      expect(within(refine).queryByText("Generated situation.")).toBeNull();
      expect(within(refine).queryByText("No measurable result.")).toBeNull();

      expect(ai.map(({ path }) => path)).toEqual(["/me/prep/ai/draft", "/me/prep/ai/review", "/me/prep/ai/refine"]);
      expect(field("Situation")).toHaveValue(MINE.situation);
      await pastAutosave();
      expect((await stored(answer.id)).fields).toEqual(MINE);
   });

   it("autosave and the AI request never trigger each other", async () => {
      const answer = await ready();
      await waitFor(() => expect(patches()).toHaveLength(1), { timeout: AUTOSAVE_DELAY_MS + 2000 });
      expect(ai).toEqual([]);
      await refineIt();
      await pastAutosave();
      expect(patches()).toHaveLength(1);
      expect((await stored(answer.id)).fields).toEqual(MINE);
   });
});

describe("Refine on a narrow screen", () => {
   let setNarrow: (next: boolean) => void;

   beforeEach(() => {
      let narrow = true;
      const listeners = new Set<() => void>();
      vi.stubGlobal("matchMedia", (query: string) => ({
         get matches() {
            return narrow && query.includes("max-width");
         },
         addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
         removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      }));
      setNarrow = (next) => {
         narrow = next;
         act(() => listeners.forEach((listener) => listener()));
      };
   });
   afterEach(() => vi.unstubAllGlobals());

   const behind = (name: string) => screen.getByRole("textbox", { name, hidden: true }) as HTMLTextAreaElement;
   const sheetOf = () => screen.findByRole("dialog", { name: "Refine suggestion" });
   const openSheet = async () => {
      await ready();
      button("Refine my answer").focus();
      fireEvent.click(button("Refine my answer"));
      return sheetOf();
   };

   it("opens the suggestion in a labelled sheet, focuses its title and makes the page behind it inert", async () => {
      const sheet = await openSheet();
      expect(screen.queryByRole("region", { name: "Refine preview" })).toBeNull();
      expect(sheet).toHaveAccessibleDescription(/Nothing in your answer changes until you apply or insert/);
      expect(document.activeElement).toBe(within(sheet).getByRole("heading", { name: "Refine suggestion" }));
      expect(isInert()).toBe(true);
      expect(behind("Situation").closest("[inert]")).not.toBeNull();
      expect(behind("Situation")).toHaveValue(MINE.situation);
      for (const name of ["Apply refinement", "Insert refinement", "Discard refinement"]) expect(within(sheet).getByRole("button", { name })).toBeInTheDocument();
      expect(within(sheet).getAllByText("Your text now").length).toBeGreaterThan(0);
      expect(within(sheet).getAllByText("Suggested refinement").length).toBeGreaterThan(0);
   });

   it("keeps focus inside while open", async () => {
      const sheet = await openSheet();
      const controls = Array.from(sheet.querySelectorAll<HTMLElement>("button")).filter((el) => !el.hasAttribute("disabled"));
      controls[controls.length - 1].focus();
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab" });
      await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
   });

   it("Escape hides the sheet without applying or discarding, releases the page and returns focus to Refine, and the result can be reopened", async () => {
      await openSheet();

      fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(isInert()).toBe(false);
      expect(screen.getByRole("button", { name: "Refine my answer" })).toHaveFocus();
      expect(field("Situation")).toHaveValue(MINE.situation);
      fireEvent.click(button("Show refinement preview"));
      await sheetOf();
      expect(isInert()).toBe(true);
   });

   it("Apply in the sheet changes the editor, closes the sheet, releases the page and puts focus back", async () => {
      const sheet = await openSheet();
      fireEvent.click(within(sheet).getByRole("button", { name: "Apply refinement" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(isInert()).toBe(false);
      expect(field("Situation")).toHaveValue("Our builds failed repeatedly.");
      expect(screen.getByRole("button", { name: "Refine my answer" })).toHaveFocus();
   });

   it("Insert and Discard in the sheet close it and release the page", async () => {
      let sheet = await openSheet();
      fireEvent.click(within(sheet).getByRole("button", { name: "Insert refinement" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(isInert()).toBe(false);
      expect(field("Situation")).toHaveValue(`${MINE.situation}\n\nOur builds failed repeatedly.`);

      fireEvent.click(button("Refine my answer"));
      sheet = await sheetOf();
      fireEvent.click(within(sheet).getByRole("button", { name: "Discard refinement" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(isInert()).toBe(false);
      expect(screen.getByRole("button", { name: "Refine my answer" })).toHaveFocus();
   });

   it("never saves anything from the sheet by itself", async () => {
      const answer = await ready();
      await waitFor(() => expect(patches()).toHaveLength(1), { timeout: AUTOSAVE_DELAY_MS + 2000 });
      fireEvent.click(button("Refine my answer"));
      await sheetOf();
      await pastAutosave();
      expect(patches()).toHaveLength(1);
      expect((await stored(answer.id)).fields).toEqual(MINE);
   });

   it("does not open a sheet or make the page inert when the request fails", async () => {
      aiReply = reply(503, { code: "ai_unavailable" });
      await ready();
      fireEvent.click(button("Refine my answer"));
      await screen.findByRole("alert");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(isInert()).toBe(false);
   });

   it("shows the comparison inline again, with the page released, when the viewport grows while the sheet is open", async () => {
      await openSheet();
      setNarrow(false);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(isInert()).toBe(false);
      expect(await screen.findByRole("region", { name: "Refine preview" })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("button", { name: "Refine my answer" })).toHaveFocus());
   });
});
