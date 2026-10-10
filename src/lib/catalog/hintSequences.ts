import type { CatalogSection } from "./types";

/** The unit stages (S-HNT-5): every section there is a unit, so a hint belongs to the unit it targets or to the stage. */
const UNIT_STAGES = new Set(["depth_and_trade_offs", "follow_ups"]);

export interface HintSequences {
   /** The stage-level sequence: a narrative stage's hints, or a unit stage's hints over withheld targets (X-1). */
   stage: CatalogSection[];
   /** A unit stage's hints by the id of the released unit they target; every list is in authored order. */
   units: ReadonlyMap<string, CatalogSection[]>;
}

/** A sequence's identity within a Problem: its stage, and its unit when it belongs to one. */
export const sequenceKey = (position: string, unit?: string) => (unit === undefined ? position : `${position}:${unit}`);

/**
 * Assigns the released `hints` placed in `position` (already in authored order) to their sequences (S-HNT-5), from the
 * hint's own `link` and one lookup in the stage's released `units`. In a unit stage a hint with no link, or whose released
 * target is not one of those units, is in no sequence: its place is not inferred (S-SPN-13).
 */
export function sequenceHints(position: string, hints: readonly CatalogSection[], units: readonly Pick<CatalogSection, "id">[]): HintSequences {
   if (!UNIT_STAGES.has(position)) return { stage: [...hints], units: new Map() };

   const released = new Set(units.map(({ id }) => id));
   const stage: CatalogSection[] = [];
   const byUnit = new Map<string, CatalogSection[]>();
   for (const hint of hints) {
      const { link } = hint;
      if (!link) continue;
      if (link.withheld || link.target === null) stage.push(hint);
      else if (released.has(link.target)) byUnit.set(link.target, [...(byUnit.get(link.target) ?? []), hint]);
   }
   return { stage, units: byUnit };
}
