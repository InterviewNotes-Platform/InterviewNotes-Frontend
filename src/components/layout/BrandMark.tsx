/** The two-tone wordmark in the AA-safe blue and gold (the homepage palette scope supplies `--primary-text`). */
export function BrandMark() {
   return (
      <>
         <span className="text-[color:var(--primary-text,var(--primary))]">Interview</span>
         <span className="text-premium">Notes</span>
      </>
   );
}
