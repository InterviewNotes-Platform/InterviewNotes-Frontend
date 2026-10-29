"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SLOW_NOTICE_MS } from "@/app/prepare/PrepareWorkspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { SaveStatus } from "@/components/ui/save-status";
import { catalogHref } from "@/lib/catalog/routes";
import { STAR_KEYS, hasStarText, starText, type StarKey } from "@/lib/prep/answerDraft";
import { aiEnabled } from "@/lib/ai-flag";
import { AiAssist } from "@/components/prepare/ai/AiAssist";
import { createAiClient, type AiClient } from "@/components/prepare/ai/aiClient";
import { createConsentClient, type ConsentClient } from "@/components/prepare/ai/consent/consentClient";
import { createPrepClient, type PrepClient } from "@/lib/prep/client";
import { answerHref } from "@/lib/prep/links";
import type { CatalogQuestion } from "@/lib/prep/questions";
import { relateToCatalog } from "@/lib/prep/relation";
import type { Answer, AnswerStatus, FieldIssue, PrepResult } from "@/lib/prep/types";
import { PREPARE_HREF, PREPARE_NEW_HREF } from "@/lib/primary-navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LinkedStories } from "@/components/prepare/stories/LinkedStories";
import { TagInput } from "@/components/prepare/stories/TagInput";
import { DeleteAnswer } from "./DeleteAnswer";
import { useAnswerEditor } from "./useAnswerEditor";
import { useLeaveGuard } from "./useLeaveGuard";

const STATUSES: readonly { value: AnswerStatus; label: string }[] = [
   { value: "draft", label: "Draft" },
   { value: "in_progress", label: "In progress" },
   { value: "ready", label: "Ready" },
];

const STAR_COPY: Record<StarKey, { label: string; hint: string }> = {
   situation: { label: "Situation", hint: "The context: where and when, and what was at stake." },
   task: { label: "Task", hint: "Your responsibility: what you needed to achieve." },
   action: { label: "Action", hint: "What you did, in the first person." },
   result: { label: "Result", hint: "What happened, with numbers where you can." },
};

const CHOICE =
   "flex min-h-11 cursor-pointer items-center rounded-lg border border-border px-5 py-3 text-body transition-micro hover:border-primary " +
   "has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]";

const SELECT =
   "border-input h-11 w-full max-w-xs rounded-md border bg-transparent px-3 text-base shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm dark:bg-input/30";

const REASONS: Record<FieldIssue["reason"], string> = {
   required: "This is required.",
   too_long: "This is too long to save.",
   too_short: "This is too short to save.",
   invalid_format: "This is not in a form the server accepts.",
   invalid_value: "The server did not accept this text.",
   unknown_field: "The server did not accept this field.",
};

type Load = { phase: "loading" } | { phase: "ready"; answer: Answer } | { phase: "signin" } | { phase: "failed"; message: string; retry: boolean };

interface Props {
   /** The API origin the browser calls; null when the environment has none. */
   apiUrl: string | null;
   answerId: string;
   /** The Behavioral questions as the Lessons now state them, or null when they could not be read. */
   catalog: readonly CatalogQuestion[] | null;
   getAccessToken?: () => Promise<string | null>;
   fetch?: typeof fetch;
}

async function sessionToken(): Promise<string | null> {
   const { data } = await createClient().auth.getSession();
   return data.session?.access_token ?? null;
}

function loadFailure(result: PrepResult<Answer>): Load {
   switch (result.status) {
      case "unauthenticated":
         return { phase: "signin" };
      case "notFound":
         return { phase: "failed", message: "We could not find this answer. It may have been deleted, or the workspace is not available.", retry: false };
      case "unavailable":
         return {
            phase: "failed",
            message: result.cause === "timeout" ? "The server took too long to answer." : "We could not reach the preparation service.",
            retry: true,
         };
      default:
         return { phase: "failed", message: "The preparation service sent a response we could not use.", retry: true };
   }
}

export function AnswerEditor({ apiUrl, answerId, catalog, getAccessToken = sessionToken, fetch: fetchImpl }: Props) {
   const [load, setLoad] = useState<Load>(apiUrl ? { phase: "loading" } : { phase: "failed", message: "The preparation service is not configured for this environment.", retry: false });
   const [slow, setSlow] = useState(false);
   const [attempt, setAttempt] = useState(0);
   const [deleted, setDeleted] = useState<"deleted" | "missing" | null>(null);
   const client = useMemo(
      () => (apiUrl ? createPrepClient({ baseUrl: apiUrl, getAccessToken, fetch: fetchImpl }) : null),
      [apiUrl, getAccessToken, fetchImpl]
   );

   const ai = useMemo(
      () => (apiUrl && aiEnabled() ? { client: createAiClient({ baseUrl: apiUrl, getAccessToken, fetch: fetchImpl }), consent: createConsentClient({ baseUrl: apiUrl, getAccessToken, fetch: fetchImpl }) } : null),
      [apiUrl, getAccessToken, fetchImpl]
   );

   useEffect(() => {
      if (!client) return;
      let current = true;
      const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS);
      client.getAnswer(answerId).then((result) => {
         if (!current) return;
         clearTimeout(timer);
         setSlow(false);
         setLoad(result.status === "ok" ? { phase: "ready", answer: result.data } : loadFailure(result));
      });
      return () => {
         current = false;
         clearTimeout(timer);
      };
   }, [client, answerId, attempt]);

   const signInHref = `/login?redirect=${encodeURIComponent(answerHref(answerId))}`;

   if (deleted) return <AnswerDeleted outcome={deleted} />;
   if (load.phase === "ready" && client) return <AnswerForm initial={load.answer} client={client} catalog={catalog} ai={ai} signInHref={signInHref} onDeleted={setDeleted} />;
   return (
      <div className="space-y-4">
         <BackLink />
         {load.phase === "loading" && (
            <p role="status" className="text-body text-muted-foreground">
               Loading your answer…
               {slow && " This is taking longer than usual, which can happen after a period of inactivity. Please keep this page open."}
            </p>
         )}
         {load.phase === "signin" && (
            <div role="alert" className="space-y-3">
               <p className="text-body text-foreground">Your session has ended. Sign in again to open this answer.</p>
               <Button asChild>
                  <Link href={signInHref}>Sign in</Link>
               </Button>
            </div>
         )}
         {load.phase === "failed" && (
            <div role="alert" className="space-y-3">
               <p className="text-body text-foreground">{load.message}</p>
               {load.retry && (
                  <Button
                     variant="outline"
                     onClick={() => {
                        setLoad({ phase: "loading" });
                        setAttempt((n) => n + 1);
                     }}
                  >
                     Try again
                  </Button>
               )}
            </div>
         )}
      </div>
   );
}

function BackLink() {
   return (
      <Link
         href={PREPARE_HREF}
         prefetch={false}
         className="inline-flex min-h-11 items-center text-supporting text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
         Back to your workspace
      </Link>
   );
}

/** Shown instead of the form once the API has answered the deletion; the form, its autosave and its leave guard are gone with it. */
function AnswerDeleted({ outcome }: { outcome: "deleted" | "missing" }) {
   const heading = useRef<HTMLHeadingElement>(null);
   useEffect(() => heading.current?.focus(), []);
   return (
      <div className="space-y-4">
         <BackLink />
         <h1 ref={heading} tabIndex={-1} className="text-section text-foreground">
            {outcome === "deleted" ? "Answer deleted" : "Answer not found"}
         </h1>
         <p role="status" className="text-body text-foreground">
            {outcome === "deleted"
               ? "The server confirmed that this answer was deleted."
               : "This answer was not found in your workspace, so this request deleted nothing."}
         </p>
         <Button asChild>
            <Link href={PREPARE_NEW_HREF} prefetch={false}>
               Answer a question
            </Link>
         </Button>
      </div>
   );
}

function issueText(issues: FieldIssue[], field: string): string | undefined {
   const found = issues.find((issue) => issue.field === field);
   return found && REASONS[found.reason];
}

interface FormProps {
   initial: Answer;
   client: PrepClient;
   catalog: readonly CatalogQuestion[] | null;
   /** Null while the build's AI setting is off: no AI control is drawn. */
   ai: { client: AiClient; consent: ConsentClient } | null;
   signInHref: string;
   onDeleted: (outcome: "deleted" | "missing") => void;
}

function AnswerForm({ initial, client, catalog, ai, signInHref, onDeleted }: FormProps) {
   const router = useRouter();
   const ids = useId();
   const editor = useAnswerEditor({ initial, client, onCopied: (id) => void leave(() => router.push(answerHref(id))) });
   const { saved, draft, write, copy, dirty, hasPendingWork, blankQuestion, cannotSave, canDuplicate, issues, saveState, edit, editStar, save, persist, settle, check, keepMine, loadServer, duplicate, allowAnotherCopy } = editor;
   const { leave, leaving } = useLeaveGuard({ active: hasPendingWork, settle });
   const saveMessage = leaving && saveState === "saving" ? "Saving before you leave…" : editor.saveMessage;
   const statusRef = useRef<HTMLDivElement>(null);
   const choiceRef = useRef<HTMLDivElement>(null);
   const chose = useRef(false);

   // The choice buttons unmount when a choice is made. Focus then goes to the status, or back to the choice if it reopens,
   // unless the reader has already moved on to something else (the status itself still counts as not moved on).
   useEffect(() => {
      if (!chose.current || (write.phase === "conflict" && write.busy)) return;
      const held = document.activeElement;
      const lost = !held || held === document.body || held === statusRef.current || choiceRef.current?.contains(held);
      if (write.phase !== "saving") chose.current = false;
      if (!lost) return;
      (write.phase === "conflict" ? choiceRef.current : statusRef.current)?.focus();
   }, [write]);
   const choose = (run: () => void) => () => {
      chose.current = true;
      run();
   };
   const freeForm = draft.framework === "free_form";
   const custom = saved.source === "custom";

   const relation = !custom && catalog && saved.content_id && saved.question_id
      ? relateToCatalog({ content_id: saved.content_id, question_id: saved.question_id, question_snapshot: saved.question_snapshot, snapshot_fallback: saved.snapshot_fallback }, catalog)
      : null;
   const lesson = !custom && saved.content_id && saved.question_id && relation?.state !== "removed" ? catalogHref(saved.content_id) : null;

   return (
      <>
      <form onSubmit={save} onBlur={() => void persist()} noValidate className="space-y-8">
         <div className="space-y-3">
            <BackLink />
            <h1 className="text-section text-foreground">Your answer</h1>
         </div>

         <section aria-labelledby={`${ids}-question`} className="space-y-3">
            <h2 id={`${ids}-question`} className="text-subsection text-foreground">
               Question
            </h2>
            {custom ? (
               <Field label="Your question" required error={blankQuestion ? "Enter the question." : issueText(issues, "question_snapshot")}>
                  <Textarea rows={2} value={draft.question_snapshot} onChange={(event) => edit({ question_snapshot: event.target.value })} />
               </Field>
            ) : (
               <>
                  <p className="text-body text-foreground">{saved.question_snapshot}</p>
                  {saved.snapshot_fallback && <p className="text-supporting text-muted-foreground">The Lesson had no question line for this section, so this text is the section heading.</p>}
                  {relation && relation.state !== "current" && (
                     <p role="note" className="text-supporting text-foreground">
                        The question changed in the Lesson.{" "}
                        {relation.question
                           ? `It now reads: “${relation.question.text}” Your answer keeps the question you chose.`
                           : "It is no longer in the Lesson. Your answer keeps the question you chose."}
                     </p>
                  )}
               </>
            )}
            {lesson && saved.question_id && (
               <p className="text-supporting">
                  <a
                     href={`${lesson}#${saved.question_id}`}
                     target="_blank"
                     rel="noopener"
                     className="inline-flex min-h-11 items-center text-primary underline underline-offset-4 decoration-primary/40 transition-micro hover:decoration-primary"
                  >
                     Read the Lesson guidance<span className="sr-only"> for this question (opens in a new tab)</span>
                  </a>
               </p>
            )}
         </section>

         <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
            <fieldset className="space-y-2">
               <legend className="text-sm leading-snug font-medium">Writing format</legend>
               <div className="flex flex-wrap gap-3">
                  {(
                     [
                        ["star", "STAR"],
                        ["free_form", "Free-form"],
                     ] as const
                  ).map(([value, label]) => (
                     <label key={value} className={CHOICE}>
                        <input
                           type="radio"
                           name={`${ids}-format`}
                           value={value}
                           checked={(value === "free_form") === freeForm}
                           onChange={() => edit({ framework: value })}
                           className="sr-only"
                        />
                        {label}
                     </label>
                  ))}
               </div>
            </fieldset>
            <Field label="Status" className="min-w-48" error={issueText(issues, "status")}>
               <select value={draft.status} onChange={(event) => edit({ status: event.target.value as AnswerStatus })} className={SELECT}>
                  {STATUSES.map(({ value, label }) => (
                     <option key={value} value={value}>
                        {label}
                     </option>
                  ))}
               </select>
            </Field>
         </div>

         <section aria-labelledby={`${ids}-writing`} className="space-y-5">
            <h2 id={`${ids}-writing`} className="sr-only">
               Your answer text
            </h2>
            {freeForm ? (
               <>
                  <Field label="Your answer" description="Write the answer in your own words." error={issueText(issues, "body")}>
                     <Textarea rows={12} value={draft.body} onChange={(event) => edit({ body: event.target.value })} />
                  </Field>
                  {hasStarText(draft.fields) && (
                     <Field label="STAR notes" description="Kept with your answer and shown here so nothing is hidden. Switch to STAR to edit them.">
                        <Textarea rows={8} readOnly value={starText(draft.fields)} />
                     </Field>
                  )}
               </>
            ) : (
               <>
                  {STAR_KEYS.map((key) => (
                     <Field key={key} label={STAR_COPY[key].label} description={STAR_COPY[key].hint} error={issueText(issues, `fields.${key}`)}>
                        <Textarea rows={4} value={draft.fields[key]} onChange={(event) => editStar(key, event.target.value)} />
                     </Field>
                  ))}
                  {draft.body !== "" && (
                     <Field label="Free-form text" description="Kept with your answer and shown here so nothing is hidden. Switch to Free-form to edit it.">
                        <Textarea rows={6} readOnly value={draft.body} />
                     </Field>
                  )}
               </>
            )}
         </section>

         {ai && <AiAssist client={ai.client} consent={ai.consent} draft={draft} onChange={edit} signInHref={signInHref} />}

         <TagInput subject="answer" tags={draft.tags} onChange={(tags) => edit({ tags })} error={issueText(issues, "tags")} />

         <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
               <Button type="submit" size="lg" aria-disabled={cannotSave} className={cn(cannotSave && "opacity-50")}>
                  Save changes
               </Button>
               <Button type="button" variant="outline" size="lg" aria-disabled={!canDuplicate} className={cn(!canDuplicate && "opacity-50")} onClick={duplicate}>
                  Duplicate
               </Button>
               <DeleteAnswer client={client} answer={saved} onDeleted={onDeleted} />
               <SaveStatus ref={statusRef} tabIndex={-1} status={saveState} message={saveMessage} />
            </div>
            {dirty && <p className="text-supporting text-muted-foreground">Save your changes before duplicating: a copy holds what is saved.</p>}
            {write.phase === "unknown" && (
               <Button type="button" variant="outline" disabled={write.checking} onClick={check}>
                  {write.checking ? "Checking…" : "Check the saved answer"}
               </Button>
            )}
            {write.phase === "conflict" && (
               <div ref={choiceRef} tabIndex={-1} role="group" aria-label="Choose which version to keep" className="space-y-3">
                  <p className="text-supporting text-foreground">A newer version of this answer was saved elsewhere. Nothing has been replaced yet; your text here is unsaved.</p>
                  <div className="flex flex-wrap gap-3">
                     <Button type="button" aria-disabled={write.busy} className={cn(write.busy && "opacity-50")} onClick={choose(keepMine)}>
                        Keep mine
                     </Button>
                     <Button type="button" variant="outline" aria-disabled={write.busy} className={cn(write.busy && "opacity-50")} onClick={choose(loadServer)}>
                        Load server version
                     </Button>
                  </div>
                  <p className="text-supporting text-muted-foreground">
                     {write.busy ? "Checking the latest version…" : "Keep mine saves what is here over the newer version. Load server version replaces what is here with it."}
                  </p>
               </div>
            )}
            {write.phase === "signin" && (
               <Button asChild>
                  <Link href={signInHref}>Sign in</Link>
               </Button>
            )}
            <div role="status" className="min-h-5 text-supporting text-foreground">
               {copy.phase === "working" && "Duplicating…"}
               {copy.phase === "done" && "Copy created. Opening it…"}
               {copy.phase === "unknown" && (
                  <>
                     We could not confirm that the copy was made. It may exist, so check{" "}
                     <Link href={PREPARE_HREF} prefetch={false} className="underline underline-offset-4">
                        your workspace
                     </Link>{" "}
                     before duplicating again.
                  </>
               )}
               {copy.phase === "failed" && (
                  <>
                     {copy.message}
                     {copy.signin && (
                        <>
                           {" "}
                           <Link href={signInHref} className="underline underline-offset-4">
                              Sign in
                           </Link>
                        </>
                     )}
                  </>
               )}
            </div>
            {copy.phase === "unknown" && (
               <Button type="button" variant="outline" onClick={allowAnotherCopy}>
                  I checked: no copy exists. Allow duplicating again
               </Button>
            )}
         </div>
      </form>
      <LinkedStories client={client} answerId={saved.id} initialStoryIds={initial.story_ids} />
      </>
   );
}
