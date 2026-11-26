import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DELAY_MS as ANSWER_DELAY } from "@/components/prepare/editor/useAnswerEditor";
import { AUTOSAVE_DELAY_MS, AutosaveEngine, OFFLINE_RETRY_DELAYS_MS, type LoadOutcome, type Resource, type SaveOutcome } from "./autosave";
import { createPracticeClient } from "./client";
import { createFakePracticeApi } from "./fakeApi";
import { installFakeAttempts, type FakeAttempts } from "./fakeAttempts";
import { createStageEngine, type StageEngine } from "./stageSave";
import type { AttemptDetailOut } from "./types";

const API = "https://api.example.test";
const PROBLEM = "problem.llm-attribute-extraction-pipeline";

type Setup = { api: ReturnType<typeof createFakePracticeApi>; store: FakeAttempts; id: string; engine: (position?: "frame" | "requirements", onTerminal?: () => void) => StageEngine; patches: () => number };

async function setup(): Promise<Setup> {
   const api = createFakePracticeApi();
   const token = api.signIn("ada");
   const store = installFakeAttempts(api, { consent: { requiredVersion: "v1", accepted: true } });
   const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => token, fetch: api.fetch });
   const created = await client.createAttempt({ content_id: PROBLEM, mode: "self", target_seniority: "senior" }, "key-aaaaaaaaaaaaaaaa");
   if (created.status !== "ok") throw new Error("setup failed");
   const id = created.data.id;
   const detail = await client.getAttempt(id);
   if (detail.status !== "ok") throw new Error("setup failed");
   const first = (position: string) => (detail.data as AttemptDetailOut).stage_work.find((stage) => stage.position === position)!;
   return {
      api,
      store,
      id,
      patches: () => store.calls("patch_stage").length,
      engine: (position = "frame", onTerminal) => createStageEngine(client, id, first(position), onTerminal),
   };
}

const type = (engine: StageEngine, key: string, value: string) => engine.edit((draft) => ({ ...draft, fields: { ...draft.fields, [key]: value } }));
const settle = async (ms = 0) => {
   await vi.advanceTimersByTimeAsync(ms);
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the autosave engine on a stage", () => {
   it("keeps the debounce the answer editor uses", () => {
      expect(AUTOSAVE_DELAY_MS).toBe(ANSWER_DELAY);
   });

   it("shows typing at once and saves once after 1.5 s of quiet, coalescing rapid edits", async () => {
      const { engine, patches, store, id } = await setup();
      const e = engine();
      type(e, "restate_task", "a");
      type(e, "restate_task", "ab");
      type(e, "restate_task", "abc");
      expect(e.getSnapshot().draft.fields.restate_task).toBe("abc");
      expect(e.getSnapshot().dirty).toBe(true);
      await settle(AUTOSAVE_DELAY_MS - 1);
      expect(patches()).toBe(0);
      await settle(1);
      expect(patches()).toBe(1);
      expect(e.getSnapshot().phase).toBe("saved");
      expect(e.getSnapshot().saved.version).toBe(2);
      expect(store.stage(id, "frame").fields.restate_task).toBe("abc");
      const body = store.calls("patch_stage")[0].body as { version: number; set_fields: Record<string, string> };
      expect(body.version).toBe(1);
      expect(body.set_fields).toEqual({ restate_task: "abc" });
   });

   it("sends the changed keys and a status change in the same compare-and-set write", async () => {
      const { engine, store, id } = await setup();
      const e = engine();
      e.edit((draft) => ({ status: "done", fields: { ...draft.fields, assumptions: "x" } }));
      await settle(AUTOSAVE_DELAY_MS);
      expect(store.calls("patch_stage")[0].body).toEqual({ version: 1, status: "done", set_fields: { assumptions: "x" } });
      expect(store.stage(id, "frame").status).toBe("done");
   });

   it("never has two writes in flight for one stage, and saves what was typed during a write afterwards", async () => {
      const { patches, api, store, id } = await setup();
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const inner = api.fetch;
      let inFlight = 0;
      let peak = 0;
      let first = true;
      // A controlled deferred: the first PATCH is answered only when the test lets it.
      const wrapped: typeof fetch = async (input, init) => {
         if ((init?.method ?? "GET") === "PATCH") {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            if (first) {
               first = false;
               await held;
            }
            try {
               return await inner(input, init);
            } finally {
               inFlight -= 1;
            }
         }
         return inner(input, init);
      };
      const client = createPracticeClient({ baseUrl: API, getAccessToken: async () => "fake-token-ada", fetch: wrapped });
      const detail = await client.getAttempt(id);
      if (detail.status !== "ok") throw new Error("setup");
      const e = createStageEngine(client, id, detail.data.stage_work[0]);
      type(e, "restate_task", "one");
      await settle(AUTOSAVE_DELAY_MS);
      expect(e.getSnapshot().phase).toBe("saving");
      type(e, "restate_task", "one two");
      await settle(AUTOSAVE_DELAY_MS * 2); // the debounce fires while the first write is still in the air
      expect(peak).toBe(1);
      release();
      await settle(10);
      await settle(AUTOSAVE_DELAY_MS);
      expect(peak).toBe(1);
      expect(patches()).toBe(2);
      expect(store.stage(id, "frame").fields.restate_task).toBe("one two");
      expect(e.getSnapshot().phase).toBe("saved");
      expect(e.getSnapshot().draft.fields.restate_task).toBe("one two");
   });

   it("does not let a late reply overwrite text typed since (saved is canonical, the draft is the learner's)", async () => {
      const { engine, store, id } = await setup();
      const e = engine();
      type(e, "restate_task", "first");
      const flush = e.persist();
      type(e, "restate_task", "first and more"); // typed while the write is in the air
      await flush;
      await settle(AUTOSAVE_DELAY_MS);
      expect(e.getSnapshot().draft.fields.restate_task).toBe("first and more");
      expect(store.stage(id, "frame").fields.restate_task).toBe("first and more");
   });

   it("keeps text in memory when offline, says so, and retries by itself without discarding it", async () => {
      const { engine, api, store, id } = await setup();
      const e = engine();
      type(e, "restate_task", "kept");
      api.failNext("network");
      await settle(AUTOSAVE_DELAY_MS);
      expect(e.getSnapshot().phase).toBe("offline");
      expect(e.getSnapshot().note).toMatch(/Not saved/);
      expect(e.getSnapshot().draft.fields.restate_task).toBe("kept");
      expect(e.hasPendingWork).toBe(true);
      await settle(OFFLINE_RETRY_DELAYS_MS[0]);
      expect(e.getSnapshot().phase).toBe("saved");
      expect(store.stage(id, "frame").fields.restate_task).toBe("kept");
   });

   it("stops retrying after the last delay and waits for the learner's Retry, text intact", async () => {
      const { engine, api, patches, store, id } = await setup();
      const e = engine();
      type(e, "restate_task", "kept");
      for (let i = 0; i <= OFFLINE_RETRY_DELAYS_MS.length; i++) {
         api.failNext("network");
         await settle(i === 0 ? AUTOSAVE_DELAY_MS : OFFLINE_RETRY_DELAYS_MS[i - 1]);
      }
      expect(patches()).toBe(1 + OFFLINE_RETRY_DELAYS_MS.length);
      expect(e.getSnapshot().phase).toBe("offline");
      await settle(120_000);
      expect(patches()).toBe(1 + OFFLINE_RETRY_DELAYS_MS.length);
      await e.retry();
      expect(e.getSnapshot().phase).toBe("saved");
      expect(store.stage(id, "frame").fields.restate_task).toBe("kept");
   });

   it("treats a write that landed unseen as saved: the resend conflicts, the server already holds the text", async () => {
      const { engine, api, store, id } = await setup();
      const e = engine();
      type(e, "restate_task", "landed");
      // The server applied the write, but its reply never reached the browser: the resend finds the version moved on.
      void api;
      store.writeElsewhere(id, "frame", { restate_task: "landed" });
      await settle(AUTOSAVE_DELAY_MS);
      expect(e.getSnapshot().phase).toBe("saved");
      expect(e.getSnapshot().theirs).toBeNull();
      expect(e.getSnapshot().saved.version).toBe(2);
      expect(store.calls("patch_stage")).toHaveLength(1);
   });
});

describe("a version conflict", () => {
   it("keeps the learner's text, offers the choice, and never overwrites either side by itself", async () => {
      const { engine, store, id, patches } = await setup();
      const e = engine();
      store.writeElsewhere(id, "frame", { restate_task: "theirs" });
      type(e, "restate_task", "mine");
      await settle(AUTOSAVE_DELAY_MS);
      const snap = e.getSnapshot();
      expect(snap.phase).toBe("conflict");
      expect(snap.draft.fields.restate_task).toBe("mine");
      expect(snap.theirs?.fields.restate_task).toBe("theirs");
      expect(patches()).toBe(1);
      await settle(120_000); // nothing saves while the choice is open
      expect(patches()).toBe(1);
      expect(store.stage(id, "frame").fields.restate_task).toBe("theirs");
   });

   it("Keep mine saves against the server's current version", async () => {
      const { engine, store, id } = await setup();
      const e = engine();
      store.writeElsewhere(id, "frame", { restate_task: "theirs", assumptions: "their assumption" });
      type(e, "restate_task", "mine");
      await settle(AUTOSAVE_DELAY_MS);
      await e.keepMine();
      expect(e.getSnapshot().phase).toBe("saved");
      const last = store.calls("patch_stage").at(-1)!.body as { version: number; set_fields: Record<string, string> };
      expect(last.version).toBe(2);
      expect(last.set_fields).toEqual({ restate_task: "mine" }); // their other field is not touched
      expect(store.stage(id, "frame").fields).toEqual({ restate_task: "mine", assumptions: "their assumption" });
      expect(e.getSnapshot().draft.fields.assumptions).toBe("their assumption");
   });

   it("Take theirs replaces the local text with the server's, as an explicit choice", async () => {
      const { engine, store, id, patches } = await setup();
      const e = engine();
      store.writeElsewhere(id, "frame", { restate_task: "theirs" });
      type(e, "restate_task", "mine");
      await settle(AUTOSAVE_DELAY_MS);
      await e.takeTheirs();
      expect(e.getSnapshot().draft.fields.restate_task).toBe("theirs");
      expect(e.getSnapshot().phase).toBe("saved");
      expect(patches()).toBe(1);
   });

   it("Combine keeps both versions of a field both sides changed and saves at the current version", async () => {
      const { engine, store, id } = await setup();
      const e = engine();
      store.writeElsewhere(id, "frame", { restate_task: "theirs" });
      type(e, "restate_task", "mine");
      await settle(AUTOSAVE_DELAY_MS);
      await e.combine();
      expect(e.getSnapshot().phase).toBe("saved");
      expect(store.stage(id, "frame").fields.restate_task).toBe("mine\n\ntheirs");
      expect((store.calls("patch_stage").at(-1)!.body as { version: number }).version).toBe(2);
   });

   it("shows a second conflict again instead of overwriting", async () => {
      const { engine, store, id } = await setup();
      const e = engine();
      store.writeElsewhere(id, "frame", { restate_task: "theirs" });
      type(e, "restate_task", "mine");
      await settle(AUTOSAVE_DELAY_MS);
      // Another save lands between the learner's read and their choice's write.
      store.writeElsewhere(id, "frame", { restate_task: "theirs again" });
      await e.keepMine();
      expect(e.getSnapshot().phase).toBe("conflict");
      expect(e.getSnapshot().theirs?.fields.restate_task).toBe("theirs again");
      expect(e.getSnapshot().draft.fields.restate_task).toBe("mine");
      expect(store.stage(id, "frame").fields.restate_task).toBe("theirs again");
   });

   it("ignores a second click on a choice while one is carried out", async () => {
      const { engine, store, id } = await setup();
      const e = engine();
      store.writeElsewhere(id, "frame", { restate_task: "theirs" });
      type(e, "restate_task", "mine");
      await settle(AUTOSAVE_DELAY_MS);
      const first = e.keepMine();
      const second = e.keepMine();
      await Promise.all([first, second]);
      expect(store.calls("patch_stage")).toHaveLength(2);
   });
});

describe("an attempt that is no longer active", () => {
   it("stops writing, keeps the unsaved text visible and says it was not saved", async () => {
      const { engine, store, id, patches } = await setup();
      const onTerminal = vi.fn();
      const e = engine("frame", onTerminal);
      store.endAttempt(id, "ended_by_reveal");
      type(e, "restate_task", "too late");
      await settle(AUTOSAVE_DELAY_MS);
      expect(e.getSnapshot().phase).toBe("terminal");
      expect(e.getSnapshot().draft.fields.restate_task).toBe("too late");
      expect(e.getSnapshot().note).toMatch(/no longer be saved/);
      expect(e.hasPendingWork).toBe(true);
      expect(onTerminal).toHaveBeenCalledTimes(1);
      type(e, "restate_task", "still too late");
      await settle(120_000);
      expect(patches()).toBe(1);
      expect(store.stage(id, "frame").fields.restate_task).toBeUndefined();
   });
});

describe("leaving and ending", () => {
   it("settle writes what is unsaved and says whether the server holds it", async () => {
      const { engine, store, id } = await setup();
      const e = engine();
      type(e, "restate_task", "on the way out");
      await expect(e.settle()).resolves.toBe(true);
      expect(store.stage(id, "frame").fields.restate_task).toBe("on the way out");
      type(e, "restate_task", "again");
      store.endAttempt(id);
      await expect(e.settle()).resolves.toBe(false);
   });

   it("dispose sends nothing more and ignores whatever arrives (session change)", async () => {
      const { engine, patches, store, id } = await setup();
      const e = engine();
      type(e, "restate_task", "ada's text");
      e.dispose();
      await settle(AUTOSAVE_DELAY_MS * 4);
      expect(patches()).toBe(0);
      expect(store.stage(id, "frame").fields.restate_task).toBeUndefined();
      await e.persist();
      expect(patches()).toBe(0);
   });
});

// A controlled deferred resource: each write and each read is answered only when the test says so (no timers, no sleeps).
type Copy = { version: number; text: string };
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
const deferred = <T,>(): Deferred<T> => {
   let resolve!: (value: T) => void;
   const promise = new Promise<T>((r) => (resolve = r));
   return { promise, resolve };
};

function controlled() {
   const sends: { saved: Copy; patch: string; reply: Deferred<SaveOutcome<Copy>> }[] = [];
   const loads: Deferred<LoadOutcome<Copy>>[] = [];
   const resource: Resource<string, Copy, string> = {
      draftOf: (saved) => saved.text,
      diff: (draft, saved) => (draft === saved.text ? null : draft),
      send: (saved, patch) => {
         const reply = deferred<SaveOutcome<Copy>>();
         sends.push({ saved, patch, reply });
         return reply.promise;
      },
      load: () => {
         const reply = deferred<LoadOutcome<Copy>>();
         loads.push(reply);
         return reply.promise;
      },
      combine: (mine) => ({ draft: mine }),
      keepMine: (mine) => mine,
   };
   const onTerminal = vi.fn();
   const engine = new AutosaveEngine<string, Copy, string>({ resource, initial: { version: 1, text: "" }, onTerminal });
   return { engine, sends, loads, onTerminal };
}

const flush = () => settle(0);

describe("halt is absorbing (an attempt that ended while a write was in the air)", () => {
   it("a successful reply after halt does not reopen the resource, send again, or call the text unsaved if the write landed", async () => {
      const { engine, sends, onTerminal } = controlled();
      engine.edit(() => "landed");
      void engine.persist();
      await flush();
      expect(engine.getSnapshot().phase).toBe("saving");
      engine.halt();
      expect(engine.getSnapshot().phase).toBe("terminal");
      sends[0].reply.resolve({ kind: "ok", saved: { version: 2, text: "landed" } });
      await flush();
      const after = engine.getSnapshot();
      expect(after.phase).toBe("terminal");
      expect(after.saved).toEqual({ version: 2, text: "landed" }); // the write committed before the attempt ended
      expect(after.dirty).toBe(false);
      expect(after.note).toBeUndefined();
      engine.edit(() => "typed after the end");
      await engine.persist();
      await engine.retry();
      await settle(AUTOSAVE_DELAY_MS * 4 + 120_000);
      expect(sends).toHaveLength(1);
      expect(engine.getSnapshot().phase).toBe("terminal");
      expect(engine.getSnapshot().draft).toBe("typed after the end");
      expect(engine.getSnapshot().dirty).toBe(true);
      expect(engine.getSnapshot().note).toMatch(/no longer be saved/);
      expect(onTerminal).toHaveBeenCalledTimes(1);
   });

   it("a reply that holds only part of what was typed keeps the rest unsaved, and still sends nothing", async () => {
      const { engine, sends } = controlled();
      engine.edit(() => "one");
      void engine.persist();
      await flush();
      engine.edit(() => "one two"); // typed while the write is in the air
      engine.halt();
      sends[0].reply.resolve({ kind: "ok", saved: { version: 2, text: "one" } });
      await flush();
      expect(engine.getSnapshot().phase).toBe("terminal");
      expect(engine.getSnapshot().saved).toEqual({ version: 2, text: "one" });
      expect(engine.getSnapshot().dirty).toBe(true);
      expect(engine.getSnapshot().note).toMatch(/Not saved/);
      await settle(AUTOSAVE_DELAY_MS * 4);
      expect(sends).toHaveLength(1);
   });

   it("an offline reply after halt stays terminal, schedules no retry, and does not claim a save", async () => {
      const { engine, sends } = controlled();
      engine.edit(() => "unknown outcome");
      void engine.persist();
      await flush();
      engine.halt();
      sends[0].reply.resolve({ kind: "offline" });
      await flush();
      expect(engine.getSnapshot().phase).toBe("terminal");
      expect(engine.getSnapshot().saved).toEqual({ version: 1, text: "" });
      expect(engine.getSnapshot().dirty).toBe(true);
      expect(engine.getSnapshot().note).toMatch(/Not saved/);
      await settle(OFFLINE_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) + 1000);
      expect(sends).toHaveLength(1);
      expect(engine.getSnapshot().phase).toBe("terminal");
      engine.edit(() => "more");
      await engine.persist();
      await settle(AUTOSAVE_DELAY_MS * 2);
      expect(sends).toHaveLength(1);
      expect(engine.getSnapshot().draft).toBe("more");
   });

   it("a late conflict, sign-in, gone or invalid reply after halt changes nothing and reads nothing", async () => {
      for (const kind of ["conflict", "signin", "gone", "invalid", "not_active"] as const) {
         const { engine, sends, loads, onTerminal } = controlled();
         engine.edit(() => "text");
         void engine.persist();
         await flush();
         engine.halt();
         sends[0].reply.resolve({ kind });
         await flush();
         expect(engine.getSnapshot().phase, kind).toBe("terminal");
         expect(loads, kind).toHaveLength(0);
         expect(engine.getSnapshot().draft, kind).toBe("text");
         expect(sends, kind).toHaveLength(1);
         expect(onTerminal, kind).toHaveBeenCalledTimes(1);
      }
   });

   it("a conflict read that finishes after halt cannot turn terminal back into conflict, and cannot be resolved", async () => {
      const { engine, sends, loads } = controlled();
      engine.edit(() => "mine");
      void engine.persist();
      await flush();
      sends[0].reply.resolve({ kind: "conflict" });
      await flush();
      expect(engine.getSnapshot().phase).toBe("conflict");
      expect(loads).toHaveLength(1);
      engine.halt();
      loads[0].resolve({ kind: "ok", active: true, saved: { version: 5, text: "theirs" } });
      await flush();
      expect(engine.getSnapshot().phase).toBe("terminal");
      expect(engine.getSnapshot().theirs).toBeNull();
      expect(engine.getSnapshot().draft).toBe("mine");
      await engine.keepMine();
      await engine.combine();
      await engine.takeTheirs();
      await engine.reloadConflict();
      await settle(AUTOSAVE_DELAY_MS * 2);
      expect(engine.getSnapshot().phase).toBe("terminal");
      expect(engine.getSnapshot().draft).toBe("mine");
      expect(sends).toHaveLength(1);
   });

   it("an automatic offline retry that is waiting when halt arrives never fires", async () => {
      const { engine, sends } = controlled();
      engine.edit(() => "text");
      void engine.persist();
      await flush();
      sends[0].reply.resolve({ kind: "offline" });
      await flush();
      expect(engine.getSnapshot().phase).toBe("offline");
      engine.halt();
      await settle(OFFLINE_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) + 1000);
      expect(sends).toHaveLength(1);
      expect(engine.getSnapshot().phase).toBe("terminal");
   });

   it("settle after halt reports that the server does not hold the text, and sends nothing", async () => {
      const { engine, sends } = controlled();
      engine.edit(() => "text");
      engine.halt();
      await expect(engine.settle()).resolves.toBe(false);
      expect(sends).toHaveLength(0);
   });
});
