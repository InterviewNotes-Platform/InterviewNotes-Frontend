/**
 * The editor's closed vocabulary (graph-editor-contract §3.2 to §3.4) with its product words: type and subtype names, the
 * shape size of each type, palette shortcuts, edge kinds, boundary types and the fixed, content-free explanation prompts.
 * The legal values come from `GRAPH` (the frozen contract); this file only names them.
 */

import { GRAPH, LAYOUT_BOUNDS } from "@/lib/practice-workspace/contract";
import type { BoundaryType, EdgeKind, NodeType } from "@/lib/practice-workspace/types";

export const LIMITS = GRAPH.limits;
export const LAYOUT_MAX_BYTES = GRAPH.layoutMaxBytes;
export { LAYOUT_BOUNDS };

/** Palette order and keys: Design D's six first (1 to 6), then the rest of the contract's types. */
export const NODE_TYPE_ORDER: readonly NodeType[] = ["client", "service", "gateway", "database", "queue", "model", "cache", "object_store", "worker", "external"];

export const NODE_TYPE: Readonly<Record<NodeType, { label: string; key: string; w: number; h: number }>> = {
   client: { label: "Client", key: "1", w: 136, h: 56 },
   service: { label: "Service", key: "2", w: 140, h: 56 },
   gateway: { label: "Gateway", key: "3", w: 140, h: 56 },
   database: { label: "Database", key: "4", w: 124, h: 72 },
   queue: { label: "Queue", key: "5", w: 150, h: 48 },
   model: { label: "Model", key: "6", w: 116, h: 76 },
   cache: { label: "Cache", key: "7", w: 124, h: 72 },
   object_store: { label: "Object store", key: "8", w: 124, h: 68 },
   worker: { label: "Worker", key: "9", w: 140, h: 56 },
   external: { label: "External system", key: "0", w: 140, h: 56 },
};

export const SUBTYPES: Readonly<Record<NodeType, readonly string[]>> = GRAPH.nodeTypes;

const SUBTYPE_LABEL: Readonly<Record<string, string>> = {
   web: "Web",
   mobile: "Mobile",
   partner: "Partner",
   batch_consumer: "Batch consumer",
   api: "API",
   backend: "Backend",
   orchestrator: "Orchestrator",
   scheduler: "Scheduler",
   api_gateway: "API gateway",
   load_balancer: "Load balancer",
   proxy: "Proxy",
   relational: "Relational",
   key_value: "Key-value",
   document: "Document",
   vector: "Vector",
   search: "Search",
   graph: "Graph",
   columnar: "Columnar",
   in_memory: "In-memory",
   edge: "Edge",
   semantic: "Semantic",
   kv_cache: "KV cache",
   queue: "Queue",
   stream: "Stream",
   object_store: "Object store",
   llm: "LLM",
   embedding: "Embedding",
   classifier: "Classifier",
   reranker: "Reranker",
   speech: "Speech",
   batch: "Batch",
   stream_processor: "Stream processor",
   gpu_worker: "GPU worker",
   third_party_api: "Third-party API",
   saas: "SaaS",
};

export const subtypeLabel = (subtype: string): string => SUBTYPE_LABEL[subtype] ?? subtype;

export const isLegalSubtype = (type: NodeType, subtype: string | null | undefined): boolean => subtype == null || SUBTYPES[type].includes(subtype);

export const EDGE_KINDS: readonly EdgeKind[] = GRAPH.edgeKinds;

export const EDGE_KIND_LABEL: Readonly<Record<EdgeKind, string>> = {
   request: "Request",
   async_message: "Async message",
   read: "Read",
   write: "Write",
   stream: "Stream",
   batch: "Batch",
};

export const BOUNDARY_TYPES: readonly BoundaryType[] = GRAPH.boundaryTypes;

export const BOUNDARY_TYPE_LABEL: Readonly<Record<BoundaryType, string>> = {
   region: "Region",
   tenant: "Tenant",
   trust: "Trust boundary",
   network: "Network",
   group: "Group",
};

/** Fixed product copy (contract §5.3): they ask, and never name a technology, a number or a design choice. */
export const NODE_PROMPTS: readonly string[] = ["What is this component responsible for?", "What does it receive, and what does it produce?", "What happens when it fails?"];
export const EDGE_PROMPTS: readonly string[] = ["Why does this connection exist?", "What is sent? What comes back?", "What happens on failure?"];

/** The palette's accessible name for adding one component of a type: "Add database", "Add external system". */
export const addLabel = (type: NodeType): string => `Add ${NODE_TYPE[type].label.toLowerCase()}`;
/** A lower-case type name with its article, for announcements: "a database", "an object store". */
export const withArticle = (type: NodeType): string => {
   const name = NODE_TYPE[type].label.toLowerCase();
   return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
};
export const nodeName = (label: string | undefined, type: NodeType): string => (label && label.trim() !== "" ? label.trim() : `Unnamed ${NODE_TYPE[type].label.toLowerCase()}`);
export const boundaryName = (label: string | undefined, type: BoundaryType): string => (label && label.trim() !== "" ? label.trim() : `Unnamed ${BOUNDARY_TYPE_LABEL[type].toLowerCase()}`);
