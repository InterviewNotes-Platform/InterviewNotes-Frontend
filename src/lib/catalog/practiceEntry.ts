import { parseBlocks, type Block } from "@/components/catalog/blocks";
import { SENIORITY_ORDER } from "./positionCopy";
import type { CatalogItem } from "./types";

/**
 * The seniorities a Problem is written to, for the practice entry (P9-OD-07, spec §3 "Seniority"): the learner picks one the Problem
 * targets, and a seniority with no bar is never offered (practice-ready minimum PR-9). It reads only what the reader already holds for this
 * caller (`level_expectations` and `rubric_dimension` sections the API released) and asks for nothing else, so it fetches no hidden
 * reference material. A seniority counts as targeted when some released section has a `bar` written for it; an unattributed bar names no
 * seniority, so it adds none. No Track label maps to a seniority here, or anywhere in P9.
 *
 * Returns them in the P4 presentation order. Empty when the released sections declare none (for example, the bars are withheld from this
 * caller): the entry then does not appear, because it cannot say which seniority is applicable. The server remains the authority and
 * refuses an untargeted one regardless of what this returns.
 */
export function targetedSeniorities(item: Pick<CatalogItem, "sections">): string[] {
   const found = new Set<string>();
   const visit = (blocks: Block[]) => {
      for (const block of blocks) {
         if (block.type === "part") {
            if (block.name === "bar" && block.seniority !== null) found.add(block.seniority);
         }
      }
   };
   for (const section of item.sections) {
      if (section.type !== "level_expectations" && section.type !== "rubric_dimension") continue;
      if (section.body.format === "markdown@1") visit(parseBlocks(section.body.text));
   }
   return SENIORITY_ORDER.filter((seniority) => found.has(seniority));
}
