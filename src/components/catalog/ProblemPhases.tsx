import { problemSectionHeading, type ProblemPhase } from "@/lib/catalog/problem";
import { cn } from "@/lib/utils";
import { CatalogBody } from "./CatalogBody";

// Problem sections carry no API headings; reading mode still gives diagrams their natural size and keeps links from prefetching.
const READING = { headings: [] } as const;

/**
 * What the API released as a reasoning sequence: each phase is a labelled group with a quiet step cue and a title, and
 * its sections are plain h2 blocks in the API's order, set apart by whitespace and a hairline, never boxed. The cue and
 * the title are text, not headings, so the Problem's sections are the page's h2s. The phase's top is the anchor the
 * phase navigation jumps to: a focus target that clears the sticky header.
 */
export function ProblemPhases({ phases, stayOnDeployment }: { phases: ProblemPhase[]; stayOnDeployment: boolean }) {
   return (
      <>
         {phases.map((phase, index) => (
            <section key={phase.id} aria-labelledby={`${phase.id}_title`} className={cn(index > 0 && "mt-16 border-t border-border pt-12")}>
               <div id={phase.id} tabIndex={-1} className="scroll-mt-28 rounded-sm">
                  {phase.step ? (
                     <p className="m-0 mb-1 text-supporting font-semibold uppercase tracking-wide text-muted-foreground">
                        {`Step ${phase.step.position} of ${phase.step.total}`}
                     </p>
                  ) : null}
                  <p id={`${phase.id}_title`} className="m-0 text-section text-balance">
                     {phase.label}
                  </p>
               </div>
               {phase.sections.map((section, position) => {
                  const heading = problemSectionHeading(section);
                  return (
                     <section key={section.id} id={section.id} className={cn("scroll-mt-28", position === 0 ? "mt-8" : "mt-10 border-t border-border pt-8")}>
                        {heading ? <h2 className="mt-0 mb-4 text-subsection text-balance">{heading}</h2> : null}
                        <CatalogBody body={section.body} stayOnDeployment={stayOnDeployment} reading={READING} />
                     </section>
                  );
               })}
            </section>
         ))}
      </>
   );
}
