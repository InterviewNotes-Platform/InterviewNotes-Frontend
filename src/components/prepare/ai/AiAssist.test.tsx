import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const DRAFT_RESULT = {
   action: "draft",
   result: { framework: "star", fields: { situation: "Generated situation.", action: "Generated action." }, body: null, questions_to_ask_yourself: ["What was the impact?"] },
};
const REVIEW_RESULT = {
   action: "review",
   result: { missing: ["No measurable result."], weak: ["The task is vague."], claims_to_verify: ["Fixed in a day."], questions_to_ask_yourself: ["Who else was involved?"] },
};

let api: ReturnType<typeof createFakePrepApi>;
let consent: ReturnType<typeof createFakeConsentApi>;
let token: string;
/** Every AI request the browser made, in order. */
let ai: { path: string; body: unknown }[];
let aiReply: () => Promise<Response>;

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The fake preparation API for everything but the AI and consent routes, which are mocked here (the real API is T39's). */
const routed: typeof fetch = async (input, init) => {
   const url = String(input);
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
   // These tests are about Draft and Review, so the reader has already accepted the current terms; consent itself is in ConsentDialog.test.tsx.
   consent = createFakeConsentApi();
   consent.grant(token);
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

const isInert = () => Array.from(document.body.children).some((element) => element.hasAttribute("inert"));
const alertAfterDraft = async () => {
   fireEvent.click(button("Draft from my notes"));
   return screen.findByRole("alert");
};

describe("AI error states", () => {
   const states: [string, number, Record<string, unknown>, RegExp, string][] = [
      ["ai_quota_exhausted", 429, { window: "day", resets_at: "2026-10-31T00:00:00Z" }, /used today's AI help, so we couldn't write a draft\. It renews at .* You can try again after it renews\./, "ai_quota_exhausted"],
      ["ai_quota_exhausted", 429, { window: "month", resets_at: "2026-11-01T00:00:00Z" }, /used this month's AI help, so we couldn't write a draft\. It renews on /, "ai_quota_exhausted"],
      ["ai_busy", 429, { retry_after_seconds: 30 }, /AI help is busy, so we couldn't write a draft just now\..* try again in about 30 seconds\./, "ai_busy"],
      ["ai_busy", 429, {}, /AI help is busy.* try again in a moment\./, "ai_busy"],
      ["ai_unavailable", 503, {}, /AI help is unavailable, so we couldn't write a draft just now\..* try again later\./, "ai_unavailable"],
      ["ai_input_too_large", 413, {}, /too long for AI help to read, so we couldn't write a draft\..* Shorten your text/, "ai_input_too_large"],
      ["ai_not_entitled", 403, {}, /isn't included in your plan, so we couldn't write a draft/, "ai_not_entitled"],
      ["ai_disabled", 403, {}, /AI help isn't available right now/, "ai_disabled"],
      ["a code this build does not know", 500, {}, /We couldn't write a draft just now/, "error"],
   ];

   it.each(states)("%s (%#) renders its own state, keeps the text, and offers no upgrade", async (name, status, extra, expected, marker) => {
      const answer = await seed();
      await open(answer);
      type("Situation", "Unsaved words that must survive.");
      aiReply = reply(status, { detail: "provider said something private", code: name.startsWith("a code") ? "internal_error" : name, ...extra });

      const alert = await alertAfterDraft();

      expect(alert).toHaveTextContent(expected);
      expect(alert).toHaveAttribute("data-ai-state", marker);
      expect(alert).toHaveTextContent("Your text is unchanged and nothing was saved from this.");
      expect(alert).not.toHaveTextContent(/provider said something private/);
      expect(alert).not.toHaveTextContent(/upgrade|premium|pricing|subscribe/i);
      expect(within(alert).queryByRole("link")).toBeNull();
      expect(document.querySelector('a[href*="pricing"]')).toBeNull();
      expect(field("Situation")).toHaveValue("Unsaved words that must survive.");
      expect(screen.getByRole("button", { name: "Draft from my notes" })).not.toHaveAttribute("aria-disabled", "true");
      expect(ai).toHaveLength(1);
      await pastAutosave();
      expect(JSON.stringify(await stored(answer.id))).not.toContain("Generated");

      aiReply = reply(200, DRAFT_RESULT);
      await draftIt();
      expect(field("Situation")).toHaveValue("Unsaved words that must survive.");
      expect(JSON.stringify(await stored(answer.id))).not.toContain("Generated");
   });

   it("shows a different state for each code", async () => {
      await open(await seed());
      type("Situation", "Typed.");
      const seen = new Set<string>();
      for (const code of ["ai_quota_exhausted", "ai_busy", "ai_unavailable", "ai_input_too_large", "ai_not_entitled", "ai_disabled"]) {
         aiReply = reply(429, { detail: "x", code });
         seen.add((await alertAfterDraft()).textContent ?? "");
         await waitFor(() => expect(screen.getByRole("button", { name: "Draft from my notes" })).not.toHaveAttribute("aria-disabled", "true"));
      }
      expect(seen.size).toBe(6);
   });

   it("a busy answer is retried only when the reader chooses to, and then succeeds without a second request of its own", async () => {
      await open(await seed());
      type("Situation", "Typed.");
      aiReply = reply(429, { detail: "x", code: "ai_busy", retry_after_seconds: 1 });
      await alertAfterDraft();
      await new Promise((resolve) => setTimeout(resolve, 1300));
      expect(ai).toHaveLength(1);

      aiReply = reply(200, DRAFT_RESULT);
      await draftIt();
      expect(ai).toHaveLength(2);
      expect(screen.queryByRole("alert")).toBeNull();
   });

   it("an unreadable error body is an ordinary failure, not a crash", async () => {
      await open(await seed());
      type("Situation", "Typed.");
      aiReply = async () => new Response("<html>bad gateway</html>", { status: 502 });
      expect(await alertAfterDraft()).toHaveTextContent("We couldn't write a draft just now.");
   });
});

describe("provider and context disclosure", () => {
   it("names the provider for each plan from the shared constant and links the Privacy page without leaving the editor", async () => {
      await open(await seed());
      const section = screen.getByRole("region", { name: "AI help" });
      expect(section).toHaveTextContent("your question and the text you chose go to the AI provider for your plan (Groq on Free, OpenAI on Premium)");
      expect(section).not.toHaveTextContent(/is available|are available|powered by/i);
      const link = within(section).getByRole("link", { name: /Privacy & AI Use/ });
      expect(link).toHaveAttribute("href", "/privacy");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
   });
});

describe("mobile result sheet", () => {
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
   const sheetOf = (name: string) => screen.findByRole("dialog", { name });
   const openSheet = async (typed = "Mine.") => {
      await open(await seed());
      type("Situation", typed);
      button("Draft from my notes").focus();
      fireEvent.click(button("Draft from my notes"));
      return sheetOf("Draft preview");
   };

   it("opens the draft in a labelled sheet, focuses its title, and makes the page behind it inert", async () => {
      const sheet = await openSheet();
      expect(screen.queryByRole("region", { name: "Draft preview" })).toBeNull();
      expect(sheet).toHaveAccessibleDescription(/Nothing in your answer changes until you apply or insert/);
      expect(document.activeElement).toBe(within(sheet).getByRole("heading", { name: "Draft preview" }));
      expect(isInert()).toBe(true);
      expect(behind("Situation").closest("[inert]")).not.toBeNull();
      expect(within(sheet).getByRole("button", { name: "Apply draft" })).not.toHaveFocus();
      expect(behind("Situation")).toHaveValue("Mine.");
   });

   it("keeps focus inside while open", async () => {
      const sheet = await openSheet();
      const controls = Array.from(sheet.querySelectorAll<HTMLElement>("button")).filter((el) => !el.hasAttribute("disabled"));
      controls[controls.length - 1].focus();
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab" });
      await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
   });

   it("Escape hides the sheet without applying or discarding, releases the page, and returns focus to Draft", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "Mine.");
      button("Draft from my notes").focus();
      fireEvent.click(button("Draft from my notes"));
      await sheetOf("Draft preview");

      fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(isInert()).toBe(false);
      expect(screen.getByRole("button", { name: "Draft from my notes" })).toHaveFocus();
      expect(field("Situation")).toHaveValue("Mine.");
      await pastAutosave();
      expect(JSON.stringify(await stored(answer.id))).not.toContain("Generated");

      fireEvent.click(button("Show draft preview"));
      const again = await sheetOf("Draft preview");
      expect(isInert()).toBe(true);
      fireEvent.click(within(again).getByRole("button", { name: "Apply draft" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(isInert()).toBe(false);
      expect(field("Situation")).toHaveValue("Generated situation.");
      expect(screen.queryByRole("button", { name: "Show draft preview" })).toBeNull();
      expect(screen.getByRole("button", { name: "Draft from my notes" })).toHaveFocus();
   });

   it("Insert and Discard in the sheet close it, release the page and put focus back", async () => {
      const sheet = await openSheet("Mine.");
      fireEvent.click(within(sheet).getByRole("button", { name: "Insert draft" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(field("Situation")).toHaveValue("Mine.\n\nGenerated situation.");
      expect(isInert()).toBe(false);
      expect(screen.getByRole("button", { name: "Draft from my notes" })).toHaveFocus();

      aiReply = reply(200, REVIEW_RESULT);
      button("Review my answer").focus();
      fireEvent.click(button("Review my answer"));
      const reviewing = await sheetOf("Review");
      fireEvent.click(within(reviewing).getByRole("button", { name: "Discard review" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(isInert()).toBe(false);
      expect(screen.getByRole("button", { name: "Review my answer" })).toHaveFocus();
   });

   it("never saves anything from the sheet by itself", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "Mine.");
      fireEvent.click(button("Draft from my notes"));
      await sheetOf("Draft preview");
      await pastAutosave();
      api.requests.length = 0;
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await pastAutosave();
      expect(ai).toHaveLength(1);
      expect(JSON.stringify(await stored(answer.id))).not.toContain("Generated");
   });

   it("leaves the page usable when the editor unmounts with the sheet open", async () => {
      const view = await open(await seed());
      type("Situation", "Mine.");
      fireEvent.click(button("Draft from my notes"));
      await sheetOf("Draft preview");
      expect(isInert()).toBe(true);
      view.unmount();
      expect(isInert()).toBe(false);
   });

   it("shows the preview inline again, with the page released, when the viewport grows while the sheet is open", async () => {
      const sheet = await openSheet();
      expect(sheet).toBeInTheDocument();
      setNarrow(false);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(isInert()).toBe(false);
      expect(screen.getByRole("region", { name: "Draft preview" })).toBeInTheDocument();
      expect(field("Situation")).toHaveValue("Mine.");
   });

   it("moves focus from the sheet to the visible Draft control when the viewport grows while it is open", async () => {
      const sheet = await openSheet();
      expect(sheet.contains(document.activeElement)).toBe(true);

      setNarrow(false);

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(isInert()).toBe(false);
      expect(screen.getByRole("region", { name: "Draft preview" })).toBeInTheDocument();
      expect(document.activeElement).not.toBe(document.body);
      expect(button("Draft from my notes")).toHaveFocus();
      expect(field("Situation")).toHaveValue("Mine.");
   });

   it("does not open a sheet, or make the page inert, when the request fails", async () => {
      await open(await seed());
      type("Situation", "Mine.");
      aiReply = reply(429, { detail: "x", code: "ai_busy" });
      expect(await alertAfterDraft()).toHaveTextContent("AI help is busy");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(isInert()).toBe(false);
   });
});
