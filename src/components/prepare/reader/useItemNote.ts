import { useCallback, useEffect, useRef, useState } from "react";
import { AUTOSAVE_DELAY_MS } from "@/components/prepare/editor/useAnswerEditor";
import type { SaveState } from "@/components/ui/save-status";
import type { ItemState } from "@/lib/prep/types";
import type { NoteWrite } from "./useReaderItem";

/** The longest note, in code points (api-contract §15.3). */
export const NOTE_MAX = 20_000;

export type NoteState =
   | { phase: "idle" }
   | { phase: "saving" }
   | { phase: "saved"; note?: string }
   | { phase: "invalid" }
   /** A 409: nothing was applied and the text is kept. `busy` while the reader's choice is being carried out. */
   | { phase: "conflict"; busy?: boolean; note?: string }
   | { phase: "gone" }
   | { phase: "signin" }
   | { phase: "unknown" };

const MESSAGES: Partial<Record<NoteState["phase"], string>> = {
   invalid: "Couldn't save. The server did not accept this note.",
   conflict: "Not saved: this note was changed somewhere else. Your text is still here; choose which version to keep.",
   gone: "Not saved: notes are not available right now. Your text is still here; copy it if you want to keep it.",
   signin: "Not saved: your session has ended. Your text is still here.",
   unknown: "We could not confirm that your note was saved. Your text is still here.",
};

const CONFLICT_NOTES = {
   again: "Not saved: this note was changed again while we tried. Your text is still here; choose again.",
   unavailable: "We could not load the latest version, so nothing was changed. Your text is still here; choose again.",
   typed: "You kept typing while the latest version loaded, so nothing was replaced. Your text is still here; choose again.",
   loaded: "Saved: loaded the latest version from the server. Your earlier text was replaced.",
   elsewhere: "This note was changed somewhere else while you were editing. Nothing has been replaced; choose which version to keep.",
};

/** Why `text` cannot be saved, or null. Checked on the reader's side so a note that can never be accepted is not sent. */
export function noteIssue(text: string): string | null {
   if (text.includes("\u0000")) return "This note has a null character, which cannot be saved. Remove it.";
   // UTF-16 length is never below the code-point count, so the spread only runs for a long note.
   return text.length > NOTE_MAX && [...text].length > NOTE_MAX ? `Too long to save: a note can have ${NOTE_MAX.toLocaleString("en-US")} characters at most.` : null;
}

/** An empty note is stored as no note (`null`); the text box and the server keep one meaning of "empty". */
const noteOf = (text: string) => (text === "" ? null : text);
const isBlocked = (phase: NoteState["phase"]) => phase === "conflict" || phase === "gone" || phase === "signin" || phase === "unknown";

interface Options {
   /** The shared item state, as the reader owner holds it. */
   state: ItemState;
   writeNote: (note: string | null) => Promise<NoteWrite>;
   readLatest: (before?: (latest: ItemState) => void) => Promise<ItemState | null>;
}

/**
 * The note's draft and its autosave, in the shape of the M1 editors: the same quiet time before a save, one loop that
 * makes every write one at a time, "saved" only when the server's note equals the draft as it stands, and the explicit
 * Keep mine / Load server version choice on a 409. The version is not held here: `writeNote` takes it from the reader's
 * shared state, so a note and the completion and bookmark controls can never write with different versions.
 */
export function useItemNote({ state, writeNote, readLatest }: Options) {
   const initial = state.note ?? "";
   const [draft, setDraft] = useState(initial);
   const [write, setWrite] = useState<NoteState>({ phase: "idle" });
   /** The note the server held when the draft was last in step with it; kept in state to draw from and in a ref for the loop. */
   const [base, setBase] = useState(initial);
   const draftRef = useRef(initial);
   const baseRef = useRef(initial);
   const writeRef = useRef(write);
   const sentRef = useRef<string | null>(null);
   const rejectedRef = useRef<string | null>(null);
   const flightRef = useRef<Promise<void> | null>(null);
   const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

   const issue = noteIssue(draft);
   const dirty = draft !== base;
   const saving = write.phase === "saving";
   const hasPendingWork = dirty || saving;

   const commit = useCallback((next: NoteState) => {
      writeRef.current = next;
      setWrite(next);
   }, []);
   const commitBase = useCallback((text: string) => {
      baseRef.current = text;
      setBase(text);
   }, []);

   // A change to the note that this draft did not make: another browser, found by a re-read after a control's 409.
   useEffect(() => {
      const server = state.note ?? "";
      if (server === baseRef.current) return;
      if (server === sentRef.current) return commitBase(server);
      if (draftRef.current === baseRef.current || draftRef.current === server) {
         commitBase(server);
         draftRef.current = server;
         setDraft(server);
      } else if (!isBlocked(writeRef.current.phase)) {
         commit({ phase: "conflict", note: CONFLICT_NOTES.elsewhere });
      }
   }, [state.note, commit, commitBase]);

   const drain = useCallback(async () => {
      for (;;) {
         const text = draftRef.current;
         if (text === baseRef.current || noteIssue(text) || isBlocked(writeRef.current.phase) || rejectedRef.current === text) return;
         sentRef.current = text;
         commit({ phase: "saving" });
         const result = await writeNote(noteOf(text));
         switch (result.status) {
            case "ok":
               commitBase(result.state.note ?? "");
               if (draftRef.current === baseRef.current) return commit({ phase: "saved" });
               // Text typed during the request: a pending debounce will save it, otherwise do it now.
               if (timerRef.current !== undefined) return commit({ phase: "idle" });
               continue;
            case "invalid":
               rejectedRef.current = text;
               return commit({ phase: "invalid" });
            case "conflict":
               return commit({ phase: "conflict" });
            case "gone":
               return commit({ phase: "gone" });
            case "signin":
               return commit({ phase: "signin" });
            default:
               return commit({ phase: "unknown" });
         }
      }
   }, [commit, commitBase, writeNote]);

   /** Saves what is unsaved now, after any request already in flight. Resolves when the loop has stopped. */
   const persist = useCallback((): Promise<void> => {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
      flightRef.current ??= drain().finally(() => {
         flightRef.current = null;
      });
      return flightRef.current;
   }, [drain]);

   const schedule = useCallback(() => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
         timerRef.current = undefined;
         void persist();
      }, AUTOSAVE_DELAY_MS);
   }, [persist]);

   useEffect(() => () => clearTimeout(timerRef.current), []);

   useEffect(() => {
      if (!hasPendingWork) return;
      const warn = (event: BeforeUnloadEvent) => event.preventDefault();
      window.addEventListener("beforeunload", warn);
      return () => window.removeEventListener("beforeunload", warn);
   }, [hasPendingWork]);

   const edit = useCallback(
      (text: string) => {
         draftRef.current = text;
         setDraft(text);
         if (writeRef.current.phase === "saved" || writeRef.current.phase === "invalid") commit({ phase: "idle" });
         schedule();
      },
      [commit, schedule]
   );

   /** The reader's own "try again" after a write that could not be confirmed or a session that ended. The next write reads the version first. */
   const retry = useCallback(() => {
      if (writeRef.current.phase !== "unknown" && writeRef.current.phase !== "signin") return;
      rejectedRef.current = null;
      commit({ phase: "idle" });
      void persist();
   }, [commit, persist]);

   /** Both choices run as the one write in flight, so no autosave or exit can slip in between; a second click while one runs is ignored. */
   const resolve = useCallback((choose: () => Promise<void>) => {
      const now = writeRef.current;
      if (now.phase !== "conflict" || now.busy || flightRef.current) return;
      flightRef.current = choose().finally(() => {
         flightRef.current = null;
      });
   }, []);
   const adopt = useCallback((latest: ItemState) => commitBase(latest.note ?? ""), [commitBase]);

   /** Keep mine: the draft goes out against the version read now, never the old one. A second 409 returns to the choice. */
   const keepMine = useCallback(
      () =>
         resolve(async () => {
            commit({ phase: "conflict", busy: true });
            const latest = await readLatest(adopt);
            if (!latest) return commit({ phase: "conflict", note: CONFLICT_NOTES.unavailable });
            rejectedRef.current = null;
            if (draftRef.current === baseRef.current) return commit({ phase: "saved" });
            commit({ phase: "idle" });
            await drain();
            if (writeRef.current.phase === "conflict") commit({ phase: "conflict", note: CONFLICT_NOTES.again });
         }),
      [adopt, commit, drain, readLatest, resolve]
   );

   /** Load server version: the reader's text is replaced, but only if nothing was typed while it was read. */
   const loadServer = useCallback(
      () =>
         resolve(async () => {
            const before = draftRef.current;
            commit({ phase: "conflict", busy: true });
            const latest = await readLatest(adopt);
            if (!latest) return commit({ phase: "conflict", note: CONFLICT_NOTES.unavailable });
            if (draftRef.current !== before) return commit({ phase: "conflict", note: CONFLICT_NOTES.typed });
            rejectedRef.current = null;
            draftRef.current = baseRef.current;
            setDraft(baseRef.current);
            commit({ phase: "saved", note: CONFLICT_NOTES.loaded });
         }),
      [adopt, commit, readLatest, resolve]
   );

   /** Drives everything unsaved to the server before the reader leaves. True only when the server holds the draft as it stands. */
   const settle = useCallback(async (): Promise<boolean> => {
      for (let round = 0; round < 3; round++) {
         await persist();
         if (draftRef.current === baseRef.current) return true;
         if (isBlocked(writeRef.current.phase) || writeRef.current.phase === "invalid" || noteIssue(draftRef.current)) return false;
      }
      return false;
   }, [persist]);

   const saveState: SaveState = issue
      ? "error"
      : saving
        ? "saving"
        : write.phase === "idle" || write.phase === "saved"
          ? dirty
             ? "unsaved"
             : write.phase === "saved"
               ? "saved"
               : "idle"
          : "error";

   return {
      draft,
      write,
      dirty,
      issue,
      hasPendingWork,
      saveState,
      saveMessage: issue ?? (("note" in write ? write.note : undefined) || MESSAGES[write.phase]),
      edit,
      persist,
      settle,
      retry,
      keepMine,
      loadServer,
   };
}
