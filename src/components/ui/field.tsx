import { useId, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

interface FieldProps extends Omit<ComponentProps<"div">, "children"> {
   label: ReactNode;
   /** Supporting text below the control; the control's accessible description. */
   description?: ReactNode;
   /** Validation message below the control. Present means invalid: the control gets aria-invalid and is described by it. */
   error?: ReactNode;
   /** Marks the control aria-required and the label with an asterisk that assistive technology skips. */
   required?: boolean;
   /** Overrides the generated control id, for a caller that must refer to it. */
   controlId?: string;
   /** Exactly one control (Textarea, Input, a native select). Field sets its id, aria-describedby, aria-invalid and aria-required; do not set them yourself. */
   children: ReactElement;
}

/**
 * Label, control, description and error as one unit, with every id relationship wired once.
 * Description and error ids are only referenced while those elements exist, so no reference dangles.
 * The error is described, not announced: it is read when the control takes focus. A form that rejects a
 * submit should move focus to the first invalid control.
 */
function Field({ label, description, error, required, controlId, className, children, ...props }: FieldProps) {
   const generated = useId();
   const id = controlId ?? generated;
   const descriptionId = `${id}-description`;
   const errorId = `${id}-error`;
   const hasDescription = description !== undefined && description !== null && description !== false && description !== "";
   const hasError = error !== undefined && error !== null && error !== false && error !== "";
   const describedBy = [hasDescription ? descriptionId : null, hasError ? errorId : null].filter(Boolean).join(" ") || undefined;

   return (
      <div data-slot="field" className={cn("grid gap-1.5", className)} {...props}>
         <Label htmlFor={id}>
            {label}
            {required ? (
               <span aria-hidden="true" className="text-destructive ml-0.5">
                  *
               </span>
            ) : null}
         </Label>
         <Slot id={id} aria-describedby={describedBy} aria-invalid={hasError ? true : undefined} aria-required={required ? true : undefined}>
            {children}
         </Slot>
         {hasDescription ? (
            <p id={descriptionId} data-slot="field-description" className="text-muted-foreground text-sm">
               {description}
            </p>
         ) : null}
         {hasError ? (
            <p id={errorId} data-slot="field-error" className="text-destructive flex items-start gap-1.5 text-sm">
               <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
               <span>{error}</span>
            </p>
         ) : null}
      </div>
   );
}

export { Field };
export type { FieldProps };
