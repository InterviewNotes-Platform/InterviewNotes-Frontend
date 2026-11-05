"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveState } from "@/components/ui/save-status";
import { useStoryClient, type StoryApiProps } from "@/components/prepare/stories/useStoryClient";
import type { ItemState, PrepResult } from "@/lib/prep/types";
import { itemStateAvailable } from "./itemStateAvailable";

export type ReaderField = "completed" | "bookmarked";
export type ReaderView = { kind: "hidden" | "loading" | "failed" } | { kind: "ready"; state: ItemState };
export type ReaderSave = { status: SaveState; message?: string };

const COLUMN = { completed: "completed_at", bookmarked: "bookmarked_at" } as const;
const LABEL = { completed: "completion", bookmarked: "bookmark" } as const;

/**
 * Everything a Lesson or Problem reader does with the learner's item state: ask whether M2 is on, record the open, read
 * the item, change completion or bookmark. Item state lives in memory only. It stays hidden until M2 is known to be on
 * and the reader signed in, and it sends no item-state request before that.
 */
export function useReaderItem(contentId: string, api: StoryApiProps) {
   const client = useStoryClient(api);
   const [view, setView] = useState<ReaderView>({ kind: "hidden" });
   const [save, setSave] = useState<ReaderSave>({ status: "idle" });
   const [pending, setPending] = useState<ReaderField | null>(null);
   const busy = useRef(false);
   const visit = useRef<{ id: string; done: Promise<unknown> } | null>(null);
   const [attempt, setAttempt] = useState(0);

   useEffect(() => {
      if (!client || !api.apiUrl) return;
      let live = true;
      const apiUrl = api.apiUrl;
      (async () => {
         if (!(await itemStateAvailable(apiUrl, client)) || !live) return;
         setView({ kind: "loading" });
         // One visit per open, kept across a repeated effect. The read waits for it: a first visit creates the row.
         if (visit.current?.id !== contentId) visit.current = { id: contentId, done: client.recordVisit(contentId) };
         await visit.current.done;
         const result = await client.getItemState(contentId);
         if (!live) return;
         setView(result.status === "ok" ? { kind: "ready", state: result.data } : result.status === "unavailable" ? { kind: "failed" } : { kind: "hidden" });
      })();
      return () => {
         live = false;
      };
   }, [client, api.apiUrl, contentId, attempt]);

   const retry = useCallback(() => {
      setView({ kind: "loading" });
      setAttempt((count) => count + 1);
   }, []);

   const toggle = useCallback(
      async (field: ReaderField) => {
         if (!client || busy.current || view.kind !== "ready") return;
         busy.current = true;
         setPending(field);
         setSave({ status: "saving" });
         const wanted = view.state[COLUMN[field]] === null;
         const result: PrepResult<ItemState> = await client.updateItemState(contentId, { version: view.state.version, [field]: wanted });
         if (result.status === "ok") {
            setView({ kind: "ready", state: result.data });
            setSave({ status: "saved" });
         } else if (result.status === "notFound" || result.status === "unauthenticated") {
            setView({ kind: "hidden" });
            setSave({ status: "idle" });
         } else {
            // A conflict, or a write whose outcome is unknown, is answered by reading again: nothing is overwritten.
            const fresh = await client.getItemState(contentId);
            if (fresh.status === "ok") setView({ kind: "ready", state: fresh.data });
            const applied = fresh.status === "ok" && (fresh.data[COLUMN[field]] !== null) === wanted;
            setSave(
               result.status === "conflict" || !applied
                  ? { status: "error", message: result.status === "conflict" ? `This changed elsewhere. Showing the latest ${LABEL[field]}; try again if you still want to.` : `Couldn't save the ${LABEL[field]}. Try again.` }
                  : { status: "saved" }
            );
         }
         busy.current = false;
         setPending(null);
      },
      [client, contentId, view]
   );

   return { view, save, pending, toggle, retry };
}
