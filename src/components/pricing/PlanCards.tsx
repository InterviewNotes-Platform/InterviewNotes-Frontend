import { PLANS } from "@/lib/pricing";

/** The three plans in the order the contract lists them. Informational: no control here ever starts a payment. */
export function PlanCards() {
   return (
      <ul aria-label="Premium plans" className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
         {PLANS.map((plan) => (
            <li key={plan.key} data-plan={plan.key} className="flex flex-col rounded-lg border border-border bg-surface p-5">
               <h3 className="m-0 text-subsection text-foreground">{plan.name}</h3>
               <p className="m-0 mt-3 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-title text-foreground">{plan.amount}</span>
                  <span className="text-supporting text-muted-foreground">{plan.unit}</span>
               </p>
               <ul className="m-0 mt-4 list-none space-y-2 p-0 text-body text-muted-foreground">
                  {plan.terms.map((term) => (
                     <li key={term}>{term}</li>
                  ))}
               </ul>
            </li>
         ))}
      </ul>
   );
}
