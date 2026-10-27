/**
 * Frontend `PREP_ENABLED` (api-contract.md §12): on only when the build sets `NEXT_PUBLIC_PREP_ENABLED` to exactly "true".
 * Non-secret; the literal reference lets Next inline it. Kept out of src/lib/prep, whose client reads no environment.
 */
export function prepEnabled(): boolean {
   return process.env.NEXT_PUBLIC_PREP_ENABLED === "true";
}
