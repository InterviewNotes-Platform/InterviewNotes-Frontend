import type { ReactNode } from "react";
import { CONTROL_LABEL, HINT } from "@/lib/catalog/positionCopy";
import type { CatalogSection } from "@/lib/catalog/types";
import { ProblemReveal } from "@/components/problem/ProblemReveal";

interface HintSequenceProps {
   /** The sequence's hints in authored order; never empty. */
   hints: readonly CatalogSection[];
   /** The stage or unit the hints are for, as the controls and the closing line name it. */
   where: string;
   /** The stage or unit has a released reference to open, so the closing line points to it. */
   reference: boolean;
   /** This is the first sequence in presentation order, which carries the one explanatory line (S-HNT-8). */
   explain: boolean;
   body: (hint: CatalogSection) => ReactNode;
}

/**
 * Ordered hints as nested native disclosures (S-HNT-6, S-RVL-12b): one closed control, and each next control inside the hint
 * before it, so only one hint is ever offered and nothing needs JavaScript. A hint is its own section, so a fragment naming it
 * opens the sequence through it (S-RVL-9). Nothing counts, scores or is stored (S-HNT-9).
 */
export function HintSequence({ hints, where, reference, explain, body }: HintSequenceProps) {
   const step = (index: number): ReactNode => {
      const hint = hints[index];
      return (
         <ProblemReveal
            key={hint.id}
            label={index === 0 ? CONTROL_LABEL.hints : HINT.next}
            context={HINT.context(index + 1, where)}
            quiet
            nested={index > 0}
         >
            <p className="m-0 text-supporting font-semibold text-muted-foreground">{HINT.cue(index + 1, hints.length)}</p>
            <section id={hint.id} className="scroll-mt-28">
               {body(hint)}
            </section>
            {index + 1 < hints.length ? (
               step(index + 1)
            ) : (
               <p className="mt-4 mb-0 text-supporting text-muted-foreground">{HINT.closing(where, reference)}</p>
            )}
         </ProblemReveal>
      );
   };

   return (
      <>
         {explain ? <p className="mt-6 mb-0 text-supporting text-pretty text-muted-foreground">{HINT.explanation}</p> : null}
         {step(0)}
      </>
   );
}
