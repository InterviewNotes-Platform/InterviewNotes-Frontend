import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { capitalize, type Section } from "./sections";

export type Unit = { one: string; many: string };

const STEP =
   "grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-background text-foreground transition-micro " +
   "hover:border-[var(--primary-text)] disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-[3px] focus-visible:ring-ring/50";

interface StageProps {
   unit: Unit;
   sections: readonly Section[];
   index: number;
   disabled: boolean;
   onIndex: (index: number) => void;
   /** Extra controls under the title, such as the general collection's level choice. */
   extra?: ReactNode;
   /** The question list of the current section, as the picker renders it. */
   children: ReactNode;
}

/**
 * One principle or theme at a time (P8-PREP-UX-02, Desk): a stepper with a jump menu, the group's own guidance beside its
 * questions, and the questions. Every group, title and question is the Lesson's own; nothing is reordered or left out.
 */
export function GroupStage({ unit, sections, index, disabled, onIndex, extra, children }: StageProps) {
   const heading = useId();
   const section = sections[index];
   const position = `${capitalize(unit.one)} ${index + 1} of ${sections.length}`;
   const guidance = section.paragraphs.length > 0 && (
      <div className="space-y-3">
         <h3 className="mt-0 text-supporting font-semibold text-foreground">What this {unit.one} asks</h3>
         {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="max-w-reading text-[0.9375rem] leading-relaxed text-muted-foreground">
               {paragraph}
            </p>
         ))}
      </div>
   );
   return (
      <section aria-labelledby={heading} className="rounded-2xl border border-border bg-card">
         <div className="flex items-center gap-3 px-4 py-3 md:gap-4 md:px-8 md:py-6">
            <button type="button" className={STEP} disabled={disabled || index === 0} aria-label={`Previous ${unit.one}`} onClick={() => onIndex(index - 1)}>
               <ChevronLeft aria-hidden className="size-5" />
            </button>
            <div className="relative min-w-0 flex-1 text-center md:text-left">
               <div className="flex flex-wrap items-center justify-center gap-x-3 md:justify-start">
                  <p className="m-0 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{position}</p>
                  <JumpMenu unit={unit} sections={sections} index={index} disabled={disabled} onPick={onIndex} />
               </div>
               <h2 id={heading} className="mt-1 mb-0 text-xl leading-tight font-semibold text-balance text-foreground md:text-section">
                  {section.title}
               </h2>
               {extra && <div className="mt-3 text-left">{extra}</div>}
            </div>
            <button type="button" className={STEP} disabled={disabled || index === sections.length - 1} aria-label={`Next ${unit.one}`} onClick={() => onIndex(index + 1)}>
               <ChevronRight aria-hidden className="size-5" />
            </button>
         </div>
         <div aria-hidden className="hidden gap-1.5 px-8 pb-5 md:flex">
            {sections.map(({ key }, i) => (
               <span key={key} className={cn("h-1.5 min-w-1 flex-1 rounded-full", i === index ? "bg-[var(--primary-text)]" : "bg-border")} />
            ))}
         </div>
         {/* Said once per step, so a screen reader hears where the stepper moved without focus leaving the button. */}
         <p aria-live="polite" className="sr-only">
            {`${position}: ${section.title}, ${section.questions.length} ${section.questions.length === 1 ? "question" : "questions"}`}
         </p>
         <div className={cn("border-t border-border", guidance && "lg:grid lg:grid-cols-[5fr_7fr]")}>
            {guidance && <div className="hidden border-r border-border bg-surface/60 p-8 lg:block lg:rounded-bl-2xl">{guidance}</div>}
            <div className="py-1">{children}</div>
            {guidance && (
               <details className="border-t border-border px-4 lg:hidden">
                  <summary className="flex min-h-12 cursor-pointer items-center text-supporting font-semibold text-[var(--primary-text)]">What this {unit.one} asks</summary>
                  <div className="pb-4">{guidance}</div>
               </details>
            )}
         </div>
      </section>
   );
}

/** A disclosure, not a menu: a button that shows a list of every group, each a button, closed by Escape or by choosing one. */
function JumpMenu({ unit, sections, index, disabled, onPick }: { unit: Unit; sections: readonly Section[]; index: number; disabled: boolean; onPick: (index: number) => void }) {
   const [open, setOpen] = useState(false);
   const panelId = useId();
   const root = useRef<HTMLDivElement>(null);
   const trigger = useRef<HTMLButtonElement>(null);

   useEffect(() => {
      if (!open) return;
      const current = root.current?.querySelector<HTMLElement>('[aria-current="true"]');
      current?.focus();
      // Scroll within the panel only: the page behind must not jump.
      current?.scrollIntoView?.({ block: "nearest" });
      const away = (event: PointerEvent) => {
         if (!root.current?.contains(event.target as Node)) setOpen(false);
      };
      document.addEventListener("pointerdown", away);
      return () => document.removeEventListener("pointerdown", away);
   }, [open]);

   function close(refocus: boolean) {
      setOpen(false);
      if (refocus) trigger.current?.focus();
   }

   function keys(event: KeyboardEvent<HTMLDivElement>) {
      if (!open) return;
      if (event.key === "Escape") {
         event.preventDefault();
         close(true);
         return;
      }
      const items = [...(root.current?.querySelectorAll<HTMLElement>("[data-jump-item]") ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const move = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[event.key];
      if (move !== undefined && items.length > 0) {
         event.preventDefault();
         items[Math.max(0, Math.min(items.length - 1, move))].focus();
      }
   }

   return (
      <div
         ref={root}
         onKeyDown={keys}
         // Tabbing out closes it. A null target (Safari does not focus a clicked button) is not "out", or the click would be lost.
         onBlur={(event) => event.relatedTarget && !root.current?.contains(event.relatedTarget as Node) && setOpen(false)}
         className="relative"
      >
         <button
            ref={trigger}
            type="button"
            disabled={disabled}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1.5 text-supporting font-medium text-[var(--primary-text)] transition-micro hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
         >
            Jump to {unit.one}
            <ChevronDown aria-hidden className={cn("size-4", open && "rotate-180")} />
         </button>
         {open && (
            <div id={panelId} className="absolute top-full left-1/2 z-20 mt-1 max-h-[min(24rem,60vh)] w-[min(22rem,calc(100vw-3rem))] -translate-x-1/2 overflow-y-auto rounded-xl border border-border bg-card p-2 text-left shadow-[0_12px_32px_rgba(28,25,21,0.14)] md:left-0 md:translate-x-0">
               <ul className="m-0 list-none p-0">
                  {sections.map(({ key, title, questions }, i) => (
                     <li key={key}>
                        <button
                           type="button"
                           data-jump-item
                           aria-current={i === index ? "true" : undefined}
                           onClick={() => {
                              onPick(i);
                              close(true);
                           }}
                           className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-supporting text-foreground transition-micro hover:bg-surface aria-[current=true]:bg-surface aria-[current=true]:font-semibold focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                           <span>
                              <span aria-hidden className="mr-2 text-muted-foreground tabular-nums">
                                 {i + 1}
                              </span>
                              {title}
                           </span>
                           <span className="shrink-0 text-xs text-muted-foreground">{questions.length} {questions.length === 1 ? "question" : "questions"}</span>
                        </button>
                     </li>
                  ))}
               </ul>
            </div>
         )}
      </div>
   );
}
