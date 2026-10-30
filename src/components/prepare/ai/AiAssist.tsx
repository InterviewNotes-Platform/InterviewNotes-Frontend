"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AnswerDraft } from "@/lib/prep/answerDraft";
import { AI_PROVIDER_BY_PLAN, PRIVACY_HREF } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import type { AiClient, AiErrorInfo, AiResult, DraftResult, RefineResult, ReviewResult } from "./aiClient";
import type { ConsentClient } from "./consent/consentClient";
import { useConsentGate, type ConsentOutcome } from "./consent/useConsentGate";
import { applyDraft, draftRequest, insertDraft, reviewRequest } from "./aiRequest";
import { KNOWN_CODES, failureMessage } from "./aiStates";
import { DraftPreview, RefinePreview, ReviewPreview } from "./ResultPreview";
import { useRefineAvailable } from "./useRefineAvailable";
import { useResultSheet } from "./useResultSheet";

type Action = "draft" | "review" | "refine";

/** A result is a preview held only here: nothing reaches the editor, the API or storage until the reader applies or inserts it. */
type Run =
   | { phase: "idle"; note?: string }
   | { phase: "pending"; action: Action; stage: "consent" | "request" }
   | { phase: "failed"; action: Action; signin: boolean; code?: string | null; info?: AiErrorInfo }
   | { phase: "draft"; result: DraftResult }
   | { phase: "review"; result: ReviewResult }
   | { phase: "refine"; result: RefineResult };

/** Where a run ends when consent was not granted. In every case no AI request was sent and the reader's text is untouched. */
function stopped(action: Action, outcome: Exclude<ConsentOutcome, "granted">): Run {
   if (outcome === "declined") return { phase: "idle", note: "AI help was not used. Nothing was sent and your answer is unchanged. You will be asked again the next time you choose an AI action." };
   if (outcome === "unavailable") return { phase: "idle", note: "AI help is not available right now. Nothing was sent and your answer is unchanged." };
   return { phase: "failed", action, signin: outcome === "signin" };
}

interface Props {
   client: AiClient;
   /** Consent is checked before every request; the first-use dialog opens only from a Draft or Review click (P7-D-042). */
   consent: ConsentClient;
   /** The answer as it stands on screen; Apply and Insert read it when clicked, not when the request was sent. */
   draft: AnswerDraft;
   /** The editor's own edit function: the only way generated text reaches the answer, and from there its normal save. */
   onChange: (next: Partial<AnswerDraft>) => void;
   signInHref: string;
}

/** Explicit Draft, Review and (when the server says it is offered) Refine for the answer editor. It starts no request on its own, and every failure leaves the reader's text as it was. */
export function AiAssist({ client, consent, draft, onChange, signInHref }: Props) {
   const ids = useId();
   const [run, setRun] = useState<Run>({ phase: "idle" });
   const first = useRef<HTMLButtonElement>(null);
   const second = useRef<HTMLButtonElement>(null);
   const third = useRef<HTMLButtonElement>(null);
   const mounted = useRef(true);
   const refocus = useRef(false);
   /** The control that started the run: focus returns to it when a preview is closed. */
   const origin = useRef<Action>("draft");
   const sheet = useResultSheet();
   /** Set synchronously on the click so a double click or a re-render can never start a second run. */
   const busy = useRef(false);
   const gate = useConsentGate(consent);
   const refineShown = useRefineAvailable(consent);
   const control = useMemo(() => ({ draft: first, review: second, refine: third }), []);
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
      if (busy.current) return;
      busy.current = true;
      origin.current = action;
      // Making the page inert for the dialog drops focus to the body; put it back on the control the reader used.
      const returnFocus = () => {
         if (!document.activeElement || document.activeElement === document.body) control[action].current?.focus();
      };
      try {
         setRun({ phase: "pending", action, stage: "consent" });
         const outcome = await gate.ask();
         if (!mounted.current) return;
         returnFocus();
         if (outcome !== "granted") return setRun(stopped(action, outcome));
         setRun({ phase: "pending", action, stage: "request" });
         const result = await send();
         if (!mounted.current) return;
         if (result.status === "ok") {
            sheet.show();
            return setRun(show(result.data));
         }
         if (result.status === "failed" && result.code === "ai_consent_required") {
            // The route and the status read disagreed: ask the same T68 gate once more and send nothing else, so editor and dialog cannot loop.
            setRun({ phase: "pending", action, stage: "consent" });
            const again = await gate.ask();
            if (!mounted.current) return;
            returnFocus();
            return setRun(again === "granted" ? { phase: "failed", action, signin: false, code: result.code } : stopped(action, again));
         }
         setRun({ phase: "failed", action, signin: result.status === "unauthenticated", code: result.status === "failed" ? result.code : null, info: result.status === "failed" ? result.info : undefined });
      } finally {
         busy.current = false;
      }
   }

   const askDraft = () => drafting && void start("draft", () => client.draft(drafting), (result) => ({ phase: "draft", result }));
   const askReview = () => reviewing && void start("review", () => client.review(reviewing), (result) => ({ phase: "review", result }));
   // Refine sends the same text as Review. It goes through the same consent gate, and the server decides again whether this reader may use it.
   const askRefine = () => refineShown && reviewing && void start("refine", () => client.refine(reviewing), (result) => ({ phase: "refine", result }));

   // Closing a preview unmounts the control that has focus, so focus goes back to where the reader started.
   function close(note?: string) {
      refocus.current = true;
      sheet.hide();
      setRun({ phase: "idle", note });
   }
   // Dismissing the sheet (Close, Escape, the backdrop) only hides it: the result stays on the page and nothing is applied or discarded.
   function dismissSheet() {
      refocus.current = true;
      sheet.hide();
   }
   // Growing past the breakpoint unmounts the sheet under the focus; the inline preview takes over, so focus goes to the control that started the run.
   const wasOpen = useRef(false);
   useEffect(() => {
      const closedByResize = wasOpen.current && !sheet.narrow;
      wasOpen.current = sheet.open;
      if (!closedByResize || (document.activeElement && document.activeElement !== document.body)) return;
      control[origin.current].current?.focus();
   }, [sheet.open, sheet.narrow, control]);
   useEffect(() => {
      if (!refocus.current || sheet.open || run.phase === "pending") return;
      refocus.current = false;
      control[origin.current].current?.focus();
   }, [run, sheet.open, control]);

   const hasText = Boolean(drafting);
   const preview =
      run.phase === "draft"
         ? {
              label: "Draft preview",
              title: "Draft preview",
              body: (
                 <DraftPreview
                    result={run.result}
                    onApply={() => { onChange(applyDraft(run.result, draft)); close("Draft applied. It is saved with your answer like anything you type."); }}
                    onInsert={() => { onChange(insertDraft(run.result, draft)); close("Draft inserted after your text. It is saved with your answer like anything you type."); }}
                    onDiscard={() => close("Draft discarded. Nothing was saved from it.")}
                 />
              ),
           }
         : run.phase === "review"
           ? { label: "Review preview", title: "Review", body: <ReviewPreview result={run.result} onDiscard={() => close("Review discarded.")} /> }
           : run.phase === "refine"
             ? {
                  label: "Refine preview",
                  title: "Refine suggestion",
                  body: (
                     <RefinePreview
                        result={run.result}
                        current={draft}
                        onApply={() => { onChange(applyDraft(run.result, draft)); close("Refinement applied. It is saved with your answer like anything you type."); }}
                        onInsert={() => { onChange(insertDraft(run.result, draft)); close("Refinement inserted after your text. It is saved with your answer like anything you type."); }}
                        onDiscard={() => close("Refinement discarded. Nothing was saved from it.")}
                     />
                  ),
               }
             : null;

   return (
      <section aria-labelledby={`${ids}-ai`} className="space-y-4 rounded-lg border border-border p-5">
         <div className="space-y-1">
            <h2 id={`${ids}-ai`} className="text-subsection text-foreground">
               AI help
            </h2>
            <p id={`${ids}-note`} className="text-supporting text-muted-foreground">
               Results are previews. Nothing in your answer changes until you apply or insert one.
            </p>
            <p className="text-supporting text-muted-foreground">
               When you choose {refineShown ? "Draft, Review or Refine" : "Draft or Review"}, your question and the text you chose go to the AI provider for your plan ({AI_PROVIDER_BY_PLAN.map(({ plan, provider }) => `${provider} on ${plan}`).join(", ")}).{" "}
               <a href={PRIVACY_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">
                  Privacy &amp; AI Use, opens in a new tab
               </a>
            </p>
         </div>
         <div className="flex flex-wrap items-center gap-3">
            <Button ref={first} type="button" variant="outline" aria-disabled={pending || !drafting} aria-describedby={`${ids}-note`} className={cn((pending || !drafting) && "opacity-50")} onClick={askDraft}>
               Draft from my notes
            </Button>
            <Button ref={second} type="button" variant="outline" aria-disabled={pending || !reviewing} aria-describedby={`${ids}-note`} className={cn((pending || !reviewing) && "opacity-50")} onClick={askReview}>
               Review my answer
            </Button>
            {refineShown && (
               <Button ref={third} type="button" variant="outline" aria-disabled={pending || !reviewing} aria-describedby={`${ids}-note ${ids}-refine`} className={cn((pending || !reviewing) && "opacity-50")} onClick={askRefine}>
                  Refine my answer
               </Button>
            )}
         </div>
         {refineShown && (
            <p id={`${ids}-refine`} className="text-supporting text-muted-foreground">
               Refine suggests a rewrite of your own answer as a preview. It may not keep your meaning exactly, so you compare it with your text before you apply, insert or discard it.
            </p>
         )}
         {!hasText && <p className="text-supporting text-muted-foreground">Write some notes or part of an answer first. Draft and Review work from the text above.</p>}

         <div role="status" className="text-supporting text-foreground empty:hidden">
            {run.phase === "pending" && run.stage === "consent" && "Checking your AI consent… Nothing is sent until you have accepted."}
            {run.phase === "pending" && run.stage === "request" && `${run.action === "draft" ? "Writing a draft" : run.action === "refine" ? "Refining your answer" : "Reviewing your answer"}… This can take up to two minutes. Your text stays as it is.`}
            {run.phase === "idle" && run.note}
            {run.phase === "draft" && "Draft ready. Review it before using it."}
            {run.phase === "review" && "Review ready."}
            {run.phase === "refine" && "Refinement ready. Compare it with your text before using it."}
         </div>

         {run.phase === "failed" && (
            <div role="alert" data-ai-state={run.signin ? "signin" : run.code && KNOWN_CODES.includes(run.code) ? run.code : "error"} className="space-y-2 text-body text-foreground">
               <p>
                  {run.signin
                     ? "Your session has ended. Your answer remains unchanged, and no AI result was saved. Sign in to try again."
                     : failureMessage(run.code, run.action, run.info)}
               </p>
               {run.signin && (
                  <Link href={signInHref} className="inline-flex min-h-11 items-center underline underline-offset-4">
                     Sign in
                  </Link>
               )}
            </div>
         )}

         {preview && !sheet.narrow && (
            <div role="region" aria-label={preview.label} className="space-y-4 rounded-md bg-muted/50 p-4">
               <h3 className="text-body font-medium text-foreground">{preview.title}</h3>
               {preview.body}
            </div>
         )}
         {preview && sheet.narrow && !sheet.open && (
            <Button type="button" variant="outline" onClick={sheet.show}>
               Show {run.phase === "draft" ? "draft preview" : run.phase === "refine" ? "refinement preview" : "review"}
            </Button>
         )}
         {preview && sheet.narrow && (
            <Sheet open={sheet.open} onOpenChange={(next) => !next && dismissSheet()}>
               <SheetContent
                  side="bottom"
                  className="max-h-[85dvh] gap-0 rounded-t-xl"
                  onOpenAutoFocus={(event) => {
                     // The first control inside is Apply; land on the title so the reader hears what opened before choosing anything.
                     event.preventDefault();
                     (event.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-slot=sheet-title]")?.focus();
                  }}
                  onCloseAutoFocus={(event) => event.preventDefault()}
               >
                  <SheetHeader className="pr-14">
                     <SheetTitle tabIndex={-1} className="text-body outline-none">
                        {preview.title}
                     </SheetTitle>
                     <SheetDescription>Nothing in your answer changes until you apply or insert. Closing this keeps the result on the page.</SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 space-y-4 overflow-y-auto px-4 pb-6">{preview.body}</div>
               </SheetContent>
            </Sheet>
         )}
         {gate.dialog}
      </section>
   );
}
