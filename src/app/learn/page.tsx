import { CourseCard } from "@/components/courses/CourseCard";
import { Footer } from "@/components/layout/Footer";
import { getVisibleCourses } from "@/lib/courses";
import { Badge } from "@/components/ui/badge";

export const metadata = {
    title: "Interview Prep Paths - InterviewNotes",
    description: "Master System Design, ML System Design, LLD and more. Designed for Senior, Staff, and Principal engineering roles.",
};

export default async function LearnPage() {
    const courses = await getVisibleCourses();
    return (
        <main className="min-h-screen">
            <section className="py-16">
                <div className="container mx-auto px-6 md:px-8">
                    {/* Header */}
                    <div className="text-center mb-10">
                        <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
                            All Courses
                        </Badge>
                        <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-4">
                            Interview Paths
                        </h1>
                        <p className="text-lg text-foreground/80 max-w-2xl mx-auto">
                            Explore focused tracks for ML System Design, LLM Platform Design, Gen AI Native Design and more.
                            Each path is designed to take you from fundamentals to confident whiteboard delivery.
                        </p>
                    </div>

                    {/* Course Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                        {courses.map((course) => (
                            <CourseCard key={course.id} course={course} />
                        ))}
                    </div>

                    {/* Coming Soon */}
                    <div className="mt-16 text-center">
                        <h3 className="text-xl font-semibold text-foreground mb-3">More Content Coming Soon</h3>
                        <p className="text-foreground/75 max-w-lg mx-auto">
                            We&apos;re drafting modules on Engineering Strategy,
                            Behavioral Interviews for Leaders, and advanced LLD at Scale.
                        </p>
                    </div>
                </div>
            </section>
            <Footer />
        </main>
    );
}
