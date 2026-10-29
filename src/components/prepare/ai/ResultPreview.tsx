import { Button } from "@/components/ui/button";
import { STAR_KEYS } from "@/lib/prep/answerDraft";
import type { DraftResult, ReviewResult } from "./aiClient";
import { generatedText } from "./aiRequest";

const LABEL = { situation: "Situation", task: "Task", action: "Action", result: "Result" } as const;

const REVIEW_SECTIONS: readonly { key: keyof Omit<ReviewResult, "questions_to_ask_yourself">; title: string }[] = [
   { key: "missing", title: "Missing" },
   { key: "weak", title: "Weak or vague" },
   { key: "claims_to_verify", title: "Claims to verify" },
];

/** The body of a draft preview, shown inline or in the mobile sheet. Apply and Insert are the only way its text reaches the answer. */
export function DraftPreview({ result, onApply, onInsert, onDiscard }: { result: DraftResult; onApply: () => void; onInsert: () => void; onDiscard: () => void }) {
   const generated = generatedText(result);
   return (
      <>
         {generated.fields
            ? STAR_KEYS.filter((key) => generated.fields![key] !== "").map((key) => (
                 <div key={key} className="space-y-1">
                    <h4 className="text-supporting font-medium text-foreground">{LABEL[key]}</h4>
                    <p className="text-body whitespace-pre-wrap text-foreground">{generated.fields![key]}</p>
                 </div>
              ))
            : generated.body && <p className="text-body whitespace-pre-wrap text-foreground">{generated.body}</p>}
         {generated.empty && <p className="text-body text-foreground">The draft left every field empty and asks you questions instead. There is nothing to apply.</p>}
         <Questions items={result.questions_to_ask_yourself} />
         {!generated.empty && (
            <p className="text-supporting text-muted-foreground">Apply replaces your text in the fields the draft fills; a field it left empty keeps your text. Insert adds the draft after your text.</p>
         )}
         <div className="flex flex-wrap gap-3">
            {!generated.empty && (
               <>
                  <Button type="button" onClick={onApply}>
                     Apply draft
                  </Button>
                  <Button type="button" variant="outline" onClick={onInsert}>
                     Insert draft
                  </Button>
               </>
            )}
            <Button type="button" variant="ghost" onClick={onDiscard}>
               Discard draft
            </Button>
         </div>
      </>
   );
}

export function ReviewPreview({ result, onDiscard }: { result: ReviewResult; onDiscard: () => void }) {
   return (
      <>
         {REVIEW_SECTIONS.map(({ key, title }) => result[key].length > 0 && (
            <div key={key} className="space-y-1">
               <h4 className="text-supporting font-medium text-foreground">{title}</h4>
               <ul className="list-disc space-y-1 pl-5 text-body text-foreground">
                  {result[key].map((item, index) => <li key={index}>{item}</li>)}
               </ul>
            </div>
         ))}
         <Questions items={result.questions_to_ask_yourself} />
         <p className="text-supporting text-muted-foreground">A review is feedback, not answer text, so it has nothing to apply. Your answer is unchanged.</p>
         <Button type="button" variant="ghost" onClick={onDiscard}>
            Discard review
         </Button>
      </>
   );
}

function Questions({ items }: { items: string[] }) {
   if (items.length === 0) return null;
   return (
      <div className="space-y-1">
         <h4 className="text-supporting font-medium text-foreground">Questions to ask yourself</h4>
         <ul className="list-disc space-y-1 pl-5 text-body text-foreground">
            {items.map((item, index) => <li key={index}>{item}</li>)}
         </ul>
      </div>
   );
}
