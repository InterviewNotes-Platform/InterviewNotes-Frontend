"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PRACTICE_DATA_NOTICE, PRACTICE_TERMS_HREF, PRACTICE_TERMS_VERSION } from "@/lib/practice-terms";
import { newIdempotencyKey, type PracticeClient, type PracticeFailure } from "@/lib/practice-workspace/client";
import type { ConsentDocumentStatus, Seniority } from "@/lib/practice-workspace/types";
import { SENIORITY_NAME } from "./HistoryRoute";

type Step =
   | { kind: "choose"; note?: string }
   | { kind: "checking" }
   | { kind: "acknowledge"; version: string; note?: string; busy?: boolean }
   | { kind: "starting" }
   | { kind: "failed"; message: string; retry: "start" | "choose"; historyLink?: boolean }
   | { kind: "closed" };

interface Props {
   contentId: string;
   seniorities: readonly Seniority[];
   client: PracticeClient;
   signal: AbortSignal;
   /** The control that opens the dialog; focus returns to it when the dialog closes. */
   trigger: ReactNode;
}

const FAILURE: Partial<Record<NonNullable<PracticeFailure["code"]>, string>> = {
   practice_not_ready: "This Problem is not ready for practice yet.",
   practice_disabled: "Practice is not available right now.",
   content_withdrawn: "This Problem is no longer available for practice.",
};

/**
 * Start a self-guided attempt: choose a seniority the Problem targets, read the practice-data acknowledgement when the server says one is needed,
 * create the attempt, open the workspace. Declining the acknowledgement closes the dialog and leaves the reader as it was. It fails closed:
 * without a required notice version, or with one other than the practice data terms this build shows (`PRACTICE_TERMS_VERSION`), nothing
 * is accepted and nothing is created. The notice wording is T17's (`src/lib/practice-terms.ts`).
 *
 * One create operation has one idempotency key, kept across retries of the same choice, so a lost reply followed by a retry cannot make a second
 * attempt; a second click while one request is in the air does nothing.
 *
 * The learner's default seniority (`P9-AC-01.8`, the owner-scoped `/preference` of the M1 contract) preselects a choice when this Problem targets
 * it, and a started attempt records its seniority as the new default. Both are best effort: a failed read preselects nothing, a failed write is
 * ignored, and nothing is written unless the current version was read first (no blind overwrite). No Track-label mapping is assumed.
 */
export function StartPracticeDialog({ contentId, seniorities, client, signal, trigger }: Props) {
   const router = useRouter();
   const [open, setOpen] = useState(false);
   const [step, setStep] = useState<Step>({ kind: "choose" });
   const [chosen, setChosen] = useState<Seniority | null>(seniorities.length === 1 ? seniorities[0] : null);
   const inflight = useRef(false);
   const operation = useRef<{ seniority: Seniority; key: string } | null>(null);
   // The saved default as last read from the server, or null when it was not read; written only from a read version.
   const preference = useRef<{ seniority: Seniority | null; version: number } | null>(null);

   async function readPreference() {
      const result = await client.getPreference();
      if (signal.aborted || result.status !== "ok") return;
      // The preference reader does not validate the body (the client's `pending()` reader), so check its shape here.
      const { default_seniority: saved, version }: { default_seniority?: unknown; version?: unknown } = result.data ?? {};
      if (typeof version !== "number" || !Number.isInteger(version) || version < 0) return;
      const known = typeof saved === "string" && (seniorities as readonly string[]).includes(saved) ? (saved as Seniority) : null;
      preference.current = { seniority: typeof saved === "string" ? (saved as Seniority) : null, version };
      if (known !== null) setChosen((current) => current ?? known);
   }

   function rememberPreference(seniority: Seniority) {
      const read = preference.current;
      if (read === null || read.seniority === seniority) return;
      preference.current = null;
      void client.putPreference({ default_seniority: seniority, version: read.version === 0 ? null : read.version });
   }

   function reset() {
      setStep({ kind: "choose" });
      operation.current = null;
   }
   const busy = step.kind === "checking" || step.kind === "starting" || (step.kind === "acknowledge" && step.busy === true);

   async function create(seniority: Seniority) {
      {
         if (inflight.current) return;
         inflight.current = true;
         setStep({ kind: "starting" });
         // The same choice reuses its key; a different seniority is a different operation.
         if (operation.current?.seniority !== seniority) operation.current = { seniority, key: newIdempotencyKey() };
         const result = await client.createAttempt({ content_id: contentId, mode: "self", target_seniority: seniority }, operation.current.key, { signal });
         inflight.current = false;
         if (signal.aborted) return;
         if (result.status === "ok") {
            operation.current = null;
            rememberPreference(seniority);
            setStep({ kind: "closed" });
            router.push(`/practice/attempts/${encodeURIComponent(result.data.id)}`);
            return;
         }
         if (result.status === "unavailable") {
            // The outcome is unknown: the attempt may exist. Retrying with the same key returns it instead of making another.
            setStep({ kind: "failed", retry: "start", message: "We could not confirm that your attempt started. Nothing was lost; try again and we will not start a second one." });
            return;
         }
         // A definite answer: this operation is over.
         const keep = result.status === "failed" && result.code === "request_in_progress";
         if (!keep) operation.current = null;
         if (result.status === "unauthenticated") return setStep({ kind: "failed", retry: "choose", message: "Your session has ended. Sign in again to start practice." });
         if (result.status === "disabled" || result.status === "notFound") return setStep({ kind: "failed", retry: "choose", message: "Practice is not available right now." });
         if (result.code === "consent_version_stale") return void begin(seniority);
         if (result.code === "validation_error") return setStep({ kind: "failed", retry: "choose", message: "That bar is not available for this Problem. Choose another." });
         if (result.code === "attempt_limit_reached") return setStep({ kind: "failed", retry: "choose", historyLink: true, message: "You have reached the limit of active attempts. Resume or end one from your attempts, then start again." });
         if (result.code === "request_in_progress") return setStep({ kind: "failed", retry: "start", message: "Your attempt is still being started. Give it a moment, then try again." });
         setStep({ kind: "failed", retry: "start", message: (result.code && FAILURE[result.code]) || "We could not start your attempt. Nothing was lost." });
      }
   }

   /** Read the consent status first: an accepted notice goes straight on; a missing version fails closed. */
   async function begin(seniority: Seniority) {
      {
         if (inflight.current) return;
         inflight.current = true;
         setStep({ kind: "checking" });
         const result = await client.getConsent({ signal });
         inflight.current = false;
         if (signal.aborted) return;
         if (result.status !== "ok") {
            return setStep({ kind: "failed", retry: "start", message: result.status === "unauthenticated" ? "Your session has ended. Sign in again to start practice." : "We could not check the practice notice, so nothing was started. Try again." });
         }
         const document: ConsentDocumentStatus = result.data.practice_data;
         if (document.state === "accepted" && document.accepted_version !== null && document.accepted_version === document.required_version) return void create(seniority);
         if (document.required_version === null || document.required_version !== PRACTICE_TERMS_VERSION) {
            // Fail closed: no terms version is required yet, or the server requires a version whose text this build does not show,
            // so there is nothing a learner could knowingly accept.
            return setStep({ kind: "failed", retry: "choose", message: "Practice is not available right now." });
         }
         setStep({ kind: "acknowledge", version: document.required_version, note: document.state === "outdated" ? PRACTICE_DATA_NOTICE.changedNote : undefined });
      }
   }

   async function accept() {
      if (step.kind !== "acknowledge" || step.busy || chosen === null || inflight.current) return;
      inflight.current = true;
      const version = step.version;
      setStep({ ...step, busy: true, note: undefined });
      const result = await client.postConsent({ document_id: "practice-data", document_version: version }, { signal });
      inflight.current = false;
      if (signal.aborted) return;
      if (result.status === "ok") return void create(chosen);
      if (result.status === "failed" && result.code === "consent_version_stale") return void begin(chosen); // read the new version, and ask again
      setStep({ kind: "acknowledge", version, note: result.status === "unauthenticated" ? "Your session has ended. Sign in again to continue." : "We could not record your choice. Nothing was started; try again." });
   }

   const onOpenChange = (next: boolean) => {
      if (next) {
         setOpen(true);
         void readPreference();
         return;
      }
      if (busy) return; // a request is being made: the dialog stays until it is answered
      setOpen(false);
      reset();
   };

   return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
         <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
         <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content
               onInteractOutside={(event) => busy && event.preventDefault()}
               className="bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-lg border p-6 shadow-lg"
            >
               {step.kind === "acknowledge" ? (
                  <>
                     <Dialog.Title className="m-0 text-subsection text-foreground">{PRACTICE_DATA_NOTICE.title}</Dialog.Title>
                     <Dialog.Description className="m-0 text-body text-muted-foreground">{PRACTICE_DATA_NOTICE.intro}</Dialog.Description>
                     <ul className="m-0 list-disc space-y-2 pl-5 text-body text-foreground">
                        {PRACTICE_DATA_NOTICE.points.map((point) => (
                           <li key={point}>{point}</li>
                        ))}
                     </ul>
                     <p className="m-0 text-supporting text-muted-foreground">
                        {PRACTICE_DATA_NOTICE.readingNote} {PRACTICE_DATA_NOTICE.declineNote}
                     </p>
                     <a href={PRACTICE_TERMS_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-body text-foreground underline underline-offset-4">
                        {PRACTICE_DATA_NOTICE.termsLinkLabel} (version {step.version}), opens in a new tab
                     </a>
                     {step.busy ? (
                        <p role="status" className="m-0 text-supporting text-muted-foreground">
                           Saving your choice…
                        </p>
                     ) : null}
                     {step.note ? (
                        <p role="alert" className="m-0 text-body text-foreground">
                           {step.note}
                        </p>
                     ) : null}
                     <div className="flex flex-wrap justify-end gap-3">
                        <Button type="button" variant="outline" className="min-h-11" aria-disabled={step.busy || undefined} onClick={() => !step.busy && onOpenChange(false)}>
                           Decline
                        </Button>
                        <Button type="button" className="min-h-11" aria-disabled={step.busy || undefined} onClick={() => void accept()}>
                           Accept and start
                        </Button>
                     </div>
                  </>
               ) : (
                  <>
                     <Dialog.Title className="m-0 text-subsection text-foreground">Practise this Problem</Dialog.Title>
                     <Dialog.Description className="m-0 text-body text-muted-foreground">
                        Work through it in your own time, stage by stage. Choose the level you are preparing for.
                     </Dialog.Description>
                     <fieldset disabled={busy} className="m-0 grid gap-2 border-0 p-0">
                        <legend className="mb-1 p-0 text-body font-semibold">Practise against the bar for</legend>
                        {seniorities.map((seniority) => (
                           <label key={seniority} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 text-body has-[:checked]:border-primary has-[:checked]:bg-accent">
                              <input type="radio" name="practice-seniority" value={seniority} checked={chosen === seniority} onChange={() => setChosen(seniority)} className="size-4 accent-[var(--primary)]" />
                              {SENIORITY_NAME[seniority]}
                           </label>
                        ))}
                     </fieldset>
                     {step.kind === "checking" || step.kind === "starting" ? (
                        <p role="status" className="m-0 text-supporting text-muted-foreground">
                           {step.kind === "checking" ? "Checking…" : "Starting your attempt…"}
                        </p>
                     ) : null}
                     {step.kind === "failed" ? (
                        <div role="alert" className="grid gap-2">
                           <p className="m-0 text-body text-foreground">{step.message}</p>
                           {step.historyLink ? (
                              <Link href="/practice/history" prefetch={false} className="inline-flex min-h-11 items-center text-body underline underline-offset-4">
                                 Your attempts
                              </Link>
                           ) : null}
                        </div>
                     ) : null}
                     <div className="flex flex-wrap justify-end gap-3">
                        <Dialog.Close asChild>
                           <Button type="button" variant="outline" className="min-h-11" aria-disabled={busy || undefined}>
                              Not now
                           </Button>
                        </Dialog.Close>
                        <Button
                           type="button"
                           className="min-h-11"
                           aria-disabled={busy || chosen === null || undefined}
                           onClick={() => {
                              if (!busy && chosen !== null) void begin(chosen);
                           }}
                        >
                           {step.kind === "failed" && step.retry === "start" ? "Try again" : "Start practice"}
                        </Button>
                     </div>
                  </>
               )}
            </Dialog.Content>
         </Dialog.Portal>
      </Dialog.Root>
   );
}
