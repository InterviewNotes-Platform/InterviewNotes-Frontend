import { cn } from "@/lib/utils";

/** The centred eyebrow, heading and lead that open each homepage section (the prototype's section heading style). */
export function SectionIntro({ id, label, title, lead, gold }: { id: string; label: string; title: string; lead?: string; gold?: boolean }) {
   return (
      <div className="mx-auto mb-12 flex max-w-4xl flex-col items-center gap-4 text-center md:mb-16">
         <p className={cn("m-0 font-mono text-[11px]/3.5 tracking-[0.08em] uppercase", gold ? "text-premium" : "text-muted-foreground")}>{label}</p>
         <h2 id={id} className="m-0 text-[32px]/10 font-medium tracking-[-0.03em] text-balance sm:text-[40px]/11.5">
            {title}
         </h2>
         {lead ? <p className="m-0 max-w-3xl text-base/7 text-pretty text-muted-foreground md:text-lg/7">{lead}</p> : null}
      </div>
   );
}
