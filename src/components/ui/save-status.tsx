import type { ComponentProps } from "react";
import { Check, CircleAlert, CircleDashed, LoaderCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "unsaved" | "error";

const COPY: Record<Exclude<SaveState, "idle">, { text: string; Icon: LucideIcon; tone: string; spin?: boolean }> = {
   saving: { text: "Saving…", Icon: LoaderCircle, tone: "text-muted-foreground", spin: true },
   saved: { text: "Saved", Icon: Check, tone: "text-foreground" },
   unsaved: { text: "Unsaved changes", Icon: CircleDashed, tone: "text-muted-foreground" },
   error: { text: "Couldn't save", Icon: CircleAlert, tone: "text-destructive" },
};

interface SaveStatusProps extends Omit<ComponentProps<"div">, "children"> {
   /** The state to show. It is only displayed, never inferred: "Saved" appears only when the caller says saved. */
   status: SaveState;
   /** Replaces the default text of the state, for a reason or a next step ("Couldn't save. Check your connection."). */
   message?: string;
}

/**
 * A status line in a polite, atomic live region (role="status"). Each state has its own icon and words, so colour is
 * never the only signal. The region stays mounted while idle, because a region added together with its text is often
 * not announced. A change of state is one change of text.
 *
 * What to announce and when is the caller's policy (for example holding "Saving…" back for a fast save): this
 * component does not debounce. Props spread last, so a caller can set `aria-live="off"` for a state it wants quiet.
 */
function SaveStatus({ status, message, className, ...props }: SaveStatusProps) {
   const copy = status === "idle" ? null : COPY[status];
   return (
      <div
         role="status"
         aria-live="polite"
         aria-atomic="true"
         data-slot="save-status"
         data-status={status}
         className={cn("flex min-h-5 items-center gap-1.5 text-sm", copy?.tone, className)}
         {...props}
      >
         {copy ? (
            <>
               <copy.Icon aria-hidden="true" className={cn("size-4 shrink-0", copy.spin && "motion-safe:animate-spin")} />
               <span>{message ?? copy.text}</span>
            </>
         ) : null}
      </div>
   );
}

export { SaveStatus };
export type { SaveState, SaveStatusProps };
