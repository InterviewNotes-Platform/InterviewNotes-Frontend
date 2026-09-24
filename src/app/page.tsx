import { getCourses } from "@/lib/courses";
import { HomeContent } from "./HomeContent";

/**
 * Server shell for the landing page.
 *
 * The page body is interactive and stays a client component; it just needs the
 * course list, which now comes from the API rather than a hard-coded array.
 */
export default async function HomePage() {
    const courses = await getCourses();
    return <HomeContent courses={courses} />;
}
