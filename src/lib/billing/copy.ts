/**
 * Wording for the checkout and return states. Minimal and truthful: no promotion, trial, tax, refund or Discord claim, no
 * statement that a customer was or was not charged, and no support address (none is named yet, payment-spec §12.2).
 */
export const CHECKOUT_COPY = {
   heading: "Get Premium",
   lead: "Choose a plan to continue to the secure payment page. Your plan is confirmed by InterviewNotes after payment, not by the page you return to.",
   starting: "Starting checkout…",
   redirecting: "Taking you to the hosted payment page…",
   cancelled: "You left checkout before finishing. Choose a plan again whenever you are ready.",
   signIn: "Sign in to buy Premium. You will come back to this page.",
   disabled: "Purchase is not available right now.",
   entitled: "Your account already has Premium access, so there is nothing to buy.",
   subscription: "You already have an active Annual subscription, so this plan cannot be bought right now.",
   unavailable: "Checkout is temporarily unavailable. Please try again in a few minutes.",
   ambiguous: "We could not confirm that checkout started, so we do not know whether a checkout was created. You can try again, or check your Premium status first.",
   invalid: "Checkout could not be started safely. Please try again later.",
   notConfigured: "Checkout is not set up in this environment.",
} as const;

export const RETURN_COPY = {
   eyebrow: "Pricing",
   confirming: { heading: "Confirming your payment", body: "We are checking with the payment provider. This usually takes a few seconds. Premium is shown only after InterviewNotes confirms it." },
   waiting: { heading: "Confirming your payment", body: "Still waiting for confirmation. Premium is shown here only after InterviewNotes confirms the payment." },
   active: { heading: "Premium is active", body: "InterviewNotes has confirmed Premium on your account. Premium pages check your access each time you open them." },
   failed: { heading: "The payment did not complete", body: "Premium has not been added to your account. You can choose a plan again from Pricing." },
   unconfirmed: { heading: "We have not confirmed a payment yet", body: "Confirmation can take a few minutes. Your account does not show Premium yet. You can check again, and nothing on this page changes your access." },
   inactive: { heading: "Premium is not active", body: "Your account does not currently have active Premium." },
   signIn: { heading: "Sign in to see your payment", body: "Your session has ended or you are signed out. Sign in to see whether Premium is active." },
   notFound: { heading: "We could not match this checkout", body: "This checkout is not linked to your account. If you signed in with a different account, sign in with the one you paid with." },
   unavailable: { heading: "Status is temporarily unavailable", body: "We could not read your Premium status just now. This does not mean the payment failed. Please check again shortly." },
   notConfigured: { heading: "Status is not available", body: "Checkout status is not set up in this environment." },
} as const;
