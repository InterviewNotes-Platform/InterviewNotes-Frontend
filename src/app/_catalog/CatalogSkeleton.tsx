import type { ReactNode } from "react";
import { PageContainer, ReadingColumn } from "@/components/layout/PageContainer";
import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
   return <div className={cn("h-4 rounded bg-muted motion-safe:animate-pulse", className)} />;
}

function Lines({ widths }: { widths: string[] }) {
   return (
      <div className="space-y-3">
         {widths.map((width, index) => (
            <Bar key={index} className={width} />
         ))}
      </div>
   );
}

/** The page's own `main` and reading column, so the real page replaces it without moving. Announced once, not bar by bar. */
function SkeletonPage({ label, children }: { label: string; children: ReactNode }) {
   return (
      <PageContainer as="main" className="py-12 md:py-16" aria-busy="true">
         <ReadingColumn>
            <p role="status" className="sr-only">
               {label}
            </p>
            <div aria-hidden="true">{children}</div>
         </ReadingColumn>
      </PageContainer>
   );
}

/** Title and summary, the lead of every catalog page. */
function HeaderBars() {
   return (
      <>
         <Bar className="h-9 w-3/4" />
         <div className="mt-4">
            <Lines widths={["w-full", "w-2/3"]} />
         </div>
      </>
   );
}

function BodyBars() {
   return (
      <div className="mt-12 space-y-10">
         {[0, 1].map((section) => (
            <div key={section} className="space-y-5">
               <Bar className="h-6 w-1/3" />
               <Lines widths={["w-full", "w-full", "w-11/12", "w-2/3"]} />
            </div>
         ))}
      </div>
   );
}

export function TrackSkeleton() {
   return (
      <SkeletonPage label="Loading Track">
         <HeaderBars />
         <Bar className="mt-6 h-8 w-28 rounded-md" />
         <div className="mt-12 space-y-10 md:mt-16">
            {[0, 1].map((module) => (
               <div key={module} className="space-y-3">
                  <Bar className="mb-4 h-6 w-1/2" />
                  {[0, 1, 2].map((row) => (
                     <Bar key={row} className="h-14 rounded-lg" />
                  ))}
               </div>
            ))}
         </div>
      </SkeletonPage>
   );
}

export function LessonSkeleton() {
   return (
      <SkeletonPage label="Loading Lesson">
         <Bar className="mb-6 w-56" />
         <HeaderBars />
         <BodyBars />
      </SkeletonPage>
   );
}

export function ProblemSkeleton() {
   return (
      <SkeletonPage label="Loading Problem">
         <Bar className="mb-6 w-48" />
         <HeaderBars />
         <div className="mt-12 space-y-8">
            {[0, 1, 2].map((stage) => (
               <div key={stage} className="space-y-4">
                  <Bar className="h-6 w-1/4" />
                  <Bar className="h-24 rounded-lg" />
               </div>
            ))}
         </div>
      </SkeletonPage>
   );
}

export function KnowledgeSkeleton() {
   return (
      <SkeletonPage label="Loading Knowledge entry">
         <HeaderBars />
         <BodyBars />
      </SkeletonPage>
   );
}
