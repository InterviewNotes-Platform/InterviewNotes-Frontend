/**
 * Frontend build flag for purchase controls (P8-D-055, payment-spec §12.1): on only when the build sets
 * `NEXT_PUBLIC_PURCHASE_ENABLED` to exactly "true". It shapes wording and links only. It is never an entitlement check:
 * the API alone decides what a reader may read, and turning this off never revokes anything.
 */
export function purchaseEnabled(): boolean {
   return process.env.NEXT_PUBLIC_PURCHASE_ENABLED === "true";
}
