"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { inertPage } from "@/lib/inertPage";
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

/** Zoom resizes the vector drawing itself (no bitmap, no scale transform); the region's own scroll is the pan. */
function sizeDrawing(container: HTMLElement | null, zoom: number) {
   const svg = container?.querySelector("svg");
   const width = Number(svg?.getAttribute("data-natural-width") || svg?.viewBox.baseVal?.width || 0);
   if (!svg || !width) return;
   svg.setAttribute("data-natural-width", String(width));
   svg.style.width = `${width * zoom}px`;
   svg.style.maxWidth = "none";
   svg.style.height = "auto";
}

/**
 * S-DGM-6 / S-DGM-7: an "Expand diagram" button in the figure footer, only while the diagram overflows, and the
 * modal dialog it opens. The dialog is Radix's (as `sheet.tsx`): focus trap, Escape, backdrop, scroll lock, hidden
 * background and focus return to the trigger all come from it, and the page behind is made inert for as long as it
 * is open. The button stays while the dialog is open.
 */
export function DiagramExpand({ overflows, name, caption, captionId, draw, renderId }: DiagramExpandProps) {
   const [open, setOpen] = useState(false);
   const [zoom, setZoom] = useState(1);
   const drag = useRef<{ x: number; y: number } | null>(null);
   const region = useRef<HTMLDivElement>(null);
   const diagram = useRef<HTMLDivElement>(null);
   const releasePage = useRef<() => void>(undefined);

   // Taken before the dialog's own layers are in the document, so they are never part of the page. Released
   // before Radix returns focus to the button, and if the diagram unmounts (navigation) while the dialog is open.
   function changeOpen(next: boolean) {
      releasePage.current?.();
      releasePage.current = next ? inertPage() : undefined;
      setOpen(next);
      setZoom(1);
   }
   const zoomNow = useRef(1);
   useEffect(() => {
      zoomNow.current = zoom;
      sizeDrawing(diagram.current, zoom);
   }, [zoom, open]);
   const zoomBy = (factor: number) => setZoom((current) => Math.min(4, Math.max(0.5, Math.round(current * factor * 100) / 100)));
   useEffect(() => () => releasePage.current?.(), []);

   // The dialog copy is its own Mermaid render, so none of its generated ids repeat the inline diagram's.
   const expandedId = `${renderId}-expanded`;

   useEffect(() => {
      if (!open) return;
      let cancelled = false;
      draw(expandedId)
         .then((svg) => {
            if (!cancelled && diagram.current) {
               showDiagram(diagram.current, svg, { natural: true, hidden: true });
               sizeDrawing(diagram.current, zoomNow.current);
            }
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
               <p id={`${renderId}-keys`} className="sr-only">Arrow keys pan; plus and minus zoom; 0 resets.</p>
               <div role="group" aria-label="Zoom" className="flex items-center justify-end gap-2">
                  <Button variant="outline" className="min-h-11 min-w-11" onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</Button>
                  <span className="min-w-14 text-center text-supporting tabular-nums" aria-live="polite">{Math.round(zoom * 100)}%</span>
                  <Button variant="outline" className="min-h-11 min-w-11" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</Button>
                  <Button variant="outline" className="min-h-11" onClick={() => setZoom(1)}>Reset</Button>
               </div>
               <div ref={region} role="region" aria-label={name} aria-describedby={`${renderId}-keys`} tabIndex={0}
                  onKeyDown={(event) => {
                     if (event.key === "+" || event.key === "=") zoomBy(1.25);
                     else if (event.key === "-") zoomBy(0.8);
                     else if (event.key === "0") setZoom(1);
                     else return;
                     event.preventDefault();
                  }}
                  onWheel={(event) => {
                     if (!event.ctrlKey) return;
                     event.preventDefault();
                     zoomBy(event.deltaY < 0 ? 1.1 : 0.9);
                  }}
                  onDoubleClick={() => zoomBy(1.5)}
                  onPointerDown={(event) => {
                     if (event.pointerType !== "mouse") return;
                     drag.current = { x: event.clientX, y: event.clientY };
                  }}
                  onPointerMove={(event) => {
                     const start = drag.current;
                     if (!start || !region.current) return;
                     region.current.scrollBy(start.x - event.clientX, start.y - event.clientY);
                     drag.current = { x: event.clientX, y: event.clientY };
                  }}
                  onPointerUp={() => (drag.current = null)}
                  onPointerLeave={() => (drag.current = null)}
                  className="min-h-0 min-w-0 cursor-grab overflow-auto rounded-md border active:cursor-grabbing">
                  <div ref={diagram} role="img" aria-label={name} className="w-max p-4" />
               </div>
            </Dialog.Content>
         </Dialog.Portal>
      </Dialog.Root>
   );
}
