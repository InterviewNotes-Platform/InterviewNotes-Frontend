"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { PRIVACY_HREF } from "@/lib/privacy";

interface Props {
   open: boolean;
   /** The terms version being asked about, as the server named it. */
   version: string | null;
   /** Accepting is being recorded; a second click or a dismissal must not interrupt it. */
   busy: boolean;
   error: string | null;
   onAccept: () => void;
   onDecline: () => void;
}

/**
 * The first-use AI consent dialog (P7-D-042, P7-D-046). It only asks: it holds no state and calls no API. Escape, the overlay and Decline all decline.
 * The caller makes the page inert before opening it (as the delete dialogs do) so live regions behind it stay unreachable too.
 */
export function ConsentDialog({ open, version, busy, error, onAccept, onDecline }: Props) {
   return (
      <Dialog.Root open={open} onOpenChange={(next) => !next && !busy && onDecline()}>
         <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content
               onOpenAutoFocus={(event) => {
                  // Neither choice is the safe default to land on; the summary comes first, so the link, the first control, takes focus.
                  event.preventDefault();
                  (event.currentTarget as HTMLElement).querySelector<HTMLElement>("a[href]")?.focus();
               }}
               // The page behind was made inert, which drops focus to the body in a browser; the caller puts it back on the control that was used.
               onCloseAutoFocus={(event) => event.preventDefault()}
               onInteractOutside={(event) => busy && event.preventDefault()}
               className="bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-lg border p-6 shadow-lg"
            >
               <Dialog.Title className="text-subsection text-foreground">Use AI help on your answer?</Dialog.Title>
               <Dialog.Description className="text-body text-muted-foreground">
                  AI help is optional. Before it runs for the first time, please read how it handles your text and choose whether to accept.
               </Dialog.Description>
               <ul className="list-disc space-y-2 pl-5 text-body text-foreground">
                  <li>AI runs only when you choose Draft or Review. It sends your question and the text you chose for that request to an AI provider: Groq on the Free plan, OpenAI on Premium.</li>
                  <li>Providers may keep request data for up to 30 days for abuse monitoring or reliability.</li>
                  <li>A result is a preview. Your answer changes only if you apply or insert it.</li>
                  <li>We save that you accepted this version of the notice. You can withdraw on the Privacy &amp; AI Use page at any time.</li>
               </ul>
               <p className="text-supporting text-muted-foreground">If you decline, nothing is sent, everything else keeps working, and we ask again the next time you choose an AI action.</p>
               <a href={PRIVACY_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-body text-foreground underline underline-offset-4">
                  Read the full Privacy &amp; AI Use page{version ? ` (version ${version})` : ""}, opens in a new tab
               </a>
               {busy && (
                  <p role="status" className="text-supporting text-muted-foreground">
                     Saving your choice…
                  </p>
               )}
               {error && (
                  <p role="alert" className="text-body text-foreground">
                     {error}
                  </p>
               )}
               <div className="flex flex-wrap justify-end gap-3">
                  <Button type="button" variant="outline" aria-disabled={busy || undefined} onClick={() => !busy && onDecline()}>
                     Decline
                  </Button>
                  <Button type="button" aria-disabled={busy || undefined} onClick={() => !busy && onAccept()}>
                     {error ? "Try accepting again" : "Accept and continue"}
                  </Button>
               </div>
            </Dialog.Content>
         </Dialog.Portal>
      </Dialog.Root>
   );
}
