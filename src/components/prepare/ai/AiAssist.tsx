"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { STAR_KEYS, type AnswerDraft } from "@/lib/prep/answerDraft";
import { cn } from "@/lib/utils";
import type { AiClient, AiResult, DraftResult, ReviewResult } from "./aiClient";
import { applyDraft, draftRequest, generatedText, insertDraft, reviewRequest } from "./aiRequest";

type Action = "draft" | "review";

/** A result is a preview held only here: nothing reaches the editor, the API or storage until the reader applies or inserts it. */
type Run =
   | { phase: "idle"; note?: string }
   | { phase: "pending"; action: Action }
   | { phase: "failed"; action: Action; signin: boolean }
   | { phase: "draft"; result: DraftResult }
   | { phase: "review"; result: ReviewResult };

const LABEL = { situation: "Situation", task: "Task", action: "Action", result: "Result" } as const;

const REVIEW_SECTIONS: readonly { key: keyof Omit<ReviewResult, "questions_to_ask_yourself">; title: string }[] = [
   { key: "missing", title: "Missing" },
   { key: "weak", title: "Weak or vague" },
   { key: "claims_to_verify", title: "Claims to verify" },
];

interface Props {
   client: AiClient;
   /** The answer as it stands on screen; Apply and Insert read it when clicked, not when the request was sent. */
   draft: AnswerDraft;
   /** The editor's own edit function: the only way generated text reaches the answer, and from there its normal save. */
   onChange: (next: Partial<AnswerDraft>) => void;
   signInHref: string;
}

/** Explicit Draft and Review for the answer editor. It starts no request on its own, and every failure leaves the reader's text as it was. */
export function AiAssist({ client, draft, onChange, signInHref }: Props) {
   const ids = useId();
   const [run, setRun] = useState<Run>({ phase: "idle" });
   const first = useRef<HTMLButtonElement>(null);
   const mounted = useRef(true);
   const refocus = useRef(false);
   const pending = run.phase === "pending";
   const drafting = draftRequest(draft);
   const reviewing = reviewRequest(draft);

   useEffect(() => {
      mounted.current = true;
      return () => {
         mounted.current = false;
      };
   }, []);

   async function start<T>(action: Action, send: () => Promise<AiResult<T>>, show: (data: T) => Run) {
      if (pending) return;
      setRun({ phase: "pending", action });
      const result = await send();
      if (!mounted.current) return;
      if (result.status === "ok") setRun(show(result.data));
      else setRun({ phase: "failed", action, signin: result.status === "unauthenticated" });
   }

   const askDraft = () => drafting && void start("draft", () => client.draft(drafting), (result) => ({ phase: "draft", result }));
   const askReview = () => reviewing && void start("review", () => client.review(reviewing), (result) => ({ phase: "review", result }));

   // Closing a preview unmounts the control that has focus, so focus goes back to where the reader started.
   function close(note?: string) {
      refocus.current = true;
      setRun({ phase: "idle", note });
   }
   useEffect(() => {
      if (run.phase !== "idle" || !refocus.current) return;
      refocus.current = false;
      first.current?.focus();
   }, [run]);

   const hasText = Boolean(drafting);
   const generated = run.phase === "draft" ? generatedText(run.result) : null;

   return (
      <section aria-labelledby={`${ids}-ai`} className="space-y-4 rounded-lg border border-border p-5">
         <div className="space-y-1">
            <h2 id={`${ids}-ai`} className="text-subsection text-foreground">
               AI help
            </h2>
            <p id={`${ids}-note`} className="text-supporting text-muted-foreground">
               Results are previews. Nothing in your answer changes until you apply or insert one.
            </p>
         </div>
         <div className="flex flex-wrap items-center gap-3">
            <Button ref={first} type="button" variant="outline" aria-disabled={pending || !drafting} aria-describedby={`${ids}-note`} className={cn((pending || !drafting) && "opacity-50")} onClick={askDraft}>
               Draft from my notes
            </Button>
            <Button type="button" variant="outline" aria-disabled={pending || !reviewing} aria-describedby={`${ids}-note`} className={cn((pending || !reviewing) && "opacity-50")} onClick={askReview}>
               Review my answer
            </Button>
         </div>
         {!hasText && <p className="text-supporting text-muted-foreground">Write some notes or part of an answer first. Draft and Review work from the text above.</p>}

         <div role="status" className="text-supporting text-foreground empty:hidden">
            {run.phase === "pending" && `${run.action === "draft" ? "Writing a draft" : "Reviewing your answer"}… This can take up to two minutes. Your text stays as it is.`}
            {run.phase === "idle" && run.note}
            {run.phase === "draft" && "Draft ready. Review it below before using it."}
            {run.phase === "review" && "Review ready."}
         </div>

         {run.phase === "failed" && (
            <div role="alert" className="space-y-2 text-body text-foreground">
               <p>
                  {run.signin
                     ? "Your session has ended. Your answer remains unchanged, and no AI result was saved. Sign in to try again."
                     : `We couldn't ${run.action === "draft" ? "write a draft" : "review your answer"} just now. Your text is unchanged and nothing was saved from this. You can try again.`}
               </p>
               {run.signin && (
                  <Link href={signInHref} className="inline-flex min-h-11 items-center underline underline-offset-4">
                     Sign in
                  </Link>
               )}
            </div>
         )}

         {run.phase === "draft" && generated && (
            <div role="region" aria-label="Draft preview" className="space-y-4 rounded-md bg-muted/50 p-4">
               <h3 className="text-body font-medium text-foreground">Draft preview</h3>
               {generated.fields
                  ? STAR_KEYS.filter((key) => generated.fields![key] !== "").map((key) => (
                       <div key={key} className="space-y-1">
                          <h4 className="text-supporting font-medium text-foreground">{LABEL[key]}</h4>
                          <p className="text-body whitespace-pre-wrap text-foreground">{generated.fields![key]}</p>
                       </div>
                    ))
                  : generated.body && <p className="text-body whitespace-pre-wrap text-foreground">{generated.body}</p>}
               {generated.empty && <p className="text-body text-foreground">The draft left every field empty and asks you questions instead. There is nothing to apply.</p>}
               <Questions items={run.result.questions_to_ask_yourself} />
               {!generated.empty && (
                  <p className="text-supporting text-muted-foreground">Apply replaces your text in the fields the draft fills; a field it left empty keeps your text. Insert adds the draft after your text.</p>
               )}
               <div className="flex flex-wrap gap-3">
                  {!generated.empty && (
                     <>
                        <Button type="button" onClick={() => { onChange(applyDraft(run.result, draft)); close("Draft applied. It is saved with your answer like anything you type."); }}>
                           Apply draft
                        </Button>
                        <Button type="button" variant="outline" onClick={() => { onChange(insertDraft(run.result, draft)); close("Draft inserted after your text. It is saved with your answer like anything you type."); }}>
                           Insert draft
                        </Button>
                     </>
                  )}
                  <Button type="button" variant="ghost" onClick={() => close("Draft discarded. Nothing was saved from it.")}>
                     Discard draft
                  </Button>
               </div>
            </div>
         )}

         {run.phase === "review" && (
            <div role="region" aria-label="Review preview" className="space-y-4 rounded-md bg-muted/50 p-4">
               <h3 className="text-body font-medium text-foreground">Review</h3>
               {REVIEW_SECTIONS.map(({ key, title }) => run.result[key].length > 0 && (
                  <div key={key} className="space-y-1">
                     <h4 className="text-supporting font-medium text-foreground">{title}</h4>
                     <ul className="list-disc space-y-1 pl-5 text-body text-foreground">
                        {run.result[key].map((item, index) => <li key={index}>{item}</li>)}
                     </ul>
                  </div>
               ))}
               <Questions items={run.result.questions_to_ask_yourself} />
               <p className="text-supporting text-muted-foreground">A review is feedback, not answer text, so it has nothing to apply. Your answer is unchanged.</p>
               <Button type="button" variant="ghost" onClick={() => close("Review discarded.")}>
                  Discard review
               </Button>
            </div>
         )}
      </section>
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
