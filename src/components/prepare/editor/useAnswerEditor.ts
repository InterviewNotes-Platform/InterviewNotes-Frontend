import { useCallback, useEffect, useState, type FormEvent } from "react";
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
   | { phase: "gone" }
   | { phase: "signin" }
   | { phase: "unknown"; checking: boolean };

/** `failed` is a definite no: nothing was made and the reader may try again. `unknown` stays blocked until the reader says no copy exists. */
export type Copy = { phase: "idle" } | { phase: "working" } | { phase: "done" } | { phase: "unknown" } | { phase: "failed"; message: string; signin: boolean };

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

/**
 * The editor's state and its writes, apart from how they are drawn. The saved answer is what the server last returned;
 * the draft is what the reader sees. Nothing here saves on its own: a write happens only when `save` is called (T20 adds
 * the trigger, not a second path).
 */
export function useAnswerEditor({ initial, client, onCopied }: Options) {
   const [saved, setSaved] = useState(initial);
   const [draft, setDraft] = useState<AnswerDraft>(() => draftOf(initial));
   const [write, setWrite] = useState<Write>({ phase: "idle" });
   const [copy, setCopy] = useState<Copy>({ phase: "idle" });

   const changes = changesOf(draft, saved);
   const dirty = changes !== null;
   const saving = write.phase === "saving";
   const blankQuestion = saved.source === "custom" && draft.question_snapshot.trim() === "";
   const blocked = write.phase === "conflict" || write.phase === "gone" || write.phase === "signin" || write.phase === "unknown";
   const cannotSave = !dirty || saving || blocked || blankQuestion;
   const canDuplicate = !dirty && !saving && write.phase !== "unknown" && (copy.phase === "idle" || copy.phase === "failed");

   useEffect(() => {
      if (!dirty) return;
      const warn = (event: BeforeUnloadEvent) => event.preventDefault();
      window.addEventListener("beforeunload", warn);
      return () => window.removeEventListener("beforeunload", warn);
   }, [dirty]);

   const edit = useCallback((next: Partial<AnswerDraft>) => {
      setDraft((current) => ({ ...current, ...next }));
      setWrite((current) => (current.phase === "saved" || current.phase === "invalid" ? { phase: "idle" } : current));
   }, []);
   const editStar = (key: StarKey, value: string) => edit({ fields: { ...draft.fields, [key]: value } });

   async function save(event?: FormEvent) {
      event?.preventDefault();
      if (!changes || cannotSave) return;
      setWrite({ phase: "saving" });
      const result = await client.updateAnswer(saved.id, { version: saved.version, ...changes });
      switch (result.status) {
         case "ok":
            setSaved(result.data);
            setWrite({ phase: "saved" });
            break;
         case "invalid":
            setWrite({ phase: "invalid", issues: result.fields });
            break;
         case "conflict":
            setWrite({ phase: "conflict" });
            break;
         case "notFound":
            setWrite({ phase: "gone" });
            break;
         case "unauthenticated":
            setWrite({ phase: "signin" });
            break;
         default:
            setWrite({ phase: "unknown", checking: false });
      }
   }

   /** After an unknown outcome: re-read, and only then decide whether the write happened (contract §6). */
   async function check() {
      setWrite({ phase: "unknown", checking: true });
      const result = await client.getAnswer(saved.id);
      if (result.status !== "ok") {
         setWrite(result.status === "unauthenticated" ? { phase: "signin" } : result.status === "notFound" ? { phase: "gone" } : { phase: "unknown", checking: false });
         return;
      }
      if (changesOf(draft, result.data) === null) {
         setSaved(result.data);
         setWrite({ phase: "saved" });
      } else if (result.data.version === saved.version) {
         setWrite({ phase: "idle", note: "The earlier save did not go through. Your changes are still here; save again." });
      } else {
         setWrite({ phase: "conflict" });
      }
   }

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
      blankQuestion,
      cannotSave,
      canDuplicate,
      issues: write.phase === "invalid" ? write.issues : [],
      saveState: saveStateOf(write, dirty),
      saveMessage: write.phase === "idle" ? write.note : WRITE_MESSAGES[write.phase],
      edit,
      editStar,
      save,
      check,
      duplicate,
      allowAnotherCopy,
   };
}
