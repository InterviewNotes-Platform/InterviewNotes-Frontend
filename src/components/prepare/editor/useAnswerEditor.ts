import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SaveState } from "@/components/ui/save-status";
import { changesOf, draftOf, type AnswerDraft, type StarKey } from "@/lib/prep/answerDraft";
import type { PrepClient } from "@/lib/prep/client";
import type { Answer, FieldIssue } from "@/lib/prep/types";

/** What the last write left behind. A write whose outcome is unknown is never shown as saved or as failed for certain. */
export type Write =
   | { phase: "idle"; note?: string }
   | { phase: "saving" }
   | { phase: "saved" }
   | { phase: "invalid"; issues: FieldIssue[] }
   | { phase: "conflict" }
   | { phase: "gone"; unresolved?: boolean }
   | { phase: "signin"; unresolved?: boolean }
   | { phase: "unknown"; checking: boolean };

/** `failed` is a definite no: nothing was made and the reader may try again. `unknown` stays blocked until the reader says no copy exists. */
export type Copy = { phase: "idle" } | { phase: "working" } | { phase: "done" } | { phase: "unknown" } | { phase: "failed"; message: string; signin: boolean };

/** Quiet time after the last keystroke before a save starts. */
export const AUTOSAVE_DELAY_MS = 1500;
/** Waits before each automatic re-read after an unconfirmed write; after the last one only the reader's button remains. */
export const RECHECK_DELAYS_MS = [5_000, 15_000, 30_000];

const WRITE_MESSAGES: Partial<Record<Write["phase"], string>> = {
   invalid: "Couldn't save. The server did not accept some text; see the fields marked below.",
   conflict: "Not saved: this answer was changed somewhere else. Your text is still here; copy it before you reload.",
   gone: "Not saved: this answer no longer exists. Your text is still here; copy it if you want to keep it.",
   signin: "Not saved: your session has ended. Your text is still here.",
   unknown: "We could not confirm whether your changes were saved.",
};

function saveStateOf(write: Write, dirty: boolean): SaveState {
   if (write.phase === "saving") return "saving";
   if (write.phase === "idle" || write.phase === "saved") return dirty ? "unsaved" : write.phase === "saved" ? "saved" : "idle";
   return "error";
}

interface Options {
   initial: Answer;
   client: PrepClient;
   /** Called with the new answer's id once the API confirms the copy. */
   onCopied: (id: string) => void;
}

const isBlocked = (phase: Write["phase"]) => phase === "conflict" || phase === "gone" || phase === "signin" || phase === "unknown";
/** A re-read that fails with 401 or 404 leaves the earlier unconfirmed write unreconciled: it may have landed. */
const isUnresolved = (write: Write) => write.phase === "unknown" || (write.phase !== "idle" && "unresolved" in write && write.unresolved === true);
const isBlank = (answer: Answer, draft: AnswerDraft) => answer.source === "custom" && draft.question_snapshot.trim() === "";

/**
 * The editor's state and its writes, apart from how they are drawn. The saved answer is what the server last returned;
 * the draft is what the reader sees. One loop (`persist`) makes every write, one request at a time, so a save never
 * overlaps another and "saved" is claimed only when the server's copy equals the draft as it stands.
 */
export function useAnswerEditor({ initial, client, onCopied }: Options) {
   const [saved, setSaved] = useState(initial);
   const [draft, setDraft] = useState<AnswerDraft>(() => draftOf(initial));
   const [write, setWrite] = useState<Write>({ phase: "idle" });
   const [copy, setCopy] = useState<Copy>({ phase: "idle" });
   const savedRef = useRef(saved);
   const draftRef = useRef(draft);
   const writeRef = useRef(write);
   const sentRef = useRef<AnswerDraft | null>(null);
   const rejectedRef = useRef<AnswerDraft | null>(null);
   const flightRef = useRef<Promise<void> | null>(null);
   const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
   const rechecksRef = useRef(0);
   const checkRef = useRef<Promise<void> | null>(null);

   const changes = changesOf(draft, saved);
   const dirty = changes !== null;
   const saving = write.phase === "saving";
   // A write in the air or of unknown outcome can change the server after the draft is back to the saved text.
   const hasPendingWork = dirty || saving || isUnresolved(write);
   const blankQuestion = isBlank(saved, draft);
   const cannotSave = !dirty || saving || isBlocked(write.phase) || blankQuestion;
   const canDuplicate = !hasPendingWork && (copy.phase === "idle" || copy.phase === "failed");

   const commitWrite = useCallback((next: Write) => {
      writeRef.current = next;
      setWrite(next);
   }, []);
   const commitSaved = useCallback((next: Answer) => {
      savedRef.current = next;
      setSaved(next);
   }, []);

   useEffect(() => {
      if (!hasPendingWork) return;
      const warn = (event: BeforeUnloadEvent) => event.preventDefault();
      window.addEventListener("beforeunload", warn);
      return () => window.removeEventListener("beforeunload", warn);
   }, [hasPendingWork]);

   const drain = useCallback(async () => {
      for (;;) {
         const current = draftRef.current;
         const pending = changesOf(current, savedRef.current);
         if (!pending || isBlocked(writeRef.current.phase) || rejectedRef.current === current || isBlank(savedRef.current, current)) return;
         sentRef.current = current;
         commitWrite({ phase: "saving" });
         const result = await client.updateAnswer(savedRef.current.id, { version: savedRef.current.version, ...pending });
         switch (result.status) {
            case "ok":
               commitSaved(result.data);
               rechecksRef.current = 0;
               if (changesOf(draftRef.current, result.data) === null) return commitWrite({ phase: "saved" });
               // Text typed during the request: a pending debounce will save it, otherwise do it now.
               if (timerRef.current !== undefined) return commitWrite({ phase: "idle" });
               continue;
            case "invalid":
               rejectedRef.current = current;
               return commitWrite({ phase: "invalid", issues: result.fields });
            case "conflict":
               return commitWrite({ phase: "conflict" });
            case "notFound":
               return commitWrite({ phase: "gone" });
            case "unauthenticated":
               return commitWrite({ phase: "signin" });
            default:
               return commitWrite({ phase: "unknown", checking: false });
         }
      }
   }, [client, commitSaved, commitWrite]);

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

   const edit = useCallback(
      (next: Partial<AnswerDraft>) => {
         const updated = { ...draftRef.current, ...next };
         draftRef.current = updated;
         setDraft(updated);
         if (writeRef.current.phase === "saved" || writeRef.current.phase === "invalid") commitWrite({ phase: "idle" });
         schedule();
      },
      [commitWrite, schedule]
   );
   const editStar = (key: StarKey, value: string) => edit({ fields: { ...draftRef.current.fields, [key]: value } });

   function save(event?: FormEvent) {
      event?.preventDefault();
      rejectedRef.current = null;
      void persist();
   }

   const reread = useCallback(async () => {
      commitWrite({ phase: "unknown", checking: true });
      const result = await client.getAnswer(savedRef.current.id);
      if (result.status !== "ok") {
         return commitWrite(result.status === "unauthenticated" ? { phase: "signin", unresolved: true } : result.status === "notFound" ? { phase: "gone", unresolved: true } : { phase: "unknown", checking: false });
      }
      rechecksRef.current = 0;
      if (sentRef.current && changesOf(sentRef.current, result.data) === null) {
         // The unconfirmed write had landed. Anything typed since is still unsaved and goes out as the next write.
         commitSaved(result.data);
         if (changesOf(draftRef.current, result.data) === null) return commitWrite({ phase: "saved" });
      } else if (result.data.version === savedRef.current.version) {
         const again = changesOf(draftRef.current, savedRef.current) !== null;
         commitWrite({ phase: "idle", note: again ? "The earlier save did not go through. Your changes are still here and will be saved again." : undefined });
      } else {
         return commitWrite({ phase: "conflict" });
      }
      if (writeRef.current.phase !== "idle") commitWrite({ phase: "idle" });
      schedule();
   }, [client, commitSaved, commitWrite, schedule]);

   /** After an unknown outcome: re-read, and only then decide whether the write happened (contract §6). One re-read at a time; callers share it. */
   const check = useCallback((): Promise<void> => {
      checkRef.current ??= reread().finally(() => {
         checkRef.current = null;
      });
      return checkRef.current;
   }, [reread]);

   useEffect(() => {
      if (write.phase !== "unknown" || write.checking) return;
      const delay = RECHECK_DELAYS_MS[rechecksRef.current];
      if (delay === undefined) return;
      const timer = setTimeout(() => {
         rechecksRef.current += 1;
         void check();
      }, delay);
      return () => clearTimeout(timer);
   }, [write, check]);

   /** Drives everything unsaved to the server before the reader leaves. True only when the server holds the draft as it stands. */
   const settle = useCallback(async (): Promise<boolean> => {
      if (isUnresolved(writeRef.current)) await check();
      for (let round = 0; round < 3; round++) {
         await persist();
         // A draft equal to the last confirmed copy proves nothing while the outcome of a write is still unreconciled.
         if (changesOf(draftRef.current, savedRef.current) === null) return !isUnresolved(writeRef.current);
         if (isBlocked(writeRef.current.phase) || writeRef.current.phase === "invalid") return false;
      }
      return false;
   }, [check, persist]);

   async function duplicate() {
      if (!canDuplicate) return;
      setCopy({ phase: "working" });
      const result = await client.duplicateAnswer(saved.id);
      switch (result.status) {
         case "ok":
            setCopy({ phase: "done" });
            onCopied(result.data.id);
            break;
         // Refused before anything was made: the API answered 401 or 404 itself.
         case "unauthenticated":
            setCopy({ phase: "failed", signin: true, message: "Your session has ended, so no copy was made. Sign in again to continue." });
            break;
         case "notFound":
            setCopy({ phase: "failed", signin: false, message: "This answer no longer exists, so it could not be duplicated." });
            break;
         // A lost request, a 5xx, an unreadable reply or any status this call does not define may have made the copy.
         default:
            setCopy({ phase: "unknown" });
      }
   }

   /** The reader checked the workspace and found no copy: only then may another be requested after an unknown outcome. */
   const allowAnotherCopy = () => setCopy((current) => (current.phase === "unknown" ? { phase: "idle" } : current));

   return {
      saved,
      draft,
      write,
      copy,
      dirty,
      saving,
      hasPendingWork,
      blankQuestion,
      cannotSave,
      canDuplicate,
      issues: write.phase === "invalid" ? write.issues : [],
      saveState: saveStateOf(write, dirty),
      saveMessage: write.phase === "idle" ? write.note : WRITE_MESSAGES[write.phase],
      edit,
      editStar,
      save,
      persist,
      settle,
      check,
      duplicate,
      allowAnotherCopy,
   };
}
