import type { ReactNode } from "react";
import { PageContainer, ReadingColumn } from "@/components/layout/PageContainer";

/** The shared frame of the app-wide not-found and error pages: one h1, a plain explanation and real recovery actions. */
export function StatusPage({ code, title, children, actions, alert = false }: { code?: string; title: string; children: ReactNode; actions: ReactNode; alert?: boolean }) {
   return (
      <PageContainer as="main" className="py-16 md:py-24">
         <ReadingColumn>
            <div role={alert ? "alert" : undefined} className="rounded-lg bg-surface px-6 py-12 text-center md:px-10">
               {code ? <p className="mb-3 text-supporting font-semibold tracking-wide text-muted-foreground">{code}</p> : null}
               <h1 className="mb-3 text-section text-foreground text-balance">{title}</h1>
               <p className="mx-auto mb-8 max-w-prose text-body text-muted-foreground">{children}</p>
               <div className="flex flex-wrap justify-center gap-3">{actions}</div>
            </div>
         </ReadingColumn>
      </PageContainer>
   );
}
