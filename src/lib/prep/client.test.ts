import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPrepClient, PERSONAL_DATA_TIMEOUT_MS } from "./client";
import { createFakePrepApi } from "./fakeApi";
import type { Answer, AnswerCreate } from "./types";

const BASE = "https://api.example.test";

function setup(options: { user?: string | null; timeoutMs?: number; enabled?: boolean } = {}) {
   const api = createFakePrepApi({ enabled: options.enabled });
   let token: string | null = options.user === null ? null : api.signIn(options.user ?? "ada");
   const client = createPrepClient({
      baseUrl: `${BASE}/`,
      getAccessToken: async () => token,
      fetch: api.fetch,
      timeoutMs: options.timeoutMs,
   });
   return { api, client, setToken: (value: string | null) => (token = value) };
}

const catalog: AnswerCreate = {
   source: "catalog",
   content_id: "lesson.behavioral-prep-sde-2",
   question_id: "conflict-with-a-peer",
   question_snapshot: "Tell me about a time you disagreed with a teammate.",
   snapshot_fallback: false,
   framework: "star",
};

function ok<T>(result: { status: string; data?: T }): T {
   expect(result.status).toBe("ok");
   return result.data as T;
}

describe("sign-in and transport", () => {
   it("sends nothing and reports unauthenticated when there is no session token", async () => {
      const { api, client } = setup({ user: null });
      expect(await client.listStories()).toEqual({ status: "unauthenticated" });
      expect(api.requests).toHaveLength(0);
   });

   it("treats a failing token reader as signed out", async () => {
      const api = createFakePrepApi();
      const client = createPrepClient({ baseUrl: BASE, getAccessToken: () => Promise.reject(new Error("x")), fetch: api.fetch });
      expect(await client.getPreference()).toEqual({ status: "unauthenticated" });
      expect(api.requests).toHaveLength(0);
   });

   it("sends the bearer token per request, never cookies or a cached token", async () => {
      const calls: RequestInit[] = [];
      const api = createFakePrepApi();
      const first = api.signIn("ada");
      const second = api.signIn("grace");
      let token = first;
      const client = createPrepClient({
         baseUrl: BASE,
         getAccessToken: async () => token,
         fetch: (url, init) => (calls.push(init ?? {}), api.fetch(url, init)),
      });
      await client.getPreference();
      token = second;
      await client.getPreference();
      expect(calls.map((c) => new Headers(c.headers).get("Authorization"))).toEqual([`Bearer ${first}`, `Bearer ${second}`]);
      expect(calls[0]).toMatchObject({ credentials: "omit", cache: "no-store", method: "GET" });
      expect(api.requests[0].path).toBe("/preferences");
   });

   it("answers unauthenticated when the API rejects the token", async () => {
      const { client, setToken } = setup();
      setToken("expired");
      expect(await client.listAnswers()).toEqual({ status: "unauthenticated" });
   });

   it("reports the feature as absent when the API has it off, whatever the token", async () => {
      const { client } = setup({ enabled: false });
      expect(await client.listStories()).toEqual({ status: "notFound" });
   });

   it("classifies a network failure, a timeout and an upstream error", async () => {
      const { api, client } = setup({ timeoutMs: 20 });
      api.failNext("network");
      expect(await client.listStories()).toEqual({ status: "unavailable", cause: "transport" });
      api.failNext("timeout");
      expect(await client.listStories()).toEqual({ status: "unavailable", cause: "timeout" });
      api.failNext(500);
      expect(await client.listStories()).toEqual({ status: "unavailable", cause: "upstream" });
      api.failNext(503);
      expect(await client.createStory({ title: "x", framework: "star" })).toEqual({ status: "unavailable", cause: "upstream" });
   });

   it("uses the frozen 60 s personal-data timeout by default", () => {
      expect(PERSONAL_DATA_TIMEOUT_MS).toBe(60_000);
   });

   it("calls a body it cannot trust malformed, including an answer that breaks its identity rules", async () => {
      const respond = (body: string, status = 200) => async () => new Response(body, { status });
      const withFetch = (fetch: typeof globalThis.fetch) => createPrepClient({ baseUrl: BASE, getAccessToken: async () => "t", fetch });
      const broken = { status: "unavailable", cause: "malformed" };
      expect(await withFetch(respond("<html>")).listStories()).toEqual(broken);
      expect(await withFetch(respond("{}")).getPreference()).toEqual(broken);
      const { api, client } = setup();
      const answer = ok(await client.createAnswer(catalog));
      const tampered = JSON.stringify({ ...answer, question_id: null });
      expect(await withFetch(respond(tampered)).getAnswer(answer.id)).toEqual(broken);
      expect(api.requests.length).toBeGreaterThan(0);
   });

   it("does not take a 409 or 422 without the documented envelope for a conflict or a validation error", async () => {
      const withBody = (status: number, body: object) =>
         createPrepClient({ baseUrl: BASE, getAccessToken: async () => "t", fetch: async () => new Response(JSON.stringify(body), { status }) });
      const upstream = { status: "unavailable", cause: "upstream" };
      expect(await withBody(409, { code: "version_conflict" }).updateStory("a", { version: 1, title: "t" })).toEqual(upstream);
      expect(await withBody(409, { code: "other", current_version: 2 }).updateStory("a", { version: 1, title: "t" })).toEqual(upstream);
      expect(await withBody(422, { code: "validation_error", fields: [{ field: "x", reason: "made_up" }] }).createStory({ title: "t", framework: "star" })).toEqual(upstream);
   });
});

describe("answers", () => {
   it("carries content_id, question_id, question_snapshot and snapshot_fallback exactly as sent", async () => {
      const { client, api } = setup();
      const answer = ok(await client.createAnswer({ ...catalog, snapshot_fallback: true }));
      expect(answer).toMatchObject({
         source: "catalog",
         content_id: "lesson.behavioral-prep-sde-2",
         question_id: "conflict-with-a-peer",
         question_snapshot: "Tell me about a time you disagreed with a teammate.",
         snapshot_fallback: true,
         status: "draft",
         version: 1,
         story_ids: [],
      });
      expect(api.requests[0]).toMatchObject({ method: "POST", path: "/answers" });
      expect(api.requests[0].body).toEqual({ ...catalog, snapshot_fallback: true });
      const again = ok(await client.getAnswer(answer.id));
      expect(again).toEqual(answer);
   });

   it("creates a custom answer with no identifiers and a false fallback by default", async () => {
      const { client } = setup();
      const answer = ok(await client.createAnswer({ source: "custom", question_snapshot: "My own question", framework: "free_form", body: "text" }));
      expect(answer).toMatchObject({ source: "custom", content_id: null, question_id: null, snapshot_fallback: false, body: "text" });
   });

   it("reports the contract's validation reasons without echoing values", async () => {
      const { client } = setup();
      const missing = { ...catalog } as Partial<typeof catalog>;
      delete missing.snapshot_fallback;
      expect(await client.createAnswer(missing as AnswerCreate)).toEqual({
         status: "invalid",
         fields: [{ field: "snapshot_fallback", reason: "required" }],
      });
      expect(await client.createAnswer({ ...catalog, question_id: "x".repeat(49) })).toEqual({
         status: "invalid",
         fields: [{ field: "question_id", reason: "too_long" }],
      });
      expect(await client.createAnswer({ ...catalog, question_id: "Not A Slug" })).toEqual({
         status: "invalid",
         fields: [{ field: "question_id", reason: "invalid_format" }],
      });
      const custom = { source: "custom", question_snapshot: "q", framework: "star" } as const;
      expect(await client.createAnswer({ ...custom, content_id: "lesson.x" } as unknown as AnswerCreate)).toMatchObject({
         status: "invalid",
         fields: [{ field: "content_id", reason: "invalid_value" }],
      });
      expect(await client.createAnswer({ ...custom, snapshot_fallback: true } as unknown as AnswerCreate)).toMatchObject({
         status: "invalid",
         fields: [{ field: "snapshot_fallback", reason: "invalid_value" }],
      });
   });

   it("increments the version on update and reports a stale version as a conflict that applied nothing", async () => {
      const { client } = setup();
      const answer = ok(await client.createAnswer(catalog));
      const updated = ok(await client.updateAnswer(answer.id, { version: 1, fields: { situation: "s" }, status: "in_progress" }));
      expect(updated).toMatchObject({ version: 2, status: "in_progress", fields: { situation: "s" } });
      expect(await client.updateAnswer(answer.id, { version: 1, body: "stale" })).toEqual({ status: "conflict", currentVersion: 2 });
      expect(ok(await client.getAnswer(answer.id))).toMatchObject({ version: 2, body: null });
   });

   it("keeps a catalog answer's snapshot immutable and a custom one editable", async () => {
      const { client } = setup();
      const fixed = ok(await client.createAnswer(catalog));
      expect(await client.updateAnswer(fixed.id, { version: 1, question_snapshot: "changed" })).toMatchObject({ status: "invalid" });
      const custom = ok(await client.createAnswer({ source: "custom", question_snapshot: "mine", framework: "star" }));
      expect(ok(await client.updateAnswer(custom.id, { version: 1, question_snapshot: "still mine" })).question_snapshot).toBe("still mine");
   });

   it("lists with repeated filters, search and paging in the documented query form", async () => {
      const { client, api } = setup();
      for (const [index, status] of (["draft", "ready", "in_progress"] as const).entries()) {
         ok(await client.createAnswer({ ...catalog, question_id: `q-${index}`, status, tags: ["lead"] }));
      }
      ok(await client.createAnswer({ source: "custom", question_snapshot: "Mentoring", framework: "star", tags: ["people"] }));
      const page = ok(await client.listAnswers({ status: ["draft", "ready"], content_id: ["lesson.behavioral-prep-sde-2"], limit: 1, offset: 1 }));
      expect(page).toMatchObject({ total: 2, limit: 1, offset: 1 });
      expect(page.items).toHaveLength(1);
      expect(api.requests.at(-1)?.path).toBe("/answers?status=draft&status=ready&content_id=lesson.behavioral-prep-sde-2&limit=1&offset=1");
      expect(ok(await client.listAnswers({ q: "mentor", tag: ["people"] })).items.map((a: Answer) => a.question_snapshot)).toEqual(["Mentoring"]);
      expect(ok(await client.listAnswers({ source: "custom", sort: "created_at_desc" })).total).toBe(1);
   });

   it("duplicates as a draft with the same identity and no links", async () => {
      const { client } = setup();
      const original = ok(await client.createAnswer({ ...catalog, status: "ready" }));
      const copy = ok(await client.duplicateAnswer(original.id));
      expect(copy).toMatchObject({ status: "draft", version: 1, story_ids: [], question_id: original.question_id, question_snapshot: original.question_snapshot });
      expect(copy.id).not.toBe(original.id);
   });

   it("deletes an answer and then cannot find it", async () => {
      const { client } = setup();
      const answer = ok(await client.createAnswer(catalog));
      expect(await client.deleteAnswer(answer.id)).toEqual({ status: "ok", data: undefined });
      expect(await client.getAnswer(answer.id)).toEqual({ status: "notFound" });
      expect(await client.deleteAnswer(answer.id)).toEqual({ status: "notFound" });
   });
});

describe("stories and links", () => {
   it("creates a story with defaults, normalizes tags and trims the title", async () => {
      const { client } = setup();
      const story = ok(await client.createStory({ title: "  Outage  ", framework: "star", tags: [" Ops ", "ops", "Team"] }));
      expect(story).toMatchObject({ title: "Outage", notes: "", year: null, fields: {}, tags: ["ops", "team"], version: 1, answer_ids: [] });
      expect(await client.createStory({ title: "   ", framework: "star" })).toMatchObject({ status: "invalid" });
   });

   it("rejects a body that tries to set a field the API owns", async () => {
      const { client } = setup();
      const result = await client.createStory({ title: "t", framework: "star", user_id: "other" } as never);
      expect(result).toEqual({ status: "invalid", fields: [{ field: "user_id", reason: "unknown_field" }] });
   });

   it("updates with versions and reports a conflict", async () => {
      const { client } = setup();
      const story = ok(await client.createStory({ title: "t", framework: "star" }));
      expect(ok(await client.updateStory(story.id, { version: 1, year: 2024, fields: { result: "r" } }))).toMatchObject({ version: 2, year: 2024 });
      expect(await client.updateStory(story.id, { version: 1, title: "late" })).toEqual({ status: "conflict", currentVersion: 2 });
      expect(await client.updateStory(story.id, { version: 2 })).toMatchObject({ status: "invalid" });
   });

   it("links idempotently, reflects the link on both ends, and unlinks", async () => {
      const { client } = setup();
      const answer = ok(await client.createAnswer(catalog));
      const story = ok(await client.createStory({ title: "t", framework: "star" }));
      const first = ok(await client.linkStory(answer.id, story.id));
      expect(first.created).toBe(true);
      expect(first.link).toMatchObject({ answer_id: answer.id, story_id: story.id });
      expect(ok(await client.linkStory(answer.id, story.id)).created).toBe(false);
      expect(ok(await client.getAnswer(answer.id)).story_ids).toEqual([story.id]);
      expect(ok(await client.getStory(story.id)).answer_ids).toEqual([answer.id]);
      expect(await client.unlinkStory(answer.id, story.id)).toEqual({ status: "ok", data: undefined });
      expect(await client.unlinkStory(answer.id, story.id)).toEqual({ status: "notFound" });
   });

   it("removes a deleted story's links but leaves the answer", async () => {
      const { client } = setup();
      const answer = ok(await client.createAnswer(catalog));
      const story = ok(await client.createStory({ title: "t", framework: "star" }));
      ok(await client.linkStory(answer.id, story.id));
      ok(await client.deleteStory(story.id));
      expect(ok(await client.getAnswer(answer.id)).story_ids).toEqual([]);
   });

   it("duplicates a story without its links and keeps the title", async () => {
      const { client } = setup();
      const story = ok(await client.createStory({ title: "t", framework: "star", notes: "n" }));
      const copy = ok(await client.duplicateStory(story.id));
      expect(copy).toMatchObject({ title: "t", notes: "n", version: 1, answer_ids: [] });
   });

   it("treats another user's record as not found, on every route", async () => {
      const { api, client } = setup({ user: "ada" });
      const story = ok(await client.createStory({ title: "t", framework: "star" }));
      const answer = ok(await client.createAnswer(catalog));
      const other = createPrepClient({ baseUrl: BASE, getAccessToken: async () => api.signIn("grace"), fetch: api.fetch });
      expect(await other.getStory(story.id)).toEqual({ status: "notFound" });
      expect(await other.updateStory(story.id, { version: 1, title: "x" })).toEqual({ status: "notFound" });
      expect(await other.deleteAnswer(answer.id)).toEqual({ status: "notFound" });
      expect(await other.linkStory(answer.id, story.id)).toEqual({ status: "notFound" });
      expect(ok(await other.listStories()).total).toBe(0);
   });

   it("encodes record ids in paths", async () => {
      const { api, client } = setup();
      await client.getStory("a/b?c");
      expect(api.requests[0].path).toBe("/stories/a%2Fb%3Fc");
   });
});

describe("preference, export and deletion", () => {
   it("reads the empty preference, writes from version 0 and detects a stale write", async () => {
      const { client } = setup();
      expect(ok(await client.getPreference())).toEqual({ target_level: null, version: 0, updated_at: null });
      expect(ok(await client.updatePreference({ target_level: "sde-3", version: 0 }))).toMatchObject({ target_level: "sde-3", version: 1 });
      expect(await client.updatePreference({ target_level: null, version: 0 })).toEqual({ status: "conflict", currentVersion: 1 });
      expect(await client.updatePreference({ target_level: "staff" as never, version: 1 })).toMatchObject({ status: "invalid" });
   });

   it("exports JSON with every record and link, and Markdown as text", async () => {
      const { client } = setup();
      const answer = ok(await client.createAnswer(catalog));
      const story = ok(await client.createStory({ title: "t", framework: "star" }));
      ok(await client.linkStory(answer.id, story.id));
      const dump = ok(await client.exportJson());
      expect(dump).toMatchObject({ format_version: 1, preference: null, ai_consent: [] });
      expect(dump.answers).toHaveLength(1);
      expect(dump.links).toHaveLength(1);
      expect(ok(await client.exportMarkdown())).toContain("1 answers");
   });

   it("deletes everything for the caller only, sends the confirmation, and is idempotent", async () => {
      const { api, client } = setup();
      ok(await client.createAnswer(catalog));
      ok(await client.createStory({ title: "t", framework: "star" }));
      ok(await client.updatePreference({ target_level: "sde-1", version: 0 }));
      const other = createPrepClient({ baseUrl: BASE, getAccessToken: async () => api.signIn("grace"), fetch: api.fetch });
      ok(await other.createStory({ title: "theirs", framework: "star" }));
      expect(ok(await client.deleteAll())).toEqual({ deleted: { stories: 1, answers: 1, links: 0, preference: true } });
      expect(api.requests.at(-1)?.body).toEqual({ confirm: "delete-all" });
      expect(ok(await client.deleteAll())).toEqual({ deleted: { stories: 0, answers: 0, links: 0, preference: false } });
      expect(ok(await other.listStories()).total).toBe(1);
   });
});

describe("what the module may not do", () => {
   const dir = __dirname;
   const sources = readdirSync(dir).filter((name) => /\.ts$/.test(name) && !name.endsWith(".test.ts") && name !== "fakeApi.ts");

   it("reads no environment and persists nothing in the browser", () => {
      for (const name of sources) {
         expect(readFileSync(join(dir, name), "utf8"), name).not.toMatch(
            /process\.env|NEXT_PUBLIC|localStorage|sessionStorage|indexedDB|document\.cookie|console\./
         );
      }
   });

   it("is not imported by the fake API in the other direction", () => {
      for (const name of sources) expect(readFileSync(join(dir, name), "utf8"), name).not.toMatch(/fakeApi/);
   });
});
