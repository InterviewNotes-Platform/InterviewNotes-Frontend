import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogBody } from "@/components/catalog/CatalogBody";
import { getCatalogItem, getCatalogItemMeta } from "@/lib/catalog/client";
import { catalogHref } from "@/lib/catalog/routes";
import type { CatalogItem, CatalogItemType, CatalogMeta } from "@/lib/catalog/types";
import { CatalogStateNotice } from "./CatalogStateNotice";

export async function catalogItemMetadata(type: CatalogItemType, slug: string): Promise<Metadata> {
   const result = await getCatalogItemMeta(type, slug);
   if (result.status !== "ok") return {};
   return { title: result.data.title, description: result.data.summary };
}

function ItemHeader({ meta }: { meta: Pick<CatalogMeta, "title" | "summary"> }) {
   return (
      <header className="mb-8">
         <h1 className="text-3xl font-bold text-foreground">{meta.title}</h1>
         {meta.summary ? <p className="mt-2 text-muted-foreground">{meta.summary}</p> : null}
      </header>
   );
}

function ItemContent({ item }: { item: CatalogItem }) {
   return (
      <>
         {item.body ? <CatalogBody body={item.body} /> : null}
         {item.sections.map((section) => (
            <section key={section.id} id={section.id}>
               {section.title ? <h2 className="text-2xl font-bold mt-8 mb-3 text-foreground">{section.title}</h2> : null}
               <CatalogBody body={section.body} />
            </section>
         ))}
         {item.sections_withheld ? (
            <p role="note" className="mt-8 border border-border p-4 text-sm text-muted-foreground">
               Some sections of this content are premium and are not included in your access.
            </p>
         ) : null}
      </>
   );
}

/**
 * One canonical page per catalog type + slug. The API decides what this caller may read;
 * the page only presents the result it is given.
 */
export async function CatalogItemPage({ type, slug }: { type: CatalogItemType; slug: string }) {
   const result = await getCatalogItem(type, slug);
   if (result.status === "notFound") notFound();

   const signInPath = catalogHref(`${type}.${slug}`) ?? undefined;
   let content;
   let header: Pick<CatalogMeta, "title" | "summary"> | null = null;

   if (result.status === "ok") {
      header = result.data;
      content = <ItemContent item={result.data} />;
   } else {
      // Public metadata is a safe teaser; the body stays withheld.
      if (result.status === "unauthenticated" || result.status === "unentitled") {
         const meta = await getCatalogItemMeta(type, slug);
         if (meta.status === "ok") header = meta.data;
      }
      content = <CatalogStateNotice state={result.status} signInPath={signInPath} />;
   }

   return (
      <main className="max-w-3xl mx-auto px-6 py-8">
         {header ? <ItemHeader meta={header} /> : null}
         {content}
      </main>
   );
}
