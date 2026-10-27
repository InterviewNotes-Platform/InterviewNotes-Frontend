/**
 * Shapes of the personal-data API, frozen by `specs/learning-progress/api-contract.md` (P7-T2, P7-T3.5).
 * The API never returns `user_id`; the owner is the verified token's subject.
 */

/** Frameworks a client may send. A response may carry a later additive value (contract §3.1). */
export type FrameworkInput = "star" | "free_form";
export type AnswerSource = "catalog" | "custom";
export type AnswerStatus = "draft" | "in_progress" | "ready";
/** The four Behavioral Lessons' levels (contract §3.4). */
export type TargetLevel = "sde-1" | "sde-2" | "sde-3" | "engineering-manager";

/** Allowed keys are the STAR fields; an update replaces the whole object (contract §4.2). */
export type PrepFields = Partial<Record<"situation" | "task" | "action" | "result", string>>;

export type Story = {
   id: string;
   title: string;
   notes: string;
   year: number | null;
   framework: string;
   fields: PrepFields;
   tags: string[];
   answer_ids: string[];
   created_at: string;
   updated_at: string;
   version: number;
};

/**
 * `content_id` and `question_id` are set exactly for `catalog` answers and null for `custom`.
 * `question_snapshot` is required for both; `snapshot_fallback` is always false for `custom`.
 */
export type Answer = {
   id: string;
   source: AnswerSource;
   content_id: string | null;
   question_id: string | null;
   question_snapshot: string;
   snapshot_fallback: boolean;
   framework: string;
   fields: PrepFields;
   body: string | null;
   status: AnswerStatus;
   tags: string[];
   story_ids: string[];
   created_at: string;
   updated_at: string;
   version: number;
};

export type Link = { answer_id: string; story_id: string; created_at: string };

/** `version` is 0 and `updated_at` null until the first write. */
export type Preference = { target_level: string | null; version: number; updated_at: string | null };

export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

export type ConsentRecord = {
   document_id: string;
   document_version: string;
   accepted_at: string;
   withdrawn_at: string | null;
};

export type PrepExport = {
   format_version: number;
   exported_at: string;
   preference: Preference | null;
   stories: Story[];
   answers: Answer[];
   links: Link[];
   ai_consent: ConsentRecord[];
};

export type DeleteAllSummary = {
   deleted: { stories: number; answers: number; links: number; preference: boolean };
};

export type Sort = "updated_at_desc" | "created_at_desc";

type ListParams = { q?: string; tag?: string[]; sort?: Sort; limit?: number; offset?: number };

export type StoryListParams = ListParams;

/** `question_id` needs exactly one `content_id` (contract §5.2). */
export type AnswerListParams = ListParams & {
   status?: AnswerStatus[];
   content_id?: string[];
   question_id?: string;
   source?: AnswerSource;
};

export type StoryCreate = {
   title: string;
   framework: FrameworkInput;
   notes?: string;
   year?: number | null;
   fields?: PrepFields;
   tags?: string[];
};

/** At least one field besides `version`; `version` is the value last read (contract §6). */
export type StoryUpdate = {
   version: number;
   title?: string;
   notes?: string;
   year?: number | null;
   framework?: FrameworkInput;
   fields?: PrepFields;
   tags?: string[];
};

/**
 * A catalog answer must give `content_id`, `question_id` and an explicit `snapshot_fallback`;
 * a custom answer must give none of them as non-null and may omit `snapshot_fallback` (contract §4.3).
 */
export type AnswerCreate =
   | (AnswerCreateBase & {
        source: "catalog";
        content_id: string;
        question_id: string;
        snapshot_fallback: boolean;
     })
   | (AnswerCreateBase & {
        source: "custom";
        content_id?: null;
        question_id?: null;
        snapshot_fallback?: false;
     });

type AnswerCreateBase = {
   question_snapshot: string;
   framework: FrameworkInput;
   fields?: PrepFields;
   body?: string | null;
   status?: AnswerStatus;
   tags?: string[];
};

/** `question_snapshot` is editable for a custom answer only; identity never changes. */
export type AnswerUpdate = {
   version: number;
   question_snapshot?: string;
   framework?: FrameworkInput;
   fields?: PrepFields;
   body?: string | null;
   status?: AnswerStatus;
   tags?: string[];
};

export type PreferenceUpdate = { target_level: TargetLevel | null; version: number };

/** One of the `validation_error` reasons (contract §7.2). */
export type ValidationReason =
   | "required"
   | "too_long"
   | "too_short"
   | "invalid_format"
   | "invalid_value"
   | "unknown_field";

/** The offending path and why; the API never echoes the submitted value. */
export type FieldIssue = { field: string; reason: ValidationReason };

/**
 * Outcome of one call, discriminated on `status` like the catalog client's.
 *
 * - `unauthenticated`  no session token, or the API answered 401; nothing is sent without a token
 * - `notFound`         404: missing, owned by someone else, or the feature is off (indistinguishable)
 * - `invalid`          422 `validation_error`; `fields` says which and why
 * - `conflict`         409 `version_conflict`; nothing was applied, `currentVersion` is the stored one
 * - `unavailable`      `transport`: network failure; `timeout`: no answer in time; `upstream`: any other
 *                      status; `malformed`: a 2xx body this client cannot safely use. For a write, the
 *                      outcome is unknown: re-read before retrying (contract §6)
 */
export type PrepResult<T> =
   | { status: "ok"; data: T }
   | { status: "unauthenticated" }
   | { status: "notFound" }
   | { status: "invalid"; fields: FieldIssue[] }
   | { status: "conflict"; currentVersion: number }
   | { status: "unavailable"; cause: "transport" | "timeout" | "upstream" | "malformed" };
