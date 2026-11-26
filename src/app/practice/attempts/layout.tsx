import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { practiceEnabled } from "@/lib/practice-flag";

// Attempts are per user: nothing under this segment is built or cached statically.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
   title: "Practice | InterviewNotes",
   robots: { index: false, follow: false },
};

// The route boundary of the practice workspace (P9-T06). Frontend flag off: not found for everyone, before any session is read.
// The flag only hides the route; whether practice exists for a caller is the backend's answer (PracticeGate).
export default function PracticeAttemptsLayout({ children }: { children: ReactNode }) {
   if (!practiceEnabled()) notFound();
   return children;
}
