import type { LinkedMeta } from "./lesson";
import { linkableEntries } from "./routes";
import type { CatalogCategory, CatalogMeta, CatalogSection } from "./types";

export interface ProblemPhase {
   id: string;
   label: string;
   /** Position among the phases being shown, so a Problem without an ML phase counts 1..5; none for the unclassified remainder. */
   step: { position: number; total: number } | null;
   sections: CatalogSection[];
}

// Page-level ids use `_`, which a section id (kebab-case, P1 §3) never contains, so they cannot collide with one.
const PHASES: readonly { id: string; label: string; types: readonly string[] }[] = [
   { id: "problem_frame", label: "Frame", types: ["prompt", "scope_clarification"] },
   { id: "problem_requirements", label: "Requirements", types: ["functional_requirements", "non_functional_requirements", "constraints"] },
   { id: "problem_design", label: "Design", types: ["core_entities", "interfaces", "high_level_design"] },
   { id: "problem_ml", label: "ML Reasoning", types: ["ml_objective", "data", "features", "labels", "model", "training", "inference"] },
   { id: "problem_evaluate", label: "Evaluate & Scale", types: ["evaluation", "integration", "production_scaling"] },
   { id: "problem_depth", label: "Depth & Trade-offs", types: ["deep_dive", "trade_offs"] },
];
const MORE = { id: "problem_more", label: "More" };

const PHASE_OF_TYPE = new Map(PHASES.flatMap(({ types }, index) => types.map((type) => [type, index] as const)));

/**
 * The phases that have sections, in the fixed phase order, each with its sections in the API's order (which is the
 * authored order, P1 §6.2). A type outside the mapping goes to More, never dropped and never classified further.
 */
export function phasesOf(sections: readonly CatalogSection[]): ProblemPhase[] {
   const buckets = [...PHASES, MORE].map((phase) => ({ ...phase, sections: [] as CatalogSection[] }));
   for (const section of sections) buckets[PHASE_OF_TYPE.get(section.type) ?? PHASES.length].sections.push(section);
   const present = buckets.filter(({ sections: members }) => members.length > 0);
   const total = present.filter(({ id }) => id !== MORE.id).length;
   let position = 0;
   return present.map(({ id, label, sections: members }) => ({
      id,
      label,
      step: id === MORE.id ? null : { position: (position += 1), total },
      sections: members,
   }));
}

const SECTION_LABEL = new Map<string, string>([
   ["prompt", "Prompt"],
   ["scope_clarification", "Scope clarification"],
   ["functional_requirements", "Functional requirements"],
   ["non_functional_requirements", "Non-functional requirements"],
   ["constraints", "Constraints"],
   ["core_entities", "Core entities"],
   ["interfaces", "Interfaces"],
   ["high_level_design", "High-level design"],
   ["ml_objective", "ML objective"],
   ["data", "Data"],
   ["features", "Features"],
   ["labels", "Labels"],
   ["model", "Model"],
   ["training", "Training"],
   ["inference", "Inference"],
   ["evaluation", "Evaluation"],
   ["integration", "Integration"],
   ["production_scaling", "Production and scaling"],
   ["deep_dive", "Deep dive"],
   ["trade_offs", "Trade-offs"],
   ["reference_design", "Reference design"],
   ["common_mistakes", "Common mistakes"],
   ["follow_ups", "Follow-ups"],
   ["level_expectations", "Level expectations"],
]);

/** A section's own title, else its type's name; an untitled section of an unknown type has no heading. */
export function problemSectionHeading(section: Pick<CatalogSection, "type" | "title">): string | null {
   return section.title?.trim() || SECTION_LABEL.get(section.type) || null;
}

const CATEGORY_LABEL = new Map<string, string>([
   ["system_design", "System design"],
   ["ml_system_design", "ML system design"],
]);

/** The friendly name of a Problem category; none for null, a Knowledge category or any other value. */
export function problemCategoryLabel(category: CatalogCategory | string | null | undefined): string | null {
   return (category && CATEGORY_LABEL.get(category)) || null;
}

export interface PreparationGroup {
   id: string;
   label: string;
   rows: LinkedMeta[];
}

export interface ProblemRelations {
   /** What to read or review first: prerequisite Lessons and Knowledge, then the Knowledge this Problem applies. */
   preparation: PreparationGroup[];
   knowledge: LinkedMeta[];
   lessons: LinkedMeta[];
   problems: LinkedMeta[];
}

// The closed P1 vocabulary (§6.5) minus the two relations that make preparation. Inline `mentions` are never returned.
const RELATED_KEYS = new Set(["applied_in", "prerequisite_of", "related"]);

/**
 * Sorts the relation payload from metadata alone; order within a relation is the API's. A target appears once, in
 * preparation if it is a prerequisite or applied Knowledge, else under its type. Unlinkable targets, a Problem named as
 * a prerequisite, unknown relation names and the item itself are dropped. Nothing here is requested or inferred.
 */
export function problemRelations(relations: Record<string, CatalogMeta[]>, selfId: string): ProblemRelations {
   const seen = new Set([selfId]);
   const take = (name: string, types: readonly CatalogMeta["type"][]) =>
      linkableEntries(relations[name] ?? []).filter(({ entry }) => {
         if (!types.includes(entry.type) || seen.has(entry.id)) return false;
         seen.add(entry.id);
         return true;
      });

   const preparation = [
      { id: "problem_prerequisites", label: "Prerequisites", rows: take("prerequisite", ["lesson", "knowledge"]) },
      { id: "problem_applies", label: "Knowledge applied", rows: take("applies", ["knowledge"]) },
   ].filter(({ rows }) => rows.length > 0);

   const rest: Record<CatalogMeta["type"], LinkedMeta[]> = { knowledge: [], lesson: [], problem: [] };
   for (const name of Object.keys(relations)) {
      if (RELATED_KEYS.has(name)) for (const link of take(name, ["knowledge", "lesson", "problem"])) rest[link.entry.type].push(link);
   }
   return { preparation, knowledge: rest.knowledge, lessons: rest.lesson, problems: rest.problem };
}
