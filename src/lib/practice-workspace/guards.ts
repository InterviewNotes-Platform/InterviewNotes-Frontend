/**
 * Runtime response guards for the routes the T13 screens read (spec §6.3, the frozen M1 manifest). A body is trusted as
 * attempt state only when every member the screens use has the frozen type; anything else is `malformed` and never becomes
 * state. Hand-written on purpose: the frontend adds no schema library for this, and each guard checks only what a screen
 * reads, so an additive backend field does not break it. Later tasks add the guards for the routes they read.
 */

import type {
   AssumptionOut,
   AttemptDetailOut,
   AttemptListItem,
   AttemptListPage,
   AttemptOut,
   ChallengeOut,
   ClarificationRevealOut,
   ConsentOut,
   ConsentDocumentStatus,
   ConsentStatusOut,
   HintOut,
   HistoryEventOut,
   RevealedClarificationOut,
   StageStatusOut,
   StageWorkOut,
} from "./types";

type Rec = Record<string, unknown>;

const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);
const isStr = (value: unknown): value is string => typeof value === "string";
const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isBool = (value: unknown): value is boolean => typeof value === "boolean";
const isNullable = <T>(check: (value: unknown) => value is T) => (value: unknown): value is T | null => value === null || check(value);
const oneOf = <T extends string>(values: readonly T[]) => (value: unknown): value is T => typeof value === "string" && (values as readonly string[]).includes(value);
const arrayOf = <T>(check: (value: unknown) => value is T) => (value: unknown): value is T[] => Array.isArray(value) && value.every(check);

export const POSITIONS = ["frame", "requirements", "design", "ml_reasoning", "evaluate_and_scale", "depth_and_trade_offs", "follow_ups"] as const;
const STAGE_STATUSES = ["not_started", "in_progress", "done", "skipped"] as const;
const ATTEMPT_STATUSES = ["active", "submitted", "evaluating", "evaluated", "evaluation_failed", "ended_by_reveal", "abandoned"] as const;
const SENIORITIES = ["mid", "senior", "staff", "principal"] as const;
const CONSENT_STATES = ["accepted", "required", "outdated"] as const;

const isPosition = oneOf(POSITIONS);
const isStringMap = (value: unknown): value is Record<string, string> => isRec(value) && Object.values(value).every(isStr);

export function isStageWork(body: unknown): body is StageWorkOut {
   return isRec(body) && isPosition(body.position) && oneOf(STAGE_STATUSES)(body.status) && isNum(body.version) && isStringMap(body.fields) && isStr(body.updated_at);
}

const isStageStatusOut = (value: unknown): value is StageStatusOut => isRec(value) && isPosition(value.position) && oneOf(STAGE_STATUSES)(value.status) && isNum(value.version);

export function isAttempt(body: unknown): body is AttemptOut {
   return (
      isRec(body) &&
      isStr(body.id) &&
      isStr(body.content_id) &&
      (body.category === "system_design" || body.category === "ml_system_design") &&
      (body.mode === "self" || body.mode === "ai") &&
      oneOf(SENIORITIES)(body.target_seniority) &&
      oneOf(ATTEMPT_STATUSES)(body.status) &&
      arrayOf(isPosition)(body.spine) &&
      arrayOf(isStageStatusOut)(body.stages) &&
      isNum(body.diagram_version) &&
      isNum(body.version) &&
      isStr(body.created_at) &&
      isStr(body.updated_at)
   );
}

const isChallenge = (value: unknown): value is ChallengeOut =>
   isRec(value) &&
   isStr(value.title) &&
   Array.isArray(value.prompt) &&
   value.prompt.every(isRec) &&
   arrayOf((stage: unknown): stage is { position: string } => isRec(stage) && isPosition(stage.position) && isStr(stage.title) && isNum(stage.hints_available))(value.stages) &&
   arrayOf((entry: unknown): entry is { clarification_id: string } => isRec(entry) && isStr(entry.clarification_id) && isStr(entry.title))(value.clarifications);

const isRevealed = (value: unknown): value is RevealedClarificationOut =>
   isRec(value) && isStr(value.event_id) && isStr(value.clarification_id) && isStr(value.title) && isStr(value.answer) && isStr(value.revealed_at);

const isHistoryEvent = (value: unknown): value is HistoryEventOut =>
   isRec(value) &&
   isStr(value.event_id) &&
   isNum(value.seq) &&
   isNullable(isPosition)(value.position) &&
   oneOf(["clarification_reveal", "assumption_declared", "self_question", "hint_authored"] as const)(value.kind) &&
   isStr(value.text) &&
   isStr(value.created_at);

export function isAttemptDetail(body: unknown): body is AttemptDetailOut {
   return (
      isAttempt(body) &&
      isRec(body) &&
      arrayOf(isStageWork)(body.stage_work) &&
      isNullable(isChallenge)(body.challenge) &&
      arrayOf(isRevealed)(body.revealed_clarifications) &&
      arrayOf(isHistoryEvent)(body.history)
   );
}

const isListItem = (value: unknown): value is AttemptListItem =>
   isRec(value) &&
   isStr(value.id) &&
   isStr(value.content_id) &&
   (value.mode === "self" || value.mode === "ai") &&
   oneOf(SENIORITIES)(value.target_seniority) &&
   oneOf(ATTEMPT_STATUSES)(value.status) &&
   isNum(value.stages_done) &&
   isNum(value.stages_total) &&
   isStr(value.updated_at) &&
   isNullable(isStr)(value.submitted_at);

export function isAttemptListPage(body: unknown): body is AttemptListPage {
   return isRec(body) && arrayOf(isListItem)(body.items) && isNullable(isStr)(body.next_cursor);
}

export function isHint(body: unknown): body is HintOut {
   return isRec(body) && isPosition(body.position) && isStr(body.event_id) && isStr(body.text) && isNum(body.hints_used) && isNum(body.hints_available);
}

export function isClarificationReveal(body: unknown): body is ClarificationRevealOut {
   return isRec(body) && isStr(body.event_id) && isStr(body.clarification_id) && isStr(body.title) && isStr(body.answer) && isBool(body.already_revealed);
}

export function isAssumption(body: unknown): body is AssumptionOut {
   return isRec(body) && isStr(body.event_id);
}

const isConsentDocument = (value: unknown): value is ConsentDocumentStatus =>
   isRec(value) &&
   oneOf(CONSENT_STATES)(value.state) &&
   isNullable(isStr)(value.required_version) &&
   isNullable(isStr)(value.accepted_version) &&
   isNullable(isStr)(value.accepted_at) &&
   isNullable(isStr)(value.withdrawn_at);

export function isConsentStatus(body: unknown): body is ConsentStatusOut {
   return isRec(body) && isConsentDocument(body.practice_data) && isConsentDocument(body.practice_ai);
}

export function isConsentOut(body: unknown): body is ConsentOut {
   return isRec(body) && isStr(body.document_id) && isStr(body.document_version) && isStr(body.accepted_at) && isNullable(isStr)(body.withdrawn_at);
}
