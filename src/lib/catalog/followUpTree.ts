import { linkDisplay } from "./linkDisplay";
import type { CatalogSection } from "./types";

export interface FollowUpTree {
   /** The follow-ups shown on their own, in authored order: no link, a probes link, or a withheld target (S-FUP-6). */
   top: CatalogSection[];
   /** A top-level follow-up's branches by its id, in authored order (S-FUP-5). */
   branches: ReadonlyMap<string, CatalogSection[]>;
}

/**
 * Splits a stage's released follow-ups into top-level ones and their branches: two levels, and no other (S-LNK-9). A
 * follow-up is a branch only when its link reads as one (a released follow-up target, §6.5) and that target is itself
 * top-level in this list; any other follow-up stays top-level, so none is hidden. Nothing here follows a link twice.
 */
export function followUpTree(followUps: readonly CatalogSection[], released: readonly CatalogSection[]): FollowUpTree {
   const parents = new Map(followUps.map((followUp) => [followUp.id, linkDisplay(followUp, released).under]));
   const topIds = new Set([...parents].filter(([, parent]) => parent === null).map(([id]) => id));

   const top: CatalogSection[] = [];
   const branches = new Map<string, CatalogSection[]>();
   for (const followUp of followUps) {
      const parent = parents.get(followUp.id) ?? null;
      if (parent !== null && topIds.has(parent)) branches.set(parent, [...(branches.get(parent) ?? []), followUp]);
      else top.push(followUp);
   }
   return { top, branches };
}
