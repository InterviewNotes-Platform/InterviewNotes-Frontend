import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { keyOf, type PickerQuestion } from "./sections";
import { highlight } from "./search";

/** The text with each matched word marked; with no words it is just the text. */
export function Highlight({ text, words }: { text: string; words: readonly string[] }) {
   return (
      <>
         {highlight(text, words).map(({ text: piece, hit }, index) =>
            hit ? (
               <mark key={index} className="rounded-sm bg-[color-mix(in_srgb,var(--primary)_22%,transparent)] px-0.5 text-foreground">
                  {piece}
               </mark>
            ) : (
               piece
            )
         )}
      </>
   );
}

interface Props {
   question: PickerQuestion;
   name: string;
   checked: boolean;
   disabled: boolean;
   words?: readonly string[];
   onChoose: (question: PickerQuestion) => void;
   inputRef?: (element: HTMLInputElement | null) => void;
}

/**
 * One question as a native radio in a labelled row: its number (a check once chosen), the Lesson's own heading, the question
 * as written. The number is a CSS counter of the list it sits in, so it is never part of the row's text or the radio's name.
 */
export function QuestionRow({ question, name, checked, disabled, words = [], onChoose, inputRef }: Props) {
   const title = question.title && question.title !== question.text ? question.title : null;
   return (
      <li className="[counter-increment:q]">
         <label
            className={
               "grid cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)] gap-3 border-l-[3px] border-transparent px-4 py-4 transition-micro md:grid-cols-[2.25rem_minmax(0,1fr)] md:px-7 md:py-5 " +
               "hover:bg-surface has-[:checked]:border-l-[var(--primary-text)] has-[:checked]:bg-surface has-[:disabled]:cursor-default " +
               "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring/60"
            }
         >
            <input type="radio" name={name} value={keyOf(question)} checked={checked} disabled={disabled} onChange={() => onChoose(question)} ref={inputRef} className="sr-only" />
            <span
               aria-hidden
               className={cn("pt-0.5 text-supporting font-semibold text-muted-foreground tabular-nums", !checked && "before:content-[counter(q,decimal-leading-zero)]")}
            >
               {checked && <Check className="size-4 text-[var(--primary-text)]" strokeWidth={2.5} />}
            </span>
            <span className="min-w-0 space-y-1">
               {title && (
                  <>
                     <span className="block text-[0.9375rem] font-semibold text-foreground">
                        <Highlight text={title} words={words} />
                     </span>{" "}
                  </>
               )}
               <span className="block text-body text-foreground">
                  <Highlight text={question.text} words={words} />
               </span>
            </span>
         </label>
      </li>
   );
}
