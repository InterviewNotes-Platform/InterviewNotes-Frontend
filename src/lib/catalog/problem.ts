import type { LinkedMeta } from "./lesson";
import { linkableEntries } from "./routes";
import type { CatalogCategory, CatalogMeta, CatalogSection } from "./types";

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
