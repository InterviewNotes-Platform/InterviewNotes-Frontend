"use client";

import { useEffect, useRef, useState } from "react";

const FAILED = "Copy failed — select the code to copy it";
const RESULT_MS = 2000;

/**
 * Copies the fence source it was given, never text read back from the page. The name stays the same while the
 * visible text confirms, and a polite live region announces the result once per press. Nothing is stored.
 */
export function CopyCode({ source, label }: { source: string; label: string | null }) {
   const [result, setResult] = useState<"copied" | "failed" | null>(null);
   const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
   useEffect(() => () => clearTimeout(timer.current), []);

   async function copy() {
      clearTimeout(timer.current);
      setResult(null);
      try {
         await navigator.clipboard.writeText(source);
         setResult("copied");
      } catch {
         setResult("failed");
      }
      timer.current = setTimeout(() => setResult(null), RESULT_MS);
   }

   return (
      <>
         <button
            type="button"
            onClick={copy}
            aria-label={label ? `Copy ${label} code` : "Copy code"}
            className="-mr-3 ml-auto flex min-h-11 shrink-0 items-center rounded-md px-3 text-supporting font-medium text-muted-foreground transition-micro hover:text-foreground"
         >
            {result === "copied" ? "Copied" : "Copy"}
         </button>
         <span role="status" aria-live="polite" className="sr-only">
            {result === "copied" ? "Copied" : result === "failed" ? FAILED : ""}
         </span>
      </>
   );
}
