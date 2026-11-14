/**
 * Static plan facts for /pricing. Source: payment-spec §1 and P8-D-014 (Accepted); no promotion exists (P8-D-026).
 * Nothing here is read from an API, and no refund, tax, trial or discount term is defined or implied (P8-D-031 is Open;
 * purchase terms belong to P8-T37).
 */
export interface Plan {
   key: "annual" | "three_year" | "lifetime";
   name: string;
   amount: string;
   unit: string;
   terms: readonly [string, string];
}

export const PLANS: readonly Plan[] = [
   { key: "annual", name: "Annual", amount: "$50", unit: "USD per year", terms: ["Renews automatically every year.", "Access lasts to the end of the period you have paid for."] },
   { key: "three_year", name: "3-year", amount: "$100", unit: "USD, one payment", terms: ["One-time payment. It does not renew.", "Access lasts 36 months."] },
   { key: "lifetime", name: "Lifetime", amount: "$150", unit: "USD, one payment", terms: ["One-time payment. It does not renew.", "Permanent access."] },
];

/** The published Premium catalogue as read from production on this date (P8-T18 audit §3, verified); a baseline, never a threshold claim. */
export const PREMIUM_BASELINE = {
   asOf: "10 November 2026",
   lessons: "one Lesson",
   problemSections: "four sections of one Problem",
} as const;

export const PRICING_COPY = {
   title: "Pricing",
   heading: "Plans and what Premium includes today",
   lead: "Most InterviewNotes content is free to read. Premium adds the content marked Premium. Prices are in US dollars.",
   unavailable: "Purchase is not available yet. Nothing is for sale today.",
   unavailableDetail: "Paid access opens only when payments and the Premium offer have been checked and approved. Until then, the plans below are for information.",
   checkoutNotConnected: "Checkout is not connected in this build, so no payment can be made yet.",
   comparisonCaption: "What Free and Premium include today",
} as const;
