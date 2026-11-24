import { notFound, redirect } from "next/navigation";
import { PracticeGate } from "@/components/practice-workspace/PracticeGate";
import { hasSession } from "@/app/prepare/hasSession";
import { practiceEnabled } from "@/lib/practice-flag";

// Per user, never static or cached (the layout says so too; a page repeats what it relies on).
export const dynamic = "force-dynamic";

// T06 stops at the boundary: no workspace exists yet, so the gate has nothing to show and, with the backend's
// `practice_available` false, always renders the unavailable notice. T13 puts the workspace inside it.
export default async function PracticeAttemptPage({ params }: { params: Promise<{ id: string }> }) {
   if (!practiceEnabled()) notFound();
   const { id } = await params;
   if (!(await hasSession())) redirect(`/login?redirect=${encodeURIComponent(`/practice/attempts/${encodeURIComponent(id)}`)}`);
   // The browser calls the API directly with the user's token, so it needs a public base URL.
   return <PracticeGate apiUrl={process.env.NEXT_PUBLIC_API_URL || null} />;
}
