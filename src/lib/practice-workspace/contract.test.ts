import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_STATUS, GRAPH, LAYOUT_BOUNDS, M1_MANIFEST_SHA256, M1_ROUTES, PRACTICE_PREFIX, ROUTE } from "./contract";
import type * as T from "./types";

const FILE = join(__dirname, "m1-contract-manifest.json");
const bytes = readFileSync(FILE);
interface ManifestRoute {
   id: string;
   method: string;
   path: string;
   request: string | null;
   response: string | null;
   success_status: number;
   idempotency_key: boolean;
   media_type: string;
}
interface Manifest {
   milestone: string;
   prefix: string;
   routes: ManifestRoute[];
   provisional_routes_not_frozen: string[];
   errors: Record<string, { status: number }>;
   models: Record<string, { properties: object }>;
   diagram: {
      graph_schema: string;
      layout_schema: string;
      node_types: Record<string, string[]>;
      edge_kinds: string[];
      boundary_types: string[];
      limits: Record<string, number>;
      layout_limits: { max_bytes: number; coordinate_min: number; coordinate_max: number; size_max: number; zoom_min: number; zoom_max: number };
      id_patterns: Record<string, string>;
   };
}
const manifest = JSON.parse(bytes.toString("utf8")) as Manifest;

/** The T06 `A2` hashing method, written out: keys sorted recursively, arrays in order, compact, no trailing newline. */
function canonical(value: unknown): string {
   if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
   if (value !== null && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
   }
   return JSON.stringify(value);
}

describe("the frozen M1 manifest", () => {
   it("is the recorded hash, byte for byte", () => {
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(M1_MANIFEST_SHA256);
      expect(bytes.at(-1)).not.toBe(0x0a); // no trailing newline
   });

   it("is already in the canonical form another language produces the same bytes for", () => {
      expect(canonical(manifest)).toBe(bytes.toString("utf8"));
      expect(JSON.stringify(manifest)).toContain('"manifest":"p9-practice-m1-contract"');
   });

   it("freezes the milestone and the prefix, and leaves M2 and M3 out", () => {
      expect(manifest.milestone).toBe("M1");
      expect(manifest.prefix).toBe(PRACTICE_PREFIX);
      expect(manifest.provisional_routes_not_frozen).toHaveLength(10);
      expect(M1_ROUTES.map((route) => route.path).join(" ")).not.toMatch(/check|evaluation|transcribe|speak/);
   });
});

describe("the typed route table agrees with the manifest", () => {
   it("has the same 25 routes in the same order, with the same shapes", () => {
      expect(M1_ROUTES).toHaveLength(25);
      const frozen = manifest.routes;
      expect(M1_ROUTES.map((route) => ({ id: route.id, method: route.method, path: PRACTICE_PREFIX + route.path, request: route.request, response: route.response, status: route.status, key: route.idempotencyKey, media: route.mediaType }))).toEqual(
         frozen.map((route) => ({ id: route.id, method: route.method, path: route.path, request: route.request, response: route.response, status: route.success_status, key: route.idempotency_key, media: route.media_type }))
      );
      expect(Object.keys(ROUTE).sort()).toEqual(M1_ROUTES.map((route) => route.id).sort());
   });

   it("carries the registered error codes and statuses", () => {
      const frozen = Object.fromEntries(Object.entries(manifest.errors).map(([code, spec]) => [code, spec.status]));
      expect(ERROR_STATUS).toEqual(frozen);
   });

   it("carries the graph vocabularies, limits and identifier patterns of in.arch-graph/1", () => {
      const diagram = manifest.diagram;
      expect(GRAPH.graphSchema).toBe(diagram.graph_schema);
      expect(GRAPH.layoutSchema).toBe(diagram.layout_schema);
      expect(GRAPH.nodeTypes).toEqual(diagram.node_types);
      expect(GRAPH.edgeKinds).toEqual(diagram.edge_kinds);
      expect(GRAPH.boundaryTypes).toEqual(diagram.boundary_types);
      expect(GRAPH.limits).toEqual(diagram.limits);
      expect(GRAPH.layoutMaxBytes).toBe(diagram.layout_limits.max_bytes);
      expect(LAYOUT_BOUNDS).toEqual({ coordinateMin: diagram.layout_limits.coordinate_min, coordinateMax: diagram.layout_limits.coordinate_max, sizeMax: diagram.layout_limits.size_max, zoomMin: diagram.layout_limits.zoom_min, zoomMax: diagram.layout_limits.zoom_max });
      expect({ node: GRAPH.idPatterns.node.source, edge: GRAPH.idPatterns.edge.source, boundary: GRAPH.idPatterns.boundary.source }).toEqual(diagram.id_patterns);
   });
});

// A complete value of each model's TypeScript type, so its keys can be compared with the manifest's schema: a field added
// or removed on either side fails here (an interface missing a field fails to compile, one gaining a field fails the sample).
const all = <M,>(value: Required<M>) => Object.keys(value as object).sort();
const GRAPH_NODE: Required<T.GraphNode> = { id: "n", type: "client", subtype: null, label: "", explanation: "", boundary: null };
const GRAPH_EDGE: Required<T.GraphEdge> = { id: "e", from: "n", to: "n", kind: "request", tag: "", explanation: "" };
const LIMITS: T.Limits = { ai_attempts_remaining: null, window: null, resets_at: null, checks_max: null, turns_max: null, nudges_max: null };
const COUNTERS: T.Counters = { turns_used: 0, checks_used: 0, nudges_used: 0, hints_used: 0 };
const GRAPH_DOC: T.ArchGraph = { schema: "in.arch-graph/1", nodes: [], edges: [], boundaries: [] };
const LAYOUT_DOC: Required<T.ArchLayout> = { schema: "in.arch-layout/1", nodes: {}, edges: {}, boundaries: {}, viewport: null };

const STAGE_WORK: T.StageWorkOut = { position: "frame", status: "done", version: 1, fields: {}, updated_at: "" };
const ATTEMPT: T.AttemptOut = { id: "", content_id: "", category: "system_design", mode: "self", target_seniority: "mid", status: "active", spine: [], stages: [], diagram_version: 0, counters: COUNTERS, limits: LIMITS, newer_content_available: false, evaluation: null, evaluation_waived: false, version: 1, created_at: "", updated_at: "", submitted_at: null };
const CONSENT_DOC: T.ConsentDocumentStatus = { state: "required", required_version: null, accepted_version: null, accepted_at: null, withdrawn_at: null };
const DIAGRAM: T.DiagramOut = { version: 1, graph: GRAPH_DOC, layout: null, graph_hash: "", topology_hash: "", structure_findings: [], tombstones: [] };
const COUNTS: T.ExportCounts = { attempt: 0, stage_work: 0, diagram: 0, diagram_snapshot: 0, inventory_snapshot: 0, submission_snapshot: 0, event: 0, feedback: 0, self_review: 0, preference: 0, consent: 0 };
const EXPORT_LINES = ["Header", "Attempt", "StageWork", "Diagram", "DiagramSnapshot", "InventorySnapshot", "SubmissionSnapshot", "Event", "Feedback", "SelfReview", "Preference", "Consent", "Trailer"];

const SAMPLES: Record<string, string[]> = {
   CreateAttemptIn: all<T.CreateAttemptIn>({ content_id: "", mode: "self", target_seniority: "mid" }),
   StageWorkOut: all<T.StageWorkOut>(STAGE_WORK),
   ChallengeStageOut: all<T.ChallengeStageOut>({ position: "frame", title: "", hints_available: 0 }),
   ChallengeClarificationOut: all<T.ChallengeClarificationOut>({ clarification_id: "", title: "" }),
   ChallengeOut: all<T.ChallengeOut>({ title: "", prompt: [], stages: [], clarifications: [] }),
   RevealedClarificationOut: all<T.RevealedClarificationOut>({ event_id: "", clarification_id: "", title: "", answer: "", revealed_at: "" }),
   HistoryEventOut: all<T.HistoryEventOut>({ event_id: "", seq: 1, position: null, kind: "self_question", text: "", created_at: "" }),
   AttemptDetailOut: all<T.AttemptDetailOut>({ ...ATTEMPT, stage_work: [], challenge: null, revealed_clarifications: [], history: [] }),
   RevealIn: all<T.RevealIn>({ confirm: true }),
   ConsentDocumentStatus: all<T.ConsentDocumentStatus>(CONSENT_DOC),
   ConsentStatusOut: all<T.ConsentStatusOut>({ practice_data: CONSENT_DOC, practice_ai: CONSENT_DOC }),
   ConsentWithdrawIn: all<T.ConsentWithdrawIn>({ document_id: "practice-ai" }),
   ConsentWithdrawOut: all<T.ConsentWithdrawOut>({ document_id: "practice-ai", withdrawn_at: "", consent: { practice_data: "required", practice_ai: "required" } }),
   ExportCounts: all<T.ExportCounts>(COUNTS),
   ExportHeaderData: all<T.ExportHeaderData>({ format_version: 1, exported_at: "", counts: COUNTS }),
   ExportTrailerData: all<T.ExportTrailerData>({ counts: COUNTS }),
   ExportAttemptData: all<T.ExportAttemptData>({ id: "", content_id: "", category: "system_design", mode: "self", target_seniority: "mid", status: "active", spine: [], counters: COUNTERS, evaluation_waived: false, version: 1, created_at: "", updated_at: "", submitted_at: null }),
   ExportStageWorkData: all<T.ExportStageWorkData>({ ...STAGE_WORK, attempt_id: "" }),
   ExportDiagramData: all<T.ExportDiagramData>({ ...DIAGRAM, attempt_id: "" }),
   ExportDiagramSnapshotData: all<T.ExportDiagramSnapshotData>({ id: "", attempt_id: "", reason: "submit", graph: GRAPH_DOC, graph_hash: "", topology_hash: "", created_at: "" }),
   ExportInventoryEntry: all<T.ExportInventoryEntry>({ source_id: "", kind: "", hash: "", text: "" }),
   ExportInventorySnapshotData: all<T.ExportInventorySnapshotData>({ id: "", attempt_id: "", reason: "submit", inventory_hash: "", diagram_snapshot_id: "", entries: [], created_at: "" }),
   ExportSubmissionSnapshotData: all<T.ExportSubmissionSnapshotData>({ id: "", attempt_id: "", stage_versions: {}, stage_hashes: {}, inventory_snapshot_id: "", inventory_hash: "", diagram_snapshot_id: "", created_at: "" }),
   ExportEventData: all<T.ExportEventData>({ id: "", attempt_id: "", seq: 1, position: null, kind: "learner", text: "", created_at: "" }),
   ExportFeedbackData: all<T.ExportFeedbackData>({ id: "", attempt_id: "", kind: "final", position: null, generation: 1, completeness: "complete", result: {}, created_at: "" }),
   ExportSelfReviewData: all<T.ExportSelfReviewData>({ dimension_id: "", mark: "met", note: null, version: 1, attempt_id: "" }),
   ...Object.fromEntries(EXPORT_LINES.map((line) => [`Export${line}Line`, ["data", "type"]])),
   StagePatchIn: all<T.StagePatchIn>({ version: 1, status: null, set_fields: {}, unset_fields: [] }),
   StageStatusOut: all<T.StageStatusOut>({ position: "frame", status: "done", version: 1 }),
   Counters: all<T.Counters>(COUNTERS),
   Limits: all<T.Limits>(LIMITS),
   EvaluationOut: all<T.EvaluationOut>({ state: "queued", completeness: null, feedback_id: null, error_code: null, retry: { allowed: false, remaining: 0 }, poll_after_seconds: null, updated_at: "" }),
   AttemptOut: all<T.AttemptOut>({ id: "", content_id: "", category: "system_design", mode: "self", target_seniority: "mid", status: "active", spine: [], stages: [], diagram_version: 0, counters: COUNTERS, limits: LIMITS, newer_content_available: false, evaluation: null, evaluation_waived: false, version: 1, created_at: "", updated_at: "", submitted_at: null }),
   AttemptListItem: all<T.AttemptListItem>({ id: "", content_id: "", mode: "self", target_seniority: "mid", status: "active", stages_done: 0, stages_total: 0, updated_at: "", submitted_at: null }),
   AttemptListPage: all<T.AttemptListPage>({ items: [], next_cursor: null }),
   ConsentStates: all<T.ConsentStates>({ practice_data: "required", practice_ai: "required" }),
   CapabilityOut: all<T.CapabilityOut>({ practice_available: false, practice_ready: false, ai_available: false, voice_available: false, plan: "free", consent: { practice_data: "required", practice_ai: "required" }, limits: null }),
   HintOut: all<T.HintOut>({ position: "frame", event_id: "", text: "", hints_used: 0, hints_available: 0 }),
   ClarificationRevealOut: all<T.ClarificationRevealOut>({ event_id: "", clarification_id: "", title: "", answer: "", already_revealed: false }),
   AssumptionIn: all<T.AssumptionIn>({ position: "frame", text: "" }),
   AssumptionOut: all<T.AssumptionOut>({ event_id: "" }),
   TurnIn: all<T.TurnIn>({ text: "" }),
   InterviewerOut: all<T.InterviewerOut>({ move: "", message: "", refs: [], coverage: [] }),
   TurnOut: all<T.TurnOut>({ event_ids: [], counters: COUNTERS, limits: LIMITS, interviewer: null }),
   SubmitIn: all<T.SubmitIn>({ diagram_version: 1, stage_versions: {} }),
   SubmitOut: all<T.SubmitOut>({ status: "submitted", submission_snapshot_id: "", evaluation: null }),
   SelfReviewIn: all<T.SelfReviewIn>({ version: 1, mark: "met", note: null }),
   SelfReviewOut: all<T.SelfReviewOut>({ dimension_id: "", mark: "met", note: null, version: 1 }),
   ReferenceSectionOut: all<T.ReferenceSectionOut>({ kind: "", title: "", body: [] }),
   ReferenceOut: all<T.ReferenceOut>({ sections: [], plan: "free" }),
   PreferenceIn: all<T.PreferenceIn>({ default_seniority: null, version: null }),
   PreferenceOut: all<T.PreferenceOut>({ default_seniority: null, version: 1 }),
   ConsentIn: all<T.ConsentIn>({ document_id: "practice-data", document_version: "" }),
   ConsentOut: all<T.ConsentOut>({ document_id: "", document_version: "", accepted_at: "", withdrawn_at: null }),
   GraphNode: all<T.GraphNode>(GRAPH_NODE),
   GraphEdge: all<T.GraphEdge>(GRAPH_EDGE),
   GraphBoundary: all<T.GraphBoundary>({ id: "", type: "region", label: "" }),
   ArchGraphIn: all<T.ArchGraph>(GRAPH_DOC as Required<T.ArchGraph>),
   ArchGraphOut: all<T.ArchGraph>(GRAPH_DOC as Required<T.ArchGraph>),
   ArchLayoutIn: all<T.ArchLayout>(LAYOUT_DOC),
   ArchLayoutOut: all<T.ArchLayout>(LAYOUT_DOC),
   Frame: all<T.Frame>({ x: 0, y: 0, w: 0, h: 0 }),
   Point: all<T.Point>({ x: 0, y: 0 }),
   Viewport: all<T.Viewport>({ x: 0, y: 0, zoom: 1 }),
   RetryInfo: all<T.RetryInfo>({ allowed: false, remaining: 0 }),
   DiagramPutIn: all<T.DiagramPutIn>({ version: 1, graph: GRAPH_DOC, layout: null }),
   Finding: all<T.Finding>({ rule: "", severity: "info", element_ids: [], basis_hash: "", state: "fresh" }),
   TombstoneOut: all<T.TombstoneOut>({ id: "", kind: "node", group: "", deleted_at_version: 1, element: {} }),
   DiagramOut: all<T.DiagramOut>({ version: 1, graph: GRAPH_DOC, layout: null, graph_hash: "", topology_hash: "", structure_findings: [], tombstones: [] }),
};

describe("the TypeScript types agree with the manifest's models", () => {
   it.each(Object.entries(SAMPLES))("%s has exactly the frozen fields", (name, keys) => {
      const properties = Object.keys(manifest.models[name].properties as object).sort();
      expect(keys).toEqual(properties);
   });

   it("covers every model the manifest freezes", () => {
      expect(Object.keys(SAMPLES).sort()).toEqual(Object.keys(manifest.models as object).sort());
   });
});

describe("the owner's final closure decisions (G-01 to G-09)", () => {
   const route = (id: string) => manifest.routes.find((entry) => entry.id === id)!;
   const model = (name: string) => manifest.models[name] as { properties: Record<string, { const?: unknown; minimum?: number; maximum?: number; exclusiveMinimum?: number }>; required?: string[] };

   it("answers the stage patch with the saved stage, the attempt with its detail, and the transitions with the attempt", () => {
      expect(ROUTE.patch_stage.response).toBe("StageWorkOut");
      expect(ROUTE.get_attempt.response).toBe("AttemptDetailOut");
      expect(ROUTE.list_attempts.response).toBe("AttemptListPage");
      for (const id of ["create_attempt", "reveal_attempt", "abandon_attempt"] as const) expect(ROUTE[id].response).toBe("AttemptOut");
      expect(ROUTE.reveal_attempt.request).toBe("RevealIn");
      expect(model("RevealIn").properties.confirm.const).toBe(true);
      expect(ROUTE.abandon_attempt).toMatchObject({ method: "POST", request: null, status: 200, idempotencyKey: false });
   });

   it("keeps the challenge to an allowlist with no reference and no unrevealed answer", () => {
      const allowlist = (manifest as unknown as { attempt_detail: { challenge_allowlist: Record<string, string[]> } }).attempt_detail.challenge_allowlist;
      expect(allowlist.challenge).toEqual(["title", "prompt", "stages", "clarifications"]);
      expect(allowlist.clarification_topic).toEqual(["clarification_id", "title"]);
      for (const name of ["ChallengeOut", "ChallengeStageOut", "ChallengeClarificationOut"]) {
         const keys = Object.keys(model(name).properties);
         for (const banned of ["reference", "solution", "sections", "answer", "rubric", "content_commit", "prompt_text"]) expect(keys).not.toContain(banned);
      }
   });

   it("deletes with 204 and no body", () => {
      for (const id of ["delete_attempt", "delete_all"] as const) expect(ROUTE[id]).toMatchObject({ status: 204, response: null });
   });

   it("types consent status, withdrawal and a stale version, without practice-voice", () => {
      expect(ROUTE.get_consent.response).toBe("ConsentStatusOut");
      expect(ROUTE.withdraw_consent).toMatchObject({ request: "ConsentWithdrawIn", response: "ConsentWithdrawOut" });
      expect(ERROR_STATUS.consent_version_stale).toBe(409);
      expect(JSON.stringify(manifest.models)).not.toContain("practice-voice");
   });

   it("bounds the layout numbers", () => {
      expect(model("Point").properties.x).toMatchObject({ minimum: -100000, maximum: 100000 });
      expect(model("Frame").properties.w).toMatchObject({ exclusiveMinimum: 0, maximum: 100000 });
      expect(model("Viewport").properties.zoom).toMatchObject({ minimum: 0.1, maximum: 4 });
      expect(manifest.diagram.layout_limits.max_bytes).toBe(65_536);
   });

   it("keeps the idempotency key on the self-mode turn", () => {
      expect(route("stage_turn").idempotency_key).toBe(true);
   });

   it("defines every export line type and keeps internals out of the payloads", () => {
      const lines = (manifest as unknown as { export: { line_models: Record<string, string>; record_types: string[] } }).export;
      expect(Object.keys(lines.line_models).sort()).toEqual(["attempt", "consent", "diagram", "diagram_snapshot", "event", "feedback", "header", "inventory_snapshot", "preference", "self_review", "stage_work", "submission_snapshot", "trailer"]);
      expect(Object.keys(model("ExportCounts").properties).sort()).toEqual([...lines.record_types].sort());
      for (const name of Object.keys(manifest.models).filter((entry) => entry.startsWith("Export"))) {
         const keys = Object.keys(model(name).properties);
         for (const banned of ["content_commit", "plan_at_start", "model_meta", "operation_id", "alias_map", "prompt_version", "rubric_version", "user_id"]) expect(keys).not.toContain(banned);
      }
   });

   it("lists what is still unspecified instead of calling it settled", () => {
      const open = (manifest as unknown as { open_items: Record<string, string>; gaps?: unknown }).open_items;
      expect(Object.keys(open).sort()).toEqual(["OI-01", "OI-02", "OI-03", "OI-04"]);
      expect((manifest as unknown as { gaps?: unknown }).gaps).toBeUndefined();
   });
});
