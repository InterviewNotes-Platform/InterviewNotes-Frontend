"use client";

import { useSyncExternalStore } from "react";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";

const NO_PREFERENCE = "(prefers-reduced-motion: no-preference)";

function subscribe(onChange: () => void) {
   const query = window.matchMedia?.(NO_PREFERENCE); // optional call: jsdom has no matchMedia
   query?.addEventListener?.("change", onChange);
   return () => query?.removeEventListener?.("change", onChange);
}

/** Overlays own their scrolling and focus; Lenis leaves wheel and touch input inside them to the browser. */
const OVERLAY = '[role="dialog"], [role="menu"], [role="listbox"]';
const leaveToBrowser = (node: HTMLElement) => node.matches(OVERLAY);

// The prototype's settings (homepage/src/app/motion.tsx): inertial wheel scrolling with a 0.09 lerp, and in-page anchors animated.
const OPTIONS = { autoRaf: true, anchors: true, lerp: 0.09, prevent: leaveToBrowser } as const;

/**
 * Inertial wheel scrolling for the homepage only (P6-D-39). It exists while the homepage is mounted: the instance is created
 * on mount and destroyed on unmount, so reader, catalog, auth and legacy routes keep native scrolling. Readers who prefer
 * reduced motion never get an instance, so scrolling, anchors, keyboard and touch stay fully native.
 */
export function HomeSmoothScroll() {
   const smooth = useSyncExternalStore(subscribe, () => window.matchMedia?.(NO_PREFERENCE).matches ?? false, () => false);
   return smooth ? <ReactLenis root options={OPTIONS} /> : null;
}
