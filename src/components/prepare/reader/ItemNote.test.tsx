import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DELAY_MS } from "@/components/prepare/editor/useAnswerEditor";
import { createPrepClient } from "@/lib/prep/client";
import { createFakePrepApi } from "@/lib/prep/fakeApi";
import { forgetItemStateAvailability } from "./itemStateAvailable";
import { ReaderControls } from "./ReaderControls";
import { NOTE_MAX } from "./useItemNote";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const BASE = "https://api.example.test";
const LESSON = "lesson.dynamic-batching";
const PROBLEM = "problem.rate-limiter";

type Api = ReturnType<typeof createFakePrepApi>;

let api: Api;
let canary = 0;

beforeEach(() => {
   forgetItemStateAvailability();
   api = createFakePrepApi();
});
afterEach(() => {
   vi.useRealTimers();
   window.localStorage.clear();
   window.sessionStorage.clear();
});

/** One browser context: the reader as `user` sees it. */
function mount(user: string, { id = LESSON, fetchImpl = api.fetch, strict = false }: { id?: string; fetchImpl?: typeof fetch; strict?: boolean } = {}) {
   const token = api.signIn(user);
   const tree = <ReaderControls contentId={id} apiUrl={BASE} getAccessToken={async () => token} fetch={fetchImpl} />;
   return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}
const server = (user: string) => createPrepClient({ baseUrl: BASE, getAccessToken: async () => api.signIn(user), fetch: api.fetch });
const stored = async (user: string, id = LESSON) => {
   const result = await server(user).getItemState(id);
   if (result.status !== "ok") throw new Error("read failed");
   return result.data;
};

const field = () => screen.getByRole("textbox", { name: /private note/ }) as HTMLTextAreaElement;
const panel = () => field().closest('[data-slot="disclosure"]') as HTMLElement;
const noteStatus = () => within(panel()).getByRole("status");
const complete = () => screen.getByRole("button", { name: "Mark complete" });
const bookmark = () => screen.getByRole("button", { name: "Bookmark" });
const patches = () => api.requests.filter(({ method }) => method === "PATCH");
const bodies = () => patches().map(({ body }) => body);
const type = (value: string) => fireEvent.change(field(), { target: { value } });
const act0 = (run: () => void) => act(async () => run());
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const settleSave = () => advance(AUTOSAVE_DELAY_MS + 50);

/** Waits for the controls to load, then opens the note. Timers are real until the test asks for fake ones. */
async function ready(open = true) {
   await waitFor(() => expect(complete()).toBeEnabled());
   if (open) await act0(() => fireEvent.click(screen.getByRole("button", { name: /Your note/ })));
}
/** After `ready`: fake timers, so the quiet time before a save can be stepped. */
const stepped = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

/** A fetch that holds note and control writes until released, counting how many are in the air at once. */
function gated() {
   const waiting: (() => void)[] = [];
   const state = { inFlight: 0, peak: 0, fetch: undefined as unknown as typeof fetch };
   state.fetch = async (input, init) => {
      if (init?.method !== "PATCH") return api.fetch(input, init);
      state.peak = Math.max(state.peak, ++state.inFlight);
      await new Promise<void>((resolve) => waiting.push(resolve));
      state.inFlight--;
      return api.fetch(input, init);
   };
   return { state, release: () => act(async () => void waiting.shift()?.()) };
}

describe("loading the note", () => {
   for (const id of [LESSON, PROBLEM]) {
      it(`${id}: shows the saved note for the exact item, reading only features, visit and the item`, async () => {
         await server("ada").updateItemState(id, { version: 0, note: `note for ${id}` });
         await server("ada").updateItemState(LESSON === id ? PROBLEM : LESSON, { version: 0, note: "the other item" });
         api.requests.length = 0;
         mount("ada", { id });
         await ready();
         expect(field()).toHaveValue(`note for ${id}`);
         expect(api.requests.map(({ method, path }) => `${method} ${path}`)).toEqual(["GET /features", `POST /item-state/${id}/visit`, `GET /item-state/${id}`]);
         expect(screen.getByRole("group", { name: id === LESSON ? "Lesson actions" : "Problem actions" })).toBeInTheDocument();
      });
   }

   it("shows an empty box and no 'has a note' hint for an item with no note", async () => {
      mount("ada");
      await ready();
      expect(field()).toHaveValue("");
      expect(screen.getByRole("button", { name: /Your note/ })).not.toHaveTextContent("Has a note");
   });

   it("is collapsed until opened and says so on the button", async () => {
      mount("ada");
      await ready(false);
      expect(screen.getByRole("button", { name: /Your note/ })).toHaveAttribute("aria-expanded", "false");
      await act0(() => fireEvent.click(screen.getByRole("button", { name: /Your note/ })));
      expect(screen.getByRole("button", { name: /Your note/ })).toHaveAttribute("aria-expanded", "true");
   });
});

describe("writing the note", () => {
   it("creates, updates and clears it, each as one write with the version just read; clearing sends null", async () => {
      mount("ada");
      await ready();
      stepped();
      type("first");
      await settleSave();
      expect(bodies()).toEqual([{ version: 1, note: "first" }]);
      expect(noteStatus()).toHaveTextContent("Saved");
      expect(await stored("ada")).toMatchObject({ note: "first", version: 2 });

      type("second");
      await settleSave();
      expect(bodies().at(-1)).toEqual({ version: 2, note: "second" });

      type("");
      await settleSave();
      expect(bodies().at(-1)).toEqual({ version: 3, note: null });
      expect(await stored("ada")).toMatchObject({ note: null, version: 4 });
      expect(field()).toHaveValue("");
      expect(noteStatus()).toHaveTextContent("Saved");
   });

   it("waits for a quiet moment: typing in bursts sends one write, and leaving the box sends it at once", async () => {
      mount("ada");
      await ready();
      stepped();
      type("a");
      await advance(AUTOSAVE_DELAY_MS - 100);
      type("ab");
      await advance(AUTOSAVE_DELAY_MS - 100);
      type("abc");
      expect(patches()).toHaveLength(0);
      expect(noteStatus()).toHaveTextContent("Unsaved changes");
      await settleSave();
      expect(bodies()).toEqual([{ version: 1, note: "abc" }]);

      type("abcd");
      await act0(() => fireEvent.blur(field()));
      expect(bodies().at(-1)).toEqual({ version: 2, note: "abcd" });
      await advance(AUTOSAVE_DELAY_MS + 50);
      expect(patches()).toHaveLength(2);
   });

   it("sends exactly one write under React Strict Mode", async () => {
      mount("ada", { strict: true });
      await ready();
      stepped();
      type("once");
      await settleSave();
      expect(patches()).toHaveLength(1);
      expect(await stored("ada")).toMatchObject({ note: "once" });
   });

   it("keeps a note of exactly 20,000 characters, counting code points, and refuses one character more without sending it", async () => {
      mount("ada");
      await ready();
      stepped();
      type("😀".repeat(NOTE_MAX));
      await settleSave();
      expect(patches()).toHaveLength(1);
      expect([...(await stored("ada")).note!]).toHaveLength(NOTE_MAX);

      type("😀".repeat(NOTE_MAX + 1));
      await settleSave();
      expect(patches()).toHaveLength(1);
      expect(field()).toBeInvalid();
      expect(noteStatus()).toHaveTextContent("Too long to save");
      expect(screen.getByRole("button", { name: /Your note/ })).toHaveTextContent("Not saved");

      type("😀".repeat(NOTE_MAX - 1));
      await settleSave();
      expect(patches()).toHaveLength(2);
      expect(noteStatus()).toHaveTextContent("Saved");
   });

   it("does not send text with a null character", async () => {
      mount("ada");
      await ready();
      stepped();
      type("a\u0000b");
      await settleSave();
      expect(patches()).toHaveLength(0);
      expect(field()).toBeInvalid();
   });
});

describe("the note belongs to its reader and its item", () => {
   it("is there after a reload, after sign-out and sign-in, and in a second browser context", async () => {
      const first = mount("ada");
      await ready();
      stepped();
      type("keep this");
      await settleSave();
      vi.useRealTimers();

      const second = mount("ada");
      await waitFor(() => expect(within(second.container).getByRole("textbox", { name: /private note/ })).toHaveValue("keep this"));
      second.unmount();
      first.unmount();

      forgetItemStateAvailability();
      mount("ada");
      await ready(false);
      await waitFor(() => expect(field()).toHaveValue("keep this"));
   });

   it("is not shown to, and not overwritten by, another user", async () => {
      await server("ada").updateItemState(LESSON, { version: 0, note: "ada's note" });
      const grace = mount("grace");
      await ready();
      expect(field()).toHaveValue("");
      stepped();
      type("grace's note");
      await settleSave();
      expect(await stored("grace")).toMatchObject({ note: "grace's note" });
      expect(await stored("ada")).toMatchObject({ note: "ada's note" });
      grace.unmount();
      expect(api.requests.filter(({ token }) => token === "token-grace").every(({ path }) => path === "/features" || path.startsWith("/item-state/"))).toBe(true);
   });

   it("is kept per item: a note on one Lesson is not on another", async () => {
      await server("ada").updateItemState(LESSON, { version: 0, note: "on the lesson" });
      mount("ada", { id: "lesson.other-lesson" });
      await ready();
      expect(field()).toHaveValue("");
   });
});

describe("one version for the note and the controls", () => {
   it("takes the version from the same state a completion or bookmark just updated", async () => {
      mount("ada");
      await ready();
      stepped();
      type("n1");
      await settleSave();
      vi.useRealTimers();
      await act0(() => fireEvent.click(complete()));
      expect(complete()).toHaveAttribute("aria-pressed", "true");
      stepped();
      type("n2");
      await settleSave();
      vi.useRealTimers();
      await act0(() => fireEvent.click(bookmark()));
      expect(bodies()).toEqual([
         { version: 1, note: "n1" },
         { version: 2, completed: true },
         { version: 3, note: "n2" },
         { version: 4, bookmarked: true },
      ]);
      expect(await stored("ada")).toMatchObject({ note: "n2", version: 5, completed_at: expect.any(String), bookmarked_at: expect.any(String) });
   });

   it("keeps the note text when a completion or bookmark saves, and keeps both marks when the note saves", async () => {
      mount("ada");
      await ready();
      stepped();
      type("typed but not yet saved");
      await act0(() => fireEvent.click(complete()));
      await act0(() => fireEvent.click(bookmark()));
      expect(field()).toHaveValue("typed but not yet saved");
      expect(complete()).toHaveAttribute("aria-pressed", "true");
      expect(bookmark()).toHaveAttribute("aria-pressed", "true");
      expect(noteStatus()).toHaveTextContent("Unsaved changes");

      await settleSave();
      expect(noteStatus()).toHaveTextContent("Saved");
      const state = await stored("ada");
      expect(state).toMatchObject({ note: "typed but not yet saved", completed_at: expect.any(String), bookmarked_at: expect.any(String) });
      expect(complete()).toHaveAttribute("aria-pressed", "true");
      expect(bookmark()).toHaveAttribute("aria-pressed", "true");
      expect(bodies().map((body) => Object.keys(body as object).sort().join())).toEqual(["completed,version", "bookmarked,version", "note,version"]);
   });

   it("never has two writes in the air: a press during a note save waits for it and then uses the new version", async () => {
      const held = gated();
      mount("ada", { fetchImpl: held.state.fetch });
      await ready();
      stepped();
      type("slow note");
      await settleSave();
      vi.useRealTimers();
      expect(held.state.inFlight).toBe(1);

      await act0(() => fireEvent.click(complete()));
      expect(held.state.inFlight).toBe(1);
      await held.release();
      await waitFor(() => expect(held.state.inFlight).toBe(1));
      await held.release();
      await waitFor(() => expect(complete()).toHaveAttribute("aria-pressed", "true"));
      expect(held.state.peak).toBe(1);
      expect(bodies()).toEqual([
         { version: 1, note: "slow note" },
         { version: 2, completed: true },
      ]);
      expect(field()).toHaveValue("slow note");
   });
});

describe("a change made in another context", () => {
   async function conflict() {
      mount("ada");
      await ready();
      await server("ada").updateItemState(LESSON, { version: 1, note: "theirs" });
      stepped();
      type("mine");
      await settleSave();
      vi.useRealTimers();
   }
   const choice = () => screen.getByRole("group", { name: "Choose which version to keep" });

   it("is not overwritten: a stale save stops at a clear choice, and the reader's text stays", async () => {
      await conflict();
      expect(choice()).toBeInTheDocument();
      expect(field()).toHaveValue("mine");
      expect(noteStatus()).toHaveTextContent("Not saved: this note was changed somewhere else");
      expect(noteStatus()).not.toHaveTextContent(/^Saved/);
      expect(await stored("ada")).toMatchObject({ note: "theirs", version: 2 });
      expect(patches()).toHaveLength(2);
   });

   it("Keep mine saves the text against the version read just now", async () => {
      await conflict();
      await act0(() => fireEvent.click(within(choice()).getByRole("button", { name: "Keep mine" })));
      await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));
      expect(bodies().at(-1)).toEqual({ version: 2, note: "mine" });
      expect(await stored("ada")).toMatchObject({ note: "mine", version: 3 });
      expect(screen.queryByRole("group", { name: "Choose which version to keep" })).not.toBeInTheDocument();
   });

   it("Load server version replaces the text with theirs and sends nothing", async () => {
      await conflict();
      const before = patches().length;
      await act0(() => fireEvent.click(within(choice()).getByRole("button", { name: "Load server version" })));
      await waitFor(() => expect(field()).toHaveValue("theirs"));
      expect(patches()).toHaveLength(before);
      expect(noteStatus()).toHaveTextContent("loaded the latest version");
      expect(await stored("ada")).toMatchObject({ note: "theirs", version: 2 });
   });

   it("a press of a control that meets a stale version re-reads; an untouched note shows the newer text, a typed one asks", async () => {
      mount("ada");
      await ready();
      await server("ada").updateItemState(LESSON, { version: 1, note: "theirs" });
      await act0(() => fireEvent.click(complete()));
      await waitFor(() => expect(field()).toHaveValue("theirs"));
      expect(screen.queryByRole("group", { name: "Choose which version to keep" })).not.toBeInTheDocument();
      expect(patches()).toHaveLength(2);
      await act0(() => fireEvent.click(complete()));

      stepped();
      type("typed");
      vi.useRealTimers();
      await server("ada").updateItemState(LESSON, { version: (await stored("ada")).version, note: "newer" });
      await act0(() => fireEvent.click(bookmark()));
      await waitFor(() => expect(choice()).toBeInTheDocument());
      expect(field()).toHaveValue("typed");
      expect((await stored("ada")).note).toBe("newer");
   });

   it("holds the choice on the screen: the panel opens itself and offers both buttons by keyboard", async () => {
      mount("ada");
      await ready(false);
      await server("ada").updateItemState(LESSON, { version: 1, note: "theirs" });
      await act0(() => fireEvent.click(screen.getByRole("button", { name: /Your note/ })));
      stepped();
      type("mine");
      await settleSave();
      vi.useRealTimers();
      expect(screen.getByRole("button", { name: /Your note/ })).toHaveTextContent("Not saved");
      for (const name of ["Keep mine", "Load server version"]) expect(within(choice()).getByRole("button", { name }).tagName).toBe("BUTTON");
      within(choice()).getByRole("button", { name: "Keep mine" }).focus();
      await act0(() => fireEvent.click(within(choice()).getByRole("button", { name: "Keep mine" })));
      await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));
      await waitFor(() => expect(noteStatus()).toHaveFocus());
   });
});

describe("when a write fails", () => {
   it("keeps the text, never says Saved, and a retry reads the version again first", async () => {
      mount("ada");
      await ready();
      await server("ada").updateItemState(LESSON, { version: 1, completed: true });
      api.requests.length = 0;
      stepped();
      api.failNext("network");
      type("do not lose me");
      await settleSave();
      vi.useRealTimers();
      expect(field()).toHaveValue("do not lose me");
      expect(noteStatus()).toHaveTextContent("We could not confirm that your note was saved");
      expect(noteStatus()).not.toHaveTextContent(/^Saved/);
      expect(screen.getByRole("button", { name: /Your note/ })).toHaveTextContent("Not saved");
      expect((await stored("ada")).note).toBeNull();

      await act0(() => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
      await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));
      expect(bodies()).toEqual([
         { version: 1, note: "do not lose me" },
         { version: 2, note: "do not lose me" },
      ]);
      expect(await stored("ada")).toMatchObject({ note: "do not lose me", completed_at: expect.any(String) });
   });

   it("does not write twice when the first write reached the server and only its answer was lost", async () => {
      const lost: typeof fetch = async (input, init) => {
         const response = await api.fetch(input, init);
         if (init?.method === "PATCH") throw new TypeError("connection dropped");
         return response;
      };
      mount("ada", { fetchImpl: lost });
      await ready();
      stepped();
      type("landed");
      await settleSave();
      vi.useRealTimers();
      await waitFor(() => expect(noteStatus()).toHaveTextContent("Saved"));
      expect(patches()).toHaveLength(1);
      expect(await stored("ada")).toMatchObject({ note: "landed", version: 2 });
   });

   it("says so and keeps the text when the session has ended", async () => {
      mount("ada");
      await ready();
      stepped();
      api.failNext(401);
      type("still here");
      await settleSave();
      expect(field()).toHaveValue("still here");
      expect(noteStatus()).toHaveTextContent("Not saved: your session has ended");
   });

   it("keeps the text when the server stops offering notes", async () => {
      mount("ada");
      await ready();
      stepped();
      api.setContinuity(false);
      type("keep");
      await settleSave();
      expect(field()).toHaveValue("keep");
      expect(noteStatus()).toHaveTextContent("Not saved: notes are not available right now");
   });
});

describe("leaving the page", () => {
   it("asks the browser before the tab closes while a note is unsaved, and not after it is saved", async () => {
      mount("ada");
      await ready();
      stepped();
      const asked = () => {
         const event = new Event("beforeunload", { cancelable: true });
         window.dispatchEvent(event);
         return event.defaultPrevented;
      };
      expect(asked()).toBe(false);
      type("unsaved");
      expect(asked()).toBe(true);
      await settleSave();
      expect(asked()).toBe(false);
   });
});

describe("where the note is not offered", () => {
   it("signed out: no note, no request", async () => {
      const view = render(<ReaderControls contentId={LESSON} apiUrl={BASE} getAccessToken={async () => null} fetch={api.fetch} />);
      await act0(() => {});
      expect(view.container).toBeEmptyDOMElement();
      expect(api.requests).toEqual([]);
   });

   it("M2 off: no note, and the only request is the capability read", async () => {
      api.setContinuity(false);
      const view = mount("ada");
      await act0(() => {});
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(view.container).toBeEmptyDOMElement();
      expect(api.requests.map(({ method, path }) => `${method} ${path}`)).toEqual(["GET /features"]);
   });

   it("a feature read that fails closed offers no note and sends no item-state request", async () => {
      api.failNext(500);
      mount("ada");
      await act0(() => {});
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(api.requests.every(({ path }) => path === "/features")).toBe(true);
   });
});

describe("nothing about the note is kept in the browser", () => {
   it("writes no storage, cookie or address while the note is read, typed, saved and cleared", async () => {
      const text = `secret note ${++canary}`;
      mount("ada");
      await ready();
      stepped();
      type(text);
      await settleSave();
      type("");
      await settleSave();
      type(text);
      await settleSave();
      const kept = [window.localStorage.length, window.sessionStorage.length, document.cookie, window.location.href];
      expect(kept.slice(0, 3)).toEqual([0, 0, ""]);
      expect(kept.join("")).not.toContain(text);
      expect(window.location.search + window.location.hash).toBe("");
   });

   it("the note travels only in the body of the item-state write, never in a path or query", async () => {
      const text = `canary ${++canary}`;
      mount("ada");
      await ready();
      stepped();
      type(text);
      await settleSave();
      for (const { path, body } of api.requests) {
         expect(path).not.toContain(text);
         if (JSON.stringify(body ?? "").includes(text)) expect(path).toMatch(/^\/item-state\/[a-z.-]+$/);
      }
   });
});

describe("the panel for assistive technology", () => {
   it("labels the box, describes it, and names the live status the note uses", async () => {
      mount("ada", { id: PROBLEM });
      await ready();
      expect(field()).toHaveAccessibleName("Your private note on this Problem");
      expect(field()).toHaveAccessibleDescription(/Only you can see it\. It saves as you type\. Up to 20,000 characters\./);
      expect(noteStatus()).toHaveAttribute("aria-live", "polite");
      expect(screen.getByRole("heading", { level: 2, name: /Your note/ })).toBeInTheDocument();
   });

   it("opens and closes from the keyboard through its native button", async () => {
      mount("ada");
      await ready(false);
      const button = screen.getByRole("button", { name: /Your note/ });
      expect(button.tagName).toBe("BUTTON");
      expect(document.getElementById(button.getAttribute("aria-controls")!)).toContainElement(field());
      await act0(() => fireEvent.click(button));
      expect(button).toHaveAttribute("aria-expanded", "true");
      await act0(() => fireEvent.click(button));
      expect(button).toHaveAttribute("aria-expanded", "false");
   });

   it("announces the invalid text through the box's own description", async () => {
      mount("ada");
      await ready();
      type("x".repeat(NOTE_MAX + 1));
      expect(field()).toHaveAccessibleDescription(/Too long to save/);
   });
});
