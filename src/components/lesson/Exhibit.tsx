"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Expand, Pin as PinIcon } from "lucide-react";
import { useReaderToolState } from "@/components/reader/readerState";
import { inertPage } from "@/lib/inertPage";
import { DIAGRAM_VIEWER, EXHIBIT_OPEN, NO_PINS, PINS_KEY, pinKey, sectionOf, tablePreview, togglePin, type Pin } from "./pins";

const ACTION =
   "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 text-supporting font-medium text-foreground transition-micro hover:bg-muted md:min-h-[34px]";
/** Clicks on these stay theirs: an exhibit opens only from a plain click on its own drawing or cells (§4.7). */
const INTERACTIVE = 'a, button, input, textarea, select, summary, details, label, [role="button"], [contenteditable="true"]';

/** Pin control for one block; hidden in Read by the reader stylesheet (§4.3), so the pins themselves are never lost. */
function PinButton({ kind, route, anchor, preview, block }: { kind: Pin["kind"]; route: string; anchor: string; preview: () => string; block: () => Element | null }) {
   const [pins, setPins] = useReaderToolState<readonly Pin[]>(PINS_KEY, NO_PINS);
   const key = pinKey(route, anchor);
   const pinned = pins.find((pin) => pin.key === key);
   const section = () => {
      const element = block();
      return element ? sectionOf(element) : null;
   };
   return (
      <button
         type="button"
         data-pin
         aria-pressed={Boolean(pinned)}
         aria-label={`${pinned ? "Unpin" : "Pin"} ${kind.toLowerCase()}`}
         onClick={() => setPins((current) => togglePin(current, { key, kind, route, anchor, section: section(), preview: preview() }))}
         className={`${ACTION} aria-pressed:border-[var(--reader-butter)] aria-pressed:bg-[var(--reader-butter)] aria-pressed:text-[var(--reader-butter-ink)]`}
      >
         <PinIcon aria-hidden="true" className="size-3.5" />
         {pinned ? `Pinned · ${pinned.no}` : "Pin"}
      </button>
   );
}

/** The table viewer (§4.7): the same rendered table, scrolling both ways with a sticky heading row and first column. */
function TableViewer({ children, size, label, open, onOpenChange, returnTo: returnToRef }: {
   children: ReactNode;
   size: string;
   label: string;
   open: boolean;
   onOpenChange: (open: boolean) => void;
   /** Opened from a pinned slip in the margin: focus goes back there instead of to Expand. */
   returnTo: RefObject<HTMLElement | null>;
}) {
   const region = useRef<HTMLDivElement>(null);
   const release = useRef<() => void>(undefined);
   function change(next: boolean) {
      release.current?.();
      release.current = next ? inertPage() : undefined;
      onOpenChange(next);
   }
   // Opened without the trigger (a click on the table, a slip): the page goes inert as it does from Expand.
   useEffect(() => {
      if (open && !release.current) release.current = inertPage();
   }, [open]);
   useEffect(() => () => release.current?.(), []);
   return (
      <Dialog.Root open={open} onOpenChange={change}>
         <Dialog.Trigger asChild>
            <button type="button" className={ACTION}>
               <Expand aria-hidden="true" className="size-3.5" />
               Expand table
            </button>
         </Dialog.Trigger>
         <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content
               aria-describedby={undefined}
               onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  region.current?.focus();
               }}
               onCloseAutoFocus={(event) => {
                  const target = returnToRef.current;
                  returnToRef.current = null;
                  if (!target?.isConnected) return;
                  event.preventDefault();
                  target.focus({ preventScroll: true });
               }}
               className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[1180px] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg border bg-background p-4 shadow-lg motion-reduce:animate-none sm:max-h-[calc(100dvh-3rem)]"
            >
               <div className="flex items-center justify-between gap-4">
                  <Dialog.Title className="m-0 text-supporting font-semibold text-foreground">{label}</Dialog.Title>
                  <Dialog.Close asChild>
                     <button type="button" className={`${ACTION} min-h-11 md:min-h-11`}>
                        Close
                     </button>
                  </Dialog.Close>
               </div>
               <div ref={region} role="region" aria-label={label} tabIndex={0} className="lesson-exhibit-table min-h-0 overflow-auto rounded-md border">
                  {children}
               </div>
               <p className="m-0 text-supporting text-muted-foreground">{size}</p>
            </Dialog.Content>
         </Dialog.Portal>
      </Dialog.Root>
   );
}

/**
 * A Lesson table or diagram as an exhibit (P8-T27): the block as rendered, then its Expand and Pin controls. `anchor` is the
 * exhibit's stable id (its place in the body), so pins and "Go to source" reach this occurrence and no other. A plain click on
 * the cells or the drawing opens the viewer; a diagram's viewer is its own `DiagramExpand`, offered only while it overflows
 * (S-DGM-6). Nothing is fetched.
 */
export function Exhibit({ kind, anchor, size, label, children }: { kind: Pin["kind"]; anchor: string; size?: string; label: string; children: ReactNode }) {
   const ref = useRef<HTMLDivElement>(null);
   const returnTo = useRef<HTMLElement | null>(null);
   const route = usePathname();
   const [open, setOpen] = useState(false);
   const preview = () => {
      const table = ref.current?.querySelector("table");
      return table ? tablePreview(table) : label;
   };
   /** Opens this exhibit's viewer; false when it has none (a diagram that fits its column has no Expand, S-DGM-6). */
   function show(from: HTMLElement | null): boolean {
      if (kind === "Table") {
         returnTo.current = from;
         setOpen(true);
         return true;
      }
      const trigger = ref.current?.querySelector<HTMLButtonElement>(DIAGRAM_VIEWER);
      trigger?.click();
      return Boolean(trigger);
   }

   // A slip asks for this exhibit's viewer; a deep link to the exhibit (Go to source from another page) gives it focus.
   useEffect(() => {
      const element = ref.current;
      if (!element) return;
      const onOpen = (event: Event) => {
         if (show((event as CustomEvent<HTMLElement | null>).detail)) return;
         element.scrollIntoView({ block: "center" });
         element.focus({ preventScroll: true });
      };
      element.addEventListener(EXHIBIT_OPEN, onOpen);
      return () => element.removeEventListener(EXHIBIT_OPEN, onOpen);
   });
   useEffect(() => {
      if (window.location.hash === `#${anchor}`) ref.current?.focus({ preventScroll: true });
   }, [anchor]);

   function onClick(event: MouseEvent<HTMLDivElement>) {
      const target = event.target as Element;
      // Portalled dialogs bubble through React; only clicks inside the page's own exhibit count.
      if (!event.currentTarget.contains(target) || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || target.closest(INTERACTIVE)) return;
      if (window.getSelection()?.toString()) return;
      show(null);
   }

   return (
      <div
         ref={ref}
         id={anchor}
         role="group"
         aria-label={label}
         data-exhibit={kind.toLowerCase()}
         data-pin-key={pinKey(route, anchor)}
         tabIndex={-1}
         className="lesson-exhibit my-6"
      >
         {/* A pointer shortcut only: Expand is the keyboard route, so this wrapper takes no focus or key handler. */}
         <div className="lesson-exhibit-body [&>*]:my-0" onClick={onClick}>
            {children}
         </div>
         {kind === "Table" ? (
            <p className="lesson-wider" aria-hidden="true">
               Wider than the column →
            </p>
         ) : null}
         <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            {kind === "Table" ? (
               <TableViewer size={size ?? ""} label={label} open={open} onOpenChange={setOpen} returnTo={returnTo}>
                  {children}
               </TableViewer>
            ) : null}
            <PinButton kind={kind} route={route} anchor={anchor} preview={preview} block={() => ref.current} />
         </div>
      </div>
   );
}
