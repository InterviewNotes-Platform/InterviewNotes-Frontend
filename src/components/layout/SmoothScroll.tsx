"use client";

import { useSyncExternalStore } from "react";
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
   anchors: true,
   // A scrollable region inside the page (a sidebar, a code block, a list) scrolls natively under the pointer, then hands over.
   allowNestedScroll: true,
   // A wheel glide still running when a link is followed must not drag the next page.
   stopInertiaOnNavigate: true,
   prevent: leaveToBrowser,
} as const;

/**
 * Inertial wheel scrolling on the homepage only (P6-D-39; the product owner's site-wide extension of 2026-11-21 was reverted to
 * the homepage on 2026-11-27). One instance lives in the root layout and exists only while the homepage is shown, so lessons,
 * problems, knowledge, practice and app pages scroll natively. Readers who prefer reduced motion never get one.
 *
 * On the homepage Lenis also animates in-page anchors (S6-HOME-17).
 */
export function SmoothScroll() {
   const smooth = useSyncExternalStore(subscribe, () => window.matchMedia?.(NO_PREFERENCE).matches ?? false, () => false);
   const onHomepage = usePathname() === "/";
   return smooth && onHomepage ? <ReactLenis root options={OPTIONS} /> : null;
}
