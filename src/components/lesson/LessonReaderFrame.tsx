"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useMediaQuery, useReaderMode } from "@/components/reader/readerState";

/** Read's three type sizes (§4.1), in px; the measure stays 736 px. */
export const READ_SIZES = [17.5, 19.5, 21.5] as const;
export type ReadSize = (typeof READ_SIZES)[number];
const NAMES: Record<ReadSize, string> = { 17.5: "Smaller text", 19.5: "Standard text", 21.5: "Larger text" };

/** The block at the top of the reading area, and where it is, so a size change can keep it in place. */
function readingAnchor(): { element: Element; top: number } | null {
   const blocks = document.querySelectorAll("[data-lesson-reader] [data-catalog-body] :is(p, li, h2, h3, [data-exhibit])");
   for (const element of blocks) {
      const top = element.getBoundingClientRect().top;
      if (top >= 180) return { element, top };
   }
   return null;
}

/** Read's text size, as a radio group (arrows move and select, like the shell's Study/Read). Shown in Read only. */
function ReadSizeControl({ size, onChange }: { size: ReadSize; onChange: (size: ReadSize) => void }) {
   function choose(next: ReadSize, focus = false) {
      const anchor = readingAnchor();
      onChange(next);
      window.requestAnimationFrame(() => {
         if (anchor) window.scrollBy({ top: anchor.element.getBoundingClientRect().top - anchor.top, behavior: "instant" });
         if (focus) document.querySelector<HTMLElement>(`[data-read-size-option="${next}"]`)?.focus({ preventScroll: true });
      });
   }
   function onKeyDown(event: KeyboardEvent) {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const index = (READ_SIZES.indexOf(size) + step + READ_SIZES.length) % READ_SIZES.length;
      choose(READ_SIZES[index], true);
   }
   return (
      <div role="radiogroup" aria-label="Text size" className="lesson-read-size" onKeyDown={onKeyDown}>
         {READ_SIZES.map((value) => (
            <button
               key={value}
               type="button"
               role="radio"
               aria-checked={size === value}
               aria-label={NAMES[value]}
               tabIndex={size === value ? 0 : -1}
               data-read-size-option={value}
               onClick={() => choose(value)}
               style={{ fontSize: `${value - 3}px` }}
            >
               A
            </button>
         ))}
      </div>
   );
}

/**
 * The Lesson's editorial frame (P8-T27): the `[data-lesson-reader]` scope, its chapter counters, and Read's text size (in memory
 * only, per page like the mode it belongs to). The size applies in Read only.
 */
export function LessonReaderFrame({ chapters, children }: { chapters: number; children: ReactNode }) {
   const mode = useReaderMode();
   // Unchosen, Read keeps the page's own size (17.5 px on phones, 19.5 px from 768 px); a choice applies at every width.
   // Per page, like the shell's Study/Read mode (T26 v3): kept across Study ⇄ Read, in memory only, reset by another page.
   const [chosen, setSize] = useState<ReadSize | null>(null);
   const phone = useMediaQuery("(min-width: 768px)") === false;
   const size: ReadSize = chosen ?? (phone ? 17.5 : 19.5);
   return (
      <div
         data-lesson-reader=""
         data-read-size={mode === "read" && chosen !== null ? chosen : undefined}
         className="mx-auto w-full max-w-reading"
         style={{ counterReset: `lesson-chapters-total ${chapters} lesson-chapter lesson-table lesson-figure` }}
      >
         {mode === "read" ? (
            <div className="lesson-read-size-holder">
               <ReadSizeControl size={size} onChange={setSize} />
            </div>
         ) : null}
         {children}
      </div>
   );
}
