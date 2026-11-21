"use client";

import { useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";

const NO_PREFERENCE = "(prefers-reduced-motion: no-preference)";

function subscribe(onChange: () => void) {
   const query = window.matchMedia?.(NO_PREFERENCE); // optional call: jsdom has no matchMedia
   query?.addEventListener?.("change", onChange);
   return () => query?.removeEventListener?.("change", onChange);
}

/**
 * Wheel and touch input Lenis leaves to the browser: overlays (they own their scrolling and focus), and the whole page while
 * a modal holds the body's scroll lock (Radix sets `data-scroll-locked` on `<body>`), so the page behind a dialog stays put.
 */
const OVERLAY = '[role="dialog"], [role="menu"], [role="listbox"]';
const SCROLL_LOCKED = "data-scroll-locked";
const leaveToBrowser = (node: HTMLElement) => node.matches(OVERLAY) || node.hasAttribute(SCROLL_LOCKED);

/** The homepage prototype's settings (homepage/src/app/motion.tsx): inertial wheel scrolling with a 0.09 lerp. */
const OPTIONS = {
   autoRaf: true,
   lerp: 0.09,
   // A scrollable region inside the page (a sidebar, a code block, a list) scrolls natively under the pointer, then hands over.
   allowNestedScroll: true,
   // The instance outlives a route change, so a wheel glide still running when a link is followed must not drag the next page.
   stopInertiaOnNavigate: true,
   prevent: leaveToBrowser,
} as const;

/**
 * Inertial wheel scrolling on every route (P6-D-39 scoped it to the homepage; the product owner extended it to all pages on
 * 2026-11-21). One instance lives in the root layout. Readers who prefer reduced motion never get one, so scrolling, anchors,
 * keyboard and touch stay fully native for them.
 *
 * In-page anchors are animated by Lenis on the homepage only (S6-HOME-17). Everywhere else they stay with the browser and the
 * page: CSS `scroll-behavior: smooth` animates them, and a Problem page owns its fragment scroll (`html:has([data-reveal])`
 * switches the CSS animation off so a deep link cannot end past its heading), which a second animator would undo.
 */
export function SmoothScroll() {
   const smooth = useSyncExternalStore(subscribe, () => window.matchMedia?.(NO_PREFERENCE).matches ?? false, () => false);
   const onHomepage = usePathname() === "/";
   const options = useMemo(() => ({ ...OPTIONS, anchors: onHomepage }), [onHomepage]);
   return smooth ? <ReactLenis root options={options} /> : null;
}
