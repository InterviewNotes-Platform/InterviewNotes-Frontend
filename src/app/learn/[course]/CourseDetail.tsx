"use client";

import Link from "next/link";
import { getGroupedChapters, type Course } from "@/lib/courses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Footer } from "@/components/layout/Footer";
import { ArrowRight, BookOpen, Clock, Lock, CheckCircle2, Sparkles } from "lucide-react";
import { CourseIcon } from "@/components/course-icon";
import { useEffect, useState } from "react";

interface CourseDetailProps {
    course: Course;
}

export function CourseDetail({ course }: CourseDetailProps) {
    const [completedChapters, setCompletedChapters] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (course) {
            const completed = new Set<string>();
            course.chapters.forEach((chapter) => {
                const key = `completed_${course.id}_${chapter.id}`;
                if (typeof window !== 'undefined' && localStorage.getItem(key) === 'true') {
                    completed.add(chapter.id);
                }
            });
            setCompletedChapters(completed);

            // Listen for completion updates
            const handleCompletion = (event: CustomEvent) => {
                if (event.detail.courseId === course.id) {
                    const updated = new Set<string>();
                    course.chapters.forEach((chapter) => {
                        const key = `completed_${course.id}_${chapter.id}`;
                        if (typeof window !== 'undefined' && localStorage.getItem(key) === 'true') {
                            updated.add(chapter.id);
                        }
                    });
                    setCompletedChapters(updated);
                }
            };

            window.addEventListener('chapterCompleted', handleCompletion as EventListener);
            return () => window.removeEventListener('chapterCompleted', handleCompletion as EventListener);
        }
    }, [course]);

    // Removed auto-redirect to prevent intermediate screen
    // Users can navigate to chapters manually or via the "Start Learning Now" button

    const groupedChapters = getGroupedChapters(course);
    const freeChapters = course.chapters.filter((ch) => !ch.isPremium);
    const totalReadTime = course.chapters.reduce((sum, ch) => sum + ch.estimatedReadTime, 0);
    const completedCount = completedChapters.size;
    const progressPercent = course.chapters.length > 0 ? (completedCount / course.chapters.length) * 100 : 0;

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto px-6 md:px-8 py-6 max-w-7xl">

                {/* Back Nav */}
                <Link href="/learn" className="inline-flex items-center text-base font-medium text-muted-foreground hover:text-foreground transition-colors mb-8 group">
                    <ArrowRight className="h-4 w-4 mr-2 rotate-180 group-hover:-translate-x-0.5 transition-transform" />
                    Back to Courses
                </Link>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    {/* Left Column (Hero + Curriculum) - Spans 8 cols */}
                    <div className="lg:col-span-8 space-y-8">

                        {/* Hero Section */}
                        <div className="space-y-5">
                            <div className="flex items-center gap-3">
                                <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 px-3 py-1.5 text-sm uppercase tracking-wide font-semibold">
                                    Learning Path
                                </Badge>
                                {freeChapters.length > 0 && (
                                    <span className="text-sm font-medium text-primary flex items-center gap-1.5">
                                        <Sparkles className="h-4 w-4" />
                                        {freeChapters.length} Free Chapters
                                    </span>
                                )}
                            </div>

                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground leading-[1.2]">
                                {course.title}
                            </h1>
                            <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-3xl">
                                {course.description}
                            </p>
                        </div>

                        {/* Story Bank CTA — behavioral course only */}
                        {course.slug === "behavioral-interviews" && (
                            <Link
                                href={`/learn/${course.slug}/story-bank`}
                                className="group flex items-center gap-5 p-5 rounded-2xl border border-[var(--gold)]/30 bg-[var(--gold)]/5 hover:bg-[var(--gold)]/10 hover:border-[var(--gold)]/50 hover:shadow-lg hover:shadow-[var(--gold)]/5 transition-all duration-200"
                            >
                                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[var(--gold)]/15 flex items-center justify-center">
                                    <Sparkles className="h-6 w-6 text-[var(--gold)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="font-bold text-foreground text-base md:text-lg group-hover:text-[var(--gold)] transition-colors">
                                        Build Your Story Bank
                                    </span>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        Add your career examples in SBI format before starting the course
                                    </p>
                                </div>
                                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-[var(--gold)] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                            </Link>
                        )}

                        {/* Curriculum Section */}
                        <div className="space-y-6">
                            <div className="flex items-center justify-between pb-4 border-b border-border/40">
                                <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-3">
                                    <BookOpen className="h-5 w-5 text-primary" />
                                    Course Curriculum
                                </h2>
                                <span className="text-base text-muted-foreground font-medium">
                                    {course.chapters.length} Lectures • ~{Math.round(totalReadTime / 60)}h
                                </span>
                            </div>

                            <div className="space-y-8">
                                {Object.entries(groupedChapters).map(([section, chapters]) => (
                                    <div key={section} className="space-y-4">
                                        <h3 className="text-base md:text-lg font-semibold text-foreground pl-4 border-l-4 border-primary">
                                            {section}
                                        </h3>

                                        <div className="grid gap-4">
                                            {chapters.map((chapter, index) => (
                                                <Link
                                                    key={chapter.id}
                                                    href={`/learn/${course.slug}/${chapter.slug}`}
                                                    className="group relative flex items-center gap-5 p-5 rounded-xl border border-border bg-card hover:bg-accent/5 hover:border-sidebar-primary/50 hover:shadow-md transition-all duration-200"
                                                >
                                                    {/* Lecture Number */}
                                                    {completedChapters.has(chapter.id) ? (
                                                        <div className="flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center bg-primary transition-all duration-200">
                                                            <CheckCircle2 className="h-7 w-7 text-primary-foreground" strokeWidth={2.5} />
                                                        </div>
                                                    ) : (
                                                        <div className="flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-base font-extrabold bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-all duration-200">
                                                            {(index + 1).toString().padStart(2, '0')}
                                                        </div>
                                                    )}

                                                    {/* Content */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <span className="font-semibold text-foreground text-base md:text-lg group-hover:text-primary transition-colors line-clamp-1">
                                                                {chapter.title}
                                                            </span>
                                                            {chapter.isPremium && (
                                                                <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border border-primary/20 h-6 px-2.5 font-semibold">
                                                                    PRO
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-3 text-base text-muted-foreground font-medium">
                                                            <span className="flex items-center gap-2">
                                                                <Clock className="h-4 w-4" />
                                                                {chapter.estimatedReadTime} min
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Action Icon */}
                                                    <div className="flex-shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                                                        {chapter.isPremium ? (
                                                            <Lock className="h-6 w-6 text-muted-foreground" />
                                                        ) : (
                                                            <ArrowRight className="h-6 w-6 text-primary" />
                                                        )}
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Sticky Sidebar Card - Spans 4 cols */}
                    <div className="lg:col-span-4 lg:sticky lg:top-24">
                        <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm shadow-lg overflow-hidden">
                            <div className="p-6 space-y-6">

                                {/* Course Icon & Title */}
                                <div className="text-center space-y-4">
                                    <div className="inline-flex p-4 rounded-xl bg-primary/10 mb-2">
                                        <CourseIcon name={course.icon} className="h-10 w-10 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-foreground">Course Progress</h3>
                                        <p className="text-sm text-muted-foreground mt-1">Keep up the momentum!</p>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between text-sm font-medium">
                                            <span className="text-muted-foreground">{Math.round(progressPercent)}% Complete</span>
                                            <span className="text-foreground font-bold">{completedCount}/{course.chapterCount}</span>
                                        </div>
                                        <Progress value={progressPercent} className="h-2.5 bg-muted/50" indicatorClassName="bg-[var(--gold)]" />
                                    </div>
                                </div>

                                <div className="h-px w-full bg-border/50" />

                                {/* Meta Grid */}
                                <div className="grid grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Content</span>
                                        <div className="flex items-center gap-2 text-base font-bold text-foreground">
                                            <BookOpen className="h-4 w-4 text-[var(--gold)]" />
                                            <span>{course.chapterCount} Chapters</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Duration</span>
                                        <div className="flex items-center gap-2 text-base font-bold text-foreground">
                                            <Clock className="h-4 w-4 text-[var(--gold)]" />
                                            <span>~{Math.round(totalReadTime / 60)}h</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Level</span>
                                        <div className="flex items-center gap-2 text-base font-bold text-foreground">
                                            <Sparkles className="h-4 w-4 text-[var(--gold)]" />
                                            <span>Intermediate</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Access</span>
                                        <div className="flex items-center gap-2 text-base font-bold text-foreground">
                                            <Lock className="h-4 w-4 text-[var(--gold)]" />
                                            <span>Lifetime</span>
                                        </div>
                                    </div>
                                </div>

                                {/* CTA */}
                                <Link href={course.chapters.length > 0 ? `/learn/${course.slug}/${course.chapters[0].slug}` : '#'} className="block">
                                    <Button className="w-full h-12 text-base font-bold shadow-lg shadow-[var(--gold)]/20 hover:shadow-[var(--gold)]/30 transition-all rounded-lg bg-[var(--gold)] hover:bg-[var(--gold-hover)] text-[var(--gold-foreground)] hover:scale-[1.02] active:scale-[0.98]">
                                        Start Learning Now
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>

                                <div className="text-center">
                                    <p className="text-xs text-muted-foreground">
                                        30-day money-back guarantee
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
            <Footer />
        </main>
    );
}
