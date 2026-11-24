/**
 * A stateful in-memory `/me/practice` attempt service for T13 tests and for LOCAL screens built before T09 (the P7 pattern):
 * it scripts the routes T13 reads onto a `FakePracticeApi` and answers as the frozen M1 contract says the T09 backend will
 * (create with an idempotency key, owner-scoped reads, stage PATCH with compare-and-set, authored clarification reveal and
 * hints in order, assumptions, consent, history). Test-only: production code never imports it (`boundary.test.ts`).
 *
 * Content is synthetic. The two practice-ready Problem slugs get a synthetic title and prompt; nothing here is, or
 * excerpts, a reference solution, rubric or authored clarification answer of a real Problem.
 */

import { failure, type FakePracticeApi, type FakeReply, type FakeRequest } from "./fakeApi";
import type {
   AttemptDetailOut,
   AttemptListItem,
   AttemptOut,
   AttemptStatus,
   ChallengeOut,
   ConsentStatusOut,
   HistoryEventOut,
   Position,
   RevealedClarificationOut,
   Seniority,
   StagePatchIn,
   StageStatus,
   StageWorkOut,
} from "./types";

export const SYSTEM_DESIGN_SPINE: Position[] = ["frame", "requirements", "design", "evaluate_and_scale", "depth_and_trade_offs", "follow_ups"];
export const ML_SPINE: Position[] = ["frame", "requirements", "design", "ml_reasoning", "evaluate_and_scale", "depth_and_trade_offs", "follow_ups"];

export interface FakeProblem {
   contentId: string;
   category: "system_design" | "ml_system_design";
   title: string;
   spine: Position[];
   seniorities: Seniority[];
   clarifications: { id: string; title: string; answer: string }[];
   hints: Partial<Record<Position, string[]>>;
}

export const FAKE_PROBLEMS: Record<string, FakeProblem> = {
   "problem.llm-attribute-extraction-pipeline": {
      contentId: "problem.llm-attribute-extraction-pipeline",
      category: "system_design",
      title: "Synthetic Problem: a batch extraction pipeline",
      spine: SYSTEM_DESIGN_SPINE,
      seniorities: ["senior", "staff"],
      clarifications: [
         { id: "clarify-scale", title: "How large is the batch?", answer: "Synthetic answer A: about ten thousand records an hour." },
         { id: "clarify-errors", title: "Which errors matter most?", answer: "Synthetic answer B: a wrong value costs more than a missing one." },
         { id: "clarify-latency", title: "Is there a deadline?", answer: "Synthetic answer C: results are needed by the next morning." },
      ],
      hints: { frame: ["Synthetic hint 1: what is the unit of work?", "Synthetic hint 2: what would you ask about failure?"], requirements: ["Synthetic hint: separate the two kinds of limits."] },
   },
   "problem.incident-handoff-summary": {
      contentId: "problem.incident-handoff-summary",
      category: "ml_system_design",
      title: "Synthetic Problem: a summary that stays current",
      spine: ML_SPINE,
      seniorities: ["mid", "senior"],
      clarifications: [
         { id: "clarify-order", title: "Do events arrive in order?", answer: "Synthetic answer D: mostly, with occasional late events." },
         { id: "clarify-cost", title: "What matters about cost?", answer: "Synthetic answer E: spend should track how often the summary changes." },
      ],
      hints: { frame: ["Synthetic hint: who reads this, and when?"], ml_reasoning: ["Synthetic hint: what would a good label be?"] },
   },
};

interface Record_ {
   owner: string;
   attempt: AttemptOut;
   stage: Map<Position, StageWorkOut>;
   history: HistoryEventOut[];
   revealed: RevealedClarificationOut[];
   hintsGiven: Map<Position, number>;
   problem: FakeProblem;
}

export interface FakeAttemptsOptions {
   problems?: Record<string, FakeProblem>;
   /** Consent: the version the server requires, and whether the caller already accepted it. */
   consent?: { requiredVersion: string | null; accepted?: boolean };
}

const NOW = "2026-11-24T10:00:00Z";
const userOf = (request: FakeRequest) => request.token?.replace(/^fake-token-/, "") ?? "";

export function installFakeAttempts(api: FakePracticeApi, options: FakeAttemptsOptions = {}) {
   const problems = options.problems ?? FAKE_PROBLEMS;
   const records = new Map<string, Record_>();
   const keys = new Map<string, { body: string; id: string }>();
   let sequence = 0;
   let clock = 0;
   let consent = { requiredVersion: options.consent?.requiredVersion === undefined ? "draft-1" : options.consent.requiredVersion, accepted: options.consent?.accepted ?? false };
   const stamp = () => new Date(Date.parse(NOW) + ++clock * 1000).toISOString();

   const idOf = (request: FakeRequest) => request.path.split("/")[4] ?? "";
   const find = (request: FakeRequest): Record_ | null => {
      const record = records.get(idOf(request));
      return record && record.owner === userOf(request) ? record : null;
   };
   const notFound = (): FakeReply => failure("not_found", 404);
   const active = (record: Record_) => record.attempt.status === "active";

   const attemptOf = (record: Record_): AttemptOut => ({
      ...record.attempt,
      stages: record.attempt.spine.map((position) => {
         const stage = record.stage.get(position)!;
         return { position, status: stage.status, version: stage.version };
      }),
   });

   function detail(record: Record_): AttemptDetailOut {
      const challenge: ChallengeOut = {
         title: record.problem.title,
         prompt: [
            { type: "markdown", text: `A synthetic prompt for **${record.problem.title}**. Design it, and say how you would know it works.\n\n- A synthetic given.\n- Another synthetic given.` },
         ],
         stages: record.attempt.spine.map((position) => ({ position, title: position, hints_available: record.problem.hints[position]?.length ?? 0 })),
         clarifications: record.problem.clarifications.map(({ id, title }) => ({ clarification_id: id, title })),
      };
      return { ...attemptOf(record), stage_work: [...record.stage.values()], challenge, revealed_clarifications: [...record.revealed], history: [...record.history] };
   }

   const consentStatus = (): ConsentStatusOut => {
      const state = consent.accepted ? "accepted" : "required";
      return {
         practice_data: { state, required_version: consent.requiredVersion, accepted_version: consent.accepted ? consent.requiredVersion : null, accepted_at: consent.accepted ? NOW : null, withdrawn_at: null },
         practice_ai: { state: "required", required_version: null, accepted_version: null, accepted_at: null, withdrawn_at: null },
      };
   };

   api.script("capability", (request) => {
      const contentId = request.query.content_id;
      return {
         status: 200,
         body: {
            practice_available: true,
            practice_ready: contentId === undefined || contentId in problems,
            ai_available: false,
            voice_available: false,
            plan: "free",
            consent: { practice_data: consent.accepted ? "accepted" : "required", practice_ai: "required" },
            limits: null,
         },
      };
   });
   api.script("get_consent", () => ({ status: 200, body: consentStatus() }));
   api.script("post_consent", (request) => {
      const body = request.body as { document_id?: string; document_version?: string };
      if (consent.requiredVersion === null) return failure("practice_not_ready", 409);
      if (body.document_version !== consent.requiredVersion) return failure("consent_version_stale", 409, { document_id: body.document_id, required_version: consent.requiredVersion });
      consent = { ...consent, accepted: true };
      return { status: 200, body: { document_id: body.document_id, document_version: body.document_version, accepted_at: NOW, withdrawn_at: null } };
   });

   api.script("create_attempt", (request) => {
      const key = request.headers["Idempotency-Key"];
      const body = request.body as { content_id: string; mode: "self" | "ai"; target_seniority: Seniority };
      if (!key) return failure("validation_error", 422);
      const problem = problems[body.content_id];
      if (!problem) return failure("practice_not_ready", 409);
      if (!consent.accepted) return failure("consent_version_stale", 409, { document_id: "practice-data", required_version: consent.requiredVersion });
      if (!problem.seniorities.includes(body.target_seniority)) return failure("validation_error", 422, { fields: [{ field: "target_seniority", reason: "not targeted" }] });
      const bodyText = JSON.stringify(body);
      const earlier = keys.get(`${userOf(request)}:${key}`);
      if (earlier) {
         if (earlier.body !== bodyText) return failure("idempotency_conflict", 409);
         return { status: 201, body: attemptOf(records.get(earlier.id)!) };
      }
      const id = `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
      const stage = new Map<Position, StageWorkOut>(problem.spine.map((position) => [position, { position, status: "not_started" as StageStatus, version: 1, fields: {}, updated_at: NOW }]));
      const created = stamp();
      const record: Record_ = {
         owner: userOf(request),
         problem,
         stage,
         history: [],
         revealed: [],
         hintsGiven: new Map(),
         attempt: {
            id,
            content_id: problem.contentId,
            category: problem.category,
            mode: "self",
            target_seniority: body.target_seniority,
            status: "active",
            spine: problem.spine,
            stages: [],
            diagram_version: 1,
            counters: { turns_used: 0, checks_used: 0, nudges_used: 0, hints_used: 0 },
            limits: { ai_attempts_remaining: null, window: null, resets_at: null, checks_max: null, turns_max: null, nudges_max: null },
            newer_content_available: false,
            evaluation: null,
            evaluation_waived: false,
            version: 1,
            created_at: created,
            updated_at: created,
            submitted_at: null,
         },
      };
      records.set(id, record);
      keys.set(`${userOf(request)}:${key}`, { body: bodyText, id });
      return { status: 201, body: attemptOf(record) };
   });

   api.script("list_attempts", (request) => {
      const items: AttemptListItem[] = [...records.values()]
         .filter((record) => record.owner === userOf(request))
         .filter((record) => (request.query.content_id ? record.attempt.content_id === request.query.content_id : true))
         .filter((record) => (request.query.status ? record.attempt.status === request.query.status : true))
         .map((record) => ({
            id: record.attempt.id,
            content_id: record.attempt.content_id,
            mode: record.attempt.mode,
            target_seniority: record.attempt.target_seniority,
            status: record.attempt.status,
            stages_done: [...record.stage.values()].filter((stage) => stage.status === "done" || stage.status === "skipped").length,
            stages_total: record.attempt.spine.length,
            updated_at: record.attempt.updated_at,
            submitted_at: record.attempt.submitted_at,
         }))
         .reverse();
      return { status: 200, body: { items, next_cursor: null } };
   });

   api.script("get_attempt", (request) => {
      const record = find(request);
      return record ? { status: 200, body: detail(record) } : notFound();
   });

   api.script("patch_stage", (request) => {
      const record = find(request);
      if (!record) return notFound();
      const position = request.path.split("/")[6] as Position;
      const stage = record.stage.get(position);
      if (!stage) return failure("stage_not_available", 404);
      if (!active(record)) return failure("attempt_not_active", 409);
      const body = request.body as StagePatchIn;
      if (body.version !== stage.version) return failure("version_conflict", 409, { current_version: stage.version });
      for (const value of Object.values(body.set_fields ?? {})) if (value.length > 6000) return failure("validation_error", 422);
      const next: StageWorkOut = {
         ...stage,
         status: body.status ?? stage.status,
         fields: { ...stage.fields, ...(body.set_fields ?? {}) },
         version: stage.version + 1,
         updated_at: stamp(),
      };
      for (const key of body.unset_fields ?? []) delete next.fields[key];
      record.stage.set(position, next);
      return { status: 200, body: next };
   });

   const event = (record: Record_, position: Position | null, kind: HistoryEventOut["kind"], text: string): HistoryEventOut => {
      const made: HistoryEventOut = { event_id: `10000000-0000-4000-8000-${String(record.history.length + 1).padStart(12, "0")}`, seq: record.history.length + 1, position, kind, text, created_at: stamp() };
      record.history.push(made);
      return made;
   };

   api.script("reveal_clarification", (request) => {
      const record = find(request);
      if (!record) return notFound();
      if (!active(record)) return failure("attempt_not_active", 409);
      const id = decodeURIComponent(request.path.split("/")[6] ?? "");
      const authored = record.problem.clarifications.find((entry) => entry.id === id);
      if (!authored) return notFound();
      const already = record.revealed.find((entry) => entry.clarification_id === id);
      if (already) return { status: 200, body: { event_id: already.event_id, clarification_id: id, title: authored.title, answer: authored.answer, already_revealed: true } };
      const made = event(record, "frame", "clarification_reveal", authored.title);
      record.revealed.push({ event_id: made.event_id, clarification_id: id, title: authored.title, answer: authored.answer, revealed_at: made.created_at });
      return { status: 200, body: { event_id: made.event_id, clarification_id: id, title: authored.title, answer: authored.answer, already_revealed: false } };
   });

   api.script("stage_hint", (request) => {
      const record = find(request);
      if (!record) return notFound();
      if (!active(record)) return failure("attempt_not_active", 409);
      const position = request.path.split("/")[6] as Position;
      const authored = record.problem.hints[position] ?? [];
      const given = record.hintsGiven.get(position) ?? 0;
      if (given >= authored.length) return failure("stage_not_available", 404);
      record.hintsGiven.set(position, given + 1);
      const made = event(record, position, "hint_authored", authored[given]);
      record.attempt.counters.hints_used += 1;
      return { status: 200, body: { position, event_id: made.event_id, text: authored[given], hints_used: given + 1, hints_available: authored.length - given - 1 } };
   });

   api.script("add_assumption", (request) => {
      const record = find(request);
      if (!record) return notFound();
      if (!active(record)) return failure("attempt_not_active", 409);
      const body = request.body as { position: Position; text: string };
      const made = event(record, body.position, "assumption_declared", body.text);
      return { status: 200, body: { event_id: made.event_id } };
   });

   return {
      records,
      /** Ends the attempt as the server would (reveal, submit or abandon): later writes answer `attempt_not_active`. */
      endAttempt(id: string, status: Exclude<AttemptStatus, "active"> = "abandoned") {
         records.get(id)!.attempt.status = status;
      },
      /** Another device saves this stage: the canonical version moves on. */
      writeElsewhere(id: string, position: Position, fields: Record<string, string>) {
         const record = records.get(id)!;
         const stage = record.stage.get(position)!;
         record.stage.set(position, { ...stage, fields: { ...stage.fields, ...fields }, version: stage.version + 1, status: stage.status === "not_started" ? "in_progress" : stage.status, updated_at: stamp() });
      },
      stage(id: string, position: Position): StageWorkOut {
         return records.get(id)!.stage.get(position)!;
      },
      setConsent(next: { requiredVersion: string | null; accepted?: boolean }) {
         consent = { requiredVersion: next.requiredVersion, accepted: next.accepted ?? false };
      },
      /** The requests of one route, in order. */
      calls(route: FakeRequest["route"]) {
         return api.requests.filter((request) => request.route === route);
      },
   };
}

export type FakeAttempts = ReturnType<typeof installFakeAttempts>;
