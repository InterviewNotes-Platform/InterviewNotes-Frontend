import { CatalogBody } from "@/components/catalog/CatalogBody";
import type { CatalogHeading, CatalogItem } from "@/lib/catalog/types";

interface ItemContentProps {
   item: CatalogItem;
   stayOnDeployment: boolean;
   /** A Lesson's reading mode, applied to its body only: sections carry no headings of their own. */
   reading?: { headings: readonly CatalogHeading[] };
}

/** What the API released for this caller: the body, then each authorized section, and a note if some were withheld. */
export function ItemContent({ item, stayOnDeployment, reading }: ItemContentProps) {
   return (
      <>
         {item.body ? <CatalogBody body={item.body} stayOnDeployment={stayOnDeployment} reading={reading} /> : null}
         {item.sections.map((section) => (
            <section key={section.id} id={section.id}>
               {section.title ? <h2 className="mt-12 mb-4 text-section text-balance">{section.title}</h2> : null}
               <CatalogBody body={section.body} stayOnDeployment={stayOnDeployment} />
            </section>
         ))}
         {item.sections_withheld ? (
            <p role="note" className="mt-8 mb-0 rounded-lg bg-surface p-4 text-supporting text-muted-foreground">
               Some sections of this content are premium and are not included in your access.
            </p>
         ) : null}
      </>
   );
}
