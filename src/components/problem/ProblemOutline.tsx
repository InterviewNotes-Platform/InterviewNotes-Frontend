"use client";

import { useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import { goTo } from "@/components/lesson/LessonContents";
import { useActiveHeading } from "@/components/lesson/useActiveHeading";
import { EVERYTHING, GROUP_LABEL, NEUTRAL_REGION_LABEL, OUTLINE_LABEL } from "@/lib/catalog/positionCopy";
import { cn } from "@/lib/utils";
import { useEverything } from "./RevealProvider";

export interface OutlineEntry {
   id: string;
   label: string;
}

interface OutlineProps {
   interview: OutlineEntry[];
   review: OutlineEntry[];
   /** The region after the review surfaces for material with no usable position; in neither group. */
   neutral: OutlineEntry | null;
   className?: string;
}

const subscribe = () => () => {};
/** False in the server HTML and while hydrating, so a control that needs JavaScript is absent until it can work (S-RVL-12c). */
const useHydrated = () => useSyncExternalStore(subscribe, () => true, () => false);

function Everything({ announce }: { announce: (message: string) => void }) {
   const hydrated = useHydrated();
   const { everything, showAll, hideAll } = useEverything();
   if (!hydrated) return null;
   return (
      <button
         type="button"
         onClick={() => {
            if (everything) hideAll();
            else showAll();
            announce(everything ? EVERYTHING.hidden : EVERYTHING.shown);
         }}
         className="flex min-h-11 w-full cursor-pointer items-center rounded-sm text-supporting font-semibold text-foreground transition-micro hover:text-primary lg:min-h-0 lg:py-1.5"
      >
         {everything ? EVERYTHING.hide : EVERYTHING.show}
      </button>
   );
}

function Links({ label, entries, numbered, active, onJump, touch }: { label: string; entries: OutlineEntry[]; numbered: boolean; active: string | null; onJump: (id: string) => void; touch?: boolean }) {
   const List = numbered ? "ol" : "ul";
   return (
      <List
         aria-label={label}
         role="list"
         className={cn("m-0 pl-6", numbered ? "list-decimal text-supporting text-muted-foreground" : "list-none")}
      >
         {entries.map(({ id, label: text }) => (
            <li key={id}>
               <a
                  href={`#${id}`}
                  aria-current={id === active ? "location" : undefined}
                  onClick={(event: MouseEvent) => {
                     event.preventDefault();
                     onJump(id);
                  }}
                  className={cn(
                     "block border-l-2 border-border py-1.5 pl-3 text-supporting text-muted-foreground transition-micro hover:text-foreground aria-[current=location]:border-foreground aria-[current=location]:font-medium aria-[current=location]:text-foreground",
                     touch && "flex min-h-11 items-center"
                  )}
               >
                  {text}
               </a>
            </li>
         ))}
      </List>
   );
}

const GROUP_HEADING = "m-0 mt-4 mb-1 text-supporting font-semibold uppercase tracking-wide text-muted-foreground first:mt-0";

function Groups({ interview, review, neutral, active, onJump, touch }: Omit<OutlineProps, "className"> & { active: string | null; onJump: (id: string) => void; touch?: boolean }) {
   const shared = { active, onJump, touch };
   return (
      <>
         {interview.length > 0 ? (
            <>
               <p className={GROUP_HEADING}>{GROUP_LABEL.interview}</p>
               <Links label={GROUP_LABEL.interview} entries={interview} numbered {...shared} />
            </>
         ) : null}
         {review.length > 0 ? (
            <>
               <p className={GROUP_HEADING}>{GROUP_LABEL.review}</p>
               <Links label={GROUP_LABEL.review} entries={review} numbered={false} {...shared} />
            </>
         ) : null}
         {neutral ? (
            <div className="mt-4">
               <Links label={NEUTRAL_REGION_LABEL} entries={[neutral]} numbered={false} {...shared} />
            </div>
         ) : null}
      </>
   );
}

/**
 * The Problem's outline (S-LAY-2, S-AX-1): Interview (numbered) and Review (unnumbered), a sticky rail from `lg` and a native
 * disclosure below it, so the page and its links work without JavaScript. Show / Hide everything sits with it, never beside the
 * challenge (S-RVL-6), and announces each press once, politely (S-AX-5).
 */
export function ProblemOutline({ className, ...groups }: OutlineProps) {
   const ids = [...groups.interview, ...groups.review, ...(groups.neutral ? [groups.neutral] : [])].map(({ id }) => id);
   const [active, choose] = useActiveHeading(ids);
   const [message, setMessage] = useState("");
   const phone = useRef<HTMLDetailsElement>(null);

   // One phase needs no links, only the control (S-RVL-6).
   if (ids.length < 2) {
      return (
         <div className={className}>
            <div className="mb-6 lg:sticky lg:top-28 lg:mb-0">
               <Everything announce={setMessage} />
            </div>
            <p role="status" className="sr-only">
               {message}
            </p>
         </div>
      );
   }

   const jump = (id: string) => {
      choose(id);
      goTo(id, 0);
   };
   const closeThenJump = (id: string) => {
      if (phone.current) phone.current.open = false;
      jump(id);
   };

   return (
      <div className={className}>
         <details ref={phone} className="mb-10 border-y border-border lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm font-semibold transition-micro hover:text-primary [&::-webkit-details-marker]:hidden">
               <ChevronRight aria-hidden="true" className="size-4 shrink-0 motion-safe:transition-transform [[open]>summary>&]:rotate-90" />
               {OUTLINE_LABEL}
            </summary>
            <nav aria-label={OUTLINE_LABEL} className="pb-3">
               <Everything announce={setMessage} />
               <Groups {...groups} active={active} onJump={closeThenJump} touch />
            </nav>
         </details>
         <nav aria-label={OUTLINE_LABEL} className="sticky top-28 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block">
            <Groups {...groups} active={active} onJump={jump} />
            <div className="mt-4 border-t border-border pt-3 empty:hidden">
               <Everything announce={setMessage} />
            </div>
         </nav>
         <p role="status" className="sr-only">
            {message}
         </p>
      </div>
   );
}
