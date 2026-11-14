import { sectionHeading, type KnowledgeBand } from "@/lib/catalog/knowledge";
import { CatalogBody, type ReadingMode } from "./CatalogBody";

/**
 * What the API released, in reading bands: a band is an h2 that the contents link to, each section keeps its own element and an
 * h3. Bands are plain blocks, not boxes, and only the bands that have content are passed in. Each band carries its canonical rank
 * (Read at depth hides by it, P8-T28); each section is a pin source, and its tables and diagrams are exhibits anchored in it.
 */
export function KnowledgeBands({ bands, stayOnDeployment }: { bands: KnowledgeBand[]; stayOnDeployment: boolean }) {
   return (
      <>
         {bands.map((band, index) => (
            <div key={band.id} data-knowledge-band={band.rank} className={index > 0 ? "knowledge-band mt-14 border-t border-border pt-12" : "knowledge-band"}>
               <h2 id={band.id} tabIndex={-1} data-band-rank={band.rank} className="knowledge-band-title m-0 scroll-mt-28 text-section text-balance">
                  {band.label}
               </h2>
               {band.sections.map((section) => {
                  const heading = sectionHeading(section);
                  const reading: ReadingMode = { headings: [], exhibits: true, exhibitScope: section.id };
                  return (
                     <section key={section.id} id={section.id} tabIndex={-1} data-pin-section={heading ?? band.label} className="knowledge-section">
                        {heading ? <h3 className="mt-8 mb-3 text-subsection text-balance">{heading}</h3> : null}
                        <CatalogBody body={section.body} stayOnDeployment={stayOnDeployment} reading={reading} />
                     </section>
                  );
               })}
            </div>
         ))}
      </>
   );
}
