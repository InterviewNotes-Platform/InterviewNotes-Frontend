/**
 * The frozen M1 contract of `/me/practice` as the frontend uses it (P9-T06; 25 routes after the owner's final closure). It repeats, in code, what backend
 * `app/practice/contract.py` froze in `m1-contract-manifest.json`; `contract.test.ts` checks every line against that
 * file and the file against `M1_MANIFEST_SHA256`. The frontend never decides availability: the backend does.
 *
 * Hashing method (approved for T06): the manifest as UTF-8 JSON, object keys sorted recursively, array order kept,
 * compact separators, no trailing newline, SHA-256 over those exact bytes. The stored file holds those bytes.
 */

import type { EdgeKind, BoundaryType, NodeType } from "./types";

/** The SHA-256 the T13 and T14 records cite. Changing any shape needs an owner-recorded amendment and a new hash. */
export const M1_MANIFEST_SHA256 = "91a70c7d78bb0f8afb9382c9392f8fc07a8202784a09a8e587960425573dfcfe";

export const PRACTICE_PREFIX = "/me/practice";
export const CONTENT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export type RouteId =
   | "capability"
   | "create_attempt"
   | "list_attempts"
   | "get_attempt"
   | "patch_stage"
   | "get_diagram"
   | "put_diagram"
   | "stage_hint"
   | "reveal_clarification"
   | "add_assumption"
   | "stage_turn"
   | "submit_attempt"
   | "reveal_attempt"
   | "abandon_attempt"
   | "get_reference"
   | "put_self_review"
   | "delete_attempt"
   | "export_attempt"
   | "get_preference"
   | "put_preference"
   | "export_all"
   | "delete_all"
   | "get_consent"
   | "post_consent"
   | "withdraw_consent";

export interface RouteDef {
   id: RouteId;
   method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
   /** Under `PRACTICE_PREFIX`; `{name}` marks a path parameter. */
   path: string;
   /** The request body model, or null. */
   request: string | null;
   /** The response model, or null when the spec names none (the answer is 204 or the body is streamed), the body is streamed, or there is no body. */
   response: string | null;
   status: number;
   idempotencyKey: boolean;
   mediaType: "application/json" | "application/x-ndjson";
}

const A = "/attempts/{attempt_id}";

function route(id: RouteId, method: RouteDef["method"], path: string, request: string | null, response: string | null, status = 200, idempotencyKey = false, mediaType: RouteDef["mediaType"] = "application/json"): RouteDef {
   return { id, method, path, request, response, status, idempotencyKey, mediaType };
}

export const M1_ROUTES: readonly RouteDef[] = [
   route("capability", "GET", "/capability", null, "CapabilityOut"),
   route("create_attempt", "POST", "/attempts", "CreateAttemptIn", "AttemptOut", 201, true),
   route("list_attempts", "GET", "/attempts", null, "AttemptListPage"),
   route("get_attempt", "GET", A, null, "AttemptDetailOut"),
   route("patch_stage", "PATCH", `${A}/stages/{position}`, "StagePatchIn", "StageWorkOut"),
   route("get_diagram", "GET", `${A}/diagram`, null, "DiagramOut"),
   route("put_diagram", "PUT", `${A}/diagram`, "DiagramPutIn", "DiagramOut"),
   route("stage_hint", "POST", `${A}/stages/{position}/hint`, null, "HintOut"),
   route("reveal_clarification", "POST", `${A}/clarifications/{clarification_id}/reveal`, null, "ClarificationRevealOut"),
   route("add_assumption", "POST", `${A}/assumptions`, "AssumptionIn", "AssumptionOut"),
   route("stage_turn", "POST", `${A}/stages/{position}/turn`, "TurnIn", "TurnOut", 200, true),
   route("submit_attempt", "POST", `${A}/submit`, "SubmitIn", "SubmitOut", 200, true),
   route("reveal_attempt", "POST", `${A}/reveal`, "RevealIn", "AttemptOut"),
   route("abandon_attempt", "POST", `${A}/abandon`, null, "AttemptOut"),
   route("get_reference", "GET", `${A}/reference`, null, "ReferenceOut"),
   route("put_self_review", "PUT", `${A}/self-review/{dimension_id}`, "SelfReviewIn", "SelfReviewOut"),
   route("delete_attempt", "DELETE", A, null, null, 204),
   route("export_attempt", "GET", `${A}/export`, null, null, 200, false, "application/x-ndjson"),
   route("get_preference", "GET", "/preference", null, "PreferenceOut"),
   route("put_preference", "PUT", "/preference", "PreferenceIn", "PreferenceOut"),
   route("export_all", "GET", "/export", null, null, 200, false, "application/x-ndjson"),
   route("delete_all", "DELETE", "", null, null, 204),
   route("get_consent", "GET", "/consent", null, "ConsentStatusOut"),
   route("post_consent", "POST", "/consent", "ConsentIn", "ConsentOut"),
   route("withdraw_consent", "POST", "/consent/withdraw", "ConsentWithdrawIn", "ConsentWithdrawOut"),
];

export const ROUTE: Readonly<Record<RouteId, RouteDef>> = Object.fromEntries(M1_ROUTES.map((entry) => [entry.id, entry])) as Record<RouteId, RouteDef>;

/** The registered M1 error codes and their statuses (spec §6.2 and the P7 envelope). An unknown code is never trusted. */
export const ERROR_STATUS = {
   unauthenticated: 401,
   not_found: 404,
   validation_error: 422,
   version_conflict: 409,
   internal_error: 500,
   ai_consent_required: 403,
   consent_version_stale: 409,
   practice_disabled: 403,
   practice_not_ready: 409,
   attempt_not_active: 409,
   invalid_transition: 409,
   attempt_limit_reached: 409,
   stage_not_available: 404,
   graph_invalid: 422,
   graph_too_large: 413,
   content_withdrawn: 410,
   reference_not_available: 409,
   idempotency_conflict: 409,
   request_in_progress: 409,
   entitlement_unavailable: 503,
} as const;

export type PracticeErrorCode = keyof typeof ERROR_STATUS;

export function isPracticeErrorCode(value: unknown): value is PracticeErrorCode {
   return typeof value === "string" && Object.hasOwn(ERROR_STATUS, value);
}

/** The closed vocabularies and limits of `in.arch-graph/1` and `in.arch-layout/1` (graph-editor-contract §3 and §4). */
export const GRAPH = {
   graphSchema: "in.arch-graph/1",
   layoutSchema: "in.arch-layout/1",
   nodeTypes: {
      client: ["web", "mobile", "partner", "batch_consumer"],
      service: ["api", "backend", "orchestrator", "scheduler"],
      gateway: ["api_gateway", "load_balancer", "proxy"],
      database: ["relational", "key_value", "document", "vector", "search", "graph", "columnar"],
      cache: ["in_memory", "edge", "semantic", "kv_cache"],
      queue: ["queue", "stream"],
      object_store: ["object_store"],
      model: ["llm", "embedding", "classifier", "reranker", "speech"],
      worker: ["batch", "stream_processor", "gpu_worker"],
      external: ["third_party_api", "saas"],
   } satisfies Record<NodeType, readonly string[]>,
   edgeKinds: ["request", "async_message", "read", "write", "stream", "batch"] satisfies EdgeKind[],
   boundaryTypes: ["region", "tenant", "trust", "network", "group"] satisfies BoundaryType[],
   idPatterns: {
      node: /^n_[0-9A-HJKMNP-TV-Z]{26}$/,
      edge: /^e_[0-9A-HJKMNP-TV-Z]{26}$/,
      boundary: /^b_[0-9A-HJKMNP-TV-Z]{26}$/,
   },
   limits: {
      max_nodes: 60,
      max_edges: 120,
      max_boundaries: 12,
      max_label: 40,
      max_tag: 24,
      max_explanation: 600,
      max_total_explanation: 12_000,
      max_unbroken_run: 256,
      max_retired_ids: 500,
      max_tombstoned_elements: 100,
   },
   layoutMaxBytes: 65_536,
} as const;

/** Layout number bounds (G-07): finite coordinates, positive sizes, a zoom range. The server enforces them; an editor clamps to them. */
export const LAYOUT_BOUNDS = {
   coordinateMin: -100_000,
   coordinateMax: 100_000,
   sizeMax: 100_000,
   zoomMin: 0.1,
   zoomMax: 4,
} as const;
