import type {
   Answer,
   ConsentRecord,
   DeleteAllSummary,
   FieldIssue,
   Link,
   Page,
   PrepExport,
   Preference,
   Story,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
   return typeof value === "string";
}

function isCount(value: unknown): value is number {
   return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNullable<T>(check: (value: unknown) => value is T) {
   return (value: unknown): value is T | null => value === null || check(value);
}

function isStringArray(value: unknown): value is string[] {
   return Array.isArray(value) && value.every(isString);
}

const FIELD_KEYS = ["situation", "task", "action", "result"];

function isFields(value: unknown): boolean {
   return isRecord(value) && Object.entries(value).every(([key, text]) => FIELD_KEYS.includes(key) && isString(text));
}

/** Fields every stored record shares: timestamps, a positive version, tags, and a string framework. */
function isRecordBase(value: Record<string, unknown>): boolean {
   return (
      isString(value.id) &&
      isString(value.framework) &&
      isFields(value.fields) &&
      isStringArray(value.tags) &&
      isString(value.created_at) &&
      isString(value.updated_at) &&
      isCount(value.version) &&
      value.version >= 1
   );
}

export function isStory(value: unknown): value is Story {
   return (
      isRecord(value) &&
      isRecordBase(value) &&
      isString(value.title) &&
      isString(value.notes) &&
      isNullable(isCount)(value.year) &&
      isStringArray(value.answer_ids)
   );
}

/** A catalog answer names its question; a custom one never does, and never claims a fallback. */
export function isAnswer(value: unknown): value is Answer {
   if (!isRecord(value) || !isRecordBase(value)) return false;
   const catalog = value.source === "catalog";
   const identity = isString(value.content_id) && isString(value.question_id);
   const noIdentity = value.content_id === null && value.question_id === null;
   return (
      (catalog ? identity : value.source === "custom" && noIdentity && value.snapshot_fallback === false) &&
      isString(value.question_snapshot) &&
      typeof value.snapshot_fallback === "boolean" &&
      isNullable(isString)(value.body) &&
      (value.status === "draft" || value.status === "in_progress" || value.status === "ready") &&
      isStringArray(value.story_ids)
   );
}

export function isLink(value: unknown): value is Link {
   return isRecord(value) && isString(value.answer_id) && isString(value.story_id) && isString(value.created_at);
}

export function isPreference(value: unknown): value is Preference {
   return (
      isRecord(value) &&
      isNullable(isString)(value.target_level) &&
      isCount(value.version) &&
      isNullable(isString)(value.updated_at)
   );
}

export function isPage<T>(isItem: (item: unknown) => item is T) {
   return (value: unknown): value is Page<T> =>
      isRecord(value) &&
      Array.isArray(value.items) &&
      value.items.every(isItem) &&
      isCount(value.total) &&
      isCount(value.limit) &&
      isCount(value.offset);
}

function isConsent(value: unknown): value is ConsentRecord {
   return (
      isRecord(value) &&
      isString(value.document_id) &&
      isString(value.document_version) &&
      isString(value.accepted_at) &&
      isNullable(isString)(value.withdrawn_at)
   );
}

function every<T>(value: unknown, check: (item: unknown) => item is T): boolean {
   return Array.isArray(value) && value.every(check);
}

export function isExport(value: unknown): value is PrepExport {
   return (
      isRecord(value) &&
      isCount(value.format_version) &&
      isString(value.exported_at) &&
      isNullable(isPreference)(value.preference) &&
      every(value.stories, isStory) &&
      every(value.answers, isAnswer) &&
      every(value.links, isLink) &&
      every(value.ai_consent, isConsent)
   );
}

export function isDeleteAll(value: unknown): value is DeleteAllSummary {
   return (
      isRecord(value) &&
      isRecord(value.deleted) &&
      isCount(value.deleted.stories) &&
      isCount(value.deleted.answers) &&
      isCount(value.deleted.links) &&
      typeof value.deleted.preference === "boolean"
   );
}

const REASONS = ["required", "too_long", "too_short", "invalid_format", "invalid_value", "unknown_field"];

/** The `fields` member of a `validation_error`, or null when the envelope is not the documented one. */
export function readIssues(value: unknown): FieldIssue[] | null {
   if (!Array.isArray(value)) return null;
   const issues: FieldIssue[] = [];
   for (const entry of value) {
      if (!isRecord(entry) || !isString(entry.field) || !isString(entry.reason) || !REASONS.includes(entry.reason)) {
         return null;
      }
      issues.push({ field: entry.field, reason: entry.reason as FieldIssue["reason"] });
   }
   return issues;
}

export { isRecord };
