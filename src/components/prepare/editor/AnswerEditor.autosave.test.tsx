import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERSONAL_DATA_TIMEOUT_MS, createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { mayLeave } from "@/lib/leave-guard";
import type { Answer, AnswerCreate } from "@/lib/prep/types";
import { AnswerEditor } from "./AnswerEditor";
import { AUTOSAVE_DELAY_MS, RECHECK_DELAYS_MS } from "./useAnswerEditor";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const API = "https://api.example.test";
/** The slowest cold read P7-T5 recorded (beta, 38.4 s): a write that long must still complete. */
const COLD_START_MS = 38_400;
const NOT_CONFIRMED = "We could not confirm whether your changes were saved.";

let api: ReturnType<typeof createFakePrepApi>;
let token: string;
let added: HTMLElement[] = [];

beforeEach(() => {
   nav.push.mockReset();
   api = createFakePrepApi();
   token = api.signIn("user-1");
});

afterEach(() => {
   vi.useRealTimers();
   vi.restoreAllMocks();
   added.forEach((element) => element.remove());
   added = [];
});

const client = () => createPrepClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });

async function seed(over: Partial<AnswerCreate> & Record<string, unknown> = {}): Promise<Answer> {
   const result = await client().createAnswer({
      source: "catalog",
      content_id: "lesson.behavioral-prep-sde-1",
      question_id: "being-stuck",
      question_snapshot: "Tell me about a time you were stuck.",
      snapshot_fallback: false,
      framework: "star",
      ...over,
   } as AnswerCreate);
   if (result.status !== "ok") throw new Error("seed failed");
   api.requests.length = 0;
   return result.data;
}

async function open(answer: Answer, fetchImpl: typeof fetch = api.fetch) {
   const view = render(<AnswerEditor apiUrl={API} answerId={answer.id} catalog={null} getAccessToken={async () => token} fetch={fetchImpl} />);
   await screen.findByRole("heading", { name: "Your answer" });
   api.requests.length = 0;
   return view;
}

const field = (name: string | RegExp) => screen.getByRole("textbox", { name }) as HTMLTextAreaElement;
const type = (name: string | RegExp, value: string) => fireEvent.change(field(name), { target: { value } });
const status = () => document.querySelector('[data-slot="save-status"]')!.textContent;
const patches = () => api.requests.filter(({ method }) => method === "PATCH");
const sentVersions = () => patches().map(({ body }) => (body as { version: number }).version);
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const stored = async (id: string) => {
   const result = await client().getAnswer(id);
   if (result.status !== "ok") throw new Error("read failed");
   return result.data;
};

/** Every text the status line showed, in order and without repeats. */
function watchStatus() {
   const region = document.querySelector('[data-slot="save-status"]')!;
   const seen = [region.textContent ?? ""];
   const observer = new MutationObserver(() => {
      const text = region.textContent ?? "";
      if (seen[seen.length - 1] !== text) seen.push(text);
   });
   observer.observe(region, { childList: true, subtree: true, characterData: true });
   return seen;
}

/** A fetch whose writes are held until released, counting how many are in the air at once. */
function gated() {
   const waiting: (() => void)[] = [];
   const state = { inFlight: 0, peak: 0, started: 0, fetch: undefined as unknown as typeof fetch };
   state.fetch = async (input, init) => {
      if (init?.method !== "PATCH") return api.fetch(input, init);
      state.started++;
      state.peak = Math.max(state.peak, ++state.inFlight);
      await new Promise<void>((resolve) => waiting.push(resolve));
      state.inFlight--;
      return api.fetch(input, init);
   };
   return { state, release: () => act(async () => void waiting.shift()?.()) };
}

/** A fetch that takes `delay.ms` of (fake) time to reach the server and honours the client's abort. */
function slow(delay: { ms: number }): typeof fetch {
   return (input, init) =>
      new Promise((resolve, reject) => {
         if (init?.method !== "PATCH") return void api.fetch(input, init).then(resolve, reject);
         const timer = setTimeout(() => api.fetch(input, init).then(resolve, reject), delay.ms);
         init?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("aborted", "AbortError"));
         });
      });
}

/** A first write whose outcome is lost (it reached the server only when `landed`), and re-reads that can be held in the air. */
function lostWriteThenHeldReads(landed: boolean) {
   const state = { lose: true, hold: false, waiting: [] as (() => void)[], reads: 0 };
   const fetchImpl: typeof fetch = async (input, init) => {
      if (init?.method === "PATCH" && state.lose) {
         state.lose = false;
         if (landed) await api.fetch(input, init);
         throw new TypeError("reply lost");
      }
      if (state.hold && (!init?.method || init.method === "GET")) {
         state.reads++;
         await new Promise<void>((resolve) => state.waiting.push(resolve));
      }
      return api.fetch(input, init);
   };
   return { state, fetch: fetchImpl, release: () => act(async () => void state.waiting.shift()?.()) };
}

describe("autosave timing", () => {
   it("saves once, a debounce after the last keystroke and not before", async () => {
      const answer = await seed();
      await open(answer);
      vi.useFakeTimers();
      type("Situation", "A");
      expect(status()).toBe("Unsaved changes");
      await advance(1000);
      type("Situation", "AB");
      await advance(AUTOSAVE_DELAY_MS - 1);
      expect(patches()).toHaveLength(0);
      await advance(1);
      expect(patches()).toHaveLength(1);
      expect(patches()[0].body).toMatchObject({ version: 1, fields: { situation: "AB" } });
      expect(status()).toBe("Saved");
      await advance(10_000);
      expect(patches()).toHaveLength(1);
      expect((await stored(answer.id)).fields).toEqual({ situation: "AB" });
   });

   it("saves a status or format change the same way", async () => {
      const answer = await seed();
      await open(answer);
      vi.useFakeTimers();
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "ready" } });
      await advance(AUTOSAVE_DELAY_MS);
      expect(patches()[0].body).toEqual({ version: 1, status: "ready" });
      expect(status()).toBe("Saved");
   });

   it("saves on blur at once, and a blur with nothing to save sends nothing", async () => {
      const answer = await seed();
      await open(answer);
      fireEvent.blur(field("Situation"));
      await act(async () => {});
      expect(api.requests).toHaveLength(0);
      type("Situation", "Mine");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(status()).toBe("Saved"));
      expect(patches()).toHaveLength(1);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Mine" });
   });

   it("does not save a blank custom question, on the timer or on blur", async () => {
      const answer = await seed({ source: "custom", content_id: undefined, question_id: undefined, question_snapshot: "My question" });
      await open(answer);
      vi.useFakeTimers();
      type("Your question", "  ");
      fireEvent.blur(field("Your question"));
      await advance(AUTOSAVE_DELAY_MS * 2);
      expect(api.requests).toHaveLength(0);
   });

   it("does not resend text the server rejected, on the timer or on blur, until it is edited", async () => {
      await open(await seed());
      vi.useFakeTimers();
      type("Situation", "x".repeat(20_001));
      await advance(AUTOSAVE_DELAY_MS);
      expect(status()).toContain("Couldn't save");
      fireEvent.blur(field("Situation"));
      await advance(AUTOSAVE_DELAY_MS * 2);
      expect(patches()).toHaveLength(1);
      type("Situation", "short");
      await advance(AUTOSAVE_DELAY_MS);
      expect(status()).toBe("Saved");
      expect(patches()).toHaveLength(2);
   });
});

describe("autosave never overlaps or overclaims", () => {
   it("moves Unsaved, Saving, Saved in that order and says Saved only after the API answered", async () => {
      const held = gated();
      const answer = await seed();
      await open(answer, held.state.fetch);
      const seen = watchStatus();
      vi.useFakeTimers();
      type("Situation", "Mine");
      await advance(AUTOSAVE_DELAY_MS);
      expect(status()).toBe("Saving…");
      expect(seen).not.toContain("Saved");
      await held.release();
      expect(status()).toBe("Saved");
      expect(seen.filter((text) => text !== "")).toEqual(["Unsaved changes", "Saving…", "Saved"]);
   });

   it("keeps one request in the air, sends text typed meanwhile next, and says Saved only when nothing newer remains", async () => {
      const held = gated();
      const answer = await seed();
      await open(answer, held.state.fetch);
      const seen = watchStatus();
      vi.useFakeTimers();
      type("Situation", "First");
      await advance(AUTOSAVE_DELAY_MS);
      type("Situation", "First, then more");
      fireEvent.blur(field("Situation"));
      await advance(AUTOSAVE_DELAY_MS * 3);
      expect(held.state.peak).toBe(1);
      expect(held.state.started).toBe(1);
      expect(status()).toBe("Saving…");

      await held.release();
      expect(held.state.started).toBe(2);
      expect(status()).toBe("Saving…");
      await held.release();
      expect(sentVersions()).toEqual([1, 2]);
      expect(patches()[1].body).toMatchObject({ fields: { situation: "First, then more" } });
      expect(status()).toBe("Saved");
      expect(held.state.peak).toBe(1);
      expect(seen.indexOf("Saved")).toBe(seen.length - 1);
      expect(field("Situation")).toHaveValue("First, then more");
      expect((await stored(answer.id)).fields).toEqual({ situation: "First, then more" });
   });

   it("waits out a cold start: Saving stays true, the text stays, and Saved comes only after the answer", async () => {
      const delay = { ms: COLD_START_MS };
      const answer = await seed();
      await open(answer, slow(delay));
      vi.useFakeTimers();
      const seen = watchStatus();
      type("Situation", "Mine");
      await advance(AUTOSAVE_DELAY_MS);
      for (let waited = 0; waited + 5000 < COLD_START_MS; waited += 5000) {
         await advance(5000);
         expect(status()).toBe("Saving…");
         expect(field("Situation")).toHaveValue("Mine");
      }
      expect(COLD_START_MS).toBeLessThan(PERSONAL_DATA_TIMEOUT_MS);
      expect(seen).not.toContain("Saved");
      await advance(COLD_START_MS % 5000);
      expect(status()).toBe("Saved");
      expect(patches()).toHaveLength(1);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Mine" });
   });

   it("treats a request that outlasts the timeout as unconfirmed, then re-reads before writing again", async () => {
      const delay = { ms: PERSONAL_DATA_TIMEOUT_MS + 10_000 };
      const answer = await seed();
      await open(answer, slow(delay));
      vi.useFakeTimers();
      type("Situation", "Mine");
      await advance(AUTOSAVE_DELAY_MS + PERSONAL_DATA_TIMEOUT_MS);
      expect(status()).toBe(NOT_CONFIRMED);
      expect(field("Situation")).toHaveValue("Mine");

      delay.ms = 0;
      // The first write never reached the server (the client gave up), so the re-read finds the old version and the write is made once.
      await advance(RECHECK_DELAYS_MS[0] - 1);
      expect(api.requests).toHaveLength(0);
      await advance(1);
      expect(api.requests.map(({ method }) => method)).toEqual(["GET"]);
      await advance(AUTOSAVE_DELAY_MS + 1);
      expect(api.requests.map(({ method }) => method)).toEqual(["GET", "PATCH"]);
      expect(status()).toBe("Saved");
      expect(sentVersions()).toEqual([1]);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Mine" });
   });
});

describe("autosave when the network goes", () => {
   it("keeps the text, never says Saved, and does not repeat the write until it has re-read", async () => {
      const answer = await seed();
      await open(answer);
      vi.useFakeTimers();
      type("Situation", "Mine");
      api.failNext("network");
      await advance(AUTOSAVE_DELAY_MS);
      expect(status()).toBe(NOT_CONFIRMED);
      expect(field("Situation")).toHaveValue("Mine");
      fireEvent.blur(field("Situation"));
      type("Situation", "Mine, more");
      await advance(AUTOSAVE_DELAY_MS * 2);
      expect(patches()).toHaveLength(1);
      expect(status()).toBe(NOT_CONFIRMED);

      api.failNext("network");
      await advance(RECHECK_DELAYS_MS[0]);
      expect(status()).toBe(NOT_CONFIRMED);
      expect(patches()).toHaveLength(1);

      await advance(RECHECK_DELAYS_MS[1] + AUTOSAVE_DELAY_MS);
      expect(patches()).toHaveLength(2);
      expect(status()).toBe("Saved");
      expect(patches()[1].body).toMatchObject({ version: 1, fields: { situation: "Mine, more" } });
      expect((await stored(answer.id)).fields).toEqual({ situation: "Mine, more" });
   });

   it("adopts the server's copy when only the reply was lost, and never sends that write twice", async () => {
      const answer = await seed();
      const lost: typeof fetch = async (input, init) => {
         const response = await api.fetch(input, init);
         if (init?.method === "PATCH") throw new TypeError("reply lost");
         return response;
      };
      await open(answer, lost);
      vi.useFakeTimers();
      type("Situation", "Mine");
      await advance(AUTOSAVE_DELAY_MS);
      expect(status()).toBe(NOT_CONFIRMED);
      await advance(RECHECK_DELAYS_MS[0]);
      expect(status()).toBe("Saved");
      expect(patches()).toHaveLength(1);
      expect(await stored(answer.id)).toMatchObject({ version: 2, fields: { situation: "Mine" } });
   });

   it("keeps text typed after a lost reply and sends it on top of the write that had landed", async () => {
      const answer = await seed();
      let lose = true;
      const lostOnce: typeof fetch = async (input, init) => {
         const response = await api.fetch(input, init);
         if (init?.method === "PATCH" && lose) {
            lose = false;
            throw new TypeError("reply lost");
         }
         return response;
      };
      await open(answer, lostOnce);
      vi.useFakeTimers();
      type("Situation", "Mine");
      await advance(AUTOSAVE_DELAY_MS);
      type("Situation", "Mine, more");
      await advance(RECHECK_DELAYS_MS[0] + AUTOSAVE_DELAY_MS);
      expect(sentVersions()).toEqual([1, 2]);
      expect(status()).toBe("Saved");
      expect((await stored(answer.id)).fields).toEqual({ situation: "Mine, more" });
   });

   it("stops at an error on a version conflict: text kept, nothing repeated, the choice offered", async () => {
      const answer = await seed();
      await open(answer);
      await client().updateAnswer(answer.id, { version: 1, status: "ready" });
      api.requests.length = 0;
      vi.useFakeTimers();
      type("Situation", "Mine");
      await advance(AUTOSAVE_DELAY_MS);
      expect(status()).toContain("changed somewhere else");
      fireEvent.blur(field("Situation"));
      await advance(AUTOSAVE_DELAY_MS * 4);
      expect(patches()).toHaveLength(1);
      expect(field("Situation")).toHaveValue("Mine");
      expect(screen.getByRole("button", { name: "Keep mine" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Load server version" })).toBeInTheDocument();
   });
});

const link = (href: string, attrs: Record<string, string> = {}) => {
   const anchor = document.createElement("a");
   anchor.href = href;
   anchor.textContent = href;
   Object.entries(attrs).forEach(([name, value]) => anchor.setAttribute(name, value));
   anchor.addEventListener("click", (event) => event.preventDefault());
   document.body.append(anchor);
   added.push(anchor);
   return anchor;
};

describe("leaving by a link", () => {
   it("saves first, then opens the page, for a header, menu or Lesson link in the same tab", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "Mine");
      fireEvent.click(link("/learn/behavioral?tab=1#top"));
      expect(nav.push).not.toHaveBeenCalled();
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/learn/behavioral?tab=1#top"));
      expect(patches()).toHaveLength(1);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Mine" });
   });

   it("also covers the back link, and saves what was typed while an earlier save was still going", async () => {
      const held = gated();
      const answer = await seed();
      await open(answer, held.state.fetch);
      type("Situation", "First");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(held.state.inFlight).toBe(1));
      type("Situation", "First, then more");
      fireEvent.click(screen.getAllByRole("link", { name: "Back to your workspace" })[0]);
      await held.release();
      await waitFor(() => expect(held.state.inFlight).toBe(1));
      await held.release();
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/prepare"));
      expect((await stored(answer.id)).fields).toEqual({ situation: "First, then more" });
   });

   it("still waits when the draft is back to the saved text while the write for the edit is in the air", async () => {
      const held = gated();
      const answer = await seed({ fields: { situation: "Old" } });
      await open(answer, held.state.fetch);
      type("Situation", "New");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(held.state.inFlight).toBe(1));
      type("Situation", "Old");
      expect(status()).toBe("Saving…");
      fireEvent.click(link("/learn"));
      await act(async () => {});
      expect(nav.push).not.toHaveBeenCalled();
      await held.release();
      // The server now holds "New", so the visible draft is still unsaved and goes out before the page does.
      await waitFor(() => expect(held.state.inFlight).toBe(1));
      expect(nav.push).not.toHaveBeenCalled();
      await held.release();
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/learn"));
      expect(sentVersions()).toEqual([1, 2]);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Old" });
   });

   it("also waits for a write whose reply was lost when the draft is back to the saved text", async () => {
      const answer = await seed({ fields: { situation: "Old" } });
      let lose = true;
      const lostOnce: typeof fetch = async (input, init) => {
         const response = await api.fetch(input, init);
         if (init?.method === "PATCH" && lose) {
            lose = false;
            throw new TypeError("reply lost");
         }
         return response;
      };
      await open(answer, lostOnce);
      type("Situation", "New");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(status()).toBe(NOT_CONFIRMED));
      type("Situation", "Old");
      fireEvent.click(link("/learn"));
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/learn"));
      expect((await stored(answer.id)).fields).toEqual({ situation: "Old" });
   });

   it("waits for a re-read already in the air when the draft is back to the saved text, then leaves on an old snapshot", async () => {
      const lost = lostWriteThenHeldReads(false);
      const answer = await seed({ fields: { situation: "Old" } });
      await open(answer, lost.fetch);
      type("Situation", "New");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(status()).toBe(NOT_CONFIRMED));
      lost.state.hold = true;
      fireEvent.click(screen.getByRole("button", { name: "Check the saved answer" }));
      await waitFor(() => expect(lost.state.reads).toBe(1));
      type("Situation", "Old");
      fireEvent.click(link("/learn"));
      await act(async () => {});
      expect(nav.push).not.toHaveBeenCalled();
      // The exit joined the re-read that was running instead of starting a second one.
      expect(lost.state.reads).toBe(1);
      await lost.release();
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/learn"));
      // The lost write never reached the server and the draft is clean, so nothing is sent on the way out.
      expect(patches()).toHaveLength(0);
      expect(await stored(answer.id)).toMatchObject({ version: 1, fields: { situation: "Old" } });
   });

   it("adopts a write that had landed, then sends the reverted draft before leaving", async () => {
      const lost = lostWriteThenHeldReads(true);
      const answer = await seed({ fields: { situation: "Old" } });
      await open(answer, lost.fetch);
      type("Situation", "New");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(status()).toBe(NOT_CONFIRMED));
      lost.state.hold = true;
      fireEvent.click(screen.getByRole("button", { name: "Check the saved answer" }));
      await waitFor(() => expect(lost.state.reads).toBe(1));
      type("Situation", "Old");
      fireEvent.click(link("/learn"));
      await act(async () => {});
      expect(nav.push).not.toHaveBeenCalled();
      await lost.release();
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/learn"));
      expect(sentVersions()).toEqual([1, 2]);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Old" });
   });

   it("does not let the exit pass when the re-read it waited on fails, and asks instead", async () => {
      const lost = lostWriteThenHeldReads(true);
      const answer = await seed({ fields: { situation: "Old" } });
      await open(answer, lost.fetch);
      type("Situation", "New");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(status()).toBe(NOT_CONFIRMED));
      lost.state.hold = true;
      fireEvent.click(screen.getByRole("button", { name: "Check the saved answer" }));
      await waitFor(() => expect(lost.state.reads).toBe(1));
      type("Situation", "Old");
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      fireEvent.click(link("/learn"));
      api.failNext("network");
      await lost.release();
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
      expect(nav.push).not.toHaveBeenCalled();
      expect(status()).toBe(NOT_CONFIRMED);
   });

   it.each([
      [401, "Not saved: your session has ended."],
      [404, "Not saved: this answer no longer exists."],
   ])("asks, rather than passing, when the re-read after an unconfirmed write answers %i and the draft is back to the saved text", async (code, message) => {
      const lost = lostWriteThenHeldReads(true);
      const answer = await seed({ fields: { situation: "Old" } });
      await open(answer, lost.fetch);
      type("Situation", "New");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(status()).toBe(NOT_CONFIRMED));
      api.failNext(code);
      fireEvent.click(screen.getByRole("button", { name: "Check the saved answer" }));
      await waitFor(() => expect(status()).toContain(message));
      type("Situation", "Old");
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      api.failNext(code);
      fireEvent.click(link("/learn"));
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
      await act(async () => {});
      expect(nav.push).not.toHaveBeenCalled();
      expect(field("Situation")).toHaveValue("Old");

      confirm.mockReturnValue(true);
      api.failNext(code);
      fireEvent.click(link("/learn"));
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/learn"));
   });

   it("says it is saving while it waits", async () => {
      const held = gated();
      await open(await seed(), held.state.fetch);
      type("Situation", "Mine");
      fireEvent.click(link("/learn"));
      await waitFor(() => expect(status()).toBe("Saving before you leave…"));
      await held.release();
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/learn"));
   });

   it("lets a clean page go at once, with no request and no interception", async () => {
      await open(await seed());
      const handled = vi.fn();
      const anchor = link("/learn");
      anchor.addEventListener("click", (event) => handled(event.defaultPrevented));
      fireEvent.click(anchor);
      expect(api.requests).toHaveLength(0);
      expect(nav.push).not.toHaveBeenCalled();
      expect(handled).toHaveBeenCalledOnce();
   });

   it.each([
      ["a new tab", () => link("/learn", { target: "_blank" })],
      ["a download", () => link("/learn", { download: "" })],
      ["another site", () => link("https://example.org/page")],
      ["the same page", () => link(`${window.location.pathname}#top`)],
   ])("leaves %s to the browser", async (_name, make) => {
      await open(await seed());
      type("Situation", "Mine");
      fireEvent.click(make());
      await act(async () => {});
      expect(nav.push).not.toHaveBeenCalled();
      expect(patches()).toHaveLength(0);
   });

   it.each([["control", { ctrlKey: true }], ["meta", { metaKey: true }], ["shift", { shiftKey: true }], ["middle button", { button: 1 }]])("leaves a %s click to the browser", async (_name, init) => {
      await open(await seed());
      type("Situation", "Mine");
      fireEvent.click(link("/learn"), init);
      await act(async () => {});
      expect(nav.push).not.toHaveBeenCalled();
      expect(patches()).toHaveLength(0);
   });

   it("asks before discarding when the save fails, stays on a no, and keeps the text", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "Mine");
      api.failNext("network");
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      fireEvent.click(link("/learn"));
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
      await act(async () => {});
      expect(nav.push).not.toHaveBeenCalled();
      expect(field("Situation")).toHaveValue("Mine");
      expect(status()).toBe(NOT_CONFIRMED);

      // Still no network: the re-read fails too, so the reader is asked again, and a yes lets them go.
      api.failNext("network");
      confirm.mockReturnValue(true);
      fireEvent.click(link("/learn"));
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/learn"));
      expect(confirm).toHaveBeenCalledTimes(2);
   });

   it("re-reads and writes once more before asking when the network is back", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "Mine");
      api.failNext("network");
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      fireEvent.click(link("/learn"));
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
      fireEvent.click(link("/learn"));
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/learn"));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(api.requests.map(({ method }) => method)).toEqual(["PATCH", "GET", "PATCH"]);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Mine" });
   });

   it("asks rather than leaving when the server turned the text down", async () => {
      await open(await seed());
      type("Situation", "x".repeat(20_001));
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      fireEvent.click(link("/learn"));
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
      expect(nav.push).not.toHaveBeenCalled();
   });
});

describe("leaving by Duplicate", () => {
   it("saves text typed while the copy was being made before opening the copy", async () => {
      const answer = await seed({ fields: { situation: "Saved" } });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const holdCopy: typeof fetch = async (input, init) => {
         if (init?.method === "POST") await gate;
         return api.fetch(input, init);
      };
      await open(answer, holdCopy);
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      await waitFor(() => expect(screen.getByText("Duplicating…")).toBeInTheDocument());
      type("Situation", "Typed meanwhile");
      await act(async () => release());
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      expect(api.requests.map(({ method }) => method)).toEqual(["POST", "PATCH"]);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Typed meanwhile" });
   });

   it.each([
      ["unconfirmed", null],
      ["unreconciled after a re-read that answered 401", 401],
      ["unreconciled after a re-read that answered 404", 404],
   ])("sends no copy request while the last write is %s, even with the draft back at the saved text", async (_name, code) => {
      const lost = lostWriteThenHeldReads(true);
      const answer = await seed({ fields: { situation: "Old" } });
      await open(answer, lost.fetch);
      type("Situation", "New");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(status()).toBe(NOT_CONFIRMED));
      if (code) {
         api.failNext(code);
         fireEvent.click(screen.getByRole("button", { name: "Check the saved answer" }));
         await waitFor(() => expect(status()).toMatch(/^Not saved/));
      }
      type("Situation", "Old");
      const duplicate = screen.getByRole("button", { name: "Duplicate" });
      expect(duplicate).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(duplicate);
      await act(async () => {});
      expect(api.requests.filter(({ method }) => method === "POST")).toHaveLength(0);
      expect(nav.push).not.toHaveBeenCalled();
   });

   it("opens the copy without a detour when nothing is unsaved", async () => {
      await open(await seed());
      fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      expect(patches()).toHaveLength(0);
   });
});

describe("leaving by sign-out", () => {
   it("saves first and lets the sign-out go on", async () => {
      const answer = await seed();
      await open(answer);
      type("Situation", "Mine");
      await expect(mayLeave()).resolves.toBe(true);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Mine" });
   });

   it("still waits when the draft is back to the saved text while the write for the edit is in the air", async () => {
      const held = gated();
      const answer = await seed({ fields: { situation: "Old" } });
      await open(answer, held.state.fetch);
      type("Situation", "New");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(held.state.inFlight).toBe(1));
      type("Situation", "Old");
      const decision = vi.fn();
      void mayLeave().then(decision);
      await act(async () => {});
      expect(decision).not.toHaveBeenCalled();
      await held.release();
      await waitFor(() => expect(held.state.inFlight).toBe(1));
      expect(decision).not.toHaveBeenCalled();
      await held.release();
      await waitFor(() => expect(decision).toHaveBeenCalledWith(true));
      expect((await stored(answer.id)).fields).toEqual({ situation: "Old" });
   });

   it("waits for a re-read already in the air when the draft is back to the saved text", async () => {
      const lost = lostWriteThenHeldReads(true);
      const answer = await seed({ fields: { situation: "Old" } });
      await open(answer, lost.fetch);
      type("Situation", "New");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(status()).toBe(NOT_CONFIRMED));
      lost.state.hold = true;
      fireEvent.click(screen.getByRole("button", { name: "Check the saved answer" }));
      await waitFor(() => expect(lost.state.reads).toBe(1));
      type("Situation", "Old");
      const decision = vi.fn();
      void mayLeave().then(decision);
      await act(async () => {});
      expect(decision).not.toHaveBeenCalled();
      await lost.release();
      await waitFor(() => expect(decision).toHaveBeenCalledWith(true));
      expect((await stored(answer.id)).fields).toEqual({ situation: "Old" });
   });

   it.each([401, 404])("holds the sign-out when the re-read after an unconfirmed write answers %i and the draft is back to the saved text", async (code) => {
      const lost = lostWriteThenHeldReads(true);
      const answer = await seed({ fields: { situation: "Old" } });
      await open(answer, lost.fetch);
      type("Situation", "New");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(status()).toBe(NOT_CONFIRMED));
      api.failNext(code);
      fireEvent.click(screen.getByRole("button", { name: "Check the saved answer" }));
      await waitFor(() => expect(status()).toMatch(/^Not saved/));
      type("Situation", "Old");
      vi.spyOn(window, "confirm").mockReturnValue(false);
      api.failNext(code);
      await expect(mayLeave()).resolves.toBe(false);
   });

   it("holds the sign-out when the save fails and the reader keeps the text", async () => {
      await open(await seed());
      type("Situation", "Mine");
      api.failNext("network");
      vi.spyOn(window, "confirm").mockReturnValue(false);
      await expect(mayLeave()).resolves.toBe(false);
      expect(field("Situation")).toHaveValue("Mine");
   });

   it("lets anything go once the editor is gone", async () => {
      const view = await open(await seed());
      view.unmount();
      await expect(mayLeave()).resolves.toBe(true);
   });
});

describe("leaving by the browser's back button", () => {
   const here = () => window.location.pathname;
   const settledAt = (path: string) => waitFor(() => expect(here()).toBe(path));

   async function editorAt(answer: Answer, marked = false) {
      window.history.pushState({ __NA: true }, "", "/prepare");
      window.history.pushState({ __NA: true }, "", `/prepare/answers/${answer.id}`);
      if (marked) window.history.pushState({ __NA: true, itnLeaveGuard: true }, "", window.location.href);
      return open(answer);
   }

   it("goes back only after saving what was typed", async () => {
      const answer = await seed();
      await editorAt(answer);
      type("Situation", "Mine");
      window.history.back();
      await settledAt("/prepare");
      expect((await stored(answer.id)).fields).toEqual({ situation: "Mine" });
      expect(patches()).toHaveLength(1);
   });

   it("stays on the editor with the text when the save fails and the reader declines", async () => {
      const answer = await seed();
      await editorAt(answer);
      type("Situation", "Mine");
      api.failNext("network");
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      window.history.back();
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(here()).toBe(`/prepare/answers/${answer.id}`);
      expect(field("Situation")).toHaveValue("Mine");
      expect(status()).toBe(NOT_CONFIRMED);
   });

   it("leaves when the save fails and the reader agrees to discard", async () => {
      const answer = await seed();
      await editorAt(answer);
      type("Situation", "Mine");
      api.failNext("network");
      vi.spyOn(window, "confirm").mockReturnValue(true);
      window.history.back();
      await settledAt("/prepare");
   });

   it("goes back at once, adding no history entry, when nothing was edited", async () => {
      await editorAt(await seed());
      const entries = window.history.length;
      window.history.back();
      await settledAt("/prepare");
      expect(api.requests).toHaveLength(0);
      expect(window.history.length).toBe(entries);
   });

   it("still takes one press of Back to leave once everything is saved", async () => {
      const answer = await seed();
      await editorAt(answer);
      type("Situation", "Mine");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(status()).toBe("Saved"));
      window.history.back();
      await settledAt("/prepare");
      expect(patches()).toHaveLength(1);
   });

   it("takes one press of Back to leave when the page was reached on the added entry", async () => {
      await editorAt(await seed(), true);
      window.history.back();
      await settledAt("/prepare");
      expect(api.requests).toHaveLength(0);
   });
});

describe("leaving by a history jump of any length", () => {
   /** A stand-in for window.navigation: the page's navigate listener sees each traversal before the router does. */
   function fakeNavigation() {
      const target = new EventTarget();
      const dispatched: Event[] = [];
      const jump = (key: string | null = "entry-1", cancelable = true) => {
         const event = Object.assign(new Event("navigate", { cancelable }), { navigationType: "traverse", destination: { key } });
         dispatched.push(event);
         target.dispatchEvent(event);
         return event;
      };
      const traverseTo = vi.fn((key: string): { committed?: Promise<unknown>; finished?: Promise<unknown> } | undefined => void jump(key));
      Object.defineProperty(window, "navigation", { configurable: true, value: Object.assign(target, { traverseTo }) });
      return { traverseTo, jump, dispatched };
   }

   afterEach(() => {
      Reflect.deleteProperty(window, "navigation");
   });

   it("holds the jump, saves, then makes the same jump once, which the page lets through", async () => {
      const navigation = fakeNavigation();
      const answer = await seed();
      await open(answer);
      type("Situation", "Mine");
      const first = navigation.jump("entry-1");
      expect(first.defaultPrevented).toBe(true);
      expect(navigation.traverseTo).not.toHaveBeenCalled();
      await waitFor(() => expect(navigation.traverseTo).toHaveBeenCalledWith("entry-1"));
      expect(navigation.dispatched[1].defaultPrevented).toBe(false);
      expect(navigation.traverseTo).toHaveBeenCalledTimes(1);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Mine" });
   });

   it("still holds it when the draft is back to the saved text while a write is in the air", async () => {
      const held = gated();
      const answer = await seed({ fields: { situation: "Old" } });
      const navigation = fakeNavigation();
      await open(answer, held.state.fetch);
      type("Situation", "New");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(held.state.inFlight).toBe(1));
      type("Situation", "Old");
      expect(navigation.jump().defaultPrevented).toBe(true);
      await held.release();
      await waitFor(() => expect(held.state.inFlight).toBe(1));
      expect(navigation.traverseTo).not.toHaveBeenCalled();
      await held.release();
      await waitFor(() => expect(navigation.traverseTo).toHaveBeenCalledTimes(1));
      expect((await stored(answer.id)).fields).toEqual({ situation: "Old" });
   });

   it("asks when the save fails: a no stays on the page with the text, a yes makes the jump", async () => {
      const navigation = fakeNavigation();
      await open(await seed());
      type("Situation", "Mine");
      api.failNext("network");
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      navigation.jump();
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
      await act(async () => {});
      expect(navigation.traverseTo).not.toHaveBeenCalled();
      expect(field("Situation")).toHaveValue("Mine");

      api.failNext("network");
      confirm.mockReturnValue(true);
      navigation.jump();
      await waitFor(() => expect(navigation.traverseTo).toHaveBeenCalledTimes(1));
   });

   it("forgets its pass when the replayed traversal is rejected, so the next jump is held again", async () => {
      const navigation = fakeNavigation();
      navigation.traverseTo.mockImplementation(() => ({ committed: Promise.reject(new Error("aborted")), finished: Promise.reject(new Error("aborted")) }));
      await open(await seed());
      type("Situation", "Mine");
      navigation.jump();
      await waitFor(() => expect(navigation.traverseTo).toHaveBeenCalledTimes(1));
      await act(async () => {});
      type("Situation", "Mine again");
      expect(navigation.jump().defaultPrevented).toBe(true);
   });

   it("leaves a clean page, a traversal the browser will not let anyone cancel, and other navigation types alone", async () => {
      const navigation = fakeNavigation();
      await open(await seed());
      expect(navigation.jump().defaultPrevented).toBe(false);
      type("Situation", "Mine");
      expect(navigation.jump("entry-1", false).defaultPrevented).toBe(false);
      expect(navigation.jump(null).defaultPrevented).toBe(false);
      await act(async () => {});
      expect(patches()).toHaveLength(0);
      expect(navigation.traverseTo).not.toHaveBeenCalled();
   });
});

describe("version conflicts (P7-T21)", () => {
   const keepMine = () => screen.getByRole("button", { name: "Keep mine" });
   const loadServer = () => screen.getByRole("button", { name: "Load server version" });
   const gets = () => api.requests.filter(({ method }) => method === "GET");
   /** The editor's own writes: the other writers in these tests send `body` or `status` only, never `fields`. */
   const mineSent = () => patches().filter(({ body }) => "fields" in (body as object)).map(({ body }) => (body as { version: number }).version);
   const choiceOffered = () => screen.queryByRole("button", { name: "Keep mine" }) !== null;

   /** Another tab saves version 2 before this editor's first save; the editor then holds "Mine" and is in conflict. */
   async function conflicted(fetchImpl?: typeof fetch) {
      const answer = await seed();
      await open(answer, fetchImpl);
      await client().updateAnswer(answer.id, { version: 1, status: "ready", fields: { situation: "Theirs" } });
      type("Situation", "Mine");
      fireEvent.blur(field("Situation"));
      await screen.findByRole("button", { name: "Keep mine" });
      api.requests.length = 0;
      return answer;
   }

   it("keeps the draft and its editing state while the choice is open, and sends nothing on its own", async () => {
      const answer = await conflicted();
      expect(status()).toContain("changed somewhere else");
      expect(field("Situation")).toHaveValue("Mine");
      type("Situation", "Mine, edited");
      expect(field("Situation")).toHaveValue("Mine, edited");
      fireEvent.blur(field("Situation"));
      expect(api.requests).toHaveLength(0);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Theirs" });
   });

   it("keep mine: reads the latest, retries on its version, and the server ends up holding the draft", async () => {
      const answer = await conflicted();
      fireEvent.click(keepMine());
      await waitFor(() => expect(status()).toBe("Saved"));
      expect(api.requests.map(({ method }) => method)).toEqual(["GET", "PATCH"]);
      expect(sentVersions()).toEqual([2]);
      const now = await stored(answer.id);
      expect(now).toMatchObject({ version: 3, fields: { situation: "Mine" }, status: "draft" });
      expect(field("Situation")).toHaveValue("Mine");
      expect(choiceOffered()).toBe(false);
   });

   it("keep mine retries on the version read at that moment, not the one the 409 reported", async () => {
      const answer = await conflicted();
      await client().updateAnswer(answer.id, { version: 2, body: "Third writer" });
      api.requests.length = 0;
      fireEvent.click(keepMine());
      await waitFor(() => expect(status()).toBe("Saved"));
      expect(sentVersions()).toEqual([3]);
      expect(await stored(answer.id)).toMatchObject({ version: 4, fields: { situation: "Mine" }, body: null });
   });

   it("keep mine: a second conflict returns to the choice, nothing is retried by itself, and the text is kept", async () => {
      const race = { id: "", bump: true };
      const racing: typeof fetch = async (input, init) => {
         const response = await api.fetch(input, init);
         if (race.bump && (!init?.method || init.method === "GET") && race.id) {
            race.bump = false;
            await client().updateAnswer(race.id, { version: 2, body: "Third writer" });
         }
         return response;
      };
      const answer = await conflicted(racing);
      race.id = answer.id;
      fireEvent.click(keepMine());
      await waitFor(() => expect(status()).toContain("changed again"));
      expect(mineSent()).toEqual([2]);
      expect(field("Situation")).toHaveValue("Mine");
      expect(keepMine()).toBeInTheDocument();
      expect(loadServer()).toBeInTheDocument();
      vi.useFakeTimers();
      await advance(AUTOSAVE_DELAY_MS * 4 + RECHECK_DELAYS_MS[0]);
      vi.useRealTimers();
      expect(mineSent()).toEqual([2]);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Theirs" });
      // The reader decides again, and this time it goes through.
      fireEvent.click(keepMine());
      await waitFor(() => expect(status()).toBe("Saved"));
      expect(mineSent()).toEqual([2, 3]);
      expect(await stored(answer.id)).toMatchObject({ fields: { situation: "Mine" }, body: null });
   });

   it("keep mine is ignored while it runs: one read and one write for two clicks", async () => {
      const hold = { on: false, started: 0, waiting: [] as (() => void)[] };
      const held: typeof fetch = async (input, init) => {
         if (hold.on && init?.method === "PATCH") {
            hold.started++;
            await new Promise<void>((resolve) => hold.waiting.push(resolve));
         }
         return api.fetch(input, init);
      };
      await conflicted(held);
      hold.on = true;
      fireEvent.click(keepMine());
      await waitFor(() => expect(hold.started).toBe(1));
      expect(screen.queryByRole("button", { name: "Keep mine" })).toBeNull();
      await act(async () => void hold.waiting.shift()?.());
      await waitFor(() => expect(status()).toBe("Saved"));
      expect(gets()).toHaveLength(1);
      expect(patches()).toHaveLength(1);
   });

   it("keep mine: two clicks in the same moment start one read", async () => {
      await conflicted();
      fireEvent.click(keepMine());
      fireEvent.click(keepMine());
      await waitFor(() => expect(status()).toBe("Saved"));
      expect(gets()).toHaveLength(1);
      expect(patches()).toHaveLength(1);
   });

   it("keep mine: while the retry is in the air the choice is gone, Saved is not shown, and only one write is out at once", async () => {
      const held = gated();
      const answer = await seed();
      await open(answer, held.state.fetch);
      await client().updateAnswer(answer.id, { version: 1, status: "ready" });
      type("Situation", "Mine");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(held.state.started).toBe(1));
      await held.release();
      await screen.findByRole("button", { name: "Keep mine" });
      const seen = watchStatus();
      fireEvent.click(keepMine());
      await waitFor(() => expect(held.state.started).toBe(2));
      expect(status()).toBe("Saving…");
      expect(choiceOffered()).toBe(false);
      expect(screen.queryByRole("button", { name: "Load server version" })).toBeNull();
      expect(seen).not.toContain("Saved");
      await held.release();
      await waitFor(() => expect(status()).toBe("Saved"));
      expect(held.state.peak).toBe(1);
   });

   it("keep mine: a lost reply is an unknown outcome, never Saved, text kept, no second write before a re-read", async () => {
      const lose = { next: false, attempts: 0 };
      const flaky: typeof fetch = async (input, init) => {
         if (init?.method === "PATCH" && lose.next) {
            lose.next = false;
            lose.attempts++;
            throw new TypeError("reply lost");
         }
         return api.fetch(input, init);
      };
      const answer = await conflicted(flaky);
      const seen = watchStatus();
      lose.next = true;
      fireEvent.click(keepMine());
      await screen.findByText(NOT_CONFIRMED);
      expect(seen).not.toContain("Saved");
      expect(field("Situation")).toHaveValue("Mine");
      expect(lose.attempts).toBe(1);
      expect(patches()).toHaveLength(0);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Theirs" });
   });

   it("keep mine: if the latest version cannot be read nothing is sent and the choice stays", async () => {
      const down = { reads: false };
      const flaky: typeof fetch = async (input, init) => {
         if (down.reads && (!init?.method || init.method === "GET")) throw new TypeError("offline");
         return api.fetch(input, init);
      };
      await conflicted(flaky);
      down.reads = true;
      fireEvent.click(keepMine());
      await screen.findByText(/could not load the latest version/);
      expect(patches()).toHaveLength(0);
      expect(field("Situation")).toHaveValue("Mine");
      down.reads = false;
      fireEvent.click(keepMine());
      await waitFor(() => expect(status()).toBe("Saved"));
      expect(sentVersions()).toEqual([2]);
   });

   it("load server version: replaces the draft with the server's text and version, sends nothing, and saves later edits on that version", async () => {
      const answer = await conflicted();
      fireEvent.click(loadServer());
      await waitFor(() => expect(status()).toContain("loaded the latest version"));
      expect(field("Situation")).toHaveValue("Theirs");
      expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("ready");
      expect(patches()).toHaveLength(0);
      expect(choiceOffered()).toBe(false);
      type("Situation", "Theirs, plus mine");
      fireEvent.blur(field("Situation"));
      await waitFor(() => expect(status()).toBe("Saved"));
      expect(sentVersions()).toEqual([2]);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Theirs, plus mine" });
   });

   it("load server version: text typed during the conflict cannot be sent afterwards by a pending autosave", async () => {
      const answer = await conflicted();
      vi.useFakeTimers();
      type("Situation", "Mine, typed during the conflict");
      fireEvent.click(loadServer());
      await advance(0);
      expect(field("Situation")).toHaveValue("Theirs");
      await advance(AUTOSAVE_DELAY_MS * 4);
      fireEvent.blur(field("Situation"));
      await advance(AUTOSAVE_DELAY_MS);
      vi.useRealTimers();
      expect(patches()).toHaveLength(0);
      expect((await stored(answer.id)).fields).toEqual({ situation: "Theirs" });
   });

   it("load server version: nothing is replaced if the reader kept typing while it loaded", async () => {
      const held = { waiting: [] as (() => void)[], on: false };
      const slowRead: typeof fetch = async (input, init) => {
         if (held.on && (!init?.method || init.method === "GET")) await new Promise<void>((resolve) => held.waiting.push(resolve));
         return api.fetch(input, init);
      };
      await conflicted(slowRead);
      held.on = true;
      fireEvent.click(loadServer());
      await waitFor(() => expect(held.waiting).toHaveLength(1));
      field("Situation").focus();
      type("Situation", "Mine, and more");
      await act(async () => void held.waiting.shift()?.());
      await screen.findByText(/kept typing while the latest version loaded/);
      expect(field("Situation")).toHaveValue("Mine, and more");
      expect(document.activeElement).toBe(field("Situation"));
      expect(keepMine()).toBeInTheDocument();
      expect(patches()).toHaveLength(0);
   });

   it("load server version: the answer deleted elsewhere is reported as gone, the text is kept", async () => {
      const answer = await conflicted();
      await client().deleteAnswer(answer.id);
      fireEvent.click(loadServer());
      await waitFor(() => expect(status()).toContain("no longer exists"));
      expect(field("Situation")).toHaveValue("Mine");
      expect(choiceOffered()).toBe(false);
   });

   const choiceGroup = () => screen.getByRole("group", { name: "Choose which version to keep" });
   const statusRegion = () => document.querySelector('[data-slot="save-status"]');

   it("focus: after a choice the unmounted button hands focus to the status; a reopened choice takes it back to the choice group", async () => {
      const race = { id: "", bump: true, hold: false, release: undefined as undefined | (() => void) };
      const racing: typeof fetch = async (input, init) => {
         const response = await api.fetch(input, init);
         if (race.bump && (!init?.method || init.method === "GET") && race.id) {
            race.bump = false;
            await client().updateAnswer(race.id, { version: 2, body: "Third writer" });
         }
         if (race.hold && init?.method === "PATCH") await new Promise<void>((resolve) => (race.release = resolve));
         return response;
      };
      const answer = await conflicted(racing);
      race.id = answer.id;
      race.hold = true;
      keepMine().focus();
      fireEvent.click(keepMine());
      // While the retry is in the air the status holds focus; the reopened choice must still take it from there.
      await waitFor(() => expect(race.release).toBeDefined());
      expect(document.activeElement).toBe(statusRegion());
      race.hold = false;
      await act(async () => void race.release?.());
      await waitFor(() => expect(status()).toContain("changed again"));
      expect(document.activeElement).toBe(choiceGroup());
      // Moving focus runs the form's blur-save, so the click comes in a later event, as a person's does.
      keepMine().focus();
      await act(async () => {});
      fireEvent.click(keepMine());
      await waitFor(() => expect(status()).toBe("Saved"));
      expect(document.activeElement).toBe(statusRegion());
   });

   it("focus: loading the server version leaves focus on the status", async () => {
      await conflicted();
      loadServer().focus();
      fireEvent.click(loadServer());
      await waitFor(() => expect(status()).toContain("loaded the latest version"));
      expect(document.activeElement).toBe(statusRegion());
   });

   it("leaving with the choice open does not discard the text silently: the exit asks", async () => {
      await conflicted();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      fireEvent.click(link("/learn/behavioral"));
      await waitFor(() => expect(confirm).toHaveBeenCalled());
      expect(nav.push).not.toHaveBeenCalled();
      expect(field("Situation")).toHaveValue("Mine");
   });
});
