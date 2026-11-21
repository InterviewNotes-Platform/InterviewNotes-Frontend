import { cn } from "@/lib/utils";
import type { Unit } from "./GroupSheet";
import type { Section } from "./sections";

interface Props {
   unit: Unit;
   sections: readonly Section[];
   disabled: boolean;
   /** The principle, theme or level whose sheet was open last: marked, so closing the sheet returns to a place on the grid. */
   current: number | null;
   onOpen: (index: number) => void;
}

/**
 * Every principle, theme or level of the open collection at once, as a ruled table of contents (P8-PREP-UX-03, Shelf). The
 * tiles share hairlines and carry no shadow. Each shows the Lesson's own number order, title and its first two question
 * headings; choosing one opens its sheet. Nothing here is a score, a count of the reader's answers or a recommendation.
 */
export function ShelfGrid({ unit, sections, disabled, current, onOpen }: Props) {
   return (
      <ol
         aria-label={`Every ${unit.one} in this collection`}
         className="m-0 grid list-none grid-cols-1 gap-0 p-0 md:grid-cols-3 md:border-t md:border-l md:border-border xl:grid-cols-4"
      >
         {sections.map(({ key, title, questions }, index) => {
            const headings = questions.map(({ title: heading, text }) => (heading && heading !== text ? heading : text)).slice(0, 2);
            return (
               <li key={key} className="md:contents">
                  <button
                     type="button"
                     disabled={disabled}
                     aria-haspopup="dialog"
                     aria-label={`${title}, ${questions.length} ${questions.length === 1 ? "question" : "questions"}`}
                     aria-current={index === current ? "true" : undefined}
                     onClick={() => onOpen(index)}
                     className={cn(
                        "grid w-full cursor-pointer grid-cols-[1.875rem_minmax(0,1fr)] gap-x-2 gap-y-1 border-b border-border bg-transparent px-1 py-3.5 text-left transition-micro",
                        "hover:bg-surface focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/60 disabled:cursor-default",
                        "md:flex md:min-h-37 md:flex-col md:gap-1.5 md:border-r md:bg-card md:px-5 md:pt-4.5 md:pb-4",
                        "aria-[current=true]:bg-surface aria-[current=true]:shadow-[inset_3px_0_0_var(--primary-text)]"
                     )}
                  >
                     <span aria-hidden className="row-span-2 pt-0.5 text-xs font-semibold tracking-[0.06em] text-muted-foreground tabular-nums md:row-auto md:pt-0">
                        {String(index + 1).padStart(2, "0")}
                     </span>
                     <span className="text-[1.0625rem] leading-snug font-semibold text-foreground">{title}</span>
                     <span className="text-supporting leading-snug text-muted-foreground md:mt-auto">
                        <span className="line-clamp-2">{headings.join(" · ")}</span>
                        <span className="mt-1 block text-xs font-semibold text-[var(--primary-text)] max-md:mt-0 max-md:inline max-md:before:content-['_·_']">
                           {questions.length} {questions.length === 1 ? "question" : "questions"}
                        </span>
                     </span>
                  </button>
               </li>
            );
         })}
      </ol>
   );
}
