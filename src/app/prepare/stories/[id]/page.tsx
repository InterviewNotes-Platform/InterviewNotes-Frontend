import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { StoryEditor } from "@/components/prepare/stories/StoryEditor";
import { prepEnabled } from "@/lib/prep-flag";
import { hasSession } from "../../hasSession";
import { STORY_ID, storyHref } from "../href";

// Personal data is per user: the page reads the session and is never built or cached statically.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Your story | InterviewNotes",
    robots: { index: false, follow: false },
};

interface PageProps {
    params: Promise<{ id: string }>;
}

// Flag off or a malformed id: not found, before any session is read. Signed out: sign-in, returning here (P7-D-016).
export default async function StoryPage({ params }: PageProps) {
    const { id } = await params;
    if (!prepEnabled() || !STORY_ID.test(id)) notFound();
    if (!(await hasSession())) redirect(`/login?redirect=${encodeURIComponent(storyHref(id))}`);

    // The browser calls the API directly with the user's token (P7-D-009), so it needs a public base URL.
    return (
        <PageContainer as="main" className="py-10 md:py-14">
            <StoryEditor key={id} apiUrl={process.env.NEXT_PUBLIC_API_URL || null} storyId={id} />
        </PageContainer>
    );
}
