"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DisclosureProps {
   title: ReactNode;
   /** Quiet text beside the title, such as a count; part of the control's accessible name. */
   detail?: ReactNode;
   defaultOpen?: boolean;
   /** The heading level of the control, so it fits the page's outline. */
   level?: "h2" | "h3";
   className?: string;
   children: ReactNode;
}

/**
 * A heading whose native button shows or hides its panel, so Enter and Space work unaided. A collapsed
 * panel is `inert`: not focusable and not read out. It shows at once and hides when its size transition
 * ends; the global reduced-motion rule makes both instant.
 */
export function Disclosure({ title, detail, defaultOpen = false, level: Heading = "h2", className, children }: DisclosureProps) {
   const [open, setOpen] = useState(defaultOpen);
   const panelId = `${useId()}-panel`;

   return (
      <div data-slot="disclosure" data-state={open ? "open" : "closed"} className={className}>
         <Heading className="-mx-2 my-0">
            <button
               type="button"
               aria-expanded={open}
               aria-controls={panelId}
               onClick={() => setOpen((current) => !current)}
               className="flex min-h-11 w-full items-center gap-4 rounded-md px-2 py-3 text-left transition-micro -outline-offset-2 hover:text-primary"
            >
               <span className="min-w-0 flex-1 text-subsection text-balance">{title}</span>
               {detail ? (
                  <>
                     {" "}
                     <span className="shrink-0 text-supporting font-normal text-muted-foreground">{detail}</span>
                  </>
               ) : null}
               <ChevronDown
                  aria-hidden="true"
                  className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-standard", open && "rotate-180")}
               />
            </button>
         </Heading>
         <div
            id={panelId}
            inert={!open}
            className={cn(
               "grid ease-standard [transition-duration:200ms,0s] [transition-property:grid-template-rows,visibility]",
               open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr] [transition-delay:0s,200ms]"
            )}
         >
            <div className="-mx-2 min-h-0 overflow-hidden px-2">{children}</div>
         </div>
      </div>
   );
}
