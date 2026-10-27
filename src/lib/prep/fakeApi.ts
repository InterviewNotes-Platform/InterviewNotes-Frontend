/**
 * An in-memory stand-in for `/me/prep`, shaped as a `fetch` so tests drive the real client over it.
 * It follows api-contract.md: flag and auth order, owner scoping, versions, validation reasons.
 * Test-only: no production module imports it. It is not the backend and proves nothing about it.
 */
import type { FieldIssue, ValidationReason } from "./types";

type Row = Record<string, unknown> & { id: string; version: number; created_at: string; updated_at: string };
type Store = { stories: Row[]; answers: Row[]; links: { answer_id: string; story_id: string; created_at: string }[]; preference: Row | null };
type Failure = "network" | "timeout" | number;

const STORY_KEYS = ["title", "notes", "year", "framework", "fields", "tags"];
const ANSWER_KEYS = ["question_snapshot", "framework", "fields", "body", "status", "tags"];
const FIELD_KEYS = ["situation", "task", "action", "result"];
const LEVELS = ["sde-1", "sde-2", "sde-3", "engineering-manager"];
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "private, no-store" };

function respond(status: number, body?: unknown, headers: Record<string, string> = HEADERS): Response {
   return new Response(body === undefined || status === 204 ? null : JSON.stringify(body), { status, headers });
}

function failure(status: number, code: string, extra: object = {}): Response {
   return respond(status, { detail: code, code, ...extra });
}

export function createFakePrepApi(options: { enabled?: boolean } = {}) {
   const stores = new Map<string, Store>();
   const tokens = new Map<string, string>();
   const requests: { method: string; path: string; token: string | null; body: unknown }[] = [];
   const pending: Failure[] = [];
   let enabled = options.enabled ?? true;
   let tick = 0;
   let serial = 0;

   const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
   const newId = () => `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;
   const storeOf = (user: string): Store => {
      if (!stores.has(user)) stores.set(user, { stories: [], answers: [], links: [], preference: null });
      return stores.get(user)!;
   };

   function validate(body: unknown, allowed: string[], required: string[]): FieldIssue[] {
      const issues: FieldIssue[] = [];
      const add = (field: string, reason: ValidationReason) => issues.push({ field, reason });
      if (typeof body !== "object" || body === null || Array.isArray(body)) return [{ field: "body", reason: "invalid_value" }];
      const record = body as Record<string, unknown>;
      for (const key of Object.keys(record)) if (!allowed.includes(key) && !required.includes(key)) add(key, "unknown_field");
      for (const key of required) if (record[key] === undefined) add(key, "required");
      const text = (key: string, max: number, min = 0) => {
         const value = record[key];
         if (typeof value !== "string") return value === undefined || value === null ? undefined : add(key, "invalid_value");
         if (value.includes("\u0000")) add(key, "invalid_value");
         else if ([...value].length > max) add(key, "too_long");
         else if ([...value].length < min) add(key, "too_short");
      };
      text("title", 200, 1);
      text("notes", 20000);
      text("body", 20000);
      text("question_snapshot", 1000, 1);
      text("content_id", 80, 1);
      text("question_id", 48, 1);
      if (typeof record.title === "string" && record.title.trim() === "") add("title", "too_short");
      if (typeof record.question_id === "string" && record.question_id.length <= 48 && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(record.question_id)) add("question_id", "invalid_format");
      if (record.framework !== undefined && record.framework !== "star" && record.framework !== "free_form") add("framework", "invalid_value");
      if (record.status !== undefined && !["draft", "in_progress", "ready"].includes(record.status as string)) add("status", "invalid_value");
      if (record.year !== undefined && record.year !== null && !(Number.isInteger(record.year) && (record.year as number) >= 1900 && (record.year as number) <= 2100)) add("year", "invalid_value");
      if (record.fields !== undefined) {
         const fields = record.fields as Record<string, unknown>;
         if (typeof fields !== "object" || fields === null) add("fields", "invalid_value");
         else for (const [key, value] of Object.entries(fields)) {
            if (!FIELD_KEYS.includes(key)) add(`fields.${key}`, "unknown_field");
            else if (typeof value !== "string") add(`fields.${key}`, "invalid_value");
            else if (value.length > 20000) add(`fields.${key}`, "too_long");
         }
      }
      if (record.tags !== undefined && (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== "string" || tag.trim() === "" || tag.includes(",")))) add("tags", "invalid_value");
      return issues;
   }

   const normalizeTags = (tags: string[]) => [...new Set(tags.map((tag) => tag.trim().toLowerCase()))].slice(0, 20);

   function content(body: Record<string, unknown>): Record<string, unknown> {
      const copy = { ...body };
      delete copy.version;
      if (typeof copy.title === "string") copy.title = copy.title.trim();
      if (Array.isArray(copy.tags)) copy.tags = normalizeTags(copy.tags as string[]);
      return copy;
   }

   const withLinks = (store: Store, kind: "stories" | "answers", row: Row) =>
      kind === "stories"
         ? { ...row, answer_ids: store.links.filter((l) => l.story_id === row.id).map((l) => l.answer_id) }
         : { ...row, story_ids: store.links.filter((l) => l.answer_id === row.id).map((l) => l.story_id) };

   function list(store: Store, kind: "stories" | "answers", params: URLSearchParams): Response {
      const q = params.get("q")?.toLowerCase();
      const tags = params.getAll("tag");
      const statuses = params.getAll("status");
      const contentIds = params.getAll("content_id");
      let rows = store[kind].filter((row) => {
         const text = [row.title, row.notes, row.question_snapshot, row.body, ...Object.values((row.fields as object) ?? {}), ...(row.tags as string[])];
         return (
            (!q || text.some((t) => typeof t === "string" && t.toLowerCase().includes(q))) &&
            tags.every((tag) => (row.tags as string[]).includes(tag)) &&
            (!statuses.length || statuses.includes(row.status as string)) &&
            (!contentIds.length || contentIds.includes(row.content_id as string)) &&
            (!params.get("question_id") || row.question_id === params.get("question_id")) &&
            (!params.get("source") || row.source === params.get("source"))
         );
      });
      const key = params.get("sort") === "created_at_desc" ? "created_at" : "updated_at";
      rows = [...rows].sort((a, b) => (b[key] > a[key] ? 1 : -1));
      const limit = Number(params.get("limit") ?? 50);
      const offset = Number(params.get("offset") ?? 0);
      return respond(200, { items: rows.slice(offset, offset + limit).map((r) => withLinks(store, kind, r)), total: rows.length, limit, offset });
   }

   function create(store: Store, kind: "stories" | "answers", body: unknown): Response {
      const allowed = kind === "stories" ? STORY_KEYS : [...ANSWER_KEYS, "source", "content_id", "question_id", "snapshot_fallback"];
      const required = kind === "stories" ? ["title", "framework"] : ["source", "question_snapshot", "framework"];
      const issues = validate(body, allowed, required);
      const input = (body ?? {}) as Record<string, unknown>;
      if (kind === "answers" && !issues.length) {
         if (input.source !== "catalog" && input.source !== "custom") issues.push({ field: "source", reason: "invalid_value" });
         else if (input.source === "catalog") {
            for (const key of ["content_id", "question_id", "snapshot_fallback"]) {
               if (input[key] === undefined) issues.push({ field: key, reason: "required" });
               else if (input[key] === null || (key === "snapshot_fallback") !== (typeof input[key] === "boolean")) issues.push({ field: key, reason: "invalid_value" });
            }
         } else {
            for (const key of ["content_id", "question_id"]) if (input[key] != null) issues.push({ field: key, reason: "invalid_value" });
            if (input.snapshot_fallback === true) issues.push({ field: "snapshot_fallback", reason: "invalid_value" });
         }
      }
      if (issues.length) return failure(422, "validation_error", { fields: issues });
      const stamp = now();
      const defaults = kind === "stories"
         ? { notes: "", year: null, fields: {}, tags: [] }
         : { content_id: null, question_id: null, snapshot_fallback: false, body: null, status: "draft", fields: {}, tags: [] };
      const row = { ...defaults, ...content(input), id: newId(), version: 1, created_at: stamp, updated_at: stamp } as Row;
      store[kind].push(row);
      return respond(201, withLinks(store, kind, row));
   }

   function update(store: Store, kind: "stories" | "answers", row: Row, body: unknown): Response {
      const allowed = kind === "stories" ? STORY_KEYS : ANSWER_KEYS;
      const issues = validate(body, allowed, ["version"]);
      const input = (body ?? {}) as Record<string, unknown>;
      if (!issues.length && typeof input.version !== "number") issues.push({ field: "version", reason: "invalid_value" });
      if (!issues.length && Object.keys(input).length < 2) issues.push({ field: "body", reason: "required" });
      if (!issues.length && kind === "answers" && input.question_snapshot !== undefined && row.source !== "custom") issues.push({ field: "question_snapshot", reason: "invalid_value" });
      if (issues.length) return failure(422, "validation_error", { fields: issues });
      if (input.version !== row.version) return failure(409, "version_conflict", { current_version: row.version });
      Object.assign(row, content(input), { version: row.version + 1, updated_at: now() });
      return respond(200, withLinks(store, kind, row));
   }

   function duplicate(store: Store, kind: "stories" | "answers", row: Row): Response {
      const stamp = now();
      const copy = { ...row, id: newId(), version: 1, created_at: stamp, updated_at: stamp, ...(kind === "answers" ? { status: "draft" } : {}) } as Row;
      store[kind].push(copy);
      return respond(201, withLinks(store, kind, copy));
   }

   function route(user: string, method: string, path: string, params: URLSearchParams, body: unknown): Response {
      const store = storeOf(user);
      const parts = path.split("/").filter(Boolean);
      const [head, recordId, tail, other] = parts;
      const kind = head === "stories" || head === "answers" ? head : null;
      if (kind && parts.length === 1) return method === "GET" ? list(store, kind, params) : method === "POST" ? create(store, kind, body) : failure(404, "not_found");
      if (kind && head === "answers" && tail === "stories" && other) {
         const answer = store.answers.find((r) => r.id === recordId);
         const story = store.stories.find((r) => r.id === other);
         const index = store.links.findIndex((l) => l.answer_id === recordId && l.story_id === other);
         if (!answer || !story) return failure(404, "not_found");
         if (method === "PUT") {
            if (index >= 0) return respond(200, store.links[index]);
            store.links.push({ answer_id: recordId, story_id: other, created_at: now() });
            return respond(201, store.links[store.links.length - 1]);
         }
         if (method === "DELETE" && index >= 0) return (store.links.splice(index, 1), respond(204));
         return failure(404, "not_found");
      }
      if (kind) {
         const row = store[kind].find((r) => r.id === recordId);
         if (!row) return failure(404, "not_found");
         if (method === "GET" && parts.length === 2) return respond(200, withLinks(store, kind, row));
         if (method === "PATCH" && parts.length === 2) return update(store, kind, row, body);
         if (method === "POST" && tail === "duplicate") return duplicate(store, kind, row);
         if (method === "DELETE" && parts.length === 2) {
            store[kind].splice(store[kind].indexOf(row), 1);
            store.links = store.links.filter((l) => l.answer_id !== row.id && l.story_id !== row.id);
            return respond(204);
         }
      }
      if (head === "preferences") {
         const stored = store.preference;
         if (method === "GET") return respond(200, stored ?? { target_level: null, version: 0, updated_at: null });
         const input = (body ?? {}) as Record<string, unknown>;
         const issues = validate(body, [], ["target_level", "version"]);
         if (!issues.length && input.target_level !== null && !LEVELS.includes(input.target_level as string)) issues.push({ field: "target_level", reason: "invalid_value" });
         if (!issues.length && typeof input.version !== "number") issues.push({ field: "version", reason: "invalid_value" });
         if (issues.length) return failure(422, "validation_error", { fields: issues });
         if (input.version !== (stored?.version ?? 0)) return failure(409, "version_conflict", { current_version: stored?.version ?? 0 });
         store.preference = { id: "preference", target_level: input.target_level, version: (stored?.version ?? 0) + 1, created_at: stored?.created_at ?? now(), updated_at: now() };
         return respond(200, { target_level: input.target_level, version: store.preference.version, updated_at: store.preference.updated_at });
      }
      if (head === "export" && method === "GET") {
         const preference = store.preference && { target_level: store.preference.target_level, version: store.preference.version, updated_at: store.preference.updated_at };
         if (params.get("format") === "markdown") {
            const headers = { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "private, no-store" };
            return new Response(`# Preparation\n\n${store.answers.length} answers, ${store.stories.length} stories\n`, { status: 200, headers });
         }
         return respond(200, { format_version: 1, exported_at: now(), preference: preference ?? null, stories: store.stories.map((r) => withLinks(store, "stories", r)), answers: store.answers.map((r) => withLinks(store, "answers", r)), links: store.links, ai_consent: [] });
      }
      if (head === "delete-all" && method === "POST") {
         if ((body as { confirm?: unknown } | null)?.confirm !== "delete-all") return failure(422, "validation_error", { fields: [{ field: "confirm", reason: "invalid_value" }] });
         const deleted = { stories: store.stories.length, answers: store.answers.length, links: store.links.length, preference: store.preference !== null };
         stores.set(user, { stories: [], answers: [], links: [], preference: null });
         return respond(200, { deleted });
      }
      return failure(404, "not_found");
   }

   async function fakeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      const header = new Headers(init.headers).get("Authorization");
      const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      const path = url.pathname.replace(/^\/me\/prep/, "");
      requests.push({ method, path: path + url.search, token, body });

      const next = pending.shift();
      if (next === "network") throw new TypeError("fetch failed");
      if (next === "timeout") {
         return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      }
      if (typeof next === "number") return failure(next, "internal_error");

      if (!enabled) return failure(404, "not_found");
      const user = token ? tokens.get(token) : undefined;
      if (!user) return failure(401, "unauthenticated");
      return route(user, method, path, url.searchParams, body);
   }

   return {
      fetch: fakeFetch as typeof fetch,
      /** A token the fake accepts for `userId`. */
      signIn(userId: string): string {
         const token = `token-${userId}`;
         tokens.set(token, userId);
         return token;
      },
      /** Make the next request fail: a network error, no answer until aborted, or this status. */
      failNext(failureMode: Failure) {
         pending.push(failureMode);
      },
      setEnabled(value: boolean) {
         enabled = value;
      },
      requests,
   };
}
