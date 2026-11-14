"use client";

import { createContext, useContext, useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NO_PINS, PINS_KEY, type Pin } from "@/components/lesson/pins";
import { usePeekReaderTool } from "@/components/reader/readerState";
import { cn } from "@/lib/utils";
import { Everything } from "./ProblemOutline";

export interface SplitStage {
   id: string;
   label: string;
   /** "Step n" for an interview stage; none for a review surface or the neutral region. */
   step: number | null;
}

type Pane = "challenge" | "work";

const subscribe = () => () => {};
/** False in the server HTML and while hydrating: until then every stage and both panes show, so the page works without JavaScript. */
const useHydrated = () =>
   useSyncExternalStore(
      subscribe,
      () => true,
      () => false,
   );

const ActiveStage = createContext<string | null>(null);

/** One stage's panel: hidden while another stage is the active one; never hidden in the server HTML. */
export function StagePanel({ ids, children }: { ids: readonly string[]; children: ReactNode }) {
   const active = useContext(ActiveStage);
   return (
      <div data-stage={ids.length === 1 ? ids[0] : undefined} hidden={active !== null && !ids.includes(active)}>
         {children}
      </div>
   );
}

/** Pins the reader made on other reader pages this tab (T26 store, memory only), as plain links back to their source. */
function ProblemPins() {
   const pins = usePeekReaderTool<readonly Pin[]>(PINS_KEY, NO_PINS);
   if (pins.length === 0) return null;
   return (
      <section aria-labelledby="problem_pins" className="mt-8 border-t border-border pt-6">
         <h2 id="problem_pins" className="m-0 mb-3 text-supporting font-semibold uppercase tracking-wide text-muted-foreground">
            Your pins
         </h2>
         <ul role="list" className="m-0 list-none space-y-2 p-0">
            {pins.map((pin) => (
               <li key={pin.key}>
                  <a
                     href={`${pin.route}#${pin.anchor}`}
                     className="flex min-h-11 flex-col justify-center text-supporting text-[var(--primary-text)] underline-offset-4 hover:underline"
                  >
                     <span className="font-semibold">{`${pin.kind} ${pin.no}`}</span>
                     <span className="line-clamp-2 text-muted-foreground">{pin.preview}</span>
                  </a>
               </li>
            ))}
         </ul>
      </section>
   );
}

/** Below 1024 px: one pane at a time, as a two-option radio group (the reader's segmented controls are radio groups). */
function PaneSwitch({ pane, choose }: { pane: Pane; choose: (pane: Pane) => void }) {
   const name = useId();
   const options: [Pane, string][] = [
      ["challenge", "Challenge"],
      ["work", "Work"],
   ];
   return (
      <fieldset className="sticky top-32 z-10 m-0 mb-6 flex gap-1 rounded-full border border-border bg-[var(--reader-desk)] p-1 lg:hidden">
         <legend className="sr-only">Show</legend>
         {options.map(([value, label]) => (
            <label
               key={value}
               className="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-full text-supporting font-semibold text-muted-foreground has-[:checked]:bg-[var(--primary-text)] has-[:checked]:text-[var(--reader-on-brand)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--primary-text)]"
            >
               <input type="radio" name={name} value={value} checked={pane === value} onChange={() => choose(value)} className="sr-only" />
               {label}
            </label>
         ))}
      </fieldset>
   );
}

function StageBar({ stages, active, choose }: { stages: SplitStage[]; active: string; choose: (id: string) => void }) {
   return (
      <nav aria-label="Problem stages" className="mb-8">
         <ol role="list" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {stages.map(({ id, label, step }) => (
               <li key={id}>
                  <button
                     type="button"
                     aria-current={id === active ? "step" : undefined}
                     onClick={() => choose(id)}
                     className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-supporting font-medium text-muted-foreground transition-micro hover:border-[var(--primary-text)] hover:text-foreground aria-[current=step]:border-[var(--primary-text)] aria-[current=step]:bg-[var(--reader-brand-soft)] aria-[current=step]:text-foreground"
                  >
                     {step ? <span className="tabular-nums text-[var(--primary-text)]">{step}</span> : null}
                     {label}
                  </button>
               </li>
            ))}
         </ol>
      </nav>
   );
}

function StageSteps({ stages, active, choose }: { stages: SplitStage[]; active: string; choose: (id: string) => void }) {
   const at = stages.findIndex(({ id }) => id === active);
   const previous = stages[at - 1];
   const next = stages[at + 1];
   const STEP =
      "inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-supporting font-semibold text-[var(--primary-text)] transition-micro hover:bg-[var(--reader-brand-soft)]";
   return (
      <nav aria-label="Previous or next stage" className="mt-12 flex flex-wrap justify-between gap-3 border-t border-border pt-6">
         {previous ? (
            <button type="button" onClick={() => choose(previous.id)} aria-label={`Previous stage: ${previous.label}`} className={STEP}>
               <ChevronLeft aria-hidden="true" className="size-4" />
               <span>
                                    {previous.label}
               </span>
            </button>
         ) : (
            <span />
         )}
         {next ? (
            <button type="button" onClick={() => choose(next.id)} aria-label={`Next stage: ${next.label}`} className={STEP}>
               <span>
                                    {next.label}
               </span>
               <ChevronRight aria-hidden="true" className="size-4" />
            </button>
         ) : null}
      </nav>
   );
}

/**
 * The split Problem (P8-UX-05, D × F v3 §4.6): a sticky context column (the challenge and your pins) and a work column with
 * the stage bar, one stage at a time and Previous / Next stage. Below 1024 px the columns become Challenge and Work. The
 * active stage and pane are component state only: never stored and never written to the URL (S-RVL-10). A followed fragment
 * selects the stage and pane that hold its target before the reveal owner opens it (S-RVL-8).
 */
export function ProblemSplit({
   context,
   stages,
   everything,
   before,
   children,
}: {
   context: ReactNode;
   stages: SplitStage[];
   /** Whether the page has any reveal: exactly one Show everything then, none otherwise (S-RVL-6). */
   everything: boolean;
   before?: ReactNode;
   children: ReactNode;
}) {
   const hydrated = useHydrated();
   const [active, setActive] = useState(stages[0]?.id ?? null);
   const [pane, setPane] = useState<Pane>("challenge");
   const [message, setMessage] = useState("");

   useEffect(() => {
      // Registered before the reveal owner's (a child's effect runs first), so the target is visible when it is focused.
      const follow = () => {
         let target: HTMLElement | null = null;
         try {
            const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
            target = id ? document.getElementById(id) : null;
         } catch {
            return;
         }
         if (!target) return;
         const stage = target.closest("[data-stage]")?.getAttribute("data-stage");
         const where = target.closest("[data-pane]")?.getAttribute("data-pane") as Pane | undefined;
         flushSync(() => {
            if (stage) setActive(stage);
            if (where) setPane(where);
         });
      };
      const first = window.setTimeout(follow, 0);
      const navigation = (window as { navigation?: EventTarget }).navigation;
      const [source, event] = navigation ? [navigation, "currententrychange"] : [window, "hashchange"];
      source.addEventListener(event, follow);
      return () => {
         window.clearTimeout(first);
         source.removeEventListener(event, follow);
      };
   }, []);

   const choose = (id: string) => {
      flushSync(() => setActive(id));
      const anchor = document.getElementById(id);
      anchor?.focus({ preventScroll: true });
      anchor?.scrollIntoView({ block: "start", behavior: "instant" });
   };

   const split = hydrated && stages.length > 1;
   const shownPane = hydrated ? pane : null;
   return (
      <div
         data-split={split ? "on" : undefined}
         // Anchors land below the shell's chrome (its `top-32` offset), and below the sticky Challenge/Work switch on narrow widths.
         className="[&_[id]]:scroll-mt-36 max-lg:[&_[id]]:scroll-mt-52 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-x-12 xl:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] xl:gap-x-16"
      >
         {hydrated ? <PaneSwitch pane={pane} choose={setPane} /> : null}
         <div data-pane="challenge" className={cn("min-w-0", shownPane === "work" && "max-lg:hidden")}>
            <div className="lg:sticky lg:top-32 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2 lg:pb-8">
               {context}
               <ProblemPins />
            </div>
         </div>
         <div data-pane="work" className={cn("min-w-0 max-lg:mt-12", shownPane === "challenge" && "max-lg:hidden")}>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
               {split && active ? <StageBar stages={stages} active={active} choose={choose} /> : null}
               {everything ? (
                  <div className="w-auto">
                     <Everything announce={setMessage} beside={false} />
                  </div>
               ) : null}
            </div>
            <p role="status" className="sr-only">
               {message}
            </p>
            {before}
            <ActiveStage.Provider value={split ? active : null}>{children}</ActiveStage.Provider>
            {split && active ? <StageSteps stages={stages} active={active} choose={choose} /> : null}
         </div>
      </div>
   );
}
