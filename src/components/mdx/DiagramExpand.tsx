"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { showDiagram } from "./diagram-svg";

interface DiagramExpandProps {
   /** True while the inline diagram does not fit its column at natural size. */
   overflows: boolean;
   /** Accessible name of the diagram: text alternative, else caption, else "Diagram". */
   name: string;
   caption?: string;
   /** Id of the visible caption, so the button is described by it. */
   captionId?: string;
   /** Draws the diagram under the given Mermaid render id and returns its SVG. Changes when the theme does. */
   draw: (id: string) => Promise<string>;
   /** Id of the inline diagram's render, so the dialog's own id can never collide with it. */
   renderId: string;
}

/**
 * Makes the page inert and returns the undo, which clears only what this call set. Radix's own `aria-hidden` spares
 * every live region and its ancestors (Copy's status), so those would stay reachable behind the modal.
 */
function inertPage() {
   const page = Array.from(document.body.children).filter((element) => element.tagName !== "SCRIPT" && !element.hasAttribute("inert"));
   page.forEach((element) => element.setAttribute("inert", ""));
   return () => page.forEach((element) => element.removeAttribute("inert"));
}

/**
 * S-DGM-6 / S-DGM-7: an "Expand diagram" button in the figure footer, only while the diagram overflows, and the
 * modal dialog it opens. The dialog is Radix's (as `sheet.tsx`): focus trap, Escape, backdrop, scroll lock, hidden
 * background and focus return to the trigger all come from it, and the page behind is made inert for as long as it
 * is open. The button stays while the dialog is open.
 */
export function DiagramExpand({ overflows, name, caption, captionId, draw, renderId }: DiagramExpandProps) {
   const [open, setOpen] = useState(false);
   const region = useRef<HTMLDivElement>(null);
   const diagram = useRef<HTMLDivElement>(null);
   const releasePage = useRef<() => void>(undefined);

   // Taken before the dialog's own layers are in the document, so they are never part of the page. Released
   // before Radix returns focus to the button, and if the diagram unmounts (navigation) while the dialog is open.
   function changeOpen(next: boolean) {
      releasePage.current?.();
      releasePage.current = next ? inertPage() : undefined;
      setOpen(next);
   }
   useEffect(() => () => releasePage.current?.(), []);

   // The dialog copy is its own Mermaid render, so none of its generated ids repeat the inline diagram's.
   const expandedId = `${renderId}-expanded`;

   useEffect(() => {
      if (!open) return;
      let cancelled = false;
      draw(expandedId)
         .then((svg) => {
            if (!cancelled && diagram.current) showDiagram(diagram.current, svg, { natural: true, hidden: true });
         })
         .catch((err) => console.error("Mermaid render failed:", err));
      return () => {
         cancelled = true;
      };
   }, [open, draw, expandedId]);

   return (
      <Dialog.Root open={open} onOpenChange={changeOpen}>
         {(overflows || open) && (
            <div className="mt-3">
               <Dialog.Trigger asChild>
                  <Button variant="outline" size="sm" aria-describedby={captionId}>
                     Expand diagram
                  </Button>
               </Dialog.Trigger>
            </div>
         )}
         <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content
               aria-describedby={undefined}
               onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  region.current?.focus();
               }}
               className="bg-background fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-max max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg border p-4 shadow-lg"
            >
               <div className="flex items-start justify-between gap-4">
                  <Dialog.Title className="text-foreground text-supporting font-semibold text-pretty">{caption ?? "Diagram"}</Dialog.Title>
                  <Dialog.Close asChild>
                     <Button variant="outline" size="sm" className="shrink-0">
                        Close
                     </Button>
                  </Dialog.Close>
               </div>
               <div ref={region} role="region" aria-label={name} tabIndex={0} className="min-h-0 min-w-0 overflow-auto rounded-md border">
                  <div ref={diagram} role="img" aria-label={name} className="w-max p-4" />
               </div>
            </Dialog.Content>
         </Dialog.Portal>
      </Dialog.Root>
   );
}
