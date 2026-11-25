import { notFound, redirect } from "next/navigation";
import { AttemptRoute } from "@/components/practice-workspace/AttemptRoute";
import { PracticeGate } from "@/components/practice-workspace/PracticeGate";
import { hasSession } from "@/app/prepare/hasSession";
import { practiceEnabled } from "@/lib/practice-flag";

// Per user, never static or cached (the layout says so too; a page repeats what it relies on).
export const dynamic = "force-dynamic";

const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The attempt page holds no learner data: it is a shell the browser fills from the API with the user's token, so what a person wrote is never
// in this response, in a cached RSC payload or in the URL (only the attempt's opaque id is).
export default async function PracticeAttemptPage({ params }: { params: Promise<{ id: string }> }) {
   if (!practiceEnabled()) notFound();
   const { id } = await params;
   // The backend answers a malformed id with 404; the shell does the same without asking it.
   if (!ATTEMPT_ID.test(id)) notFound();
   if (!(await hasSession())) redirect(`/login?redirect=${encodeURIComponent(`/practice/attempts/${encodeURIComponent(id)}`)}`);
   // The browser calls the API directly with the user's token, so it needs a public base URL.
   return (
      <PracticeGate apiUrl={process.env.NEXT_PUBLIC_API_URL || null}>
         <AttemptRoute attemptId={id} />
      </PracticeGate>
   );
}
