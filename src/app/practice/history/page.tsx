import { redirect } from "next/navigation";
import { hasSession } from "@/app/prepare/hasSession";
import { HistoryRoute } from "@/components/practice-workspace/HistoryRoute";
import { PracticeGate } from "@/components/practice-workspace/PracticeGate";
import { loadProblemTitles } from "@/lib/catalog/problems";
import { practiceEnabled } from "@/lib/practice-flag";
import { notFound } from "next/navigation";

// Per user, never static or cached (the layout says so too; a page repeats what it relies on).
export const dynamic = "force-dynamic";

export default async function PracticeHistoryPage() {
   if (!practiceEnabled()) notFound();
   if (!(await hasSession())) redirect(`/login?redirect=${encodeURIComponent("/practice/history")}`);
   // Public catalog titles only (GAP-5): the same list metadata every visitor sees, never practice data.
   const titles = await loadProblemTitles();
   // The browser calls the API directly with the user's token, so it needs a public base URL.
   return (
      <PracticeGate apiUrl={process.env.NEXT_PUBLIC_API_URL || null}>
         <HistoryRoute titles={titles} />
      </PracticeGate>
   );
}
