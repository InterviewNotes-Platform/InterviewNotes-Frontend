import type { ConsentStatus } from "./consent/consentClient";

/** The Free reader's two model picks (P7-D-062). The browser names a pick; the server maps it to a model and never takes a model name from here. */
export type EngineChoice = "standard" | "large";

export const ENGINES: { value: EngineChoice; label: string; detail: string }[] = [
   { value: "standard", label: "Standard (GPT-OSS 20B)", detail: "Lower cost and usually quicker. This is the default." },
   { value: "large", label: "Larger model (GPT-OSS 120B)", detail: "A larger model at a higher cost. It may take slightly longer, and it is not guaranteed to be more accurate or to give a usable result." },
];

const KEY = "interviewnotes.ai.engine";
const isEngine = (value: unknown): value is EngineChoice => value === "standard" || value === "large";

/** The picks the server offers this reader: only known names, and none unless the server listed both (a Premium reader and an older server get none). */
export function offeredEngines(status: ConsentStatus): EngineChoice[] {
   const listed = Array.isArray(status.engine_choices) ? status.engine_choices.filter(isEngine) : [];
   return listed.includes("standard") && listed.includes("large") ? ["standard", "large"] : [];
}

/** The saved pick of this browser, or null when there is none or storage is unavailable. */
export function storedEngine(): EngineChoice | null {
   try {
      const value = window.localStorage.getItem(KEY);
      return isEngine(value) ? value : null;
   } catch {
      return null;
   }
}

export function storeEngine(value: EngineChoice): void {
   try {
      window.localStorage.setItem(KEY, value);
   } catch {
      // Storage can be blocked; the pick still applies for this visit.
   }
}

/** The pick to send: nothing unless the reader has a choice, and the standard model when the saved pick is absent or no longer offered. */
export function pickEngine(offered: EngineChoice[], stored: EngineChoice | null): EngineChoice | null {
   if (offered.length < 2) return null;
   return stored && offered.includes(stored) ? stored : "standard";
}
