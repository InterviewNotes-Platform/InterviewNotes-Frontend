"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import type { KnowledgeSupport } from "@/lib/catalog/lesson";

const OPENED = "catalog:knowledge-about-opened";
const GUTTER = 16;
const MAX_WIDTH = 352;

/**
 * The toggle after a Lesson's first reference to related Knowledge, and its panel. Everything it shows arrives as props
 * from the Lesson's own relations: it makes no request. The panel is non-modal and never takes focus; it opens below
 * the reference line, inside the reading column or else the viewport minus the gutters, and holds no animation.
 */
export function KnowledgeAbout({ title, summary, href }: KnowledgeSupport) {
   const panelId = useId();
   const [open, setOpen] = useState(false);
   const root = useRef<HTMLSpanElement>(null);
   const toggle = useRef<HTMLButtonElement>(null);
   const panel = useRef<HTMLSpanElement>(null);

   // One panel per page: an opening panel announces itself and every other one closes.
   useEffect(() => {
      const close = (event: Event) => void ((event as CustomEvent<string>).detail !== panelId && setOpen(false));
      window.addEventListener(OPENED, close);
      return () => window.removeEventListener(OPENED, close);
   }, [panelId]);

   useEffect(() => {
      if (!open) return;
      window.dispatchEvent(new CustomEvent(OPENED, { detail: panelId }));
      const onClick = (event: MouseEvent) => void (!root.current?.contains(event.target as Node) && setOpen(false));
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.key !== "Escape") return;
         if (root.current?.contains(document.activeElement)) toggle.current?.focus();
         setOpen(false);
      };
      document.addEventListener("click", onClick);
      document.addEventListener("keydown", onKeyDown);
      return () => {
         document.removeEventListener("click", onClick);
         document.removeEventListener("keydown", onKeyDown);
      };
   }, [open, panelId]);

   useLayoutEffect(() => {
      if (!open) return;
      const place = () => {
         const box = panel.current;
         const anchor = root.current;
         if (!box || !anchor) return;
         const column = anchor.closest("[data-catalog-body]")?.getBoundingClientRect();
         const viewport = document.documentElement.clientWidth;
         const min = Math.max(column?.left ?? 0, GUTTER);
         const max = Math.min(column?.right ?? viewport, viewport - GUTTER);
         const width = Math.min(MAX_WIDTH, max - min);
         const left = anchor.getBoundingClientRect().left;
         box.style.width = `${width}px`;
         box.style.left = `${Math.min(Math.max(left, min), max - width) - left}px`;
      };
      place();
      window.addEventListener("resize", place);
      return () => window.removeEventListener("resize", place);
   }, [open]);

   return (
      <>
         {/* U+2060 keeps the toggle on the line of the reference's last word. */}
         {"⁠"}
         <span ref={root} className="relative ml-1 inline-block">
            <button
               ref={toggle}
               type="button"
               aria-label={`About ${title}`}
               aria-expanded={open}
               aria-controls={open ? panelId : undefined}
               onClick={() => setOpen((value) => !value)}
               className="relative inline-flex size-[1.1em] items-center justify-center rounded-full align-[-0.15em] text-muted-foreground transition-micro after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-expanded:text-primary"
            >
               <Info aria-hidden="true" className="size-full" />
            </button>
            {open ? (
               <span
                  ref={panel}
                  id={panelId}
                  role="group"
                  aria-label={`About ${title}`}
                  className="absolute top-full left-0 z-20 mt-2 block w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-4 text-left text-supporting font-normal whitespace-normal text-popover-foreground shadow-lg"
               >
                  <span className="block font-semibold text-balance">{title}</span>
                  <span className="mt-1 block text-pretty text-muted-foreground">{summary}</span>
                  <Link href={href} prefetch={false} className="mt-2 inline-flex min-h-11 items-center text-primary underline underline-offset-4">
                     Open {title}
                  </Link>
               </span>
            ) : null}
         </span>
      </>
   );
}
