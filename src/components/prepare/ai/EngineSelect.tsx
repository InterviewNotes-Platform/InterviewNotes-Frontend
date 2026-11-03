"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { ENGINES, type EngineChoice } from "./engineChoice";

interface Props {
   value: EngineChoice;
   onChange: (next: EngineChoice) => void;
   disabled?: boolean;
}

/** Two radio choices for the Free reader's model. Raw model IDs are not shown; the descriptions make no claim of better results. */
export function EngineSelect({ value, onChange, disabled = false }: Props) {
   const ids = useId();
   return (
      <fieldset disabled={disabled} className="space-y-1">
         <legend className="text-body font-medium text-foreground">Model</legend>
         {ENGINES.map((engine) => (
            <label key={engine.value} className={cn("flex min-h-11 cursor-pointer items-start gap-3 py-1", disabled && "cursor-not-allowed opacity-50")}>
               <input
                  type="radio"
                  name={`${ids}-engine`}
                  value={engine.value}
                  checked={value === engine.value}
                  onChange={() => onChange(engine.value)}
                  aria-describedby={`${ids}-${engine.value}`}
                  className="mt-1 size-4 shrink-0 accent-foreground"
               />
               <span>
                  <span className="block text-body text-foreground">{engine.label}</span>
                  <span id={`${ids}-${engine.value}`} className="block text-supporting text-muted-foreground">
                     {engine.detail}
                  </span>
               </span>
            </label>
         ))}
      </fieldset>
   );
}
