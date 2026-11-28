import { linkableEntries } from "./routes";
import type { CatalogItemPage, CatalogResult } from "./types";

/**
 * The curriculum lead's proposed reading order for each role, as item ids (curriculum session, 2026-11-28; not yet
 * owner-approved). Only ids live here: every title and route shown comes from the public catalog, so an id that is not
 * published to the visitor's environment shows nothing, and a role with no published item is not offered.
 */
export const ROLE_PATHS = [
   {
      key: "ml-engineer",
      label: "ML Engineer",
      ids: [
         "lesson.role-guide-ml-engineer",
         "lesson.ml-ai-interview-loops",
         "lesson.framing-an-ml-problem",
         "lesson.labels-leakage-and-feedback-loops",
         "lesson.offline-metrics-and-calibration",
         "lesson.model-won-offline-lost-online",
         "lesson.multi-stage-recommendation",
         "problem.marketplace-feed-ranking",
         "problem.payment-fraud-detection-with-review",
         "problem.coding-classification-and-ranking-metrics",
      ],
   },
   {
      key: "ai-engineer",
      label: "AI / LLM Engineer",
      ids: [
         "lesson.role-guide-ai-engineer",
         "lesson.ml-ai-interview-loops",
         "lesson.evaluating-generated-output",
         "lesson.containing-model-failure",
         "lesson.prompt-injection-through-retrieved-content",
         "lesson.anatomy-of-a-model-request",
         "lesson.serving-within-a-latency-and-cost-budget",
         "knowledge.comparing-system-versions-on-an-eval-set",
         "knowledge.kv-cache",
         "lesson.evaluating-retrieval-and-grounded-answers",
         "problem.coding-token-budget-context-packer",
         "problem.coding-structured-output-validator",
         "problem.llm-assisted-product-categorization",
      ],
   },
   {
      key: "mlops-engineer",
      label: "MLOps / ML Platform Engineer",
      ids: [
         "lesson.role-guide-mlops-engineer",
         "lesson.ml-ai-interview-loops",
         "lesson.feature-stores-offline-and-online",
         "lesson.training-serving-skew",
         "lesson.reproducible-training",
         "lesson.model-registry-and-promotion",
         "lesson.monitoring-drift-and-delayed-labels",
         "lesson.progressive-model-rollout",
         "problem.feature-platform-for-real-time-fraud",
         "problem.monitoring-with-delayed-labels",
         "problem.model-registry-for-many-teams",
      ],
   },
] as const;

/** A short list, not a curriculum: the role guide and Tracks carry the rest. */
export const ROLE_ITEMS_SHOWN = 4;

/** The largest page the catalog list endpoint serves; one read covers today's catalog. */
export const ROLE_LIST_LIMIT = 100;

export interface HomeRoleItem {
   id: string;
   title: string;
   href: string;
}

export interface HomeRole {
   key: string;
   label: string;
   items: HomeRoleItem[];
}

/**
 * The roles to offer, each with its first published items in the proposed order. Built only from the public list read
 * (no session), so nothing unpublished or private can appear; a failed read offers no role at all.
 */
export function homeRoles(result: CatalogResult<CatalogItemPage>): HomeRole[] {
   if (result.status !== "ok") return [];
   const published = new Map(
      linkableEntries(result.data.items)
         .filter(({ entry }) => entry.title.trim() !== "")
         .map(({ entry, href }) => [entry.id, { id: entry.id, title: entry.title.trim(), href }])
   );
   return ROLE_PATHS.map(({ key, label, ids }) => ({
      key,
      label,
      items: [...new Set(ids)].flatMap((id) => published.get(id) ?? []).slice(0, ROLE_ITEMS_SHOWN),
   })).filter((role) => role.items.length > 0);
}
