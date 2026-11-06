"use client";

import { useEffect, useRef, useState } from "react";
import { ListTree } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { inertPage } from "@/lib/inertPage";
import type { TrackSidebarOutline } from "@/lib/catalog/outline";
import { cn } from "@/lib/utils";
import { TrackSidebar } from "./TrackSidebar";

/**
 * Below `lg`, the Track's contents in the existing Sheet from the inline-start edge (S6-RDR-7). Radix traps focus, closes on
 * Escape and returns focus to the control; choosing an entry navigates and closes it. The page behind is made inert as the
 * diagram dialog does, since Radix's `aria-hidden` spares a page with a live region. The list inside is the sidebar's, so the two
 * never differ, and opening it reads nothing.
 */
export function TrackDrawer({ outline, className }: { outline: TrackSidebarOutline; className?: string }) {
   const [open, setOpen] = useState(false);
   const releasePage = useRef<() => void>(undefined);

   // Taken before the dialog's own layers are in the document, and released if navigation unmounts the drawer while open.
   function changeOpen(next: boolean) {
      releasePage.current?.();
      releasePage.current = next ? inertPage() : undefined;
      setOpen(next);
   }
   useEffect(() => () => releasePage.current?.(), []);

   return (
      <div className={cn("lg:hidden", className)}>
         <Sheet open={open} onOpenChange={changeOpen}>
            <SheetTrigger asChild>
               <button
                  type="button"
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-4 text-supporting font-medium text-foreground transition-micro hover:bg-muted"
               >
                  <ListTree aria-hidden="true" className="size-4" />
                  Track contents
               </button>
            </SheetTrigger>
            <SheetContent side="left" className="gap-0 data-[state=closed]:duration-150 data-[state=open]:duration-200 motion-reduce:animate-none lg:hidden">
               <SheetHeader className="min-h-16 justify-center border-b px-6 py-3 pr-16">
                  <SheetTitle className="text-body leading-snug">{outline.title}</SheetTitle>
                  <SheetDescription className="sr-only">The Modules and entries of this Track</SheetDescription>
               </SheetHeader>
               <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                  <TrackSidebar outline={outline} touch onNavigate={() => changeOpen(false)} />
               </div>
            </SheetContent>
         </Sheet>
      </div>
   );
}
