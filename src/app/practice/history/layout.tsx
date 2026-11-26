import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { practiceEnabled } from "@/lib/practice-flag";

// The learner's attempts are per user: nothing under this segment is built or cached statically.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
   title: "Practice history | InterviewNotes",
   robots: { index: false, follow: false },
};

// Frontend flag off: not found for everyone, before any session is read. Whether practice exists for a caller is the backend's answer (PracticeGate).
export default function PracticeHistoryLayout({ children }: { children: ReactNode }) {
   if (!practiceEnabled()) notFound();
   return children;
}
