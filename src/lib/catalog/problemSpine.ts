import { sequenceHints, sequenceKey } from "./hintSequences";
import { NEUTRAL_REGION_LABEL, POSITION_COPY } from "./positionCopy";
import type { CatalogItem, CatalogSection, CatalogSpineEntry } from "./types";

export type ProblemRole =
   | "challenge"
   | "hints"
   | "clarifications"
   | "assumptions"
   | "stageReference"
   | "units"
   | "followUps"
   | "reference"
   | "alternatives"
   | "expectations"
   | "rubric"
   | "mistakes";

/** The challenge-facing set (S-SPN-10, §4.5): by type, never per Problem. Every other type starts closed. */
export const CHALLENGE_FACING: ReadonlySet<string> = new Set(["prompt"]);

/**
 * Role groups inside each position, in presentation order (S-ORD-2, §4.6). Presentation only: the backend owns where a
 * section sits, this only decides how a position's own sections are grouped. Bound to the spec table by a test.
 */
export const ROLE_GROUPS: Readonly<Record<string, readonly ProblemRole[]>> = {
   frame: ["challenge", "hints", "clarifications", "assumptions", "stageReference"],
   requirements: ["hints", "stageReference"],
   design: ["hints", "stageReference"],
   ml_reasoning: ["hints", "stageReference"],
   evaluate_and_scale: ["hints", "stageReference"],
   depth_and_trade_offs: ["hints", "units"],
   follow_ups: ["hints", "followUps"],
   reference_solution: ["reference", "alternatives"],
   self_review: ["expectations", "rubric", "mistakes"],
};

// A type with no entry is stage reference, which is also where a known position puts a type it has no group for.
const ROLE_OF_TYPE = new Map<string, ProblemRole>([
   ["hint", "hints"],
   ["clarification", "clarifications"],
   ["assumption", "assumptions"],
   ["deep_dive", "units"],
   ["trade_offs", "units"],
   ["follow_ups", "followUps"],
   ["reference_design", "reference"],
   ["alternative", "alternatives"],
   ["level_expectations", "expectations"],
   ["rubric_dimension", "rubric"],
   ["common_mistakes", "mistakes"],
]);

const roleOf = (type: string): ProblemRole => (CHALLENGE_FACING.has(type) ? "challenge" : (ROLE_OF_TYPE.get(type) ?? "stageReference"));

export interface ProblemRoleGroup {
   role: ProblemRole;
   sections: CatalogSection[];
}

export interface ProblemStage {
   /** Page-level id. `_` keeps it from colliding with a section id, which is kebab-case (P1 §3). */
   id: string;
   kind: "interview_stage" | "review_surface" | "neutral";
   /** The backend's position id; none for the neutral region. */
   position: string | null;
   label: string;
   intent: string | null;
   /** Among the shown interview stages, withheld ones included; none for a review surface and the neutral region. */
   step: { position: number; total: number } | null;
   /** The backend reported withheld material in this interview stage (X-2). Never set for a review surface. */
   withheld: boolean;
   /** Non-empty role groups in presentation order, each in authored order. A unit stage's hints group holds only its stage-level sequence. */
   groups: ProblemRoleGroup[];
   /** A unit stage's hint sequences by the id of the released unit they belong to (S-HNT-5); empty elsewhere. */
   unitHints: ReadonlyMap<string, CatalogSection[]>;
}

const UNIT_ROLES: ReadonlySet<ProblemRole> = new Set(["units", "followUps"]);

/** Splits a stage's hints group into its stage-level sequence and its units' sequences; a hint that fits neither is dropped. */
function withHintSequences(position: string, groups: ProblemRoleGroup[]): Pick<ProblemStage, "groups" | "unitHints"> {
   const hints = groups.find(({ role }) => role === "hints")?.sections ?? [];
   const units = groups.find(({ role }) => UNIT_ROLES.has(role))?.sections ?? [];
   const { stage, units: unitHints } = sequenceHints(position, hints, units);
   return {
      groups: groups.flatMap((group) => (group.role !== "hints" ? [group] : stage.length > 0 ? [{ role: group.role, sections: stage }] : [])),
      unitHints,
   };
}

/**
 * The first hint sequence in presentation order (S-HNT-8): stage by stage as composed, then role group, then unit; never
 * the document's authored order. Null when the Problem shows no hint.
 */
export function firstHintSequence(stages: readonly ProblemStage[]): string | null {
   for (const { position, groups, unitHints } of stages) {
      if (position === null) continue;
      for (const { role, sections } of groups) {
         if (role === "hints") return sequenceKey(position);
         const unit = UNIT_ROLES.has(role) ? sections.find(({ id }) => unitHints.has(id)) : undefined;
         if (unit) return sequenceKey(position, unit.id);
      }
   }
   return null;
}

export interface ProblemComposition {
   interview: ProblemStage[];
   review: ProblemStage[];
   /** Released material with no usable position, shown closed after the review surfaces; null when there is none. */
   neutral: ProblemStage | null;
}

function groupsOf(position: string, members: readonly CatalogSection[]): ProblemRoleGroup[] {
   const order = ROLE_GROUPS[position];
   const buckets = new Map<ProblemRole, CatalogSection[]>();
   for (const member of members) {
      const wanted = roleOf(member.type);
      const role = order.includes(wanted) ? wanted : "stageReference";
      buckets.set(role, [...(buckets.get(role) ?? []), member]);
   }
   const roles = order.includes("stageReference") ? order : [...order, "stageReference" as const];
   return roles.flatMap((role) => (buckets.has(role) ? [{ role, sections: buckets.get(role)! }] : []));
}

/**
 * Composes a Problem from the backend's `spine` and each section's `spine_position` (S-SPN-15). Entries keep the order
 * the backend sent; nothing is derived from a section's type except its role inside a position. A stage or section
 * exists only if `spine` and the released sections support it. Order between positions is the spine's; inside a role
 * group it is authored order (the API's).
 *
 * An entry the frontend has no copy for is not rendered or counted. A non-hint section without a matching entry, or an
 * older backend's section without a position, goes to the neutral region. A released hint without a matching interview
 * stage is not rendered: showing it elsewhere would put a hint outside its stage (S-SPN-13).
 */
export function composeProblem({ sections, spine }: Pick<CatalogItem, "sections" | "spine">): ProblemComposition {
   const entries = new Map<string, CatalogSpineEntry>();
   for (const entry of spine ?? []) {
      if (POSITION_COPY.has(entry.position) && !entries.has(entry.position)) entries.set(entry.position, entry);
   }

   const placed = new Map<string, CatalogSection[]>();
   const loose: CatalogSection[] = [];
   for (const section of sections) {
      const entry = section.spine_position ? entries.get(section.spine_position) : undefined;
      const isHint = section.type === "hint";
      if (entry && (!isHint || entry.kind === "interview_stage")) placed.set(entry.position, [...(placed.get(entry.position) ?? []), section]);
      else if (!isHint) loose.push(section);
   }

   const stages = [...entries.values()].filter(({ kind }) => kind === "interview_stage");
   const stageOf = (entry: CatalogSpineEntry, step: ProblemStage["step"]): ProblemStage => ({
      id: `problem_${entry.position}`,
      kind: entry.kind,
      position: entry.position,
      label: POSITION_COPY.get(entry.position)!.label,
      intent: POSITION_COPY.get(entry.position)!.intent,
      step,
      withheld: entry.kind === "interview_stage" && entry.withheld === true,
      ...withHintSequences(entry.position, groupsOf(entry.position, placed.get(entry.position) ?? [])),
   });

   return {
      interview: stages.map((entry, index) => stageOf(entry, { position: index + 1, total: stages.length })),
      review: [...entries.values()]
         .filter(({ kind, position }) => kind === "review_surface" && placed.has(position))
         .map((entry) => stageOf(entry, null)),
      neutral: loose.length
         ? {
              id: "problem_more",
              kind: "neutral",
              position: null,
              label: NEUTRAL_REGION_LABEL,
              intent: null,
              step: null,
              withheld: false,
              groups: [{ role: "stageReference", sections: loose }],
              unitHints: new Map(),
           }
         : null,
   };
}
