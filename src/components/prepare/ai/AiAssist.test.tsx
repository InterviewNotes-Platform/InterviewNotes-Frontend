import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerEditor } from "@/components/prepare/editor/AnswerEditor";
import { AUTOSAVE_DELAY_MS } from "@/components/prepare/editor/useAnswerEditor";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import type { Answer, AnswerCreate } from "@/lib/prep/types";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const API = "https://api.example.test";
const DRAFT_RESULT = {
   action: "draft",
   result: { framework: "star", fields: { situation: "Generated situation.", action: "Generated action." }, body: null, questions_to_ask_yourself: ["What was the impact?"] },
};
const REVIEW_RESULT = {
   action: "review",
   result: { missing: ["No measurable result."], weak: ["The task is vague."], claims_to_verify: ["Fixed in a day."], questions_to_ask_yourself: ["Who else was involved?"] },
};

let api: ReturnType<typeof createFakePrepApi>;
let token: string;
/** Every AI request the browser made, in order. */
let ai: { path: string; body: unknown }[];
let aiReply: () => Promise<Response>;

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The fake preparation API for everything but the AI routes, which are mocked here (the real API is T39's). */
const routed: typeof fetch = async (input, init) => {
   const url = String(input);
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
   ai = [];
   aiReply = reply(200, DRAFT_RESULT);
});

afterEach(() => vi.unstubAllEnvs());

const client = () => createPrepClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });

async function seed(over: Partial<AnswerCreate> & Record<string, unknown> = {}): Promise<Answer> {
   const result = await client().createAnswer({
      source: "custom",
      question_snapshot: "Tell me about a time you were stuck.",
      framework: "star",
      ...over,
   } as AnswerCreate);
   if (result.status !== "ok") throw new Error("seed failed");
   api.requests.length = 0;
   return result.data;
}

async function open(answer: Answer) {
   const view = render(<AnswerEditor apiUrl={API} answerId={answer.id} catalog={null} getAccessToken={async () => token} fetch={routed} />);
   await screen.findByRole("heading", { name: "Your answer" });
   api.requests.length = 0;
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
const draftIt = async () => {
   fireEvent.click(button("Draft from my notes"));
   return screen.findByRole("region", { name: "Draft preview" });
};
const reviewIt = async () => {
   fireEvent.click(button("Review my answer"));
   return screen.findByRole("region", { name: "Review preview" });
};
/** Long enough for any autosave that was going to start to have done so. */
const pastAutosave = () => new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 400));

describe("AI help in the answer editor", () => {
   it("draws no AI control while the build's AI setting is off", async () => {
      vi.stubEnv("NEXT_PUBLIC_AI_ENABLED", "");
      await open(await seed());
      expect(screen.queryByRole("button", { name: "Draft from my notes" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Review my answer" })).toBeNull();
   });

   it("sends nothing from a click when there is no text, and says why", async () => {
      await open(await seed());
      expect(screen.getByText(/Write some notes or part of an answer first/)).toBeInTheDocument();
      fireEvent.click(button("Draft from my notes"));
      fireEvent.click(button("Review my answer"));
      expect(ai).toEqual([]);
   });

   describe("Draft", () => {
      it("sends the typed text, unsaved, and shows the result as a preview that changes nothing", async () => {
         const answer = await seed();
         await open(answer);
         type("Situation", "Our build kept failing.");

         const preview = await draftIt();

         expect(ai).toHaveLength(1);
         expect(ai[0].path).toBe("/me/prep/ai/draft");
         expect(ai[0].body).toEqual({
            question: "Tell me about a time you were stuck.",
            guidance: null,
            framework: "star",
            notes: "Situation\nOur build kept failing.",
            stories: [],
         });
         expect(within(preview).getByText("Generated situation.")).toBeInTheDocument();
         expect(within(preview).getByText("Generated action.")).toBeInTheDocument();
         expect(within(preview).getByText("What was the impact?")).toBeInTheDocument();
         expect(field("Situation")).toHaveValue("Our build kept failing.");
         expect(field("Action")).toHaveValue("");
         // The preview arriving saved nothing: no write was made for it, and the server still holds the saved answer.
         await pastAutosave();
         expect(patches().map(({ body }) => body)).toEqual([expect.objectContaining({ fields: { situation: "Our build kept failing." } })]);
         expect((await stored(answer.id)).fields).toEqual({ situation: "Our build kept failing." });
      });

      it("keeps the typed text while the request runs and ignores a second click", async () => {
         await open(await seed());
         type("Situation", "Typed before.");
         let release!: () => void;
         aiReply = () => new Promise((resolve) => (release = () => resolve(new Response(JSON.stringify(DRAFT_RESULT), { status: 200 }))));

         fireEvent.click(button("Draft from my notes"));
         expect(await screen.findByText(/Writing a draft/)).toBeInTheDocument();
         fireEvent.click(button("Draft from my notes"));
         fireEvent.click(button("Review my answer"));
         type("Task", "Typed while waiting.");
         expect(ai).toHaveLength(1);
         expect(field("Situation")).toHaveValue("Typed before.");

         release();
         await screen.findByRole("region", { name: "Draft preview" });
         expect(field("Situation")).toHaveValue("Typed before.");
         expect(field("Task")).toHaveValue("Typed while waiting.");
      });

      it("Apply puts the generated text in the editor, and only then does the normal save write it", async () => {
         const answer = await seed({ fields: { task: "My task." } });
         await open(answer);
         type("Situation", "Mine.");
         await draftIt();
         await waitFor(() => expect(patches()).toHaveLength(1), { timeout: AUTOSAVE_DELAY_MS + 2000 });
         api.requests.length = 0;

         fireEvent.click(button("Apply draft"));

         expect(screen.queryByRole("region", { name: "Draft preview" })).toBeNull();
         expect(field("Situation")).toHaveValue("Generated situation.");
         expect(field("Action")).toHaveValue("Generated action.");
         expect(field("Task")).toHaveValue("My task.");
         expect(screen.getByRole("button", { name: "Draft from my notes" })).toHaveFocus();
         expect(patches()).toEqual([]);
         await waitFor(() => expect(patches()).toHaveLength(1), { timeout: AUTOSAVE_DELAY_MS + 2000 });
         expect(patches()[0].body).toMatchObject({ fields: { situation: "Generated situation.", task: "My task.", action: "Generated action." } });
         expect((await stored(answer.id)).fields).toEqual({ situation: "Generated situation.", task: "My task.", action: "Generated action." });
      });

      it("Insert adds the generated text after what the reader wrote and removes nothing", async () => {
         await open(await seed());
         type("Situation", "Mine.");
         type("Result", "My result.");
         await draftIt();

         fireEvent.click(button("Insert draft"));

         expect(field("Situation")).toHaveValue("Mine.\n\nGenerated situation.");
         expect(field("Action")).toHaveValue("Generated action.");
         expect(field("Result")).toHaveValue("My result.");
         expect(screen.queryByRole("region", { name: "Draft preview" })).toBeNull();
      });

      it("Discard removes the preview and persists nothing from it", async () => {
         const answer = await seed({ fields: { situation: "Saved." } });
         await open(answer);
         type("Situation", "Saved and edited.");
         await draftIt();
         await pastAutosave();
         const writes = patches().length;

         fireEvent.click(button("Discard draft"));

         expect(screen.queryByRole("region", { name: "Draft preview" })).toBeNull();
         expect(screen.getByText(/Draft discarded/)).toBeInTheDocument();
         expect(screen.getByRole("button", { name: "Draft from my notes" })).toHaveFocus();
         expect(field("Situation")).toHaveValue("Saved and edited.");
         await pastAutosave();
         expect(patches()).toHaveLength(writes);
         expect(JSON.stringify((await stored(answer.id)))).not.toContain("Generated");
      });

      it("offers nothing to apply when the draft left every field empty and asked questions instead", async () => {
         aiReply = reply(200, { action: "draft", result: { framework: "star", fields: {}, body: null, questions_to_ask_yourself: ["What did you do?"] } });
         await open(await seed());
         type("Situation", "Mine.");
         const preview = await draftIt();
         expect(within(preview).getByText("What did you do?")).toBeInTheDocument();
         expect(screen.queryByRole("button", { name: "Apply draft" })).toBeNull();
         expect(screen.queryByRole("button", { name: "Insert draft" })).toBeNull();
         expect(screen.getByRole("button", { name: "Discard draft" })).toBeInTheDocument();
      });

      it("drafts a free-form answer into its body", async () => {
         aiReply = reply(200, { action: "draft", result: { framework: "free_form", fields: {}, body: "A generated body.", questions_to_ask_yourself: [] } });
         await open(await seed({ framework: "free_form", body: "My notes." }));
         await draftIt();
         expect(ai[0].body).toMatchObject({ framework: "free_form", notes: "My notes." });
         fireEvent.click(button("Insert draft"));
         expect(field("Your answer")).toHaveValue("My notes.\n\nA generated body.");
      });
   });

   describe("Review", () => {
      beforeEach(() => {
         aiReply = reply(200, REVIEW_RESULT);
      });

      it("sends the answer and shows missing, weak, claims and questions without changing it", async () => {
         const answer = await seed({ fields: { situation: "Saved." } });
         await open(answer);
         type("Result", "Fixed in a day.");

         const preview = await reviewIt();

         expect(ai[0].path).toBe("/me/prep/ai/review");
         expect(ai[0].body).toEqual({
            question: "Tell me about a time you were stuck.",
            guidance: null,
            framework: "star",
            answer: { body: null, fields: { situation: "Saved.", result: "Fixed in a day." } },
            stories: [],
         });
         for (const text of ["No measurable result.", "The task is vague.", "Fixed in a day.", "Who else was involved?"]) {
            expect(within(preview).getByText(text)).toBeInTheDocument();
         }
         expect(within(preview).queryByRole("button", { name: /apply|insert/i })).toBeNull();
         expect(field("Result")).toHaveValue("Fixed in a day.");
         expect((await stored(answer.id)).fields).toEqual({ situation: "Saved." });
      });

      it("Discard closes it and nothing is written", async () => {
         await open(await seed({ fields: { situation: "Saved." } }));
         await reviewIt();
         fireEvent.click(button("Discard review"));
         expect(screen.queryByRole("region", { name: "Review preview" })).toBeNull();
         await pastAutosave();
         expect(patches()).toEqual([]);
      });
   });

   describe("when the request fails", () => {
      const failures: [string, () => Promise<Response>][] = [
         ["the network drops", () => Promise.reject(new TypeError("fetch failed"))],
         ["the provider is unavailable", reply(503, { detail: "x", code: "ai_unavailable" })],
         ["the quota is used up", reply(429, { detail: "x", code: "ai_quota_exhausted", window: "day", resets_at: "2026-10-30T00:00:00Z" })],
         ["the server errors", reply(500, { detail: "x", code: "internal_error" })],
         ["the answer is malformed", reply(200, { action: "draft", result: { framework: "star", fields: "oops" } })],
         ["the framework is unknown", reply(200, { action: "draft", result: { framework: "bullets", fields: {}, body: "x", questions_to_ask_yourself: [] } })],
         ["the framework is not the one requested", reply(200, { action: "draft", result: { framework: "free_form", fields: {}, body: "x", questions_to_ask_yourself: [] } })],
         ["the body is not JSON", async () => new Response("<html>", { status: 200 })],
      ];

      it.each(failures)("%s: the unsaved text stays, nothing is saved from it, and the reader can try again", async (_name, failing) => {
         const answer = await seed();
         await open(answer);
         type("Situation", "Unsaved words that must survive.");
         aiReply = failing;

         fireEvent.click(button("Draft from my notes"));
         const alert = await screen.findByRole("alert");

         expect(alert).toHaveTextContent("Your text is unchanged and nothing was saved from this.");
         expect(alert).toHaveTextContent("You can try again.");
         expect(field("Situation")).toHaveValue("Unsaved words that must survive.");
         expect(screen.queryByRole("region", { name: "Draft preview" })).toBeNull();

         aiReply = reply(200, DRAFT_RESULT);
         fireEvent.click(button("Draft from my notes"));
         await screen.findByRole("region", { name: "Draft preview" });
         expect(field("Situation")).toHaveValue("Unsaved words that must survive.");
         expect(JSON.stringify(await stored(answer.id))).not.toContain("Generated");
      });

      it("a failed Review also keeps the text", async () => {
         await open(await seed());
         type("Result", "Keep me.");
         aiReply = reply(503, { detail: "x", code: "ai_unavailable" });
         fireEvent.click(button("Review my answer"));
         expect(await screen.findByRole("alert")).toHaveTextContent("review your answer");
         expect(field("Result")).toHaveValue("Keep me.");
      });

      it("an ended session says so and links to sign in, with the text kept", async () => {
         await open(await seed());
         type("Situation", "Keep me.");
         aiReply = reply(401, { detail: "x", code: "unauthenticated" });
         fireEvent.click(button("Draft from my notes"));
         const alert = await screen.findByRole("alert");
         expect(alert).toHaveTextContent("Your session has ended. Your answer remains unchanged, and no AI result was saved. Sign in to try again.");
         expect(alert).not.toHaveTextContent(/nothing was sent/);
         expect(within(alert).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", expect.stringContaining("/login?redirect="));
         expect(field("Situation")).toHaveValue("Keep me.");
      });
   });

   describe("autosave", () => {
      it("never starts an AI request, whatever is typed, blurred or saved", async () => {
         const answer = await seed();
         await open(answer);
         type("Situation", "First.");
         fireEvent.blur(field("Situation"));
         type("Action", "Second.");
         await waitFor(() => expect(patches().length).toBeGreaterThan(0), { timeout: AUTOSAVE_DELAY_MS + 2000 });
         fireEvent.click(button("Save changes"));
         await pastAutosave();
         expect(patches().length).toBeGreaterThan(0);
         expect(ai).toEqual([]);
         expect((await stored(answer.id)).fields).toEqual({ situation: "First.", action: "Second." });
      });
   });
});
