"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ListTree, NotebookPen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { TrackDrawer } from "@/components/curriculum/TrackDrawer";
import { TrackSidebar } from "@/components/curriculum/TrackSidebar";
import { Footer } from "@/components/layout/Footer";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { TrackSidebarOutline } from "@/lib/catalog/outline";
import { inertPage } from "@/lib/inertPage";
import { readerOrientation, type ReaderAccess, type ReaderMode, type ReaderSurface } from "@/lib/reader/shellPolicy";
import { cn } from "@/lib/utils";
import { ReaderModeProvider, ToolsSheetProvider, useMediaQuery } from "./readerState";

/** One shell per page, so the sidebar's id is fixed. */
const SIDEBAR_ID = "reader-track-sidebar";
const WIDE = "(min-width: 1440px)";
/** The Margin Folio's breakpoint (§4.9): the tools sit beside the column from here, in a sheet below it. */
const MARGIN = "(min-width: 1280px)";

const BAR_BUTTON =
   "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-supporting font-medium text-foreground transition-micro hover:bg-muted md:min-h-9";

export interface ReaderShellProps {
   /** From the API's answer for this caller; "locked" removes every piece of Track orientation (S-LSN-18). */
   access: ReaderAccess;
   surface: ReaderSurface;
   /** The home Track's outline; ignored on a locked page. */
   outline?: TrackSidebarOutline | null;
   /** Start the sidebar expanded at 1440 px and wider (the Lesson); elsewhere it starts collapsed. */
   expandWide?: boolean;
   /**
    * Extension point: page-supplied study tools, mounted in exactly one place (the margin from 1280 px, a sheet below it, none
    * in Read). Their state belongs in `useReaderToolState` (the tab-level store in the root layout), which outlives those
    * remounts and moves between reader pages.
    */
   tools?: ReactNode;
   children: ReactNode;
}

/** Study/Read as a radio group (§4.9): arrows move and select, like native radios. */
function ModeControl({ mode, onChange }: { mode: ReaderMode; onChange: (mode: ReaderMode) => void }) {
   const options: { value: ReaderMode; label: string }[] = [
      { value: "study", label: "Study" },
      { value: "read", label: "Read" },
   ];
   return (
      <div role="radiogroup" aria-label="Reading mode" className="inline-flex rounded-md border border-border bg-background p-0.5">
         {options.map(({ value, label }) => (
            <button
               key={value}
               type="button"
               role="radio"
               aria-checked={mode === value}
               tabIndex={mode === value ? 0 : -1}
               onClick={() => onChange(value)}
               onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  const next = mode === "study" ? "read" : "study";
                  onChange(next);
                  (event.currentTarget.parentElement?.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus();
               }}
               data-mode={value}
               className="min-h-11 cursor-pointer rounded-[5px] px-3 text-supporting font-medium text-muted-foreground transition-micro aria-checked:bg-[var(--primary-text)] aria-checked:text-[var(--reader-on-brand)] md:min-h-8"
            >
               {label}
            </button>
         ))}
      </div>
   );
}

/** Below 1280 px the page's study tools open in a side sheet; the page behind is inert while it is open. */
function ToolsSheet({ tools }: { tools: ReactNode }) {
   const [open, setOpen] = useState(false);
   const release = useRef<() => void>(undefined);
   // A tool that moves the reader (Go to source) closes the sheet first and acts once focus would return (P8-T27).
   const after = useRef<() => void>(undefined);
   const closeThen = (next: () => void) => {
      after.current = next;
      change(false);
   };
   function change(next: boolean) {
      release.current?.();
      release.current = next ? inertPage() : undefined;
      setOpen(next);
   }
   useEffect(() => () => release.current?.(), []);
   return (
      <Sheet open={open} onOpenChange={change}>
         <SheetTrigger asChild>
            <button type="button" className={BAR_BUTTON}>
               <NotebookPen aria-hidden="true" className="size-4" />
               Study tools
            </button>
         </SheetTrigger>
         <SheetContent
            side="right"
            className="gap-0 motion-reduce:animate-none"
            onCloseAutoFocus={(event) => {
               const next = after.current;
               if (!next) return;
               after.current = undefined;
               event.preventDefault();
               next();
            }}
         >
            <SheetHeader className="min-h-16 justify-center border-b px-6 py-3 pr-16">
               <SheetTitle className="text-body">Study tools</SheetTitle>
               <SheetDescription className="sr-only">Tools for the page you are reading</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
               <ToolsSheetProvider value={closeThen}>{tools}</ToolsSheetProvider>
            </div>
         </SheetContent>
      </Sheet>
   );
}

/**
 * The shared reader shell (P8-T26): a 76 px rail that expands to a 272 px Track sidebar from 768 px, a top bar with the
 * Study/Read control on every readable page, the page, a contextual column from 1280 px, and the site footer. The page keeps
 * its own `<main>`; the global header stays the only site navigation. Track orientation comes only from `outline`, and a
 * locked page has neither it nor the reading controls.
 */
export function ReaderShell({ access, surface, outline, expandWide = false, tools, children }: ReaderShellProps) {
   const orientation = readerOrientation(access, outline);
   const track = orientation.outline;
   const [mode, setMode] = useState<ReaderMode>("study");
   // null follows the default (expanded at 1440 px on the Lesson); a click makes the choice explicit.
   const [chosen, setChosen] = useState<boolean | null>(null);
   const wide = useMediaQuery(WIDE) === true;
   const margin = useMediaQuery(MARGIN);
   const expanded = chosen ?? (expandWide && mode === "study" && wide);
   const study = mode === "study";
   const readable = access === "readable";
   const hasTools = readable && study && tools != null;

   function changeMode(next: ReaderMode) {
      setMode(next);
      // Read collapses the sidebar; Study returns it to its default.
      setChosen(next === "read" ? false : null);
   }

   const sidebarState = chosen === null ? (expandWide && study ? "auto" : "closed") : chosen ? "open" : "closed";

   return (
      <ReaderModeProvider mode={mode}>
         <div
            data-reader
            data-reader-surface={surface}
            data-reader-mode={mode}
            data-reader-sidebar-state={sidebarState}
            className={cn("reader-shell min-h-[calc(100vh-4rem)] md:grid", track && "md:grid-cols-[var(--reader-rail-width)_minmax(0,1fr)]")}
         >
            {track ? (
               <aside aria-label="Track navigation" className="reader-rail sticky top-16 hidden h-[calc(100vh-4rem)] flex-col overflow-y-auto border-r border-border md:flex">
                  <div className="flex flex-col items-center gap-1 py-3 data-[expanded=true]:items-start data-[expanded=true]:px-4" data-expanded={expanded}>
                     <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={SIDEBAR_ID}
                        onClick={() => setChosen(!expanded)}
                        className="flex size-11 cursor-pointer items-center justify-center rounded-md text-foreground transition-micro hover:bg-muted"
                     >
                        {expanded ? <PanelLeftClose aria-hidden="true" className="size-5" /> : <PanelLeftOpen aria-hidden="true" className="size-5" />}
                        <span className="sr-only">{expanded ? "Collapse Track sidebar" : "Expand Track sidebar"}</span>
                     </button>
                     {track.href ? (
                        <Link
                           href={track.href}
                           prefetch={false}
                           data-reader-rail-icon
                           className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-micro hover:bg-muted hover:text-foreground"
                        >
                           <ListTree aria-hidden="true" className="size-5" />
                           <span className="sr-only">Track overview: {track.title}</span>
                        </Link>
                     ) : null}
                  </div>
                  <div id={SIDEBAR_ID} data-reader-sidebar className="reader-sidebar px-4 pb-6">
                     <TrackSidebar outline={track} />
                  </div>
               </aside>
            ) : null}
            <div className="min-w-0">
               {readable ? (
                  <div className="reader-topbar sticky top-16 z-40 flex min-h-14 items-center gap-2 border-b border-border px-4 md:px-6">
                     {track ? <TrackDrawer outline={track} below="md" /> : null}
                     <div className="ml-auto flex items-center gap-2">
                        {hasTools && margin === false ? <ToolsSheet tools={tools} /> : null}
                        <ModeControl mode={mode} onChange={changeMode} />
                     </div>
                  </div>
               ) : null}
               <div className={cn(hasTools && "xl:grid xl:grid-cols-[minmax(0,1fr)_17rem] xl:gap-8 xl:pr-8")}>
                  <div className="min-w-0">{children}</div>
                  {hasTools && margin === true ? (
                     <aside aria-label="Study tools" className="self-start py-12 xl:sticky xl:top-32">
                        {tools}
                     </aside>
                  ) : null}
               </div>
               <Footer />
            </div>
         </div>
      </ReaderModeProvider>
   );
}
