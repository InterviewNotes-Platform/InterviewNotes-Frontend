"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DisclosureProps {
   title: ReactNode;
   /** Quiet text beside the title, such as a count; part of the control's accessible name. */
   detail?: ReactNode;
   defaultOpen?: boolean;
   /** Controlled state, for a caller that must close the panel itself; leave out and the control keeps its own. */
   open?: boolean;
   onOpenChange?: (open: boolean) => void;
   /** A quieter title, for a control inside a reading flow rather than a section of its own. */
   compact?: boolean;
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
export function Disclosure({
   title,
   detail,
   defaultOpen = false,
   open: controlled,
   onOpenChange,
   compact = false,
   level: Heading = "h2",
   className,
   children,
}: DisclosureProps) {
   const [own, setOwn] = useState(defaultOpen);
   const open = controlled ?? own;
   const panelId = `${useId()}-panel`;
   const toggle = () => {
      setOwn(!open);
      onOpenChange?.(!open);
   };

   return (
      <div data-slot="disclosure" data-state={open ? "open" : "closed"} className={className}>
         <Heading className="-mx-2 my-0">
            <button
               type="button"
               aria-expanded={open}
               aria-controls={panelId}
               onClick={toggle}
               className="flex min-h-11 w-full items-center gap-4 rounded-md px-2 py-3 text-left transition-micro -outline-offset-2 hover:text-primary"
            >
               <span className={cn("min-w-0 flex-1 text-balance", compact ? "text-body font-semibold" : "text-subsection")}>{title}</span>
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
