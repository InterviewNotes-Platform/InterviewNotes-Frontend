import { Search, X } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/** The longest query taken; a very long paste is cut, as the picker's own search never sends it anywhere. */
export const QUERY_MAX = 120;

interface Props {
   /** What is being searched, for the field's name: "Amazon Leadership Principles". */
   scope: string;
   value: string;
   disabled: boolean;
   onChange: (value: string) => void;
   /** ArrowDown: move into the results. */
   onArrowDown: () => void;
   className?: string;
}

/**
 * Find a question in the loaded collection. It sits outside the form, so Enter never starts an answer; Escape clears it and
 * the down arrow moves to the results. It only filters what the page already holds.
 */
export function SearchField({ scope, value, disabled, onChange, onArrowDown, className }: Props) {
   const input = useRef<HTMLInputElement>(null);
   function keys(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key === "Escape" && value !== "") {
         event.preventDefault();
         onChange("");
      } else if (event.key === "ArrowDown") {
         event.preventDefault();
         onArrowDown();
      } else if (event.key === "Enter") {
         event.preventDefault();
      }
   }
   return (
      <div role="search" className={cn("relative", className)}>
         <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
         <input
            ref={input}
            type="search"
            value={value}
            disabled={disabled}
            maxLength={QUERY_MAX}
            placeholder="Find a question"
            aria-label={`Find a question in ${scope}`}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={keys}
            className="border-input h-11 w-full rounded-xl border bg-background pr-11 pl-9 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm [&::-webkit-search-cancel-button]:hidden"
         />
         {value !== "" && (
            <button
               type="button"
               aria-label="Clear search"
               onClick={() => {
                  onChange("");
                  input.current?.focus();
               }}
               className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-micro hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
               <X aria-hidden className="size-4" />
            </button>
         )}
      </div>
   );
}
