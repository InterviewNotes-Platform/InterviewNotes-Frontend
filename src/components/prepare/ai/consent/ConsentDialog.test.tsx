import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerEditor } from "@/components/prepare/editor/AnswerEditor";
import { AUTOSAVE_DELAY_MS } from "@/components/prepare/editor/useAnswerEditor";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { PRIVACY_DOCUMENT_ID, PRIVACY_HREF, PRIVACY_VERSION } from "@/lib/privacy";
import type { Answer } from "@/lib/prep/types";
import { createFakeConsentApi } from "./fakeConsent";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const API = "https://api.example.test";
const DRAFT = { action: "draft", result: { framework: "star", fields: { situation: "Generated situation." }, body: null, questions_to_ask_yourself: [] } };
const REVIEW = { action: "review", result: { missing: ["No result."], weak: [], claims_to_verify: [], questions_to_ask_yourself: [] } };
const NEW_VERSION = "2027-01-15";

let api: ReturnType<typeof createFakePrepApi>;
let consent: ReturnType<typeof createFakeConsentApi>;
let token: string;
/** Every Draft or Review request that reached the (mocked) AI route. */
let ai: { path: string; body: unknown }[];
let aiReply: () => Promise<Response>;
/** When set, a consent status read waits for it before the server answers, and `statusStarted` counts the reads that began. */
let statusHold: Promise<void> | null;
let statusStarted: number;

const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const routed: typeof fetch = async (input, init) => {
   const url = String(input);
   if (url.endsWith("/me/prep/ai/consent") && (init?.method ?? "GET") === "GET") {
      statusStarted++;
      await statusHold;
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
   consent = createFakeConsentApi();
   ai = [];
   aiReply = json(200, DRAFT);
   statusHold = null;
   statusStarted = 0;
});
afterEach(() => vi.unstubAllEnvs());

async function seed(): Promise<Answer> {
   const result = await createPrepClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch }).createAnswer({
      source: "custom",
      question_snapshot: "Tell me about a time you were stuck.",
      framework: "star",
   } as never);
   if (result.status !== "ok") throw new Error("seed failed");
   return result.data;
}

async function open(answer: Answer, as = () => token) {
   const view = render(<AnswerEditor apiUrl={API} answerId={answer.id} catalog={null} getAccessToken={async () => as()} fetch={routed} />);
   await screen.findByRole("heading", { name: "Your answer" });
   return view;
}

const field = (name: string) => screen.getByRole("textbox", { name }) as HTMLTextAreaElement;
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const dialog = () => screen.findByRole("dialog", { name: "Use AI help on your answer?" });
const noDialog = () => expect(screen.queryByRole("dialog")).toBeNull();
const accepts = () => consent.requests.filter(({ method, path }) => method === "POST" && path === "");
const pastAutosave = () => new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 400));
const isInert = () => Array.from(document.body.children).some((element) => element.hasAttribute("inert"));

async function acceptIn(box: HTMLElement) {
   fireEvent.click(within(box).getByRole("button", { name: "Accept and continue" }));
}

describe("first-use AI consent dialog", () => {
   it("never opens, and never calls the consent API, at page load", async () => {
      await open(await seed());
      type("Situation", "Typed text.");
      await pastAutosave();
      noDialog();
      expect(consent.requests).toEqual([]);
      expect(ai).toEqual([]);
   });

   it("asks at the first action, sends nothing until accepted, then sends the requested action exactly once", async () => {
      await open(await seed());
      type("Situation", "Our build kept failing.");
      fireEvent.click(button("Draft from my notes"));

      const box = await dialog();
      expect(ai).toEqual([]);
      expect(consent.requests.map(({ method }) => method)).toEqual(["GET"]);
      expect(within(box).getByRole("link", { name: /Privacy & AI Use page/ })).toHaveAttribute("href", PRIVACY_HREF);
      expect(within(box).getByRole("button", { name: "Decline" })).toBeInTheDocument();

      await acceptIn(box);
      await screen.findByRole("region", { name: "Draft preview" });
      noDialog();
      expect(accepts().map(({ body }) => body)).toEqual([{ document_id: PRIVACY_DOCUMENT_ID, version: PRIVACY_VERSION }]);
      expect(ai).toHaveLength(1);
      expect(ai[0].path).toBe("/me/prep/ai/draft");
      expect(isInert()).toBe(false);
   });

   it("performs the requested Review, not a Draft, after accepting", async () => {
      aiReply = json(200, REVIEW);
      await open(await seed());
      type("Situation", "Our build kept failing.");
      fireEvent.click(button("Review my answer"));
      await acceptIn(await dialog());
      await screen.findByRole("region", { name: "Review preview" });
      expect(ai.map(({ path }) => path)).toEqual(["/me/prep/ai/review"]);
   });

   it("does not ask again once the current version is accepted, in this editor or a second browser context", async () => {
      const answer = await seed();
      const first = await open(answer);
      type("Situation", "Our build kept failing.");
      fireEvent.click(button("Draft from my notes"));
      await acceptIn(await dialog());
      await screen.findByRole("region", { name: "Draft preview" });
      fireEvent.click(button("Discard draft"));
      fireEvent.click(button("Review my answer"));
      await waitFor(() => expect(ai).toHaveLength(2));
      noDialog();
      first.unmount();

      // A second browser context has no memory of the first: only the server's record can spare the user the question.
      await open(answer);
      type("Situation", "Our build kept failing.");
      fireEvent.click(button("Draft from my notes"));
      await screen.findByRole("region", { name: "Draft preview" });
      noDialog();
      expect(accepts()).toHaveLength(1);
      expect(ai).toHaveLength(3);
   });

   it("sends one acceptance and one request for a double click on Accept", async () => {
      await open(await seed());
      type("Situation", "Our build kept failing.");
      fireEvent.click(button("Draft from my notes"));
      const box = await dialog();
      const accept = within(box).getByRole("button", { name: "Accept and continue" });
      fireEvent.click(accept);
      fireEvent.click(accept);
      fireEvent.click(accept);
      await screen.findByRole("region", { name: "Draft preview" });
      await pastAutosave();
      expect(accepts()).toHaveLength(1);
      expect(ai).toHaveLength(1);
   });

   it("opens one dialog and checks once for repeated clicks on the action", async () => {
      await open(await seed());
      type("Situation", "Our build kept failing.");
      fireEvent.click(button("Draft from my notes"));
      fireEvent.click(button("Draft from my notes"));
      fireEvent.click(button("Review my answer"));
      await dialog();
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(consent.requests.filter(({ method }) => method === "GET")).toHaveLength(1);
   });

   describe("Decline", () => {
      it("closes the dialog, stores nothing, sends no AI request and leaves the answer editable and saveable", async () => {
         const answer = await seed();
         await open(answer);
         type("Situation", "Typed before.");
         fireEvent.click(button("Draft from my notes"));
         fireEvent.click(within(await dialog()).getByRole("button", { name: "Decline" }));

         await waitFor(() => noDialog());
         expect(ai).toEqual([]);
         expect(accepts()).toEqual([]);
         expect(consent.status(token).accepted).toBe(false);
         expect(screen.getByText(/AI help was not used\. Nothing was sent/)).toBeInTheDocument();
         expect(isInert()).toBe(false);

         // Non-AI work is untouched: edit, autosave and navigation still work.
         type("Task", "Typed after declining.");
         await waitFor(() => expect(api.requests.some(({ method }) => method === "PATCH")).toBe(true), { timeout: AUTOSAVE_DELAY_MS + 2000 });
         const stored = await createPrepClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch }).getAnswer(answer.id);
         expect(stored.status === "ok" && stored.data.fields).toMatchObject({ task: "Typed after declining." });
         expect(screen.getByRole("link", { name: /Back to/ })).toBeInTheDocument();
      });

      it("asks again at the next AI action, because a decline is not remembered", async () => {
         await open(await seed());
         type("Situation", "Typed.");
         fireEvent.click(button("Draft from my notes"));
         fireEvent.click(within(await dialog()).getByRole("button", { name: "Decline" }));
         await waitFor(() => noDialog());

         fireEvent.click(button("Draft from my notes"));
         await dialog();
         expect(ai).toEqual([]);
      });

      it("treats Escape as a decline", async () => {
         await open(await seed());
         type("Situation", "Typed.");
         fireEvent.click(button("Draft from my notes"));
         const box = await dialog();
         fireEvent.keyDown(box, { key: "Escape" });
         await waitFor(() => noDialog());
         expect(ai).toEqual([]);
         expect(accepts()).toEqual([]);
      });
   });

   describe("versions and withdrawal", () => {
      async function acceptFirst() {
         fireEvent.click(button("Draft from my notes"));
         await acceptIn(await dialog());
         await screen.findByRole("region", { name: "Draft preview" });
         fireEvent.click(button("Discard draft"));
      }

      it("asks again for a new configured version and records that version", async () => {
         await open(await seed());
         type("Situation", "Typed.");
         await acceptFirst();
         consent.version = NEW_VERSION;

         fireEvent.click(button("Draft from my notes"));
         const box = await dialog();
         expect(box).toHaveTextContent(`version ${NEW_VERSION}`);
         expect(ai).toHaveLength(1);
         await acceptIn(box);
         await screen.findByRole("region", { name: "Draft preview" });
         expect(accepts().map(({ body }) => (body as { version: string }).version)).toEqual([PRIVACY_VERSION, NEW_VERSION]);
         expect(ai).toHaveLength(2);
      });

      it("asks again after consent was withdrawn elsewhere, and accepting again restores it", async () => {
         await open(await seed());
         type("Situation", "Typed.");
         await acceptFirst();
         consent.handle(`${API}/me/prep/ai/consent/withdraw`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });

         fireEvent.click(button("Draft from my notes"));
         await acceptIn(await dialog());
         await screen.findByRole("region", { name: "Draft preview" });
         expect(ai).toHaveLength(2);
         expect(consent.status(token).accepted).toBe(true);
      });

      it("reads a version that changed while the dialog was open and asks about that one, sending nothing meanwhile", async () => {
         await open(await seed());
         type("Situation", "Typed.");
         fireEvent.click(button("Draft from my notes"));
         const box = await dialog();
         consent.version = NEW_VERSION;
         await acceptIn(box);

         await waitFor(() => expect(box).toHaveTextContent(`version ${NEW_VERSION}`));
         expect(within(box).getByRole("alert")).toHaveTextContent("This notice changed while you were reading it");
         expect(ai).toEqual([]);
         fireEvent.click(within(box).getByRole("button", { name: "Try accepting again" }));
         await screen.findByRole("region", { name: "Draft preview" });
         expect(ai).toHaveLength(1);
      });
   });

   describe("failures send no AI request", () => {
      it("keeps the dialog open when recording the acceptance fails, and retrying sends one request", async () => {
         await open(await seed());
         type("Situation", "Typed.");
         fireEvent.click(button("Draft from my notes"));
         const box = await dialog();
         consent.failNext = "accept";
         await acceptIn(box);

         expect(await within(box).findByRole("alert")).toHaveTextContent("nothing was sent");
         expect(ai).toEqual([]);
         fireEvent.click(within(box).getByRole("button", { name: "Try accepting again" }));
         await screen.findByRole("region", { name: "Draft preview" });
         expect(ai).toHaveLength(1);
      });

      it("fails closed when the consent status cannot be read", async () => {
         await open(await seed());
         type("Situation", "Typed.");
         consent.failNext = "GET";
         fireEvent.click(button("Draft from my notes"));
         expect(await screen.findByRole("alert")).toHaveTextContent("Your text is unchanged");
         noDialog();
         expect(ai).toEqual([]);
         expect(field("Situation")).toHaveValue("Typed.");
      });

      it("opens no dialog and sends nothing when the server says AI is not available", async () => {
         consent.aiAvailable = false;
         await open(await seed());
         type("Situation", "Typed.");
         fireEvent.click(button("Draft from my notes"));
         expect(await screen.findByText(/AI help is not available right now/)).toBeInTheDocument();
         noDialog();
         expect(ai).toEqual([]);
      });

      it("points an ended session to sign in without opening the dialog", async () => {
         await open(await seed(), () => token);
         type("Situation", "Typed.");
         token = "";
         fireEvent.click(button("Draft from my notes"));
         expect(await screen.findByRole("alert")).toHaveTextContent("Your session has ended");
         noDialog();
         expect(ai).toEqual([]);
      });

      it("explains, without a dialog loop, when the AI route itself answers that consent is required", async () => {
         await open(await seed());
         type("Situation", "Typed.");
         consent.grant(token);
         aiReply = json(403, { detail: "x", code: "ai_consent_required" });
         fireEvent.click(button("Draft from my notes"));
         expect(await screen.findByRole("alert")).toHaveTextContent("Your AI consent has changed, so nothing was sent");
         noDialog();
         expect(ai).toHaveLength(1);
      });
   });

   describe("focus", () => {
      it("names the dialog, moves focus into it, loops Tab inside it, makes the page inert and returns focus on decline", async () => {
         await open(await seed());
         type("Situation", "Typed.");
         const trigger = button("Draft from my notes");
         trigger.focus();
         fireEvent.click(trigger);

         const box = await dialog();
         expect(box).toHaveAccessibleDescription(/AI help is optional/);
         const link = within(box).getByRole("link");
         const decline = within(box).getByRole("button", { name: "Decline" });
         const accept = within(box).getByRole("button", { name: "Accept and continue" });
         expect(document.activeElement).toBe(link);
         expect(isInert()).toBe(true);

         // Tab from the last control wraps to the first, and Shift+Tab from the first wraps to the last: focus cannot leave the dialog.
         accept.focus();
         fireEvent.keyDown(accept, { key: "Tab" });
         expect(document.activeElement).toBe(link);
         fireEvent.keyDown(link, { key: "Tab", shiftKey: true });
         expect(document.activeElement).toBe(accept);

         fireEvent.click(decline);
         await waitFor(() => noDialog());
         expect(isInert()).toBe(false);
         expect(document.activeElement).toBe(trigger);
      });

      it("never makes the page inert, opens a dialog or sends a request when the editor goes away while the status read is still pending", async () => {
         let release!: () => void;
         statusHold = new Promise<void>((resolve) => (release = resolve));
         const view = await open(await seed());
         type("Situation", "Typed.");
         fireEvent.click(button("Draft from my notes"));
         await waitFor(() => expect(statusStarted).toBe(1));

         view.unmount();
         release();
         // Let the held status answer and every continuation after it run.
         await new Promise((resolve) => setTimeout(resolve, 100));

         expect(isInert()).toBe(false);
         expect(screen.queryByRole("dialog")).toBeNull();
         expect(consent.requests.map(({ method }) => method)).toEqual(["GET"]);
         expect(ai).toEqual([]);
      });

      it("releases the page and runs nothing when the editor goes away with the dialog open", async () => {
         const view = await open(await seed());
         type("Situation", "Typed.");
         fireEvent.click(button("Draft from my notes"));
         await dialog();
         view.unmount();
         expect(isInert()).toBe(false);
         expect(ai).toEqual([]);
      });
   });
});
