"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { inertPage } from "@/lib/inertPage";

/** Below Tailwind's `md`, where the result opens as a bottom sheet instead of inline. */
const NARROW = "(max-width: 767px)";

const canMatch = () => typeof window !== "undefined" && typeof window.matchMedia === "function";
const isNarrow = () => canMatch() && window.matchMedia(NARROW).matches;

function subscribe(onChange: () => void) {
   if (!canMatch()) return () => {};
   const query = window.matchMedia(NARROW);
   query.addEventListener("change", onChange);
   return () => query.removeEventListener("change", onChange);
}

/**
 * Open state of the mobile result sheet. The page is made inert before the sheet mounts, as MobileMenu does, and is released on every way out:
 * hide, a viewport that grows past the breakpoint (the sheet unmounts without a close event), and unmount.
 */
export function useResultSheet() {
   const narrow = useSyncExternalStore(subscribe, isNarrow, () => false);
   const [open, setOpen] = useState(false);
   const release = useRef<(() => void) | null>(null);

   const hide = useCallback(() => {
      release.current?.();
      release.current = null;
      setOpen(false);
   }, []);
   const show = useCallback(() => {
      if (!isNarrow()) return;
      release.current ??= inertPage();
      setOpen(true);
   }, []);

   useEffect(() => {
      if (!narrow) hide();
   }, [narrow, hide]);
   useEffect(() => () => release.current?.(), []);

   return { narrow, open: open && narrow, show, hide };
}
