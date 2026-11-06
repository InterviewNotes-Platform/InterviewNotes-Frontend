"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { itemStateAvailable } from "@/components/prepare/reader/itemStateAvailable";
import { useStoryClient, type StoryApiProps } from "@/components/prepare/stories/useStoryClient";
import { ModuleOpenContext } from "./ModuleSection";

/** At most this many per-item reads are in flight at once (P7-T46; the bound F-5 leaves to this task). */
export const ITEM_STATE_READ_CONCURRENCY = 4;

type Marks = ReadonlyMap<string, "complete" | "incomplete">;
type Store = { marks: Marks; want: (contentId: string) => void };

const MarksContext = createContext<Store | null>(null);

const readable = (contentId: string) => /^(lesson|problem)\./.test(contentId);

/**
 * Reads each wanted Lesson or Problem once through the per-item read (api-contract §15.3), after the capability read
 * (§15.9) says M2 is on, never more than four at a time. A read that fails leaves its row unknown: no mark, no claim.
 */
export function CompletionMarksProvider({ children, ...api }: StoryApiProps & { children: ReactNode }) {
   const client = useStoryClient(api);
   const [marks, setMarks] = useState<Marks>(new Map());
   const wanted = useRef<string[]>([]);
   const asked = useRef(new Set<string>());
   const inFlight = useRef(0);
   const live = useRef(true);
   const available = useRef<Promise<boolean> | null>(null);
   const { apiUrl } = api;

   useEffect(() => {
      live.current = true;
      return () => {
         live.current = false;
      };
   }, []);

   const drain = useCallback(() => {
      // Once the page is left, reads already in flight finish but none is started.
      while (client && live.current && inFlight.current < ITEM_STATE_READ_CONCURRENCY && wanted.current.length > 0) {
         const contentId = wanted.current.shift()!;
         inFlight.current += 1;
         void client
            .getItemState(contentId)
            .then((result) => {
               if (result.status === "notFound" || result.status === "unauthenticated") wanted.current = [];
               if (result.status !== "ok" || !live.current) return;
               setMarks((previous) => new Map(previous).set(contentId, result.data.completed_at ? "complete" : "incomplete"));
            })
            .finally(() => {
               inFlight.current -= 1;
               drain();
            });
      }
   }, [client]);

   const want = useCallback(
      (contentId: string) => {
         if (!client || !apiUrl || !readable(contentId) || asked.current.has(contentId)) return;
         asked.current.add(contentId);
         wanted.current.push(contentId);
         available.current ??= itemStateAvailable(apiUrl, client);
         void available.current.then((on) => {
            if (on && live.current) drain();
         });
      },
      [client, apiUrl, drain]
   );

   const store = useMemo(() => ({ marks, want }), [marks, want]);
   return <MarksContext value={store}>{children}</MarksContext>;
}

/**
 * A row's leading slot. Without a provider, or until the row's state is known to be complete, it is the plain slot with the
 * type icon; a complete row shows a check in the same 2rem box, named "Completed" for assistive technology.
 */
export function EntryLeading({ contentId, children }: { contentId: string; children: ReactNode }) {
   const store = useContext(MarksContext);
   const open = useContext(ModuleOpenContext);
   const want = store?.want;
   useEffect(() => {
      if (open) want?.(contentId);
   }, [open, want, contentId]);

   if (store?.marks.get(contentId) === "complete") {
      return (
         <span data-slot="entry-leading" data-state="completed" className="flex size-8 items-center justify-center text-primary">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            <span className="sr-only">Completed </span>
         </span>
      );
   }
   return (
      <span data-slot="entry-leading" aria-hidden="true" className="flex size-8 items-center justify-center text-muted-foreground">
         {children}
      </span>
   );
}
