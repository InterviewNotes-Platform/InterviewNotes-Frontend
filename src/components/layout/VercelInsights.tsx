import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Vercel Web Analytics and Speed Insights for every route. Both load their script from `/_vercel/...`, a path only a Vercel
 * deployment serves, so they render only in a build Vercel runs (it sets `VERCEL`). Elsewhere (Netlify, local, the e2e
 * suite) they render nothing, rather than asking the host for scripts it answers with a 404 page.
 */
export function VercelInsights() {
   if (!process.env.VERCEL) return null;
   return (
      <>
         <Analytics />
         <SpeedInsights />
      </>
   );
}
