"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useReaderToolState, useToolsSheet, type CloseToolsSheet } from "@/components/reader/readerState";
import type { ContentsEntry } from "@/lib/catalog/lesson";
import { chapterNumbers, LESSON_LINE } from "./LessonOutline";
import { DIAGRAM_VIEWER, EXHIBIT_OPEN, NO_PINS, PINS_KEY, SCRATCH_KEY, SCRATCH_OPEN_KEY, SHOWN_SLIPS, type Pin } from "./pins";
import { useActiveHeading } from "./useActiveHeading";

const SLIP_BUTTON =
   "inline-flex min-h-11 cursor-pointer items-center rounded-md px-2 text-supporting font-medium text-[var(--primary-text)] transition-micro hover:bg-muted xl:min-h-8";
const KICKER = "lesson-folio-kicker m-0";

/** Runs `act` on the page: at once from the margin, or after the Study tools sheet has closed (T26's explicit close). */
function onPage(sheet: CloseToolsSheet | null, act: () => void) {
   if (sheet) sheet(act);
   else act();
}

/** The exhibit itself, by its own id: scrolled to and focused (it is a named group with tabindex -1). */
function reach(anchor: string): boolean {
   const block = document.getElementById(anchor);
   if (!block) return false;
   block.scrollIntoView({ block: "center" });
   block.focus({ preventScroll: true });
   return true;
}

/** A table always has its viewer; a diagram only while its own Expand is offered (S-DGM-6). */
function hasViewer(anchor: string): boolean {
   const exhibit = document.getElementById(anchor);
   return Boolean(exhibit && (exhibit.dataset.exhibit === "table" || exhibit.querySelector(DIAGRAM_VIEWER)));
}

/** The anchors, among this page's pinned exhibits, that have a viewer now; follows a diagram gaining or losing Expand. */
function useViewers(anchors: string[]): ReadonlySet<string> {
   const [viewers, setViewers] = useState<ReadonlySet<string>>(new Set());
   const wanted = anchors.join(" ");
   useEffect(() => {
      const found = wanted ? wanted.split(" ") : [];
      const update = () => setViewers((now) => {
         const next = new Set(found.filter(hasViewer));
         return next.size === now.size && [...next].every((anchor) => now.has(anchor)) ? now : next;
      });
      update();
      const watch = new MutationObserver(update);
      found.forEach((anchor) => {
         const exhibit = document.getElementById(anchor);
         if (exhibit) watch.observe(exhibit, { childList: true, subtree: true });
      });
      return () => watch.disconnect();
   }, [wanted]);
   return viewers;
}

function Slips({ pins, route, here }: { pins: readonly Pin[]; route: string; here: string | null }) {
   const [all, setAll] = useState(false);
   const [, setPins] = useReaderToolState<readonly Pin[]>(PINS_KEY, NO_PINS);
   const router = useRouter();
   const sheet = useToolsSheet();
   const viewers = useViewers(pins.filter((pin) => pin.route === route).map(({ anchor }) => anchor));
   // Another page: navigate to the exhibit's own fragment; the exhibit focuses itself when the fragment names it.
   const goToSource = (pin: Pin) => onPage(sheet, () => (pin.route === route ? reach(pin.anchor) : router.push(`${pin.route}#${pin.anchor}`)));
   const expand = (pin: Pin, from: HTMLElement) =>
      onPage(sheet, () => document.getElementById(pin.anchor)?.dispatchEvent(new CustomEvent(EXHIBIT_OPEN, { detail: sheet ? null : from })));
   if (pins.length === 0) return <p className="lesson-folio-empty m-0">Pin a table or diagram to keep it at hand while you read.</p>;
   const shown = all ? pins : pins.slice(0, SHOWN_SLIPS);
   return (
      <>
         <ol className="m-0 list-none space-y-3 p-0">
            {shown.map((pin) => (
               <li key={pin.key} className="lesson-slip">
                  <p className="m-0 flex items-baseline gap-2">
                     <span className="lesson-slip-no" aria-hidden="true">{pin.no}</span>
                     <span className="lesson-slip-kind">{pin.kind}</span>
                     {pin.route === route && pin.section?.id === here ? <span className="lesson-slip-here">here</span> : null}
                  </p>
                  <p className="lesson-slip-title m-0 mt-1">{pin.section?.title ?? "Opening"}</p>
                  <p className="m-0 mt-1 line-clamp-2 text-supporting text-muted-foreground">{pin.preview}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                     {pin.route === route && viewers.has(pin.anchor) ? (
                        <button type="button" className={SLIP_BUTTON} aria-label={`Expand ${pin.kind.toLowerCase()} ${pin.no}`} onClick={(event) => expand(pin, event.currentTarget)}>
                           Expand
                        </button>
                     ) : null}
                     <button type="button" className={SLIP_BUTTON} aria-label={`Go to source of ${pin.kind.toLowerCase()} ${pin.no}`} onClick={() => goToSource(pin)}>
                        Go to source
                     </button>
                     <button
                        type="button"
                        className={SLIP_BUTTON}
                        aria-label={`Unpin ${pin.kind.toLowerCase()} ${pin.no}`}
                        onClick={() => setPins((current) => current.filter(({ key }) => key !== pin.key))}
                     >
                        Unpin
                     </button>
                  </div>
               </li>
            ))}
         </ol>
         {pins.length > SHOWN_SLIPS ? (
            <button type="button" className={SLIP_BUTTON} aria-expanded={all} onClick={() => setAll(!all)}>
               {all ? "Show the newest" : `Show all ${pins.length} slips`}
            </button>
         ) : null}
      </>
   );
}

function Scratch({ where }: { where: string }) {
   const id = useId();
   const area = useRef<HTMLTextAreaElement>(null);
   // Where the reader last left the caret in this mount; none yet means the end (a remount resets the textarea's own caret).
   const caret = useRef<number | null>(null);
   const keepCaret = () => (caret.current = area.current?.selectionStart ?? null);
   const [text, setText] = useReaderToolState<string>(SCRATCH_KEY, "");
   const [open, setOpen] = useReaderToolState<boolean>(SCRATCH_OPEN_KEY, false);
   const [copied, setCopied] = useState<string | null>(null);

   function insert() {
      const element = area.current;
      const at = Math.min(caret.current ?? text.length, text.length);
      const before = text.slice(0, at);
      const mark = `${before && !before.endsWith("\n") ? "\n" : ""}— ${where} —\n`;
      setText(before + mark + text.slice(at));
      setOpen(true);
      window.requestAnimationFrame(() => {
         element?.focus();
         element?.setSelectionRange(at + mark.length, at + mark.length);
         caret.current = at + mark.length;
      });
   }
   async function copy() {
      try {
         await navigator.clipboard.writeText(text);
         setCopied("Copied");
      } catch {
         area.current?.select();
         setCopied("Selected");
      }
      window.setTimeout(() => setCopied(null), 1400);
   }

   return (
      <div className="lesson-scratch" data-open={open}>
         <div className="flex items-center justify-between gap-2">
            <label htmlFor={id} className={KICKER}>
               Scratch
            </label>
            <button type="button" className={SLIP_BUTTON} aria-controls={id} aria-expanded={open} onClick={() => setOpen(!open)}>
               {open ? "Fold" : "Open"}
            </button>
         </div>
         <textarea
            id={id}
            ref={area}
            value={text}
            rows={open ? 10 : 3}
            spellCheck={false}
            placeholder="Work through the numbers…"
            aria-describedby={`${id}-note`}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
               setText(event.target.value);
               keepCaret();
            }}
            onSelect={keepCaret}
            className="lesson-scratch-paper mt-1 block w-full resize-y rounded-md border border-border p-2 text-supporting"
         />
         <div className="mt-1 flex flex-wrap gap-1">
            <button type="button" className={SLIP_BUTTON} onClick={insert}>
               Insert where I am
            </button>
            <button type="button" className={SLIP_BUTTON} onClick={copy} aria-live="polite">
               {copied ?? "Copy all"}
            </button>
         </div>
         <p id={`${id}-note`} className="m-0 mt-1 text-[0.8125rem] text-muted-foreground">
            Not saved or synced. Kept while this tab is open; reloading clears it.
         </p>
      </div>
   );
}

/**
 * The Lesson's Margin Folio (§4.5): Now reading, the pinned slips and Scratch. Mounted by the reader shell in the margin from
 * 1280 px or in the Study tools sheet below it, never in Read. Pins and Scratch live only in the shell's tab-level store.
 */
export function LessonFolio({ entries }: { entries: ContentsEntry[] }) {
   const chapters = entries.filter(({ level }) => level === 2);
   const [active] = useActiveHeading(chapters.map(({ id }) => id), LESSON_LINE);
   const [pins] = useReaderToolState<readonly Pin[]>(PINS_KEY, NO_PINS);
   const route = usePathname();
   const numbers = chapterNumbers(entries);
   const now = chapters.find(({ id }) => id === active) ?? null;
   return (
      <div className="lesson-folio space-y-6">
         <section aria-labelledby="folio-now">
            <h2 id="folio-now" className={KICKER}>Now reading</h2>
            <p className="lesson-folio-now m-0 mt-1" aria-live="off">
               {now ? (
                  <>
                     <span className="lesson-numeral mr-2">{numbers.get(now.id)}</span>
                     {now.text}
                  </>
               ) : (
                  "The opening"
               )}
            </p>
         </section>
         <section aria-labelledby="folio-pins">
            <h2 id="folio-pins" className={KICKER}>
               Pinned{pins.length ? <span className="lesson-dock-count ml-2">{pins.length}</span> : null}
            </h2>
            <div className="mt-2">
               <Slips pins={pins} route={route} here={active} />
            </div>
            <p className="m-0 mt-2 text-[0.8125rem] text-muted-foreground">Pins stay in this tab only: not saved or synced.</p>
         </section>
         <Scratch where={now?.text ?? "The opening"} />
      </div>
   );
}
