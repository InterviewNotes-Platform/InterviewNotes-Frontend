import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerEditor } from "@/components/prepare/editor/AnswerEditor";
import { createFakeConsentApi } from "@/components/prepare/ai/consent/fakeConsent";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import type { Answer, AnswerCreate } from "@/lib/prep/types";
import { offeredEngines, pickEngine, storeEngine, storedEngine } from "./engineChoice";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const API = "https://api.example.test";
const DRAFT = { action: "draft", result: { framework: "star", fields: { situation: "Generated." }, body: null, questions_to_ask_yourself: [] } };
const REVIEW = { action: "review", result: { missing: ["No result."], weak: [], claims_to_verify: [], questions_to_ask_yourself: [] } };

let api: ReturnType<typeof createFakePrepApi>;
let consent: ReturnType<typeof createFakeConsentApi>;
let token: string;
let ai: { path: string; body: unknown }[];
let aiReply: () => Promise<Response>;

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
   window.localStorage.clear();
   api = createFakePrepApi();
   token = api.signIn("user-1");
   consent = createFakeConsentApi({ engineChoices: ["standard", "large"] });
   consent.grant(token);
   ai = [];
   aiReply = reply(200, DRAFT);
});
afterEach(() => vi.unstubAllEnvs());

const client = () => createPrepClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });

async function ready(): Promise<Answer> {
   const created = await client().createAnswer({ source: "custom", question_snapshot: "Tell me about a time you were stuck.", framework: "star" } as AnswerCreate);
   if (created.status !== "ok") throw new Error("seed failed");
   render(<AnswerEditor apiUrl={API} answerId={created.data.id} catalog={null} getAccessToken={async () => token} fetch={routed} />);
   await screen.findByRole("heading", { name: "Your answer" });
   fireEvent.change(screen.getByRole("textbox", { name: "Situation" }), { target: { value: "Our build kept failing." } });
   return created.data;
}

const radio = (name: RegExp) => screen.getByRole("radio", { name }) as HTMLInputElement;
const choose = (name: RegExp) => fireEvent.click(radio(name));
const run = async (name: string) => {
   fireEvent.click(screen.getByRole("button", { name }));
   await waitFor(() => expect(ai.length).toBeGreaterThan(0));
};

describe("the model choice helpers", () => {
   it("offers a choice only when the server lists both known picks", () => {
      const status = (engine_choices: unknown) => offeredEngines({ engine_choices } as never);
      expect(status(["standard", "large"])).toEqual(["standard", "large"]);
      for (const bad of [undefined, null, [], ["standard"], ["large"], ["standard", "huge"], "standard,large", { 0: "standard" }, ["gpt-oss-120b", "openai/gpt-oss-20b"]]) expect(status(bad)).toEqual([]);
   });
   it("sends nothing when there is no choice, and falls back to standard for an absent or unoffered saved pick", () => {
      expect(pickEngine([], "large")).toBeNull();
      expect(pickEngine(["standard", "large"], null)).toBe("standard");
      expect(pickEngine(["standard", "large"], "large")).toBe("large");
   });
   it("keeps the pick in this browser and survives blocked storage", () => {
      expect(storedEngine()).toBeNull();
      storeEngine("large");
      expect(storedEngine()).toBe("large");
      window.localStorage.setItem("interviewnotes.ai.engine", "openai/gpt-oss-120b");
      expect(storedEngine()).toBeNull();
      const blocked = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
         throw new Error("blocked");
      });
      expect(storedEngine()).toBeNull();
      blocked.mockRestore();
   });
});

describe("the model choice in the AI help panel", () => {
   it("shows two plain-language options, Standard selected by default, and no raw model ID", async () => {
      await ready();
      const standard = await screen.findByRole("radio", { name: /Standard/ });
      expect((standard as HTMLInputElement).checked).toBe(true);
      expect(radio(/Larger model/).checked).toBe(false);
      expect(screen.getByText(/not guaranteed to be more accurate/)).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/openai\/|gpt-oss-\d+b\b.*\//);
      expect(document.body.textContent).not.toMatch(/best quality|most accurate|passes more/i);
   });

   it.each([
      ["undefined, like an older server", undefined],
      ["an empty list, like a Premium reader", []],
      ["only the standard pick", ["standard"]],
   ])("hides the choice and sends no pick for %s", async (_label, choices) => {
      consent.engineChoices = choices;
      await ready();
      await screen.findByRole("button", { name: "Draft from my notes" });
      await waitFor(() => expect(consent.requests.some(({ method }) => method === "GET")).toBe(true));
      expect(screen.queryByRole("radio", { name: /Larger model/ })).toBeNull();
      await run("Draft from my notes");
      expect(ai[0].path).toBe("/me/prep/ai/draft");
   });

   it("sends the standard pick by default and the larger pick when chosen, for Draft and for Review", async () => {
      await ready();
      await screen.findByRole("radio", { name: /Standard/ });
      await run("Draft from my notes");
      expect(ai[0].path).toBe("/me/prep/ai/draft?engine=standard");
      choose(/Larger model/);
      aiReply = reply(200, REVIEW);
      await waitFor(() => expect(screen.getByRole("button", { name: "Review my answer" })).toBeTruthy());
      ai.length = 0;
      fireEvent.click(screen.getByRole("button", { name: "Review my answer" }));
      await waitFor(() => expect(ai.length).toBe(1));
      expect(ai[0].path).toBe("/me/prep/ai/review?engine=large");
      expect(JSON.stringify(ai[0].body)).not.toMatch(/engine|large|gpt-oss/);
   });

   it("remembers the pick in this browser across a reload", async () => {
      await ready();
      await screen.findByRole("radio", { name: /Standard/ });
      choose(/Larger model/);
      expect(storedEngine()).toBe("large");
      document.body.innerHTML = "";
      await ready();
      await waitFor(() => expect(radio(/Larger model/).checked).toBe(true));
   });

   it("does not switch models on a failure: it says so and leaves the choice to the reader", async () => {
      await ready();
      await screen.findByRole("radio", { name: /Standard/ });
      choose(/Larger model/);
      aiReply = reply(503, { code: "ai_unavailable" });
      await run("Draft from my notes");
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toMatch(/choose the other model above\. Nothing is switched for you/);
      expect(ai.map(({ path }) => path)).toEqual(["/me/prep/ai/draft?engine=large"]);
      expect(radio(/Larger model/).checked).toBe(true);
   });
});
