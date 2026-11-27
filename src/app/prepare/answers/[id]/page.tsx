import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PrepareFrame } from "@/components/prepare/PrepareFrame";
import { AnswerEditor } from "@/components/prepare/editor/AnswerEditor";
import { loadAllCollectionQuestions } from "@/lib/prep/collections";
import { ANSWER_ID, answerHref } from "@/lib/prep/links";
import { prepEnabled } from "@/lib/prep-flag";
import { hasSession } from "../../hasSession";

// Personal data is per user, and the catalog read depends on the caller's session: never built or cached statically.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Your answer | InterviewNotes",
    robots: { index: false, follow: false },
};

interface PageProps {
    params: Promise<{ id: string }>;
}

// Flag off or a malformed id: not found, before any session is read. Signed out: sign-in, returning here (P7-D-016).
export default async function AnswerPage({ params }: PageProps) {
    const { id } = await params;
    if (!prepEnabled() || !ANSWER_ID.test(id)) notFound();
    if (!(await hasSession())) redirect(`/login?redirect=${encodeURIComponent(answerHref(id))}`);

    // The questions of every collection as the Lessons now state them, to tell whether an answer's question changed. A failed read says nothing either way.
    const read = await loadAllCollectionQuestions();

    // The browser calls the API directly with the user's token (P7-D-009), so it needs a public base URL.
    return (
        <PrepareFrame section="answers">
            <AnswerEditor key={id} apiUrl={process.env.NEXT_PUBLIC_API_URL || null} answerId={id} catalog={read.status === "ok" ? read.data : null} />
        </PrepareFrame>
    );
}
