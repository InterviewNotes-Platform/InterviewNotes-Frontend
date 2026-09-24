import { notFound } from "next/navigation";
import { getCourse } from "@/lib/courses";
import { StoryBankContent } from "./StoryBankContent";

interface StoryBankPageProps {
    params: Promise<{ course: string }>;
}

/** Story bank is a behavioural-course-only feature. */
export default async function StoryBankPage({ params }: StoryBankPageProps) {
    const { course: courseSlug } = await params;

    if (courseSlug !== "behavioral-interviews") {
        notFound();
    }

    const course = await getCourse(courseSlug);
    if (!course) {
        notFound();
    }

    return <StoryBankContent course={course} />;
}
