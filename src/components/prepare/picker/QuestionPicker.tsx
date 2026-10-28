"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { createPrepClient } from "@/lib/prep/client";
import { asTargetLevel, levelLabel, TARGET_LEVELS } from "@/lib/prep/levels";
import { answerHref, newAnswerHref, sameQuestion, type QuestionRef } from "@/lib/prep/links";
import type { CatalogQuestion } from "@/lib/prep/questions";
import type { AnswerCreate, PrepResult, TargetLevel } from "@/lib/prep/types";
import { PREPARE_HREF } from "@/lib/primary-navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** After this long a pending request also says the wait is longer than usual (a cold start, P7-D-010). */
export const SLOW_NOTICE_MS = 4000;

/** The API's limit on `question_snapshot`, counted in characters (contract §3). */
export const SNAPSHOT_MAX = 1000;

/** What the server could read of the Behavioral Lessons. A failure is a failure, never an empty list. */
export type CatalogLoad =
   | { status: "ok"; questions: CatalogQuestion[] }
   | { status: "failed"; reason: "signin" | "unentitled" | "unavailable" };

type LevelFilter = "all" | TargetLevel;
type Mode = "catalog" | "custom";

type Preference =
   | { phase: "idle" }
   | { phase: "loading" }
   | { phase: "ready" }
   | { phase: "failed" };

type Save =
   | { phase: "idle" }
   | { phase: "saving" }
   | { phase: "done" }
   | { phase: "signin" }
   | { phase: "failed"; message: string; unconfirmed: boolean };

interface Props {
   /** The API origin the browser calls; null when the environment has none. */
   apiUrl: string | null;
   catalog: CatalogLoad;
   /** The question a Lesson link named. It selects a question only when the same pair is in `catalog`. */
   requested?: QuestionRef | null;
   /** Tests supply these; the page uses the browser's Supabase session and `fetch`. */
   getAccessToken?: () => Promise<string | null>;
   fetch?: typeof fetch;
}

async function sessionToken(): Promise<string | null> {
   const { data } = await createClient().auth.getSession();
   return data.session?.access_token ?? null;
}

/** A catalog answer carries its identity and the snapshot taken now; the fallback flag is explicit (contract §4.3). */
export function catalogAnswer(question: CatalogQuestion): AnswerCreate {
   return {
      source: "catalog",
      content_id: question.content_id,
      question_id: question.question_id,
      question_snapshot: question.text,
      snapshot_fallback: question.snapshot_fallback,
      framework: "star",
   };
}

/** A custom answer has no identity: it never borrows a catalog pair (contract §4.3). */
export function customAnswer(text: string): AnswerCreate {
   return { source: "custom", question_snapshot: text.trim(), framework: "star" };
}

const keyOf = (ref: QuestionRef) => JSON.stringify([ref.content_id, ref.question_id]);

function failure(result: Exclude<PrepResult<unknown>, { status: "ok" }>): Save {
   switch (result.status) {
      case "unauthenticated":
         return { phase: "signin" };
      case "notFound":
         return { phase: "failed", message: "The preparation workspace is not available right now.", unconfirmed: false };
      case "invalid":
         return { phase: "failed", message: "The server did not accept this question. Check it and try again.", unconfirmed: false };
      case "conflict":
         return { phase: "failed", message: "The preparation service sent a response we could not use.", unconfirmed: false };
      case "unavailable":
         // A write whose outcome is unknown (contract §6): the answer may exist, so the same one is not sent again until
         // the reader has looked. Only a definite refusal above leaves the form free to resubmit.
         return {
            phase: "failed",
            message:
               (result.cause === "malformed"
                  ? "The preparation service sent a response we could not use. "
                  : "We could not confirm that your answer was created. ") +
               "It may already exist, so Start answer is off for this question. Check In progress in your workspace first.",
            unconfirmed: true,
         };
   }
}

const FIELD =
   "border-input min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] md:text-sm dark:bg-input/30 " +
   "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] " +
   "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

const CHOICE =
   "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 text-body transition-micro hover:border-primary " +
   "has-[:checked]:border-primary has-[:checked]:bg-surface has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]";

export function QuestionPicker({ apiUrl, catalog, requested = null, getAccessToken = sessionToken, fetch: fetchImpl }: Props) {
   const router = useRouter();
   const ids = useId();
   const client = useMemo(
      () => (apiUrl ? createPrepClient({ baseUrl: apiUrl, getAccessToken, fetch: fetchImpl }) : null),
      [apiUrl, getAccessToken, fetchImpl]
   );
   const questions = useMemo(() => (catalog.status === "ok" ? catalog.questions : []), [catalog]);

   // A link's question is offered only if this load really contains the pair; otherwise nothing is selected.
   const linked = requested ? questions.find((question) => sameQuestion(question, requested)) : undefined;
   const linkedMissing = Boolean(requested) && catalog.status === "ok" && !linked;

   const [mode, setMode] = useState<Mode>("catalog");
   const [level, setLevel] = useState<LevelFilter>(linked?.level ?? "all");
   const [selected, setSelected] = useState<QuestionRef | null>(linked ? { content_id: linked.content_id, question_id: linked.question_id } : null);
   const [customText, setCustomText] = useState("");
   const [preference, setPreference] = useState<Preference>({ phase: "idle" });
   const [preferenceAttempt, setPreferenceAttempt] = useState(0);
   const [save, setSave] = useState<Save>({ phase: "idle" });
   const [slow, setSlow] = useState(false);
   // The saved level is only a default: once the reader has chosen a level or a question, it never moves the list.
   const interacted = useRef(Boolean(linked));
   const saving = useRef(false);
   // The question (or custom text) whose create ended without a confirmed result: it may already exist.
   const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
   const unconfirmedRef = useRef<string | null>(null);
   const selectedRef = useRef<HTMLInputElement | null>(null);

   // One read of the saved target level, only when the catalog is shown and no link already chose a question.
   const wantsPreference = Boolean(client) && catalog.status === "ok" && !linked;
   useEffect(() => {
      if (!client || !wantsPreference) return;
      let current = true;
      client.getPreference().then((result) => {
         if (!current) return;
         if (result.status !== "ok") {
            setPreference({ phase: "failed" });
            return;
         }
         setPreference({ phase: "ready" });
         const saved = asTargetLevel(result.data.target_level);
         if (saved && !interacted.current) setLevel(saved);
      });
      return () => {
         current = false;
      };
   }, [client, wantsPreference, preferenceAttempt]);

   useEffect(() => {
      if (save.phase !== "saving") return;
      const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS);
      return () => {
         clearTimeout(timer);
         setSlow(false);
      };
   }, [save.phase]);

   // Bring a question named by a Lesson link into view once, without animation.
   useEffect(() => {
      selectedRef.current?.scrollIntoView?.({ block: "center" });
      // Only on first paint: later selections are the reader's own and are already in view.
   }, []);

   const visible = level === "all" ? questions : questions.filter((question) => question.level === level);
   const customLength = [...customText.trim()].length;
   const customTooLong = customLength > SNAPSHOT_MAX;
   const busy = save.phase === "saving" || save.phase === "done";

   function chooseLevel(next: LevelFilter) {
      interacted.current = true;
      setLevel(next);
      // A selection the filter now hides would still be submitted: drop it instead.
      if (selected && next !== "all" && questions.find((question) => sameQuestion(question, selected))?.level !== next) setSelected(null);
   }

   function choose(question: CatalogQuestion) {
      interacted.current = true;
      setSelected({ content_id: question.content_id, question_id: question.question_id });
   }

   /** What this form would create now, as one comparable value; null when nothing valid is chosen. */
   const pending = ((): { key: string; body: AnswerCreate } | null => {
      if (mode === "custom") return customLength > 0 && !customTooLong ? { key: `custom:${customText.trim()}`, body: customAnswer(customText) } : null;
      const question = selected && questions.find((entry) => sameQuestion(entry, selected));
      return question ? { key: `catalog:${keyOf(question)}`, body: catalogAnswer(question) } : null;
   })();

   async function create(next: { key: string; body: AnswerCreate }) {
      if (!client || saving.current || unconfirmedRef.current === next.key) return;
      saving.current = true;
      setSave({ phase: "saving" });
      const result = await client.createAnswer(next.body);
      if (result.status === "ok") {
         // Stays disabled while the editor opens, so a second click cannot create a second answer.
         setSave({ phase: "done" });
         router.push(answerHref(result.data.id));
         return;
      }
      saving.current = false;
      const failed = failure(result);
      if (failed.phase === "failed" && failed.unconfirmed) {
         unconfirmedRef.current = next.key;
         setUnconfirmed(next.key);
      }
      setSave(failed);
   }

   /** The reader says they looked and it is not there: the one way past an unconfirmed create. */
   function createAgain() {
      if (!pending || pending.key !== unconfirmedRef.current) return;
      unconfirmedRef.current = null;
      setUnconfirmed(null);
      void create(pending);
   }

   function submit(event: FormEvent) {
      event.preventDefault();
      if (pending) void create(pending);
   }

   const signInHref = `/login?redirect=${encodeURIComponent(newAnswerHref(selected))}`;
   const awaitingCheck = pending !== null && pending.key === unconfirmed;
   const canSubmit = !busy && Boolean(client) && pending !== null && !awaitingCheck;
   // A warning about an earlier, different choice is no longer about what the form would create.
   const shown: Save = save.phase === "failed" && save.unconfirmed && !awaitingCheck ? { phase: "idle" } : save;

   return (
      <div className="space-y-8">
         <header className="space-y-3">
            <Link href={PREPARE_HREF} prefetch={false} className="text-supporting text-muted-foreground underline underline-offset-4 hover:text-foreground">
               Back to your workspace
            </Link>
            <h1 className="text-section text-foreground">Choose a question</h1>
            <p className="max-w-reading text-body text-muted-foreground">Start from a question in the Behavioral Lessons, or write your own.</p>
         </header>

         {!apiUrl && (
            <p role="alert" className="text-body text-foreground">
               The preparation service is not configured for this environment.
            </p>
         )}

         <form onSubmit={submit} className="space-y-6" noValidate>
            <fieldset className="flex flex-wrap gap-3">
               <legend className="sr-only">Where the question comes from</legend>
               {(
                  [
                     ["catalog", "Choose from the Lessons"],
                     ["custom", "Write your own"],
                  ] as const
               ).map(([value, label]) => (
                  <label key={value} className={cn(CHOICE, "px-5 has-[:checked]:bg-primary has-[:checked]:text-primary-foreground")}>
                     <input
                        type="radio"
                        name={`${ids}-mode`}
                        value={value}
                        checked={mode === value}
                        disabled={busy}
                        onChange={() => setMode(value)}
                        className="sr-only"
                     />
                     {label}
                  </label>
               ))}
            </fieldset>

            {mode === "catalog" ? (
               <section aria-labelledby={`${ids}-catalog`} className="space-y-5">
                  <h2 id={`${ids}-catalog`} className="sr-only">
                     Questions from the Lessons
                  </h2>
                  {catalog.status === "failed" ? (
                     <CatalogProblem reason={catalog.reason} signInHref={signInHref} onRetry={() => router.refresh()} onCustom={() => setMode("custom")} />
                  ) : (
                     <>
                        <div className="space-y-2">
                           <label htmlFor={`${ids}-level`} className="block text-supporting font-semibold text-foreground">
                              Level
                           </label>
                           <select
                              id={`${ids}-level`}
                              value={level}
                              disabled={busy}
                              onChange={(event) => chooseLevel(event.target.value === "all" ? "all" : (asTargetLevel(event.target.value) ?? "all"))}
                              className="border-input h-11 w-full max-w-xs rounded-md border bg-transparent px-3 text-base shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm dark:bg-input/30"
                           >
                              <option value="all">All levels</option>
                              {TARGET_LEVELS.map(({ value, label }) => (
                                 <option key={value} value={value}>
                                    {label}
                                 </option>
                              ))}
                           </select>
                           {preference.phase === "loading" && (
                              <p role="status" className="text-supporting text-muted-foreground">
                                 Checking your target level…
                              </p>
                           )}
                           {preference.phase === "failed" && (
                              <p role="status" className="text-supporting text-muted-foreground">
                                 We could not load your target level, so the level shown is your choice.{" "}
                                 <button
                                    type="button"
                                    className="text-primary underline underline-offset-4"
                                    onClick={() => {
                                       setPreference({ phase: "loading" });
                                       setPreferenceAttempt((n) => n + 1);
                                    }}
                                 >
                                    Try again
                                 </button>
                              </p>
                           )}
                        </div>

                        {linkedMissing && (
                           <p role="status" className="text-supporting text-muted-foreground">
                              The question from that link is not in the Lessons any more, so none is selected.
                           </p>
                        )}

                        <fieldset className="space-y-3">
                           <legend className="mb-3 text-supporting font-semibold text-foreground">Question</legend>
                           {visible.length === 0 ? (
                              <p className="text-body text-muted-foreground">There are no questions for this level.</p>
                           ) : (
                              <ul className="space-y-3">
                                 {visible.map((question) => {
                                    const checked = selected !== null && sameQuestion(question, selected);
                                    return (
                                       <li key={keyOf(question)}>
                                          <label className={CHOICE}>
                                             <input
                                                type="radio"
                                                name={`${ids}-question`}
                                                value={keyOf(question)}
                                                checked={checked}
                                                disabled={busy}
                                                onChange={() => choose(question)}
                                                ref={checked ? selectedRef : undefined}
                                                className="size-4 shrink-0 accent-primary"
                                             />
                                             <span className="min-w-0">
                                                <span className="block">{question.text}</span>
                                                {level === "all" && <span className="block text-supporting text-muted-foreground">{levelLabel(question.level)}</span>}
                                             </span>
                                          </label>
                                       </li>
                                    );
                                 })}
                              </ul>
                           )}
                        </fieldset>
                     </>
                  )}
               </section>
            ) : (
               <section className="space-y-2">
                  <label htmlFor={`${ids}-custom`} className="block text-supporting font-semibold text-foreground">
                     Your question
                  </label>
                  <textarea
                     id={`${ids}-custom`}
                     value={customText}
                     disabled={busy}
                     onChange={(event) => setCustomText(event.target.value)}
                     aria-invalid={customTooLong || undefined}
                     aria-describedby={`${ids}-custom-note`}
                     rows={4}
                     className={FIELD}
                  />
                  <p id={`${ids}-custom-note`} className={cn("text-supporting", customTooLong ? "text-destructive" : "text-muted-foreground")}>
                     {customTooLong
                        ? `This is ${customLength.toLocaleString("en-US")} characters; the limit is ${SNAPSHOT_MAX.toLocaleString("en-US")}.`
                        : `${customLength.toLocaleString("en-US")} of ${SNAPSHOT_MAX.toLocaleString("en-US")} characters. It is saved with your answer and is not part of the Lessons.`}
                  </p>
               </section>
            )}

            <div className="space-y-3">
               <Button type="submit" size="lg" disabled={!canSubmit}>
                  Start answer
               </Button>
               {shown.phase === "saving" && (
                  <p role="status" className="text-supporting text-muted-foreground">
                     Creating your answer…
                     {slow && " This is taking longer than usual, which can happen after a period of inactivity. Please keep this page open."}
                  </p>
               )}
               {shown.phase === "done" && (
                  <p role="status" className="text-supporting text-muted-foreground">
                     Answer created. Opening it…
                  </p>
               )}
               {shown.phase === "signin" && (
                  <div role="alert" className="space-y-3">
                     <p className="text-body text-foreground">Your session has ended. Sign in again to start your answer.</p>
                     <Button asChild variant="outline">
                        <Link href={signInHref}>Sign in</Link>
                     </Button>
                  </div>
               )}
               {shown.phase === "failed" && (
                  <div role="alert" className="space-y-2">
                     <p className="text-body text-foreground">{shown.message}</p>
                     <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <Link href={PREPARE_HREF} prefetch={false} className="text-supporting text-primary underline underline-offset-4">
                           Open your workspace
                        </Link>
                        {shown.unconfirmed && (
                           <Button type="button" variant="outline" onClick={createAgain}>
                              It is not there: create it again
                           </Button>
                        )}
                     </div>
                  </div>
               )}
            </div>
         </form>
      </div>
   );
}

function CatalogProblem({
   reason,
   signInHref,
   onRetry,
   onCustom,
}: {
   reason: "signin" | "unentitled" | "unavailable";
   signInHref: string;
   onRetry: () => void;
   onCustom: () => void;
}) {
   return (
      <div role="alert" className="space-y-3">
         <p className="text-body text-foreground">
            {reason === "signin"
               ? "Your session has ended. Sign in again to see the questions."
               : reason === "unentitled"
                 ? "The Lesson questions are not included in your access."
                 : "We could not load the questions from the Lessons right now."}
         </p>
         <div className="flex flex-wrap gap-3">
            {reason === "signin" ? (
               <Button asChild variant="outline">
                  <Link href={signInHref}>Sign in</Link>
               </Button>
            ) : reason === "unavailable" ? (
               <Button type="button" variant="outline" onClick={onRetry}>
                  Try again
               </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onCustom}>
               Write your own question
            </Button>
         </div>
      </div>
   );
}
