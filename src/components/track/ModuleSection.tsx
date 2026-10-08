"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Disclosure } from "@/components/ui/disclosure";

interface ModuleSectionProps {
   /** The Module's fragment id; null when it has none (S-MOD-4). */
   id: string | null;
   title: ReactNode;
   detail?: ReactNode;
   defaultOpen: boolean;
   children: ReactNode;
}

const targetOf = () => {
   try {
      return decodeURIComponent(window.location.hash.slice(1));
   } catch {
      return "";
   }
};

/** A Module's section on the Track page. A URL fragment naming it opens it at once and brings it into view (S-MOD-5). */
export function ModuleSection({ id, title, detail, defaultOpen, children }: ModuleSectionProps) {
   const [open, setOpen] = useState(defaultOpen);
   const [arrivals, setArrivals] = useState(0);
   const ref = useRef<HTMLDivElement>(null);

   useEffect(() => {
      if (!id) return;
      const arrive = () => {
         if (targetOf() !== id) return;
         setOpen(true);
         setArrivals((count) => count + 1);
      };
      arrive();
      window.addEventListener("hashchange", arrive);
      return () => window.removeEventListener("hashchange", arrive);
   }, [id]);

   useEffect(() => {
      if (arrivals > 0) ref.current?.scrollIntoView({ block: "start", behavior: "instant" });
   }, [arrivals]);

   const toggle = (next: boolean) => {
      setOpen(next);
      setArrivals(0);
   };

   return (
      <div id={id ?? undefined} ref={ref} className="scroll-mt-28">
         <Disclosure title={title} detail={detail} open={open} onOpenChange={toggle} instant={arrivals > 0} className="border-t border-border">
            {children}
         </Disclosure>
      </div>
   );
}
