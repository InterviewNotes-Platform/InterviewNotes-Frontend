"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Wide code or tables scroll inside this box, never the page. Only while the content actually
 * overflows does it become a named, keyboard-focusable region, so short blocks add no tab stops.
 */
export function TechnicalScroll({
   label,
   className,
   children,
   ...props
}: Omit<ComponentProps<"div">, "ref"> & { label: string }) {
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

   return (
      <div
         ref={box}
         data-slot="technical-scroll"
         {...(scrolls ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}
         className={cn("overflow-x-auto", className)}
         {...props}
      >
         {children}
      </div>
   );
}
