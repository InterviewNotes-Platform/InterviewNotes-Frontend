import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { STORY_ID } from "@/app/prepare/stories/href";
import { PageContainer } from "@/components/layout/PageContainer";
import { QuestionPicker, type CatalogLoad } from "@/components/prepare/picker/QuestionPicker";
import type { CatalogResult } from "@/lib/catalog/types";
import { newAnswerHref, questionRefFromParams } from "@/lib/prep/links";
import { COLLECTIONS, collectionOfContent, findCollection, loadCollectionQuestions, type Collection } from "@/lib/prep/collections";
import type { CatalogQuestion } from "@/lib/prep/questions";
import type { TargetLevel } from "@/lib/prep/types";
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
function settle(result: CatalogResult<CatalogQuestion<TargetLevel | null>[]>): CatalogLoad {
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

/** An explicit `collection` wins; otherwise the collection of the question a link named; otherwise the general one. */
function chosenCollection(param: string | string[] | undefined, contentId: string | undefined): Collection {
    return (typeof param === "string" ? findCollection(param) : undefined) ?? (contentId ? collectionOfContent(contentId) : undefined) ?? COLLECTIONS[0];
}

// Flag off: not found, before any session is read. Signed out: sign-in, returning here with the chosen question (P7-D-016).
export default async function NewAnswerPage({ searchParams }: PageProps) {
    if (!prepEnabled()) notFound();
    const params = await searchParams;
    const requested = questionRefFromParams(params);
    // Only the shape of a story id is checked here; the browser's own API call decides whether it is the reader's story.
    const story = typeof params.story === "string" && STORY_ID.test(params.story) ? params.story : null;
    const collection = chosenCollection(params.collection, requested?.content_id);
    // Signing in returns here with the chosen collection kept; a question's pair already implies it, and the general one is the default.
    const keepCollection = !requested && collection.id !== COLLECTIONS[0].id;
    const back = newAnswerHref(requested, story) + (keepCollection ? `${story ? "&" : "?"}collection=${collection.id}` : "");
    if (!(await hasSession())) redirect(`/login?redirect=${encodeURIComponent(back)}`);

    // One catalog read per Lesson of the chosen collection only, for this page only; the workspace home reads none.
    const catalog = settle(await loadCollectionQuestions(collection));
    const options = COLLECTIONS.map(({ id, title, levelFilter, grouped }) => ({ id, title, levelFilter, grouped }));

    // The browser calls the API directly with the user's token (P7-D-009), so it needs a public base URL.
    return (
        <PageContainer as="main" className="py-10 md:py-14">
            <QuestionPicker key={collection.id} apiUrl={process.env.NEXT_PUBLIC_API_URL || null} catalog={catalog} collections={options} collectionId={collection.id} requested={requested} storyId={story} />
        </PageContainer>
    );
}
