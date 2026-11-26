/**
 * Frontend wording and visibility switch for practice (spec §9, the P7 rule of `src/lib/ai-flag.ts`): on only when the
 * build sets `NEXT_PUBLIC_PRACTICE_ENABLED` to exactly "true". Non-secret. It may hide a route or choose its words and
 * MUST NOT enable anything: the backend's `PRACTICE_ENABLED`, rollout and `capability` decide whether practice exists.
 */
export function practiceEnabled(): boolean {
   return process.env.NEXT_PUBLIC_PRACTICE_ENABLED === "true";
}

/**
 * Frontend switch for the practice data terms page alone (P9-T15, backend A-11 `PRACTICE_PRIVACY_ACCESS`): on only when the
 * build sets `NEXT_PUBLIC_PRACTICE_PRIVACY_ACCESS` to exactly "true". It opens no practice route, entry, reference or editing.
 */
export function practicePrivacyAccessEnabled(): boolean {
   return process.env.NEXT_PUBLIC_PRACTICE_PRIVACY_ACCESS === "true";
}

/** The practice data terms page, and the Privacy page's link to it, are shown while either switch is on. */
export function practiceTermsAvailable(): boolean {
   return practiceEnabled() || practicePrivacyAccessEnabled();
}
