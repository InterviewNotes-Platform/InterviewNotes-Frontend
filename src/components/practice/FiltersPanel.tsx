"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The filter fields: always shown from `md`, and below it a collapsed `Filters` disclosure that counts the active filters.
 * A closed panel is `display: none`, so its fields are neither focusable nor read out. Escape closes it and returns focus to the button.
 */
export function FiltersPanel({ activeCount, children }: { activeCount: number; children: ReactNode }) {
   const [open, setOpen] = useState(false);
   const toggle = useRef<HTMLButtonElement>(null);
   const panelId = `${useId()}-panel`;

   const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !open) return;
      setOpen(false);
      toggle.current?.focus();
   };

   return (
      <div onKeyDown={closeOnEscape}>
         <button
            ref={toggle}
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
            className="flex min-h-11 w-full items-center gap-3 rounded-md border border-border px-4 text-left text-body font-medium transition-micro hover:border-foreground md:hidden"
         >
            <span className="flex-1">Filters</span>
            {activeCount > 0 ? <span className="text-supporting font-normal text-muted-foreground">{activeCount} active</span> : null}
            <ChevronDown
               aria-hidden="true"
               className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-standard", open && "rotate-180")}
            />
         </button>
         <div id={panelId} className={cn("mt-4 md:mt-0 md:block", open ? "block" : "hidden")}>
            {children}
         </div>
      </div>
   );
}
