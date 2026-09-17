"use client";

import Link from "next/link";
import type { Course } from "@/lib/courses";
import { SbiTimeline } from "@/components/behavioral/SbiTimeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, BookOpen, Sparkles } from "lucide-react";
import { Footer } from "@/components/layout/Footer";

interface StoryBankContentProps {
    course: Course;
}

export function StoryBankContent({ course }: StoryBankContentProps) {

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto px-6 md:px-8 py-6 max-w-5xl">

                {/* Back Nav */}
                <Link
                    href={`/learn/${course.slug}`}
                    className="inline-flex items-center text-base font-medium text-muted-foreground hover:text-foreground transition-colors mb-8 group"
                >
                    <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-0.5 transition-transform" />
                    Back to {course.title}
                </Link>

                {/* Page Header */}
                <div className="mb-10 space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <Badge
                            variant="outline"
                            className="border-primary/20 text-primary bg-primary/5 px-3 py-1.5 text-sm uppercase tracking-wide font-semibold"
                        >
                            Behavioral Prep
                        </Badge>
                        <Badge
                            variant="outline"
                            className="border-[var(--gold)]/30 text-[var(--gold)] bg-[var(--gold)]/5 px-3 py-1.5 text-sm font-semibold"
                        >
                            <Sparkles className="h-3.5 w-3.5 mr-1" />
                            Interactive
                        </Badge>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground leading-[1.2]">
                        Your Story Bank
                    </h1>
                    <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-3xl">
                        Before diving into the lessons, build your personal library of career
                        examples. Great behavioral answers come from{" "}
                        <span className="font-semibold text-foreground">real stories you&apos;ve lived</span>
                        . Add your experiences below in SBI format — you&apos;ll reference these
                        throughout the course.
                    </p>
                </div>

                {/* Timeline Component */}
                <div className="rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm p-5 md:p-8">
                    <SbiTimeline />
                </div>

                {/* CTA to start course */}
                <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm">
                    <div className="space-y-1">
                        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-primary" />
                            Ready to start learning?
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Jump into the first chapter — you can always come back to add more stories.
                        </p>
                    </div>
                    <Link href={`/learn/${course.slug}/${course.chapters[0]?.slug || ""}`}>
                        <Button className="gap-2 bg-[var(--gold)] hover:bg-[var(--gold-hover)] text-[var(--gold-foreground)] font-semibold shadow-md hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] h-11 px-6">
                            Start Chapter 1
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </div>

            </div>
            <Footer />
        </main>
    );
}
