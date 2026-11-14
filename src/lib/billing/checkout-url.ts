/** The only hosted destination the contract names (payment-spec §6.1). */
const STRIPE_CHECKOUT_ORIGIN = "https://checkout.stripe.com";
const MAX_URL_LENGTH = 4096;

/** A server-provided checkout URL the browser may be sent to, or null. Only Stripe's hosted HTTPS origin qualifies, in every environment. */
export function safeCheckoutUrl(value: unknown): string | null {
   if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH || /[\s\\]/.test(value)) return null;
   let url: URL;
   try {
      url = new URL(value);
   } catch {
      return null;
   }
   if (url.username || url.password) return null;
   return url.origin === STRIPE_CHECKOUT_ORIGIN ? url.href : null;
}
