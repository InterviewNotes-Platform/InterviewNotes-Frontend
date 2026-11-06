"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveState } from "@/components/ui/save-status";
import { useStoryClient, type StoryApiProps } from "@/components/prepare/stories/useStoryClient";
import type { FieldIssue, ItemState, PrepResult } from "@/lib/prep/types";
import { itemStateAvailable } from "./itemStateAvailable";

export type ReaderField = "completed" | "bookmarked";
export type ReaderView = { kind: "hidden" | "loading" | "failed" } | { kind: "ready"; state: ItemState };
export type ReaderSave = { status: SaveState; message?: string };

/** How a note write ended. Only `ok` means the server holds the note; every other outcome leaves the reader's text alone. */
export type NoteWrite =
   | { status: "ok"; state: ItemState }
   | { status: "conflict" }
   | { status: "invalid"; fields: FieldIssue[] }
   | { status: "gone" }
   | { status: "signin" }
   | { status: "unknown" };

const COLUMN = { completed: "completed_at", bookmarked: "bookmarked_at" } as const;
const LABEL = { completed: "completion", bookmarked: "bookmark" } as const;

/**
 * Everything a Lesson or Problem reader does with the learner's item state: ask whether M2 is on, record the open, read
 * the item, change completion or bookmark, write the note. Item state lives in memory only. It stays hidden until M2 is
 * known to be on and the reader signed in, and it sends no item-state request before that.
 *
 * This is the one owner of the item's `version`. Every write (a toggle or a note) runs through one lane, one at a time,
 * and reads the version from `stateRef` when it starts, so no two writes ever go out with the same stale version.
 */
export function useReaderItem(contentId: string, api: StoryApiProps) {
   const client = useStoryClient(api);
   const [view, setView] = useState<ReaderView>({ kind: "hidden" });
   const [save, setSave] = useState<ReaderSave>({ status: "idle" });
   const [pending, setPending] = useState<ReaderField | null>(null);
   const toggling = useRef(false);
   const lane = useRef<Promise<unknown>>(Promise.resolve());
   const stateRef = useRef<ItemState | null>(null);
   // Set when a note write ended without the server's answer and the re-read failed too: the next write reads first.
   const stale = useRef(false);
   const visit = useRef<{ id: string; done: Promise<unknown> } | null>(null);
   const [attempt, setAttempt] = useState(0);

   const show = useCallback((next: ReaderView) => {
      stateRef.current = next.kind === "ready" ? next.state : null;
      setView(next);
   }, []);
   const exclusive = useCallback(<T,>(run: () => Promise<T>): Promise<T> => {
      const next = lane.current.then(run);
      lane.current = next.catch(() => undefined);
      return next;
   }, []);

   useEffect(() => {
      if (!client || !api.apiUrl) return;
      let live = true;
      const apiUrl = api.apiUrl;
      (async () => {
         if (!(await itemStateAvailable(apiUrl, client)) || !live) return;
         show({ kind: "loading" });
         // One visit per open, kept across a repeated effect. The read waits for it: a first visit creates the row.
         if (visit.current?.id !== contentId) visit.current = { id: contentId, done: client.recordVisit(contentId) };
         await visit.current.done;
         const result = await client.getItemState(contentId);
         if (!live) return;
         show(result.status === "ok" ? { kind: "ready", state: result.data } : result.status === "unavailable" ? { kind: "failed" } : { kind: "hidden" });
      })();
      return () => {
         live = false;
      };
   }, [client, api.apiUrl, contentId, attempt, show]);

   const retry = useCallback(() => {
      show({ kind: "loading" });
      setAttempt((count) => count + 1);
   }, [show]);

   const toggle = useCallback(
      async (field: ReaderField) => {
         if (!client || toggling.current || !stateRef.current) return;
         toggling.current = true;
         setPending(field);
         setSave({ status: "saving" });
         await exclusive(async () => {
            const current = stateRef.current;
            if (!current) return;
            const wanted = current[COLUMN[field]] === null;
            const result: PrepResult<ItemState> = await client.updateItemState(contentId, { version: current.version, [field]: wanted });
            if (result.status === "ok") {
               show({ kind: "ready", state: result.data });
               setSave({ status: "saved" });
            } else if (result.status === "notFound" || result.status === "unauthenticated") {
               show({ kind: "hidden" });
               setSave({ status: "idle" });
            } else {
               // A conflict, or a write whose outcome is unknown, is answered by reading again: nothing is overwritten.
               const fresh = await client.getItemState(contentId);
               if (fresh.status === "ok") show({ kind: "ready", state: fresh.data });
               const applied = fresh.status === "ok" && (fresh.data[COLUMN[field]] !== null) === wanted;
               setSave(
                  result.status === "conflict" || !applied
                     ? { status: "error", message: result.status === "conflict" ? `This changed elsewhere. Showing the latest ${LABEL[field]}; try again if you still want to.` : `Couldn't save the ${LABEL[field]}. Try again.` }
                     : { status: "saved" }
               );
            }
         });
         toggling.current = false;
         setPending(null);
      },
      [client, contentId, exclusive, show]
   );

   /** The server's item now, adopted as the shared state. `before` runs in the same tick, ahead of any render of it. Null when it could not be read. */
   const readLatest = useCallback(
      async (before?: (latest: ItemState) => void): Promise<ItemState | null> => {
         if (!client) return null;
         const fresh = await client.getItemState(contentId);
         if (fresh.status !== "ok") return null;
         before?.(fresh.data);
         show({ kind: "ready", state: fresh.data });
         return fresh.data;
      },
      [client, contentId, show]
   );

   /**
    * Saves the note against the version held now, after any write already running. A failed or lost write is followed by a
    * re-read, so the next attempt, the reader's own retry included, starts from the server's version and never from an old one.
    * A 401 or 404 does not hide the item: the reader's text must stay on screen.
    */
   const writeNote = useCallback(
      (note: string | null): Promise<NoteWrite> =>
         exclusive(async (): Promise<NoteWrite> => {
            if (!client) return { status: "gone" };
            if (stale.current) {
               const latest = await readLatest();
               if (!latest) return { status: "unknown" };
               stale.current = false;
               if (latest.note === note) return { status: "ok", state: latest };
            }
            const current = stateRef.current;
            if (!current) return { status: "gone" };
            const result = await client.updateItemState(contentId, { version: current.version, note });
            switch (result.status) {
               case "ok":
                  show({ kind: "ready", state: result.data });
                  return { status: "ok", state: result.data };
               case "invalid":
                  return { status: "invalid", fields: result.fields };
               case "notFound":
                  return { status: "gone" };
               case "unauthenticated":
                  return { status: "signin" };
               default: {
                  // A 409 or an unknown outcome: read again before anything else is written.
                  const latest = await readLatest();
                  if (!latest) stale.current = true;
                  if (result.status === "unavailable" && latest?.note === note) return { status: "ok", state: latest };
                  return result.status === "conflict" ? { status: "conflict" } : { status: "unknown" };
               }
            }
         }),
      [client, contentId, exclusive, readLatest, show]
   );

   return { view, save, pending, toggle, retry, writeNote, readLatest };
}
