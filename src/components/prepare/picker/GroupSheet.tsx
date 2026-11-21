import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { capitalize, type Section } from "./sections";

export type Unit = { one: string; many: string };

const STEP =
   "grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-background text-foreground transition-micro " +
   "hover:border-[var(--primary-text)] disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-[3px] focus-visible:ring-ring/50";

interface Props {
   /** The collection's title, for the position line. */
   collection: string;
   unit: Unit;
   sections: readonly Section[];
   index: number;
   /** Saving or saved: the sheet cannot be closed or moved, so what the create reports stays in view. */
   disabled: boolean;
   onIndex: (index: number) => void;
   onClose: () => void;
   /** The id of the picker's form: Start answer is that form's submit button, though the sheet sits outside it in the page. */
   formId: string;
   /** What would be created, in words; null when nothing in this sheet is chosen. */
   chosen: string | null;
   prompt: string;
   canSubmit: boolean;
   /** The create's own states (progress, sign-in, failure, the unlinked-story notice), shown beside Start answer. */
   status?: ReactNode;
   /** The sheet's question list, as the picker renders it. */
   children: ReactNode;
}

/**
 * One principle, theme or level in a layered sheet (P8-PREP-UX-03, Shelf): its explanation, its questions and Start answer,
 * attached to the group that was chosen. A modal dialog, so focus stays inside, Escape closes it and focus returns to the tile
 * that opened it. On a phone it takes the whole screen and the explanation sits behind a disclosure so a question is near the top.
 */
export function GroupSheet({ collection, unit, sections, index, disabled, onIndex, onClose, formId, chosen, prompt, canSubmit, status, children }: Props) {
   const section = sections[index];
   const position = `${capitalize(unit.one)} ${index + 1} of ${sections.length}`;
   const guidance = section.paragraphs.length > 0 && (
      <div className="space-y-3">
         {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="max-w-reading text-[0.9375rem] leading-relaxed text-muted-foreground">
               {paragraph}
            </p>
         ))}
      </div>
   );
   return (
      <Sheet open onOpenChange={(open) => !open && !disabled && onClose()}>
         <SheetContent side="right" className="w-full gap-0 border-border bg-background p-0 sm:max-w-[42.5rem]" data-prepare-sheet>
            <div className="flex items-center gap-2 border-b border-border py-3 pr-16 pl-4 md:pl-7">
               <button type="button" className={STEP} disabled={disabled || index === 0} aria-label={`Previous ${unit.one}`} onClick={() => onIndex(index - 1)}>
                  <ChevronLeft aria-hidden className="size-5" />
               </button>
               <button type="button" className={STEP} disabled={disabled || index === sections.length - 1} aria-label={`Next ${unit.one}`} onClick={() => onIndex(index + 1)}>
                  <ChevronRight aria-hidden className="size-5" />
               </button>
               <p className="m-0 ml-1 min-w-0 truncate text-supporting text-muted-foreground">{position}</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
               <div className="px-5 pt-5 md:px-9 md:pt-7">
                  <p className="m-0 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{collection}</p>
                  <SheetTitle className="mt-2 mb-3 text-xl leading-tight text-balance md:text-section">{section.title}</SheetTitle>
                  <SheetDescription className="sr-only">
                     {position}: {section.questions.length} {section.questions.length === 1 ? "question" : "questions"}. Choose one, then start your answer.
                  </SheetDescription>
                  {guidance && (
                     <>
                        <div className="mb-5 hidden md:block">
                           <h3 className="mt-0 mb-2 text-supporting font-semibold text-foreground">What this {unit.one} asks</h3>
                           {guidance}
                        </div>
                        <details className="mb-3 md:hidden">
                           <summary className="flex min-h-11 cursor-pointer items-center text-supporting font-semibold text-[var(--primary-text)]">What this {unit.one} asks</summary>
                           <div className="pb-2">{guidance}</div>
                        </details>
                     </>
                  )}
               </div>
               <div className="border-t border-border py-1">{children}</div>
            </div>

            <div className="space-y-3 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-7">
               <div className="flex items-center justify-between gap-3">
                  <p className="line-clamp-2 min-w-0 text-supporting text-muted-foreground">
                     {chosen ? (
                        <>
                           Selected · <b className="font-semibold text-foreground">{chosen}</b>
                        </>
                     ) : (
                        prompt
                     )}
                  </p>
                  <Button type="submit" form={formId} size="lg" disabled={!canSubmit} className="shrink-0">
                     Start answer
                  </Button>
               </div>
               {status}
            </div>
         </SheetContent>
      </Sheet>
   );
}
