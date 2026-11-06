"use client";

import Link from "next/link";
import { PageContainer, ReadingColumn } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";

/** What a reader sees when a catalog page throws while rendering. Item states (404, 410, 401, 402, 5xx) never reach it: they are `CatalogStateNotice`. */
export function CatalogRouteError({ retry }: { retry: () => void }) {
   return (
      <PageContainer as="main" className="py-12 md:py-16">
         <ReadingColumn>
            <div role="alert" className="rounded-lg bg-surface px-6 py-12 text-center">
               <h1 className="m-0 mb-2 text-lg font-semibold text-balance">This page could not be displayed</h1>
               <p className="mb-6 text-body text-muted-foreground">Something went wrong on our side. Try again, or head back to the Tracks.</p>
               <div className="flex flex-wrap justify-center gap-3">
                  <Button type="button" onClick={() => retry()} className="bg-foreground text-background hover:bg-foreground/90 h-8 text-sm">
                     Try again
                  </Button>
                  <Button asChild variant="outline" className="h-8 text-sm">
                     <Link href="/#tracks">Browse Tracks</Link>
                  </Button>
               </div>
            </div>
         </ReadingColumn>
      </PageContainer>
   );
}
