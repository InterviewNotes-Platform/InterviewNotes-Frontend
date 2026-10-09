import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** The centred badge, heading and lead that open each homepage section. */
export function SectionIntro({ id, label, title, lead, gold }: { id: string; label: string; title: string; lead?: string; gold?: boolean }) {
   return (
      <div className="mx-auto mb-12 max-w-4xl text-center md:mb-16">
         <Badge variant="outline" className={cn("mb-4 px-3 py-1 text-supporting", gold ? "border-gold/40 text-premium" : "border-primary/30 text-(--primary-text)")}>
            {label}
         </Badge>
         <h2 id={id} className="m-0 mb-6 text-2xl font-bold tracking-tight text-balance md:text-3xl">
            {title}
         </h2>
         {lead ? <p className="m-0 mx-auto max-w-3xl text-lg text-pretty text-muted-foreground md:text-xl">{lead}</p> : null}
      </div>
   );
}
