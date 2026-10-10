import { POSITION_COPY } from "./positionCopy";
import { problemSectionHeading } from "./problem";
import type { CatalogSection } from "./types";

/** The generic phrase of a withheld link, one per source: it never implies the target's type (spec §6.5). */
export const WITHHELD_LINK = {
   follow_ups: "Linked to material included with full access",
   assumption: "Conditions: material included with full access",
   alternative: "Alternative to: material included with full access",
   rubric_dimension: "Mostly evaluates: material included with full access",
} as const;

// The narrative stages (spec §6.5): a follow-up that probes a section there probes the stage.
const NARRATIVE_STAGES = new Set(["frame", "requirements", "design", "ml_reasoning", "evaluate_and_scale"]);
const PROBED_UNITS = new Set(["assumption", "deep_dive", "trade_offs"]);

export interface LinkDisplay {
   /** The line to show; null when the source shows none (a hint never shows its target). */
   text: string | null;
   /** The line is a withheld indication: it carries the premium mark and is read as requiring access (S-AX-7). */
   withheld: boolean;
   /** The id of the follow-up this one renders under, as its branch; null for a top-level follow-up and every other source. */
   under: string | null;
}

type Source = Pick<CatalogSection, "type" | "link">;
type Target = Pick<CatalogSection, "id" | "type" | "title" | "spine_position">;

const NONE: LinkDisplay = { text: null, withheld: false, under: null };
const line = (text: string | null): LinkDisplay => (text === null ? NONE : { text, withheld: false, under: null });

const stageLabel = (target: Target) => (target.spine_position ? (POSITION_COPY.get(target.spine_position)?.label ?? null) : null);
const headingLine = (prefix: string, target: Target) => {
   const heading = problemSectionHeading(target);
   return line(heading === null ? null : `${prefix}: ${heading}`);
};

/**
 * How a section's link reads, one hop only (S-LNK-11a), from the table of spec §6.5. `sections` are the released sections
 * the target is looked up in; a link whose target is not among them, or that no row covers, shows nothing.
 */
export function linkDisplay(source: Source, sections: readonly Target[]): LinkDisplay {
   const { link, type } = source;
   if (!link || type === "hint") return NONE;
   if (link.withheld || link.target === null) {
      const text = WITHHELD_LINK[type as keyof typeof WITHHELD_LINK];
      return text ? { text, withheld: true, under: null } : NONE;
   }

   const target = sections.find(({ id }) => id === link.target);
   if (!target) return NONE;
   switch (type) {
      case "follow_ups": {
         if (target.type === "follow_ups") return { text: null, withheld: false, under: target.id };
         if (PROBED_UNITS.has(target.type)) return headingLine("Probes", target);
         const stage = target.spine_position && NARRATIVE_STAGES.has(target.spine_position) ? stageLabel(target) : null;
         return line(stage && `Probes: ${stage}`);
      }
      case "assumption":
         return headingLine("Conditions", target);
      case "alternative":
         return target.type === "reference_design" ? line("Alternative to: the reference solution") : headingLine("Alternative to", target);
      case "rubric_dimension": {
         const stage = stageLabel(target);
         return line(stage && `Mostly evaluates: ${stage}`);
      }
      default:
         return NONE;
   }
}
