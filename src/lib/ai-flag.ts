/**
 * Frontend build-time AI setting (api-contract.md §9.3): on only when the build sets `NEXT_PUBLIC_AI_ENABLED` to exactly "true",
 * which is allowed only when AI is available to everyone in that environment. It chooses wording only: it neither enables nor disables any backend AI route.
 */
export function aiEnabled(): boolean {
   return process.env.NEXT_PUBLIC_AI_ENABLED === "true";
}
