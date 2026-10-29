import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { STORY_ID } from "@/app/prepare/stories/href";
import { PageContainer } from "@/components/layout/PageContainer";
import { QuestionPicker, type CatalogLoad } from "@/components/prepare/picker/QuestionPicker";
import type { CatalogResult } from "@/lib/catalog/types";
import { newAnswerHref, questionRefFromParams } from "@/lib/prep/links";
import { loadBehavioralQuestions, type CatalogQuestion } from "@/lib/prep/questions";
import { prepEnabled } from "@/lib/prep-flag";
import { hasSession } from "../hasSession";

// Personal data is per user, and the catalog read depends on the caller's session: never built or cached statically.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Choose a question | InterviewNotes",
    robots: { index: false, follow: false },
};

interface PageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Why the catalog could not be shown, without exposing which Lesson failed. */
function settle(result: CatalogResult<CatalogQuestion[]>): CatalogLoad {
    switch (result.status) {
        case "ok":
            return { status: "ok", questions: result.data };
        case "unauthenticated":
            return { status: "failed", reason: "signin" };
        case "unentitled":
            return { status: "failed", reason: "unentitled" };
        default:
            return { status: "failed", reason: "unavailable" };
    }
}

// Flag off: not found, before any session is read. Signed out: sign-in, returning here with the chosen question (P7-D-016).
export default async function NewAnswerPage({ searchParams }: PageProps) {
    if (!prepEnabled()) notFound();
    const params = await searchParams;
    const requested = questionRefFromParams(params);
    // Only the shape of a story id is checked here; the browser's own API call decides whether it is the reader's story.
    const story = typeof params.story === "string" && STORY_ID.test(params.story) ? params.story : null;
    if (!(await hasSession())) redirect(`/login?redirect=${encodeURIComponent(newAnswerHref(requested, story))}`);

    // One catalog read per Lesson, for this page only; the workspace home reads none.
    const catalog = settle(await loadBehavioralQuestions());

    // The browser calls the API directly with the user's token (P7-D-009), so it needs a public base URL.
    return (
        <PageContainer as="main" className="py-10 md:py-14">
            <QuestionPicker apiUrl={process.env.NEXT_PUBLIC_API_URL || null} catalog={catalog} requested={requested} storyId={story} />
        </PageContainer>
    );
}
