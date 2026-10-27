import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { prepEnabled } from "@/lib/prep-flag";
import { PREPARE_HREF } from "@/lib/primary-navigation";
import { hasSession } from "./hasSession";
import { PrepareWorkspace } from "./PrepareWorkspace";

// Personal data is per user: the page reads the session and is never built or cached statically.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Prepare | InterviewNotes",
    robots: { index: false, follow: false },
};

// Flag off: not found, before any session is read. Signed out: sign-in, returning here (P7-D-016, P6-R-051).
export default async function PreparePage() {
    if (!prepEnabled()) notFound();
    if (!(await hasSession())) redirect(`/login?redirect=${encodeURIComponent(PREPARE_HREF)}`);

    // The browser calls the API directly with the user's token (P7-D-009), so it needs a public base URL.
    return (
        <PageContainer as="main" className="py-10 md:py-14">
            <PrepareWorkspace apiUrl={process.env.NEXT_PUBLIC_API_URL || null} />
        </PageContainer>
    );
}
