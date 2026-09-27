"use client";
import Link from "next/link";
import type { Course } from "@/lib/courses";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Footer } from "@/components/layout/Footer";
import { CourseIcon } from "@/components/course-icon";
import { ArrowRight, Sparkles, BookOpen, Clock, Zap, CheckCircle2, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";

const topics = [
    "ML Platform Design",
    "LLM Platform Design",
    "GenAI Native Design",
    "ML System Design",
];

const features = [
    "GenAI & Agentic Patterns",
    "ML Platform & MLOps",
    "LLM Platform Design",
    "ML System Design",
];

const trackConfigs = [
    {
        courseId: "gen-ai-native",
        tagline: "RAG, Agents, LLM Ops & more",
        gridClass: "lg:col-span-7 md:col-span-2",
    },
    {
        courseId: "ml-system-design",
        tagline: "Recommendations, search, ranking & more",
        gridClass: "lg:col-span-5",
    },
    {
        courseId: "llm-platform",
        tagline: "Inference serving, fine-tuning & guardrails",
        gridClass: "lg:col-span-5",
    },
    {
        courseId: "ml-platform",
        tagline: "MLOps, feature stores & inference",
        gridClass: "lg:col-span-7",
    },
    {
        courseId: "gen-ai-foundations",
        tagline: "Transformers, attention, tokenization & more",
        gridClass: "lg:col-span-12 md:col-span-2",
    },
];

const faqs = [
    {
        q: "What interview types does InterviewNotes cover?",
        a: "We cover ML System Design, ML Platform Design, LLM Platform Design, Gen AI Foundations, and Gen AI Native Design — preparation for ML and AI engineering interviews.",
    },
    {
        q: "Is there a paid plan?",
        a: "Paid access is not available yet. Our plan is to keep a free sample of chapters and offer the full library as paid access later. Nothing is for sale today.",
    },
    {
        q: "Can I try it for free?",
        a: "Yes. Free chapters are marked on each track page, so you can read them and judge the depth for yourself.",
    },
    {
        q: "How is the content structured?",
        a: "Each track is broken into chapters that build on each other — from foundational concepts to real interview problems. Chapters include estimated read times so you can plan your prep.",
    },
    {
        q: "How often is new content added?",
        a: "We add chapters and tracks over time. Each track page shows what is available today.",
    },
];

interface HomeContentProps {
    courses: Course[];
}

export function HomeContent({ courses }: HomeContentProps) {
    const [currentTopicIndex, setCurrentTopicIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentTopicIndex((prevIndex) => (prevIndex + 1) % topics.length);
                setIsAnimating(false);
            }, 300);
        }, 3500);

        return () => clearInterval(interval);
    }, []);

    const totalChapters = courses.reduce((sum, c) => sum + c.chapterCount, 0);
    const totalHours = Math.round(
        courses.reduce((sum, c) => sum + c.chapters.reduce((s, ch) => s + ch.estimatedReadTime, 0), 0) / 60,
    );

    return (
        <main className="min-h-screen bg-background">
            {/* Hero Section */}
            <section className="relative py-20 md:py-28 lg:py-32 overflow-hidden items-center justify-center flex flex-col">
                {/* Modern Grid Background */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

                {/* Spotlight / Aurora Effect */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-primary/20 blur-[120px] rounded-full pointer-events-none opacity-50 mix-blend-screen" />

                <div className="container mx-auto px-6 md:px-8 relative z-10 w-full flex flex-col items-center">
                    <div className="max-w-5xl mx-auto text-center">
                        {/* Announcement Badge */}
                        <div className="flex justify-center mb-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
                            <Badge
                                variant="outline"
                                className="px-4 py-2 bg-primary/10 border-primary/30 text-primary gap-2 text-sm font-bold hover:bg-primary/20 transition-colors cursor-pointer shadow-sm"
                            >
                                <Sparkles className="h-4 w-4" />
                                ML & GenAI interview prep
                                <ArrowRight className="h-4 w-4" />
                            </Badge>
                        </div>

                        {/* Hero Title */}
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground leading-[1.1] tracking-tight mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            Crack Your Next
                            <br className="hidden md:block" />
                            <span className="md:hidden"> </span>
                            <span
                                className={`inline-block px-3 md:px-4 py-1 md:py-2 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 rounded-xl transition-all duration-300 ${isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
                                    }`}
                            >
                                <span className="bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                                    {topics[currentTopicIndex]}
                                </span>
                            </span>{" "}
                            Interview
                        </h1>

                        {/* Hero Subtitle */}
                        <p className="text-base md:text-lg text-muted-foreground/90 max-w-2xl mx-auto mb-8 leading-relaxed font-medium animate-in fade-in slide-in-from-bottom-5 duration-700 delay-150">
                            One platform for <span className="text-foreground font-semibold">ML System Design, LLM Platforms & GenAI</span> interviews.
                            Structured chapters to help you prepare for ML/AI interviews.
                        </p>

                        {/* Feature Pills */}
                        <div className="flex flex-wrap justify-center gap-3 mb-10 animate-in fade-in slide-in-from-bottom-5 duration-700 delay-200">
                            {features.map((feature, i) => (
                                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-border/50 text-sm font-medium text-foreground hover:bg-secondary transition-colors cursor-default">
                                    <CheckCircle2 className="h-4 w-4 text-primary" />
                                    <span>{feature}</span>
                                </div>
                            ))}
                        </div>

                        {/* CTA Buttons */}
                        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center mb-12 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300">
                            <Button asChild size="lg" className="h-12 px-8 text-base font-bold bg-[var(--gold)] hover:bg-[var(--gold-hover)] text-[var(--gold-foreground)] shadow-xl shadow-[var(--gold)]/25 hover:shadow-[var(--gold)]/40 transition-all hover:scale-105 rounded-xl">
                                <Link href="/learn">
                                    Start Learning
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Link>
                            </Button>
                            <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base font-bold border-2 border-border/60 hover:bg-muted/60 hover:border-foreground/20 transition-all rounded-xl">
                                <Link href="/#access">How Access Works</Link>
                            </Button>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-6 md:gap-10 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-7 duration-700 delay-500">
                            {[
                                { icon: BookOpen, value: String(totalChapters), label: "Chapters" },
                                { icon: Zap, value: String(courses.length), label: "Tracks" },
                                { icon: Clock, value: `~${totalHours}h`, label: "Reading Time" },
                            ].map((stat, i) => (
                                <div key={i} className="text-center group cursor-default">
                                    <div className="p-3 rounded-xl bg-primary/5 w-fit mx-auto mb-3 group-hover:bg-primary/15 transition-all border border-primary/10">
                                        <stat.icon className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                                    </div>
                                    <div className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-foreground mb-1">{stat.value}</div>
                                    <div className="text-xs md:text-sm text-muted-foreground font-semibold">{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Access Section */}
            <section id="access" className="py-20 md:py-28 border-t border-border/50 bg-muted/20 scroll-mt-20">
                <div className="container mx-auto px-6 md:px-8">
                    <div className="text-center mb-16 max-w-4xl mx-auto">
                        <Badge variant="outline" className="mb-4 border-[var(--gold)]/30 text-[var(--gold-hover)]">
                            Access
                        </Badge>
                        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6 tracking-tight">
                            Start Free
                        </h2>
                        <p className="text-lg md:text-xl text-muted-foreground/90 leading-relaxed">
                            Free chapters are available now. Paid access to the full library is planned but not available yet.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 justify-center max-w-3xl mx-auto">
                        <div className="flex-1 p-6 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-md hover:bg-card/60 transition-all text-left">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Free Chapters</span>
                                <span className="text-3xl font-bold text-foreground">$0</span>
                            </div>
                            <ul className="space-y-3 text-sm text-muted-foreground">
                                <li className="flex items-center gap-3">
                                    <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    Free chapters are marked on each track
                                </li>
                                <li className="flex items-center gap-3">
                                    <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    Preview course structure
                                </li>
                            </ul>
                            <div className="mt-6">
                                <Button asChild variant="outline" className="w-full h-11 font-bold border-2 border-border/60 hover:bg-muted/60 rounded-xl">
                                    <Link href="/learn">Try Free</Link>
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 p-6 rounded-2xl border-2 border-[var(--gold)]/40 bg-gradient-to-b from-[var(--gold)]/10 to-[var(--gold)]/0 backdrop-blur-md text-left">
                            <span className="text-sm font-bold text-[var(--gold-hover)] uppercase tracking-wider">Full Library</span>
                            <p className="mt-4 text-sm font-medium text-foreground/90">
                                Paid access is not available yet. Locked chapters will open up once it launches.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Interview Tracks - Bento Grid */}
            <section className="py-20 md:py-28 border-t border-border/50 relative overflow-hidden">
                {/* Section background */}
                <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-[var(--gold)]/[0.03] pointer-events-none" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

                <div className="container mx-auto px-6 md:px-8 relative z-10">
                    <div className="text-center mb-16 max-w-4xl mx-auto">
                        <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
                            Interview Tracks
                        </Badge>
                        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6 tracking-tight">
                            Choose Your Path
                        </h2>
                        <p className="text-lg md:text-xl text-muted-foreground/90 leading-relaxed">
                            Focused tracks — from fundamentals to interview problems.
                        </p>
                    </div>

                    {/* Bento Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 max-w-6xl mx-auto">
                        {trackConfigs.map((track) => {
                            const course = courses.find(c => c.id === track.courseId);
                            if (!course) return null;
                            const totalReadTime = course.chapters.reduce((sum, ch) => sum + ch.estimatedReadTime, 0);

                            return (
                                <Link
                                    key={course.id}
                                    href={`/learn/${course.slug}`}
                                    className={`group/card ${track.gridClass}`}
                                >
                                    <div className="relative h-full rounded-2xl border border-border/40 bg-gradient-to-br from-card via-card to-primary/[0.04] overflow-hidden transition-all duration-300 hover:border-[var(--gold)]/50 hover:shadow-xl hover:shadow-[var(--gold)]/10 hover:scale-[1.02]">
                                        {/* Gold accent gradient bar */}
                                        <div className="h-1 w-full bg-gradient-to-r from-primary via-[var(--gold)]/70 to-primary/40" />

                                        <div className="relative p-6 flex flex-col h-full">
                                            {/* Icon + Chapter count */}
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="p-3 rounded-xl bg-primary/10 border border-primary/10 group-hover/card:bg-primary/15 group-hover/card:border-primary/20 transition-colors">
                                                    <CourseIcon name={course.icon} className="h-7 w-7 text-primary" />
                                                </div>
                                                <Badge variant="secondary" className="bg-primary/5 text-primary/80 border border-primary/10 font-semibold text-xs px-2.5 py-1">
                                                    {course.chapterCount} chapters
                                                </Badge>
                                            </div>

                                            {/* Title + Tagline */}
                                            <h3 className="text-xl font-bold text-foreground mb-1.5 group-hover/card:text-[var(--gold)] transition-colors">
                                                {course.title}
                                            </h3>
                                            <p className="text-sm text-muted-foreground font-medium mb-3">
                                                {track.tagline}
                                            </p>

                                            {/* Description */}
                                            <p className="text-sm text-muted-foreground/80 leading-relaxed line-clamp-2 mb-6">
                                                {course.description}
                                            </p>

                                            {/* Footer */}
                                            <div className="mt-auto flex items-center justify-between pt-4 border-t border-border/30">
                                                <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                                                    <div className="flex items-center gap-1.5">
                                                        <BookOpen className="h-4 w-4" />
                                                        <span>{course.chapterCount}</span>
                                                    </div>
                                                    <span>~{Math.round(totalReadTime / 60)}h</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm font-bold text-[var(--gold)] opacity-0 group-hover/card:opacity-100 transition-opacity">
                                                    <span>Explore</span>
                                                    <ArrowRight className="h-4 w-4 group-hover/card:translate-x-0.5 transition-transform" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Bottom CTA */}
                    <div className="text-center mt-16">
                        <Button asChild size="lg" className="h-12 px-8 font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 rounded-xl">
                            <Link href="/learn">
                                View All Courses
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section id="faq" className="py-20 md:py-28 border-t border-border/50 bg-muted/20 scroll-mt-20">
                <div className="container mx-auto px-6 md:px-8">
                    <div className="text-center mb-16 max-w-4xl mx-auto">
                        <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
                            FAQ
                        </Badge>
                        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6 tracking-tight">
                            Frequently Asked Questions
                        </h2>
                    </div>

                    <div className="max-w-2xl mx-auto space-y-3">
                        {faqs.map((faq, i) => (
                            <div
                                key={i}
                                className="border border-border/60 rounded-xl bg-card overflow-hidden transition-all"
                            >
                                <button
                                    aria-expanded={openFaq === i}
                                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                    className="w-full flex items-center justify-between p-5 text-left cursor-pointer"
                                >
                                    <span className="font-semibold text-foreground pr-4">{faq.q}</span>
                                    <ChevronDown className={`h-5 w-5 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`} />
                                </button>
                                {openFaq === i && (
                                    <div className="px-5 pb-5">
                                        <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <Footer />
        </main>
    );
}
