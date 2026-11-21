import { Children, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
   /** What would be created, in words: the chosen question's heading or wording, or why nothing can be started yet. */
   chosen: string | null;
   prompt: string;
   canSubmit: boolean;
   /** The create's own states (progress, sign-in, failure, the unlinked-story notice), shown where the button is. */
   children?: ReactNode;
}

/**
 * Start answer, kept in reach: docked under the stage on a wide screen and fixed to the bottom on a phone, so the choice and
 * the action are never a page apart. It is the form's submit button, so Enter and the create guards behave as before.
 */
export function Dock({ chosen, prompt, canSubmit, children }: Props) {
   return (
      <div
         className={
            "sticky bottom-4 z-10 rounded-2xl border border-border bg-background p-3 pl-5 shadow-[0_6px_24px_rgba(28,25,21,0.10)] " +
            "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:px-4 max-md:pt-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-md:shadow-none"
         }
      >
         <div className="flex items-center justify-between gap-3">
            <p className="line-clamp-2 min-w-0 text-supporting text-muted-foreground">
               {chosen ? (
                  <>
                     Selected · <b className="font-semibold text-foreground">{chosen}</b>
                  </>
               ) : (
                  prompt
               )}
            </p>
            <Button type="submit" size="lg" disabled={!canSubmit} className="shrink-0">
               Start answer
            </Button>
         </div>
         {Children.toArray(children).length > 0 && <div className="mt-3 space-y-3 max-md:max-h-[50vh] max-md:overflow-y-auto">{children}</div>}
      </div>
   );
}
