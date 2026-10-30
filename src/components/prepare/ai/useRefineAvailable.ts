"use client";

import { useEffect, useRef, useState } from "react";
import { refineOffered, type ConsentClient, type ConsentResult } from "./consent/consentClient";

/**
 * Whether to draw the Refine control: one read of the consent status when the editor mounts (P7-D-059), and only the literal `true` says yes.
 * Loading, an error, a signed-out reader, a missing field and a non-boolean field all leave it hidden. The read never accepts consent, opens the
 * dialog or starts an AI request, and consent state does not matter here. It is a display hint: the server decides again when Refine is requested.
 */
export function useRefineAvailable(client: ConsentClient): boolean {
   const [available, setAvailable] = useState(false);
   // One read per mount, whatever the parent re-renders with. The request is kept in a ref, which survives Strict Mode's development replay of the
   // effect, so the replay listens to the first request instead of making a second one.
   const latest = useRef(client);
   const read = useRef<Promise<ConsentResult> | null>(null);

   useEffect(() => {
      let live = true;
      read.current ??= latest.current.status();
      read.current
         .then((result) => {
            if (live) setAvailable(result.status === "ok" && refineOffered(result.data));
         })
         .catch(() => {});
      return () => {
         live = false;
      };
   }, []);

   return available;
}
