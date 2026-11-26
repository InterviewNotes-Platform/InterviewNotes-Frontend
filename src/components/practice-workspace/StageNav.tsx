"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_COPY, STATUS_LABEL } from "@/lib/practice-workspace/stages";
import type { Position, StageStatus } from "@/lib/practice-workspace/types";

interface Props {
   positions: readonly Position[];
   current: Position;
   statuses: ReadonlyMap<Position, StageStatus>;
   /** Stages whose text is not on the server and needs the learner. */
   troubled: readonly Position[];
   onSelect: (position: Position) => void;
}

/**
 * Compact stage navigation (Design D): a row of numbered stages on wide screens, a labelled select below 768 px. Any presented stage
 * may be opened at any time; nothing is locked behind another stage.
 */
export function StageNav({ positions, current, statuses, troubled, onSelect }: Props) {
   return (
      <>
         <nav aria-label="Interview stages" className="hidden min-w-0 md:block">
            <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
               {positions.map((position, index) => {
                  const status = statuses.get(position) ?? "not_started";
                  const isCurrent = position === current;
                  const label = STAGE_COPY[position].label;
                  return (
                     <li key={position} className="m-0 flex">
                        <button
                           type="button"
                           aria-current={isCurrent ? "step" : undefined}
                           onClick={() => onSelect(position)}
                           className={cn(
                              "inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-supporting transition-micro focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                              isCurrent ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                           )}
                        >
                           <span
                              aria-hidden="true"
                              className={cn("grid size-6 shrink-0 place-items-center rounded-full border text-xs", status === "done" || status === "skipped" ? "border-primary bg-primary text-primary-foreground" : "border-border")}
                           >
                              {status === "done" ? <Check className="size-3.5" /> : index + 1}
                           </span>
                           <span className={isCurrent ? undefined : "max-lg:sr-only"}>{label}</span>
                           <span className="sr-only">
                              , stage {index + 1} of {positions.length}, {STATUS_LABEL[status].toLowerCase()}
                              {troubled.includes(position) ? ", not saved" : ""}
                           </span>
                        </button>
                     </li>
                  );
               })}
            </ol>
         </nav>
         <div className="md:hidden">
            <label htmlFor="practice-stage-select" className="sr-only">
               Stage
            </label>
            <select
               id="practice-stage-select"
               value={current}
               onChange={(event) => onSelect(event.target.value as Position)}
               className="border-input bg-background min-h-11 w-full rounded-md border px-3 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
               {positions.map((position, index) => (
                  <option key={position} value={position}>
                     {index + 1} of {positions.length} · {STAGE_COPY[position].label} ({STATUS_LABEL[statuses.get(position) ?? "not_started"].toLowerCase()}
                     {troubled.includes(position) ? ", not saved" : ""})
                  </option>
               ))}
            </select>
         </div>
      </>
   );
}
