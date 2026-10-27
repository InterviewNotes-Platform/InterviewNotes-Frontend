import * as React from "react"

import { cn } from "@/lib/utils"

// A native <label>: clicking it focuses its control, and the control's accessible name comes from it.
// Pair it with a control through htmlFor, or wrap the control; Field does the pairing for you.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-sm leading-snug font-medium select-none", className)}
      {...props}
    />
  )
}

export { Label }
