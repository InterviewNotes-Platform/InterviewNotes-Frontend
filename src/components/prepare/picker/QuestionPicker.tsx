"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { StartLinkNotice } from "@/components/prepare/stories/StartLinkNotice";
import { startFromStory } from "@/components/prepare/stories/startFromStory";
import { createPrepClient } from "@/lib/prep/client";
import { asTargetLevel, levelLabel, TARGET_LEVELS } from "@/lib/prep/levels";
import { answerHref, newAnswerHref, sameQuestion, type QuestionRef } from "@/lib/prep/links";
import type { CatalogQuestion } from "@/lib/prep/questions";
import type { Answer, AnswerCreate, PrepResult, TargetLevel } from "@/lib/prep/types";
import { PREPARE_HREF, PREPARE_NEW_HREF } from "@/lib/primary-navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Dock } from "./Dock";
import { GroupStage, type Unit } from "./GroupStage";
import { QuestionRow } from "./QuestionRow";
import { matchesAll, queryWords, searchable } from "./search";
import { SearchField } from "./SearchField";
import { keyOf, levelSectionsOf, sectionsOf, type PickerQuestion } from "./sections";

/** After this long a pending request also says the wait is longer than usual (a cold start, P7-D-010). */
export const SLOW_NOTICE_MS = 4000;

/** The API's limit on `question_snapshot`, counted in characters (contract §3). */
export const SNAPSHOT_MAX = 1000;

/** What the server could read of the Behavioral Lessons. A failure is a failure, never an empty list. */
export type CatalogLoad =
   | { status: "ok"; questions: CatalogQuestion<TargetLevel | null>[] }
   | { status: "failed"; reason: "signin" | "unentitled" | "unavailable" };

/** What the picker needs to know of a registry collection; the registry itself stays on the server (P7-T58). */
export type CollectionOption = {
   id: string;
   title: string;
   levelFilter: boolean;
   grouped: boolean;
   /** A short name for the collection switch; the link's accessible name stays the title. */
   short?: string;
   /** What a group is called, for the stepper and its jump menu. */
   unit?: Unit;
};

/** The statement the contract (§6) requires with the company collections, word for word. */
export const COMPANY_STATEMENT =
   "InterviewNotes-created practice material; not affiliated with or endorsed by Amazon or Google. Company hiring practices can change; these questions and signals are editorial preparation aids, not official questions or scoring rubrics.";

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
   // Starting from a story: the answer exists with its copy, but the link is not confirmed.
   | { phase: "unlinked"; answerId: string }
   | { phase: "signin" }
   | { phase: "failed"; message: string; unconfirmed: boolean };

interface Props {
   /** The API origin the browser calls; null when the environment has none. */
   apiUrl: string | null;
   catalog: CatalogLoad;
   /** The registry's collections for the selector; without them the picker is the general Behavioral one, as before P7-T59. */
   collections?: readonly CollectionOption[];
   /** The collection `catalog` was read for. */
   collectionId?: string;
   /** The question a Lesson link named. It selects a question only when the same pair is in `catalog`. */
   requested?: QuestionRef | null;
   /** Start from this story: the answer is created with a copy of its saved text, then linked. Checked by the API, not here. */
   storyId?: string | null;
   /** Which principle or theme to open, counted from 1 (the `group` parameter). It is a view position only and is ignored when it names none. */
   initialGroup?: number | null;
   /** Tests supply these; the page uses the browser's Supabase session and `fetch`. */
   getAccessToken?: () => Promise<string | null>;
   fetch?: typeof fetch;
}

async function sessionToken(): Promise<string | null> {
   const { data } = await createClient().auth.getSession();
   return data.session?.access_token ?? null;
}

/** A catalog answer carries its identity and the snapshot taken now; the fallback flag is explicit (contract §4.3). */
export function catalogAnswer(question: CatalogQuestion<TargetLevel | null>): AnswerCreate {
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

export function QuestionPicker({ apiUrl, catalog, collections = [], collectionId, requested = null, storyId = null, initialGroup = null, getAccessToken = sessionToken, fetch: fetchImpl }: Props) {
   const router = useRouter();
   const ids = useId();
   const client = useMemo(
      () => (apiUrl ? createPrepClient({ baseUrl: apiUrl, getAccessToken, fetch: fetchImpl }) : null),
      [apiUrl, getAccessToken, fetchImpl]
   );
   const questions = useMemo(() => (catalog.status === "ok" ? catalog.questions : []), [catalog]);
   const collection = collections.find(({ id }) => id === collectionId);
   const levelFilter = collection?.levelFilter ?? true;
   const grouped = collection?.grouped ?? false;

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
   const resultsRef = useRef<HTMLFieldSetElement | null>(null);

   // Which principle or theme is open: the one the URL names, else the one holding a linked question, else the first. A view position only.
   const [group, setGroup] = useState(() => {
      // Every principle or theme is a stop; so is every level of the general collection while all levels are listed.
      const all = grouped ? sectionsOf(questions) : levelFilter && !linked ? levelSectionsOf(questions) : [];
      if (all.length === 0) return 0;
      const at = initialGroup !== null && initialGroup >= 1 ? initialGroup - 1 : linked ? all.findIndex((section) => section.questions.some((question) => sameQuestion(question, linked))) : -1;
      return Math.max(0, Math.min(at, all.length - 1));
   });
   // Find a question: a filter over the collection already loaded, never a request.
   const [query, setQuery] = useState("");
   const [announced, setAnnounced] = useState("");

   // One read of the saved target level, only when the catalog is shown and no link already chose a question.
   const wantsPreference = Boolean(client) && catalog.status === "ok" && !linked && levelFilter;
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

   // The result count is spoken once typing pauses, not on every key.
   useEffect(() => {
      const timer = setTimeout(() => setAnnounced(query), 300);
      return () => clearTimeout(timer);
   }, [query]);

   // Bring a question named by a Lesson link into view once, without animation.
   useEffect(() => {
      selectedRef.current?.scrollIntoView?.({ block: "center" });
      // Only on first paint: later selections are the reader's own and are already in view.
   }, []);

   const visible = useMemo(() => (!levelFilter || level === "all" ? questions : questions.filter((question) => question.level === level)), [levelFilter, level, questions]);
   // The stops of the stepper: principles or themes, or the levels of the general collection while every level is listed.
   const stepper = grouped || (levelFilter && level === "all");
   const sections = useMemo(() => (grouped ? sectionsOf(visible) : stepper ? levelSectionsOf(visible) : []), [grouped, stepper, visible]);
   const index = useMemo(() => visible.map((question) => ({ question, text: searchable(question.title, question.text, question.group?.title) })), [visible]);
   const words = useMemo(() => queryWords(query), [query]);
   const searching = words.length > 0;
   const results = useMemo(() => (searching ? index.filter(({ text }) => matchesAll(text, words)).map(({ question }) => question) : []), [index, searching, words]);
   const here = Math.min(group, Math.max(0, sections.length - 1));
   const customLength = [...customText.trim()].length;
   const customTooLong = customLength > SNAPSHOT_MAX;
   const busy = save.phase === "saving" || save.phase === "done" || save.phase === "unlinked";

   /** Another collection is another server read of its own Lesson, so the page is asked for it, by an ordinary link. */
   function collectionHref(id: string) {
      const params = new URLSearchParams({ collection: id });
      if (storyId) params.set("story", storyId);
      return `${PREPARE_NEW_HREF}?${params}`;
   }

   /** The open position in the address, by `replaceState` only: the server page is not asked again, so no catalog is read. */
   function writeGroup(at: number) {
      const url = new URL(window.location.href);
      if (at > 0) url.searchParams.set("group", String(at + 1));
      else if (url.searchParams.has("group")) url.searchParams.delete("group");
      else return;
      window.history.replaceState(null, "", url);
   }

   /** Open another principle or theme. */
   function openGroup(next: number) {
      const at = Math.max(0, Math.min(next, sections.length - 1));
      // Moving through the list is the reader's own choice of view: a saved level arriving late must not take it away.
      interacted.current = true;
      setGroup(at);
      writeGroup(at);
   }

   /** From a search result into its principle or theme, with the question still chosen. */
   function showInGroup(title: string) {
      const at = sections.findIndex((section) => section.title === title);
      setQuery("");
      if (at >= 0) openGroup(at);
   }

   function chooseLevel(next: LevelFilter) {
      interacted.current = true;
      setLevel(next);
      if (!grouped) {
         setGroup(0);
         writeGroup(0);
      }
      // A selection the filter now hides would still be submitted: drop it instead.
      if (selected && next !== "all" && questions.find((question) => sameQuestion(question, selected))?.level !== next) setSelected(null);
   }

   function choose(question: CatalogQuestion<TargetLevel | null>) {
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
      const started = storyId ? await startFromStory(client, storyId, next.body) : null;
      if (started?.status === "unlinked") {
         // The answer exists: the form stays closed so it cannot be made twice, and only the link is retried.
         setSave({ phase: "unlinked", answerId: started.answer.id });
         return;
      }
      if (started?.status === "no-story") {
         saving.current = false;
         setSave(
            started.result.status === "notFound"
               ? { phase: "failed", message: "We could not find that story in your Story Bank, so no answer was created.", unconfirmed: false }
               : started.result.status === "unauthenticated"
                 ? { phase: "signin" }
                 : { phase: "failed", message: "We could not read the story, so no answer was created.", unconfirmed: false }
         );
         return;
      }
      const result: PrepResult<Answer> = started ? (started.status === "no-answer" ? started.result : { status: "ok", data: started.answer }) : await client.createAnswer(next.body);
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

   const keepCollection = !selected && collection !== undefined && collection.id !== collections[0]?.id;
   const signInHref = `/login?redirect=${encodeURIComponent(newAnswerHref(selected, storyId) + (keepCollection ? `${storyId ? "&" : "?"}collection=${collection.id}` : ""))}`;
   const awaitingCheck = pending !== null && pending.key === unconfirmed;
   const canSubmit = !busy && Boolean(client) && pending !== null && !awaitingCheck;
   // A warning about an earlier, different choice is no longer about what the form would create.
   const shown: Save = save.phase === "failed" && save.unconfirmed && !awaitingCheck ? { phase: "idle" } : save;

   const chosenQuestion = selected ? questions.find((entry) => sameQuestion(entry, selected)) : undefined;
   const chosenLabel = mode === "custom" ? (customLength > 0 ? "Your own question" : null) : chosenQuestion ? (chosenQuestion.title && chosenQuestion.title !== chosenQuestion.text ? chosenQuestion.title : chosenQuestion.text) : null;
   const unit: Unit = collection?.unit ?? { one: "group", many: "groups" };
   const scope = collection?.title ?? "the Behavioral Lessons";
   const rowName = `${ids}-question`;

   const row = (question: PickerQuestion, marks: readonly string[] = []) => {
      const checked = selected !== null && sameQuestion(question, selected);
      return (
         <QuestionRow
            key={keyOf(question)}
            question={question}
            name={rowName}
            checked={checked}
            disabled={busy}
            words={marks}
            onChoose={choose}
            inputRef={checked ? (element) => void (selectedRef.current = element) : undefined}
         />
      );
   };
   // The numbers beside the rows count on from `from`, so a search result list reads 01, 02, 03 across its groups.
   const list = (items: readonly PickerQuestion[], marks: readonly string[] = [], from = 0) => (
      <ul className="m-0 list-none divide-y divide-border p-0" style={{ counterReset: `q ${from}` }}>
         {items.map((question) => row(question, marks))}
      </ul>
   );
   const choices = (inner: React.ReactNode) => (
      <fieldset ref={resultsRef} className="m-0 min-w-0 border-0 p-0">
         <legend className="sr-only">Question</legend>
         {inner}
      </fieldset>
   );

   function intoResults() {
      const target = resultsRef.current;
      (target?.querySelector<HTMLInputElement>("input[type=radio]:checked") ?? target?.querySelector<HTMLInputElement>("input[type=radio]"))?.focus();
   }

   const settledWords = queryWords(announced);
   const settledCount = settledWords.length === 0 ? 0 : index.filter(({ text }) => matchesAll(text, settledWords)).length;
   const levelNote = levelFilter && level !== "all" ? ` (${levelLabel(level)} only)` : "";

   const searchPanel = (
      <section aria-label="Search results" className="rounded-2xl border border-border bg-card">
         <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 md:px-8">
            <p role="status" className="text-supporting text-muted-foreground">
               {settledWords.length === 0
                  ? ""
                  : settledCount === 0
                    ? `No questions match “${announced.trim()}”${levelNote}.`
                    : `${settledCount} ${settledCount === 1 ? "question matches" : "questions match"} “${announced.trim()}” in ${scope}${levelNote}.`}
            </p>
            {levelFilter && level !== "all" && (
               <button type="button" onClick={() => chooseLevel("all")} className="min-h-11 text-supporting font-medium text-[var(--primary-text)] underline underline-offset-4">
                  Search all levels
               </button>
            )}
         </div>
         {results.length === 0 ? (
            <div className="space-y-3 border-t border-border px-4 py-8 text-center md:px-8">
               <p className="text-body text-foreground">No question matches those words.</p>
               <p className="text-supporting text-muted-foreground">The search covers each question&apos;s heading, wording and {grouped ? unit.one : "level"} in {scope}. Try fewer or different words, or write your own question.</p>
               <div className="flex flex-wrap justify-center gap-3">
                  <Button type="button" variant="outline" onClick={() => setQuery("")}>
                     Show all questions
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setMode("custom")}>
                     Write your own question
                  </Button>
               </div>
            </div>
         ) : (
            <div className="border-t border-border">
               {choices(
                  stepper
                     ? (() => {
                          let seen = 0;
                          return (grouped ? sectionsOf(results) : levelSectionsOf(results)).map(({ key, title, questions: inGroup }) => {
                             const from = seen;
                             seen += inGroup.length;
                             return (
                                <section key={key} aria-labelledby={`${ids}-r-${key}`}>
                                   <div className="flex items-center justify-between gap-3 bg-surface/60 px-4 py-1.5 md:px-8">
                                      <h3 id={`${ids}-r-${key}`} className="m-0 text-supporting font-semibold text-foreground">
                                         {title}
                                      </h3>
                                      <button
                                         type="button"
                                         onClick={() => showInGroup(title)}
                                         aria-label={`View ${unit.one}: ${title}`}
                                         className="min-h-11 text-supporting font-medium text-[var(--primary-text)] underline underline-offset-4"
                                      >
                                         View {unit.one}
                                      </button>
                                   </div>
                                   {list(inGroup, words, from)}
                                </section>
                             );
                          });
                       })()
                     : list(results, words)
               )}
            </div>
         )}
      </section>
   );

   const levelSelect = levelFilter && (
      <div className="grid gap-1.5">
         <label htmlFor={`${ids}-level`} className="block text-supporting font-semibold text-foreground">
            Level
         </label>
         <select
            id={`${ids}-level`}
            value={level}
            disabled={busy}
            onChange={(event) => chooseLevel(event.target.value === "all" ? "all" : (asTargetLevel(event.target.value) ?? "all"))}
            className="border-input h-11 w-full rounded-md border bg-transparent px-3 text-base shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:w-52 md:text-sm dark:bg-input/30"
         >
            <option value="all">All levels</option>
            {TARGET_LEVELS.map(({ value, label }) => (
               <option key={value} value={value}>
                  {label}
               </option>
            ))}
         </select>
      </div>
   );

   const preferenceNotice = (
      <>
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
      </>
   );

   const levelStage = (
      <section aria-labelledby={`${ids}-stage`} className="rounded-2xl border border-border bg-card">
         <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4 md:px-8 md:py-6">
            <div className="min-w-0">
               <p className="m-0 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{collection?.title ?? "Behavioral Lessons"}</p>
               <h2 id={`${ids}-stage`} className="mt-1 mb-0 text-xl leading-tight font-semibold text-foreground md:text-section">
                  {level === "all" ? "All levels" : levelLabel(level)}
               </h2>
               <p className="mt-1 text-supporting text-muted-foreground">
                  {visible.length} {visible.length === 1 ? "question" : "questions"}
               </p>
            </div>
            {levelSelect}
         </div>
         <div className="space-y-1 px-4 pb-4 empty:hidden md:px-8">{preferenceNotice}</div>
         <div className="border-t border-border py-1">
            {visible.length === 0 ? <p className="px-4 py-6 text-body text-muted-foreground md:px-8">There are no questions for this level.</p> : choices(list(visible))}
         </div>
      </section>
   );

   const stage =
      catalog.status === "failed" ? (
         <CatalogProblem reason={catalog.reason} signInHref={signInHref} onRetry={() => router.refresh()} onCustom={() => setMode("custom")} />
      ) : searching ? (
         searchPanel
      ) : stepper ? (
         sections.length === 0 ? (
            <p className="text-body text-muted-foreground">There are no questions in this collection.</p>
         ) : (
            <GroupStage
               unit={unit}
               sections={sections}
               index={here}
               disabled={busy}
               onIndex={openGroup}
               extra={
                  levelFilter ? (
                     <div className="space-y-2">
                        {levelSelect}
                        {preferenceNotice}
                     </div>
                  ) : undefined
               }
            >
               {choices(list(sections[here].questions))}
            </GroupStage>
         )
      ) : (
         levelStage
      );

   return (
      <div className="space-y-4 pb-28 md:space-y-6 md:pb-4">
         <header className="space-y-2">
            <Link href={PREPARE_HREF} prefetch={false} className="inline-flex min-h-9 items-center text-supporting text-muted-foreground underline underline-offset-4 hover:text-foreground">
               Back to your workspace
            </Link>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
               <h1 className="m-0 text-section text-foreground">Choose a question</h1>
               {mode === "catalog" && catalog.status === "ok" && <SearchField scope={scope} value={query} disabled={busy} onChange={(value) => {
                     interacted.current = true;
                     setQuery(value);
                  }} onArrowDown={intoResults} className="w-full md:w-80" />}
            </div>
            {storyId && (
               <p className="max-w-reading rounded-xl border border-border bg-surface/60 px-4 py-3 text-supporting text-foreground">
                  Your answer will start with a copy of your story&apos;s saved text and be linked to the story. After that the two are separate: editing one does not change the other.
               </p>
            )}
         </header>

         {!apiUrl && (
            <p role="alert" className="text-body text-foreground">
               The preparation service is not configured for this environment.
            </p>
         )}

         <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            {mode === "catalog" && collections.length > 1 ? (
               <nav aria-label="Collections" className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface p-1">
                  {collections.map(({ id, title, short }) => {
                     const current = id === collectionId;
                     return (
                        <Link
                           key={id}
                           href={collectionHref(id)}
                           prefetch={false}
                           aria-current={current ? "page" : undefined}
                           aria-label={title}
                           aria-disabled={busy || undefined}
                           onClick={(event) => busy && event.preventDefault()}
                           className={cn(
                              "inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 text-supporting whitespace-nowrap transition-micro focus-visible:ring-[3px] focus-visible:ring-ring/50",
                              current ? "bg-background font-semibold text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground"
                           )}
                        >
                           {short ?? title}
                        </Link>
                     );
                  })}
               </nav>
            ) : (
               <span />
            )}
            <fieldset className="m-0 flex w-full min-w-0 gap-1 rounded-xl border-0 bg-surface p-1 sm:inline-flex sm:w-auto">
               <legend className="sr-only">Where the question comes from</legend>
               {(
                  [
                     ["catalog", "Choose from the Lessons"],
                     ["custom", "Write your own"],
                  ] as const
               ).map(([value, label]) => (
                  <label
                     key={value}
                     className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 py-1 text-center text-supporting font-medium text-muted-foreground transition-micro sm:flex-none sm:px-4 sm:whitespace-nowrap has-[:checked]:bg-background has-[:checked]:font-semibold has-[:checked]:text-foreground has-[:checked]:shadow-[0_0_0_1px_var(--border)] has-[:disabled]:cursor-default has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                  >
                     <input type="radio" name={`${ids}-mode`} value={value} checked={mode === value} disabled={busy} onChange={() => setMode(value)} className="sr-only" />
                     {label}
                  </label>
               ))}
            </fieldset>
         </div>

         <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
            {mode === "catalog" && linkedMissing && (
               <p role="status" className="text-supporting text-muted-foreground">
                  The question from that link is not in the Lessons any more, so none is selected.
               </p>
            )}
            {mode === "catalog" ? (
               stage
            ) : (
               <section className="space-y-2 rounded-2xl border border-border bg-card p-4 md:p-8">
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

            {/* Beside the collection switch on a wide screen, under the questions on a phone, so a question is near the top there. */}
            {mode === "catalog" && grouped && <p className="max-w-4xl text-supporting text-muted-foreground lg:order-first">{COMPANY_STATEMENT}</p>}

            <Dock
               chosen={chosenLabel}
               prompt={mode === "custom" ? "Write your question to start your answer." : "Choose a question to start your answer."}
               canSubmit={canSubmit}
            >
               {shown.phase === "saving" && (
                  <p role="status" className="text-supporting text-muted-foreground">
                     Creating your answer…
                     {slow && " This is taking longer than usual, which can happen after a period of inactivity. Please keep this page open."}
                  </p>
               )}
               {shown.phase === "unlinked" && client && storyId && (
                  <StartLinkNotice client={client} answerId={shown.answerId} storyId={storyId} onLinked={() => router.push(answerHref(shown.answerId))} />
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
            </Dock>
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
