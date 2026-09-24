import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Course } from "@/lib/courses";
import { CourseIcon } from "@/components/course-icon";
import { ArrowRight, BookOpen } from "lucide-react";

interface CourseCardProps {
    course: Course;
}

export function CourseCard({ course }: CourseCardProps) {
    const totalReadTime = course.chapters.reduce((sum, ch) => sum + ch.estimatedReadTime, 0);

    return (
        <Link href={`/learn/${course.slug}`} className="group">
            <Card className="bg-card border-2 border-border/60 hover:border-[var(--gold)]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[var(--gold)]/10 h-full flex flex-col overflow-hidden hover:scale-[1.02]">
                <CardHeader className="pb-5 space-y-5 p-6">
                    <div className="flex items-start justify-between">
                        <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
                            <CourseIcon name={course.icon} className="h-7 w-7 text-primary" />
                        </div>
                        <Badge variant="secondary" className="bg-muted text-foreground/80 font-semibold text-xs px-2.5 py-1">
                            {course.chapterCount} chapters
                        </Badge>
                    </div>
                    <div className="space-y-3">
                        <CardTitle className="text-xl md:text-2xl font-extrabold text-foreground group-hover:text-primary transition-colors leading-tight">
                            {course.title}
                        </CardTitle>
                        <CardDescription className="text-muted-foreground text-base leading-relaxed line-clamp-3">
                            {course.description}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="mt-auto pt-0 pb-6 px-6">
                    <div className="flex items-center justify-between pt-4 border-t border-border/40">
                        <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                                <BookOpen className="h-4 w-4" />
                                <span>{course.chapterCount}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span>~{Math.round(totalReadTime / 60)}h</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-bold text-[var(--gold)] opacity-0 group-hover:opacity-100 transition-opacity">
                            <span>Explore</span>
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
