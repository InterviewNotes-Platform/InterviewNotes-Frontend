/**
 * Frontend wording and visibility switch for practice (spec §9, the P7 rule of `src/lib/ai-flag.ts`): on only when the
 * build sets `NEXT_PUBLIC_PRACTICE_ENABLED` to exactly "true". Non-secret. It may hide a route or choose its words and
 * MUST NOT enable anything: the backend's `PRACTICE_ENABLED`, rollout and `capability` decide whether practice exists.
 */
export function practiceEnabled(): boolean {
   return process.env.NEXT_PUBLIC_PRACTICE_ENABLED === "true";
}
