/**
 * The wire types of the frozen M1 `/me/practice` contract (P9-T06): backend `app/practice/schemas.py`, recorded in
 * `m1-contract-manifest.json`. Field names are the wire names (snake_case) so the manifest and these types agree.
 * A change here needs an owner-recorded contract amendment and a new manifest hash; `contract.test.ts` fails otherwise.
 */

export type Seniority = "mid" | "senior" | "staff" | "principal";
export type Position = "frame" | "requirements" | "design" | "ml_reasoning" | "evaluate_and_scale" | "depth_and_trade_offs" | "follow_ups";
export type StageStatus = "not_started" | "in_progress" | "done" | "skipped";
export type AttemptStatus = "active" | "submitted" | "evaluating" | "evaluated" | "evaluation_failed" | "ended_by_reveal" | "abandoned";
export type Mark = "met" | "partly" | "not_yet";
export type Plan = "free" | "premium" | "unknown";
export type ConsentState = "accepted" | "required" | "outdated";

// --- Attempt ---

export interface CreateAttemptIn {
   content_id: string;
   mode: "self" | "ai";
   target_seniority: Seniority;
}

export interface StageStatusOut {
   position: Position;
   status: StageStatus;
   version: number;
}

export interface Counters {
   turns_used: number;
   checks_used: number;
   nudges_used: number;
   hints_used: number;
}

/** What applies to the caller now; every member is null while AI is unavailable. */
export interface Limits {
   ai_attempts_remaining: number | null;
   window: "week" | "day" | "month" | null;
   resets_at: string | null;
   checks_max: number | null;
   turns_max: number | null;
   nudges_max: number | null;
}

export interface RetryInfo {
   allowed: boolean;
   remaining: number;
}

/** PROVISIONAL (M2): always null in M1. */
export interface EvaluationOut {
   state: "queued" | "waiting_for_capacity" | "running" | "completed" | "failed" | "cancelled";
   completeness: "complete" | "partial" | null;
   feedback_id: string | null;
   error_code: string | null;
   retry: RetryInfo;
   poll_after_seconds: number | null;
   updated_at: string;
}

export interface AttemptOut {
   id: string;
   content_id: string;
   category: "system_design" | "ml_system_design";
   mode: "self" | "ai";
   target_seniority: Seniority;
   status: AttemptStatus;
   spine: Position[];
   stages: StageStatusOut[];
   diagram_version: number;
   counters: Counters;
   limits: Limits;
   newer_content_available: boolean;
   evaluation: EvaluationOut | null;
   evaluation_waived: boolean;
   version: number;
   created_at: string;
   updated_at: string;
   submitted_at: string | null;
}

export interface AttemptListItem {
   id: string;
   content_id: string;
   mode: "self" | "ai";
   target_seniority: Seniority;
   status: AttemptStatus;
   stages_done: number;
   stages_total: number;
   updated_at: string;
   submitted_at: string | null;
}

export interface AttemptListPage {
   items: AttemptListItem[];
   next_cursor: string | null;
}

export interface ConsentStates {
   practice_data: ConsentState;
   practice_ai: ConsentState;
}

/** Booleans and states only; never withheld-content information. */
export interface CapabilityOut {
   practice_available: boolean;
   practice_ready: boolean;
   ai_available: boolean;
   voice_available: boolean;
   plan: Plan;
   consent: ConsentStates;
   limits: Limits | null;
   /** A-01: the seniorities the Problem targets and offers, server-derived; empty unless `practice_ready`. */
   seniorities: Seniority[];
}

// --- Stage work ---

export interface StagePatchIn {
   version: number;
   status?: StageStatus | null;
   set_fields?: Record<string, string>;
   unset_fields?: string[];
}

/** The canonical saved stage: the answer of the stage PATCH (G-01) and the resume state of the attempt detail. */
export interface StageWorkOut {
   position: Position;
   status: StageStatus;
   version: number;
   fields: Record<string, string>;
   updated_at: string;
}

export interface HintOut {
   position: Position;
   event_id: string;
   text: string;
   hints_used: number;
   hints_available: number;
}

export interface ClarificationRevealOut {
   event_id: string;
   clarification_id: string;
   title: string;
   answer: string;
   already_revealed: boolean;
}

// --- Attempt detail (G-02): saved work and the allowlisted challenge ---

export type MlSubsectionKey = "ml_objective" | "data" | "features" | "labels" | "model" | "training" | "inference";

/** A-02: one ML sub-section the pinned Problem authors; `key` is its stage field identifier, `title` a fixed label. */
export interface ChallengeSubsectionOut {
   key: MlSubsectionKey;
   title: string;
}

export interface ChallengeStageOut {
   position: Position;
   title: string;
   /** A-03: the total of the stage's authored hints released to the caller, never their text. */
   hints_available: number;
   /** A-03: how many of them the learner has been shown, from the event record (not the bounded history). */
   hints_used: number;
   /** A-02: for `ml_reasoning` only; empty elsewhere. */
   subsections: ChallengeSubsectionOut[];
}

/** A-04: the canonical prompt blocks. */
export interface PromptMarkdownBlock {
   type: "markdown";
   text: string;
}

export interface PromptCalloutBlock {
   type: "callout";
   kind: "note" | "tip" | "warning";
   children: PromptMarkdownBlock[];
}

/** The topic only; the authored answer arrives only through the reveal route. */
export interface ChallengeClarificationOut {
   clarification_id: string;
   title: string;
}

/** The challenge-facing content of the pinned Problem version, from a server-side allowlist. Never a reference or an unrevealed answer. */
export interface ChallengeOut {
   title: string;
   /** The givens only, as canonical blocks (A-04). */
   prompt: (PromptMarkdownBlock | PromptCalloutBlock)[];
   stages: ChallengeStageOut[];
   clarifications: ChallengeClarificationOut[];
}

/** A clarification the learner revealed: the only way an authored answer appears in attempt detail. */
export interface RevealedClarificationOut {
   event_id: string;
   clarification_id: string;
   title: string;
   answer: string;
   revealed_at: string;
}

export type HistoryKind = "clarification_reveal" | "assumption_declared" | "self_question" | "hint_authored";

/** Learner-visible history of an M1 attempt, ascending `seq`. M2 kinds are provisional and not frozen. */
export interface HistoryEventOut {
   event_id: string;
   seq: number;
   position: Position | null;
   kind: HistoryKind;
   text: string;
   created_at: string;
}

/** `GET /attempts/{id}` only: the attempt plus what a learner needs to resume. The list stays `AttemptListItem`. */
export interface AttemptDetailOut extends AttemptOut {
   stage_work: StageWorkOut[];
   /** Null while the authored material is withdrawn; the learner's own work stays. */
   challenge: ChallengeOut | null;
   revealed_clarifications: RevealedClarificationOut[];
   /** At most the 200 most recent learner-visible events, ascending (A-05). */
   history: HistoryEventOut[];
   /** Every learner-visible event, so truncation is never silent (A-05). */
   history_total: number;
}

/** Explicit confirmation (G-04): `confirm` must be `true`. */
export interface RevealIn {
   confirm: true;
}

export interface AssumptionIn {
   position: Position;
   text: string;
}

export interface AssumptionOut {
   event_id: string;
}

export interface TurnIn {
   text: string;
}

/** PROVISIONAL (M2): always null in M1. */
export interface InterviewerOut {
   move: string;
   message: string;
   refs: Record<string, string>[];
   coverage: Record<string, string>[];
}

export interface TurnOut {
   event_ids: string[];
   counters: Counters;
   limits: Limits;
   interviewer: InterviewerOut | null;
}

export interface SubmitIn {
   diagram_version: number;
   stage_versions: Partial<Record<Position, number>>;
}

export interface SubmitOut {
   status: "submitted" | "evaluating";
   submission_snapshot_id: string;
   evaluation: EvaluationOut | null;
}

export interface SelfReviewIn {
   version: number;
   mark: Mark;
   note?: string | null;
}

export interface SelfReviewOut {
   dimension_id: string;
   mark: Mark;
   note: string | null;
   version: number;
}

export interface ReferenceSectionOut {
   kind: string;
   title: string;
   body: Record<string, unknown>[];
}

/** A-10: one rubric dimension the caller may self-review now; only the attempt's own seniority bar, never another's. */
export interface ReferenceRubricOut {
   dimension_id: string;
   title: string;
   /** The interview stage the dimension's evidence sits in, or null. */
   stage: Position | null;
   bar: (PromptMarkdownBlock | PromptCalloutBlock)[] | null;
   strong_evidence: (PromptMarkdownBlock | PromptCalloutBlock)[];
   weak_evidence: (PromptMarkdownBlock | PromptCalloutBlock)[];
   self_review: SelfReviewOut | null;
}

export interface ReferenceOut {
   sections: ReferenceSectionOut[];
   plan: "free" | "premium";
   /** A-10: empty whenever the caller may not address the rubric now. */
   rubric: ReferenceRubricOut[];
}

// --- Preference and consent ---

export interface PreferenceIn {
   default_seniority: Seniority | null;
   version: number | null;
}

export interface PreferenceOut {
   default_seniority: Seniority | null;
   version: number;
}

export interface ConsentIn {
   document_id: "practice-data" | "practice-ai";
   document_version: string;
}

export interface ConsentOut {
   document_id: string;
   document_version: string;
   accepted_at: string;
   withdrawn_at: string | null;
}

export type ConsentPurpose = "practice-data" | "practice-ai";

/** One purpose. `required` also covers a withdrawn or never-accepted document; `required_version` is null while the terms version is unset (fail closed). */
export interface ConsentDocumentStatus {
   state: ConsentState;
   required_version: string | null;
   accepted_version: string | null;
   accepted_at: string | null;
   withdrawn_at: string | null;
}

/** `GET /consent`: the two purposes stay separate; practice-voice (M3) is not frozen. */
export interface ConsentStatusOut {
   practice_data: ConsentDocumentStatus;
   practice_ai: ConsentDocumentStatus;
}

export interface ConsentWithdrawIn {
   document_id: ConsentPurpose;
}

/** Withdrawal stops the matching processing; it deletes nothing and recalls nothing already sent. */
export interface ConsentWithdrawOut {
   document_id: ConsentPurpose;
   withdrawn_at: string;
   consent: ConsentStates;
}

// --- Diagram: `in.arch-graph/1` and `in.arch-layout/1` ---

export type NodeType = "client" | "service" | "gateway" | "database" | "cache" | "queue" | "object_store" | "model" | "worker" | "external";
export type EdgeKind = "request" | "async_message" | "read" | "write" | "stream" | "batch";
export type BoundaryType = "region" | "tenant" | "trust" | "network" | "group";

export interface GraphNode {
   id: string;
   type: NodeType;
   subtype?: string | null;
   label?: string;
   explanation?: string;
   boundary?: string | null;
}

export interface GraphEdge {
   id: string;
   from: string;
   to: string;
   kind?: EdgeKind;
   tag?: string;
   explanation?: string;
}

export interface GraphBoundary {
   id: string;
   type: BoundaryType;
   label?: string;
}

export interface ArchGraph {
   schema: "in.arch-graph/1";
   nodes: GraphNode[];
   edges: GraphEdge[];
   boundaries: GraphBoundary[];
}

/** Finite numbers within the G-07 bounds: see `LAYOUT_BOUNDS` in `contract.ts`. The server enforces them. */
export interface Frame {
   x: number;
   y: number;
   w: number;
   h: number;
}

export interface Point {
   x: number;
   y: number;
}

export interface Viewport {
   x: number;
   y: number;
   zoom: number;
}

/** Positions only, keyed by element ID. No text; never sent to a model; never part of a hash. */
export interface ArchLayout {
   schema: "in.arch-layout/1";
   nodes?: Record<string, Frame>;
   edges?: Record<string, Point[]>;
   boundaries?: Record<string, Frame>;
   viewport?: Viewport | null;
}

export interface DiagramPutIn {
   version: number;
   graph: ArchGraph;
   layout?: ArchLayout | null;
}

export interface Finding {
   rule: string;
   severity: "info" | "warn";
   element_ids: string[];
   basis_hash: string;
   state: "fresh" | "changed" | "resolved" | "void";
}

export interface TombstoneOut {
   id: string;
   kind: "node" | "edge" | "boundary";
   group: string;
   deleted_at_version: number;
   element: Record<string, unknown>;
}

export interface DiagramOut {
   version: number;
   graph: ArchGraph;
   layout: ArchLayout | null;
   graph_hash: string;
   topology_hash: string;
   structure_findings: Finding[];
   tombstones: TombstoneOut[];
}

// --- Export lines (G-09): `{type, data}` per NDJSON line; each `data` is an allowlist of the learner's own data ---

export type ExportRecordType = "attempt" | "stage_work" | "diagram" | "diagram_snapshot" | "inventory_snapshot" | "submission_snapshot" | "event" | "feedback" | "self_review" | "preference" | "consent";
export type EventKind = "interviewer" | "learner" | "clarification" | "clarification_reveal" | "assumption_declared" | "self_question" | "hint_authored" | "hint_model" | "stage_check" | "followup_posed" | "reveal" | "summary";

/** The number of lines of each record type; the header announces them and the trailer repeats them. */
export type ExportCounts = Record<ExportRecordType, number>;

export interface ExportHeaderData {
   format_version: number;
   exported_at: string;
   counts: ExportCounts;
}

/** No trailer means the export is incomplete. */
export interface ExportTrailerData {
   counts: ExportCounts;
}

export interface ExportAttemptData {
   id: string;
   content_id: string;
   category: "system_design" | "ml_system_design";
   mode: "self" | "ai";
   target_seniority: Seniority;
   status: AttemptStatus;
   spine: Position[];
   counters: Counters;
   evaluation_waived: boolean;
   version: number;
   created_at: string;
   updated_at: string;
   submitted_at: string | null;
}

export interface ExportStageWorkData extends StageWorkOut {
   attempt_id: string;
}

export interface ExportDiagramData extends DiagramOut {
   attempt_id: string;
}

/** Immutable; the graph only. The alias map and the born-version map are internal and not exported. */
export interface ExportDiagramSnapshotData {
   id: string;
   attempt_id: string;
   reason: "stage_check" | "submit" | "counterfactual_baseline";
   graph: ArchGraph;
   graph_hash: string;
   topology_hash: string;
   created_at: string;
}

export interface ExportInventoryEntry {
   source_id: string;
   kind: string;
   hash: string;
   text: string;
}

export interface ExportInventorySnapshotData {
   id: string;
   attempt_id: string;
   reason: "stage_check" | "submit";
   inventory_hash: string;
   diagram_snapshot_id: string;
   entries: ExportInventoryEntry[];
   created_at: string;
}

export interface ExportSubmissionSnapshotData {
   id: string;
   attempt_id: string;
   stage_versions: Partial<Record<Position, number>>;
   stage_hashes: Partial<Record<Position, string>>;
   inventory_snapshot_id: string;
   inventory_hash: string;
   diagram_snapshot_id: string;
   created_at: string;
}

export interface ExportEventData {
   id: string;
   attempt_id: string;
   seq: number;
   position: Position | null;
   kind: EventKind;
   text: string;
   created_at: string;
}

/** PROVISIONAL (M2): `result` stays opaque until the evaluation contract is frozen. */
export interface ExportFeedbackData {
   id: string;
   attempt_id: string;
   kind: "stage_check" | "final";
   position: Position | null;
   generation: number;
   completeness: "complete" | "partial";
   result: Record<string, unknown>;
   created_at: string;
}

export interface ExportSelfReviewData extends SelfReviewOut {
   attempt_id: string;
}

export type ExportLine =
   | { type: "header"; data: ExportHeaderData }
   | { type: "attempt"; data: ExportAttemptData }
   | { type: "stage_work"; data: ExportStageWorkData }
   | { type: "diagram"; data: ExportDiagramData }
   | { type: "diagram_snapshot"; data: ExportDiagramSnapshotData }
   | { type: "inventory_snapshot"; data: ExportInventorySnapshotData }
   | { type: "submission_snapshot"; data: ExportSubmissionSnapshotData }
   | { type: "event"; data: ExportEventData }
   | { type: "feedback"; data: ExportFeedbackData }
   | { type: "self_review"; data: ExportSelfReviewData }
   | { type: "preference"; data: PreferenceOut }
   | { type: "consent"; data: ConsentOut }
   | { type: "trailer"; data: ExportTrailerData };
