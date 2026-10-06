import { sectionHeading, type KnowledgeBand } from "@/lib/catalog/knowledge";
import { CatalogBody } from "./CatalogBody";

/**
 * What the API released, in reading bands: a band is an h2 that the contents link to, each section keeps its own
 * element and an h3. Bands are plain blocks, not boxes, and only the bands that have content are passed in.
 */
export function KnowledgeBands({ bands, stayOnDeployment }: { bands: KnowledgeBand[]; stayOnDeployment: boolean }) {
   return (
      <>
         {bands.map((band, index) => (
            <div key={band.id} className={index > 0 ? "mt-14 border-t border-border pt-12" : undefined}>
               <h2 id={band.id} tabIndex={-1} className="m-0 scroll-mt-28 text-section text-balance">
                  {band.label}
               </h2>
               {band.sections.map((section) => {
                  const heading = sectionHeading(section);
                  return (
                     <section key={section.id} id={section.id}>
                        {heading ? <h3 className="mt-8 mb-3 text-subsection text-balance">{heading}</h3> : null}
                        <CatalogBody body={section.body} stayOnDeployment={stayOnDeployment} />
                     </section>
                  );
               })}
            </div>
         ))}
      </>
   );
}
