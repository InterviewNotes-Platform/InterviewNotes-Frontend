"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Wide code or tables scroll inside this box, never the page. Only while the content actually
 * overflows does it become a named, keyboard-focusable region, so short blocks add no tab stops.
 * `data-scrolls` says which, so a caller can style the overflowing state alone; `onScrollsChange` tells the caller.
 */
export function TechnicalScroll({
   label,
   onScrollsChange,
   className,
   children,
   ...props
}: Omit<ComponentProps<"div">, "ref"> & { label: string; onScrollsChange?: (scrolls: boolean) => void }) {
   const box = useRef<HTMLDivElement>(null);
   const [scrolls, setScrolls] = useState(false);

   useEffect(() => {
      const element = box.current;
      if (!element) return;
      const measure = () => setScrolls(element.scrollWidth > element.clientWidth);
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      for (const child of element.children) observer.observe(child);
      return () => observer.disconnect();
   }, []);

   useEffect(() => onScrollsChange?.(scrolls), [scrolls, onScrollsChange]);

   return (
      <div
         ref={box}
         data-slot="technical-scroll"
         data-scrolls={scrolls}
         {...(scrolls ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}
         className={cn("overflow-x-auto", className)}
         {...props}
      >
         {children}
      </div>
   );
}
