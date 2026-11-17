"use client";

import { useLinkStatus } from "next/link";

/**
 * P8-RSP-02: inline feedback inside a `<Link>`, from the click until the destination renders. It needs no server
 * answer, so a click is acknowledged in the next frame. Decorative: Next's route announcer reads the destination's
 * title once it renders. The parent link (or, for a stretched link, its row) must be positioned.
 */
export function LinkPending() {
   const { pending } = useLinkStatus();
   return (
      <span
         aria-hidden="true"
         data-nav-pending={pending ? "link" : undefined}
         className="pointer-events-none absolute inset-x-3 bottom-1 h-0.5 origin-left scale-x-0 rounded-full bg-current opacity-0 transition-[opacity,transform] duration-300 ease-out data-[nav-pending]:scale-x-100 data-[nav-pending]:opacity-70 motion-reduce:transition-none"
      />
   );
}
