"use client";

import { useEffect, useRef, useState } from "react";
import { refineOffered, type ConsentClient, type ConsentResult } from "./consent/consentClient";
import { offeredEngines, type EngineChoice } from "./engineChoice";

export type AiHints = { refine: boolean; engines: EngineChoice[] };
const NONE: AiHints = { refine: false, engines: [] };

/**
 * What to draw from the server's own checks: Refine (P7-D-059) and the Free reader's model picks (P7-D-062). One read of the consent status when the
 * editor mounts; only the literal `true` offers Refine, and only a list naming both known picks offers the model choice. Loading, an error, a signed-out
 * reader and a malformed field all leave both hidden. The read never accepts consent, opens the dialog or starts an AI request. They are display hints:
 * the server decides again when an action is requested.
 */
export function useAiHints(client: ConsentClient): AiHints {
   const [hints, setHints] = useState<AiHints>(NONE);
   // One read per mount, whatever the parent re-renders with. The request is kept in a ref, which survives Strict Mode's development replay of the
   // effect, so the replay listens to the first request instead of making a second one.
   const latest = useRef(client);
   const read = useRef<Promise<ConsentResult> | null>(null);

   useEffect(() => {
      let live = true;
      read.current ??= latest.current.status();
      read.current
         .then((result) => {
            if (live && result.status === "ok") setHints({ refine: refineOffered(result.data), engines: offeredEngines(result.data) });
         })
         .catch(() => {});
      return () => {
         live = false;
      };
   }, []);

   return hints;
}
