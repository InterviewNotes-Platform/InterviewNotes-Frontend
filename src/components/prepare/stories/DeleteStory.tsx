"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { problem, SLOW_NOTICE, useSlow } from "@/app/prepare/data/messages";
import { Button } from "@/components/ui/button";
import { inertPage } from "@/lib/inertPage";
import type { PrepClient } from "@/lib/prep/client";
import type { Story } from "@/lib/prep/types";
import { SignIn } from "./notices";
import { PREPARE_STORIES_HREF } from "@/app/prepare/stories/href";

type Attempt = { phase: "idle" } | { phase: "pending" } | { phase: "failed"; message: string } | { phase: "signin" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Props {
   client: PrepClient;
   story: Story;
   /** The API confirmed the deletion (204) or that the story is not in this reader's bank. */
   onDeleted: (outcome: "deleted" | "missing") => void;
   disabled?: boolean;
}

/** Delete one story behind a confirmation. "Deleted" is shown only from the API's own answer, never from the click. */
export function DeleteStory({ client, story, onDeleted, disabled }: Props) {
   const [open, setOpen] = useState(false);
   const [attempt, setAttempt] = useState<Attempt>({ phase: "idle" });
   const releasePage = useRef<() => void>(undefined);
   const cancel = useRef<HTMLButtonElement>(null);
   const pending = attempt.phase === "pending";
   const slow = useSlow(pending);
   const links = story.answer_ids.length;

   // The page behind the dialog is inert while it is open, including its live regions (as the delete-all dialog).
   function changeOpen(next: boolean) {
      if (!next && pending) return;
      releasePage.current?.();
      releasePage.current = next ? inertPage() : undefined;
      if (next) setAttempt({ phase: "idle" });
      setOpen(next);
   }
   useEffect(() => () => releasePage.current?.(), []);

   async function confirm() {
      if (pending) return;
      setAttempt({ phase: "pending" });
      const result = await client.deleteStory(story.id);
      if (result.status === "ok" || result.status === "notFound") {
         releasePage.current?.();
         releasePage.current = undefined;
         setOpen(false);
         onDeleted(result.status === "ok" ? "deleted" : "missing");
      } else if (result.status === "unauthenticated") {
         setAttempt({ phase: "signin" });
      } else {
         const unknown = result.status === "unavailable" && result.cause !== "upstream";
         const tail = unknown ? "We cannot tell whether it was deleted, so nothing is shown as deleted. It is safe to try again." : "Nothing was deleted.";
         setAttempt({ phase: "failed", message: `${problem(result, "the deletion")} ${tail}` });
      }
   }

   return (
      <Dialog.Root open={open} onOpenChange={changeOpen}>
         <Dialog.Trigger asChild>
            <Button type="button" variant="destructive" size="lg" disabled={disabled}>
               Delete…
            </Button>
         </Dialog.Trigger>
         <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content
               role="alertdialog"
               onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  cancel.current?.focus();
               }}
               onInteractOutside={(event) => pending && event.preventDefault()}
               className="bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-lg border p-6 shadow-lg"
            >
               <Dialog.Title className="text-subsection text-foreground">Delete this story?</Dialog.Title>
               <Dialog.Description className="text-body text-muted-foreground">
                  “{story.title}” will be permanently deleted. This cannot be undone.
                  {links > 0 && ` It is linked to ${plural(links, "answer", "answers")}: the link is removed and the answers stay as they are.`}
               </Dialog.Description>
               {pending && (
                  <p role="status" className="text-supporting text-muted-foreground">
                     Deleting… {slow && SLOW_NOTICE}
                  </p>
               )}
               {attempt.phase === "failed" && (
                  <p role="alert" className="text-body text-foreground">
                     {attempt.message}
                  </p>
               )}
               {attempt.phase === "signin" && <SignIn doing="delete this story" to={`${PREPARE_STORIES_HREF}/${story.id}`} />}
               <div className="flex flex-wrap justify-end gap-3">
                  <Button ref={cancel} type="button" variant="outline" aria-disabled={pending || undefined} onClick={() => changeOpen(false)}>
                     Cancel
                  </Button>
                  <Button type="button" variant="destructive" aria-disabled={pending || undefined} onClick={() => void confirm()}>
                     {attempt.phase === "failed" ? "Try deleting again" : pending ? "Deleting…" : "Delete story"}
                  </Button>
               </div>
            </Dialog.Content>
         </Dialog.Portal>
      </Dialog.Root>
   );
}
