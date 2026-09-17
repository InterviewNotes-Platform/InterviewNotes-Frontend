import { notFound } from "next/navigation";
import { getCourse } from "@/lib/courses";
import { CourseDetail } from "./CourseDetail";

interface CoursePageProps {
    params: Promise<{ course: string }>;
}

/**
 * Server shell: loads the course from the API, then hands it to the client
 * component that tracks per-chapter completion in localStorage.
 *
 * The page used to be a client component calling a synchronous `getCourse()`
 * against a hard-coded array. Now that course metadata comes from the API,
 * the fetch has to happen on the server.
 */
export default async function CoursePage({ params }: CoursePageProps) {
    const { course: courseSlug } = await params;
    const course = await getCourse(courseSlug);

    if (!course) {
        notFound();
    }

    return <CourseDetail course={course} />;
}
