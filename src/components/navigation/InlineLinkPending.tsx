"use client";

import { useLinkStatus } from "next/link";

/**
 * P8-RSP-02 follow-up: the pending marker for a link inside running prose. Such a link can wrap across lines, where
 * `LinkPending`'s positioned bar has no stable box (measured: 0 to 66 px wide on a wrapped link), so this one draws
 * nothing. It only carries `data-nav-pending` from the click until the destination renders, and the link itself reacts
 * with `has-[[data-nav-pending]]:` classes (dimmed, thicker underline), which work on any number of lines.
 * Decorative: hidden from layout and from assistive technology; Next's route announcer reads the destination.
 */
export function InlineLinkPending() {
   const { pending } = useLinkStatus();
   return <span hidden aria-hidden="true" data-nav-pending={pending ? "link" : undefined} />;
}
