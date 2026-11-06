"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { inertPage } from "@/lib/inertPage";
import { ConsentDialog } from "./ConsentDialog";
import { consentInForce, type ConsentClient } from "./consentClient";

/**
 * How asking ended. Only `granted` lets the caller send an AI request: consent was already in force for the current version,
 * or the user accepted it just now and the server recorded it.
 */
export type ConsentOutcome = "granted" | "declined" | "signin" | "unavailable" | "failed";

type View = { open: boolean; version: string | null; busy: boolean; error: string | null };
const CLOSED: View = { open: false, version: null, busy: false, error: null };

const SAVE_FAILED = "We couldn't save your choice, so nothing was sent. You can try accepting again, or decline.";

/**
 * Asks the server what consent it requires and shows the dialog only when the caller has not accepted it. It is called from the user's own
 * AI action, never on load, and asks every time: nothing is cached here, so a withdrawal or a new terms version is seen on the next action.
 * Declining stores nothing. `ask` settles exactly once per call, so the action it guards runs at most once.
 */
export function useConsentGate(client: ConsentClient) {
   const [view, setView] = useState<View>(CLOSED);
   const settle = useRef<((outcome: ConsentOutcome) => void) | null>(null);
   const releasePage = useRef<(() => void) | null>(null);
   const accepting = useRef(false);
   /** False once the component has unmounted: a status read that outlives it must not open the dialog or make the page inert. */
   const active = useRef(true);
   const version = useRef<string | null>(null);

   const finish = useCallback((outcome: ConsentOutcome) => {
      releasePage.current?.();
      releasePage.current = null;
      accepting.current = false;
      setView(CLOSED);
      const done = settle.current;
      settle.current = null;
      done?.(outcome);
   }, []);

   // Leaving the page is a decline, whether the dialog is open or the status read is still pending: the page is made usable again and the pending action never runs.
   useEffect(() => {
      active.current = true;
      return () => {
         active.current = false;
         releasePage.current?.();
         releasePage.current = null;
         settle.current?.("declined");
         settle.current = null;
      };
   }, []);

   const ask = useCallback(async (): Promise<ConsentOutcome> => {
      if (settle.current) return "declined";
      const result = await client.status();
      if (!active.current) return "declined";
      if (result.status === "unauthenticated") return "signin";
      if (result.status === "failed") return "failed";
      const status = result.data;
      if (!status.ai_available || status.required_version === null) return "unavailable";
      if (consentInForce(status)) return "granted";

      return new Promise<ConsentOutcome>((resolve) => {
         settle.current = resolve;
         version.current = status.required_version;
         releasePage.current = inertPage();
         setView({ open: true, version: status.required_version, busy: false, error: null });
      });
   }, [client]);

   const accept = useCallback(async () => {
      if (accepting.current || !settle.current || version.current === null) return;
      accepting.current = true;
      setView((current) => ({ ...current, busy: true, error: null }));
      const result = await client.accept(version.current);
      if (!active.current || !settle.current) return;
      if (result.status === "ok" && consentInForce(result.data)) return finish("granted");
      if (result.status === "unauthenticated") return finish("signin");
      accepting.current = false;
      if (result.status === "failed" && result.code === "ai_disabled") return finish("unavailable");
      if (result.status === "failed" && result.code === "consent_version_stale") {
         // The notice changed while the dialog was open: read the new version and ask about that one. Nothing was recorded.
         const fresh = await client.status();
         if (!active.current || !settle.current) return;
         if (fresh.status === "ok" && fresh.data.required_version !== null) {
            if (consentInForce(fresh.data)) return finish("granted");
            version.current = fresh.data.required_version;
            return setView({ open: true, version: fresh.data.required_version, busy: false, error: "This notice changed while you were reading it. Please read the new version, then choose again." });
         }
      }
      setView((current) => ({ ...current, busy: false, error: SAVE_FAILED }));
   }, [client, finish]);

   const dialog = <ConsentDialog open={view.open} version={view.version} busy={view.busy} error={view.error} onAccept={() => void accept()} onDecline={() => finish("declined")} />;
   return { ask, dialog };
}
