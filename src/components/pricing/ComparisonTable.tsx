import { PRICING_COPY } from "@/lib/pricing";

const ROWS = [
   { label: "Lessons, Knowledge entries and Problems not marked Premium", free: "Included", premium: "Included" },
   { label: "Content marked Premium", free: "Not included", premium: "Included" },
] as const;

/** Only what is available today (P8-PREM-01): no AI, community or support benefit appears until it is verified for launch. */
export function ComparisonTable() {
   return (
      <div className="overflow-x-auto">
         <table className="w-full min-w-0 table-fixed border-collapse text-left text-body">
            <caption className="mb-3 text-left text-supporting text-muted-foreground">{PRICING_COPY.comparisonCaption}</caption>
            <thead>
               <tr className="border-b border-border">
                  <th scope="col" className="w-[46%] py-3 pr-3 font-semibold text-foreground">Content</th>
                  <th scope="col" className="py-3 pr-3 font-semibold text-foreground">Free</th>
                  <th scope="col" className="py-3 font-semibold text-foreground">Premium, any plan</th>
               </tr>
            </thead>
            <tbody>
               {ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-border/60 align-top">
                     <th scope="row" className="py-3 pr-3 font-normal text-foreground">{row.label}</th>
                     <td className="py-3 pr-3 text-muted-foreground">{row.free}</td>
                     <td className="py-3 text-muted-foreground">{row.premium}</td>
                  </tr>
               ))}
            </tbody>
         </table>
      </div>
   );
}
