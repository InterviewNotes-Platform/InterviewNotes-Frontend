"use client";
import Link from "next/link";
import type { Course } from "@/lib/courses";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Footer } from "@/components/layout/Footer";
import { CourseIcon } from "@/components/course-icon";
import { ArrowRight, Sparkles, Users, BookOpen, Trophy, Zap, CheckCircle2, Star, ChevronDown, Quote } from "lucide-react";
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
        a: "We cover ML System Design, ML Platform Design, LLM Platform Design, Gen AI Foundations, and Gen AI Native Design — everything you need for MLE, Senior MLE, and Staff AI/ML roles.",
    },
    {
        q: "What does Premium include?",
        a: "Premium gives you lifetime access to all articles across every track, AI-powered interview prep tools, and free updates as we add new content. One-time payment, no subscriptions.",
    },
    {
        q: "Can I try it for free?",
        a: "Yes! Every track includes 2 free articles so you can preview the depth and quality of content before upgrading.",
    },
    {
        q: "How is the content structured?",
        a: "Each track is broken into chapters that build on each other — from foundational concepts to real interview problems. Chapters include estimated read times so you can plan your prep.",
    },
    {
        q: "How often is new content added?",
        a: "We continuously add new chapters and tracks. Premium members get all updates for free, forever.",
    },
];

const testimonials = [
    {
        name: "Priya S.",
        role: "SDE-3",
        company: "Google",
        quote: "The system design modules gave me a structured framework I was missing. Landed my L5 offer in 6 weeks of prep.",
        initials: "PS",
    },
    {
        name: "Marcus T.",
        role: "Senior MLE",
        company: "Meta",
        quote: "ML Platform Design track is gold. Covered exactly what came up in my Meta loop — feature stores, model serving, the works.",
        initials: "MT",
    },
    {
        name: "Ananya R.",
        role: "Staff Engineer",
        company: "Amazon",
        quote: "LLM Platform Design track is exactly what I needed for my Anthropic loop. Inference serving, fine-tuning, guardrails — all in one place.",
        initials: "AR",
    },
    {
        name: "Jake L.",
        role: "SDE-2",
        company: "Netflix",
        quote: "GenAI design track is ahead of every other resource out there. RAG patterns and agent architectures — all covered.",
        initials: "JL",
    },
    {
        name: "Sarah K.",
        role: "Senior SDE",
        company: "Microsoft",
        quote: "ML System Design track nailed it — recommendation systems, search ranking, fraud detection. Exactly what came up in my interview.",
        initials: "SK",
    },
    {
        name: "Ravi M.",
        role: "ML Engineer",
        company: "Apple",
        quote: "Gen AI Foundations track gave me the theory I was missing. Went into my OpenAI interview confident on transformers and attention. Got the offer.",
        initials: "RM",
    },
    {
        name: "Emily C.",
        role: "SDE-2",
        company: "Google",
        quote: "Worth every penny. The depth of each article is closer to a textbook chapter than a blog post. Premium was a no-brainer.",
        initials: "EC",
    },
    {
        name: "David W.",
        role: "Senior SDE",
        company: "Amazon",
        quote: "I prepped with three other platforms before this. InterviewNotes is the only one that covers ML system design properly.",
        initials: "DW",
    },
];

const testimonialsRow1 = testimonials.slice(0, 4);
const testimonialsRow2 = testimonials.slice(4, 8);

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
                                Your complete interview prep
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
                            Everything you need to land your dream ML/AI offer.
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
                        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300">
                            <Link href="/learn">
                                <Button size="lg" className="h-12 px-8 text-base font-bold bg-[var(--gold)] hover:bg-[var(--gold-hover)] text-[var(--gold-foreground)] shadow-xl shadow-[var(--gold)]/25 hover:shadow-[var(--gold)]/40 transition-all hover:scale-105 rounded-xl">
                                    Start Learning
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                            <Link href="/#pricing">
                                <Button size="lg" variant="outline" className="h-12 px-8 text-base font-bold border-2 border-border/60 hover:bg-muted/60 hover:border-foreground/20 transition-all rounded-xl">
                                    View Pricing
                                </Button>
                            </Link>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-7 duration-700 delay-500">
                            {[
                                { icon: BookOpen, value: "80+", label: "Design Modules" },
                                { icon: Users, value: "5K+", label: "Engineers" },
                                { icon: Trophy, value: "90%", label: "Offer Rate" },
                                { icon: Zap, value: "6", label: "Tracks" },
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

            {/* Testimonials Section */}
            <section className="py-20 md:py-28 border-t border-border/50 overflow-hidden">
                <div className="container mx-auto px-6 md:px-8">
                    <div className="text-center mb-12 max-w-4xl mx-auto">
                        <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
                            Testimonials
                        </Badge>
                        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6 tracking-tight">
                            Engineers Who Landed Offers
                        </h2>
                        <p className="text-lg md:text-xl text-muted-foreground/90 leading-relaxed">
                            Trusted by engineers at Google, Meta, Amazon, Netflix, Apple & Microsoft.
                        </p>
                    </div>
                </div>

                {/* Row 1 — scrolls left */}
                <div className="relative mb-5">
                    <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
                    <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
                    <div className="flex testimonial-scroll-left w-max">
                        {[...testimonialsRow1, ...testimonialsRow1].map((t, i) => (
                            <div key={i} className="w-[350px] flex-shrink-0 mx-2.5">
                                <div className="h-full p-5 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm">
                                    <Quote className="h-5 w-5 text-[var(--gold)]/60 mb-3" />
                                    <p className="text-sm text-foreground/90 leading-relaxed mb-4">&ldquo;{t.quote}&rdquo;</p>
                                    <div className="flex items-center gap-3 pt-3 border-t border-border/30">
                                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                            {t.initials}
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-foreground">{t.name}</div>
                                            <div className="text-xs text-muted-foreground">{t.role} at {t.company}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Row 2 — scrolls right */}
                <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
                    <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
                    <div className="flex testimonial-scroll-right w-max">
                        {[...testimonialsRow2, ...testimonialsRow2].map((t, i) => (
                            <div key={i} className="w-[350px] flex-shrink-0 mx-2.5">
                                <div className="h-full p-5 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm">
                                    <Quote className="h-5 w-5 text-[var(--gold)]/60 mb-3" />
                                    <p className="text-sm text-foreground/90 leading-relaxed mb-4">&ldquo;{t.quote}&rdquo;</p>
                                    <div className="flex items-center gap-3 pt-3 border-t border-border/30">
                                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                            {t.initials}
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-foreground">{t.name}</div>
                                            <div className="text-xs text-muted-foreground">{t.role} at {t.company}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="py-20 md:py-28 border-t border-border/50 bg-muted/20 scroll-mt-20">
                <div className="container mx-auto px-6 md:px-8">
                    <div className="text-center mb-16 max-w-4xl mx-auto">
                        <Badge variant="outline" className="mb-4 border-[var(--gold)]/30 text-[var(--gold-hover)]">
                            Pricing
                        </Badge>
                        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6 tracking-tight">
                            Simple, Transparent Pricing
                        </h2>
                        <p className="text-lg md:text-xl text-muted-foreground/90 leading-relaxed">
                            One-time payment, lifetime access. No subscriptions, no hidden fees.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 justify-center max-w-3xl mx-auto">
                        {/* Free Tier */}
                        <div className="flex-1 p-6 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-md hover:bg-card/60 transition-all text-left">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Free Starter</span>
                                <span className="text-3xl font-bold text-foreground">$0</span>
                            </div>
                            <ul className="space-y-3 text-sm text-muted-foreground">
                                <li className="flex items-center gap-3">
                                    <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    2 articles per track
                                </li>
                                <li className="flex items-center gap-3">
                                    <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    Preview course structure
                                </li>
                            </ul>
                            <div className="mt-6">
                                <Link href="/learn">
                                    <Button variant="outline" className="w-full h-11 font-bold border-2 border-border/60 hover:bg-muted/60 rounded-xl">
                                        Try Free
                                    </Button>
                                </Link>
                            </div>
                        </div>

                        {/* Premium Tier */}
                        <div className="flex-1 p-6 rounded-2xl border-2 border-[var(--gold)]/40 bg-gradient-to-b from-[var(--gold)]/10 to-[var(--gold)]/0 backdrop-blur-md relative overflow-hidden text-left shadow-2xl shadow-[var(--gold)]/10 ring-1 ring-[var(--gold)]/20 hover:scale-[1.02] transition-transform duration-300">
                            <div className="absolute top-0 right-0 bg-[var(--gold)] text-[var(--gold-foreground)] text-[10px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-wide shadow-sm">
                                Most Popular
                            </div>

                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-[var(--gold-hover)] uppercase tracking-wider flex items-center gap-2">
                                    <Star className="h-4 w-4 fill-[var(--gold)] text-[var(--gold)]" />
                                    Premium Access
                                </span>
                            </div>
                            <div className="mb-4">
                                <div className="flex items-baseline gap-1">
                                    <span className="text-4xl font-extrabold text-foreground tracking-tight">$40</span>
                                    <span className="text-sm font-semibold text-muted-foreground">/ lifetime</span>
                                </div>
                                <p className="text-xs text-muted-foreground font-medium mt-1">One-time payment. Forever access.</p>
                            </div>

                            <ul className="space-y-3 text-sm font-medium text-foreground/90">
                                <li className="flex items-center gap-3">
                                    <div className="h-5 w-5 rounded-full bg-[var(--gold)]/20 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--gold)]" />
                                    </div>
                                    Unlock all articles & courses
                                </li>
                                <li className="flex items-center gap-3">
                                    <div className="h-5 w-5 rounded-full bg-[var(--gold)]/20 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--gold)]" />
                                    </div>
                                    AI-powered interview prep
                                </li>
                                <li className="flex items-center gap-3">
                                    <div className="h-5 w-5 rounded-full bg-[var(--gold)]/20 flex items-center justify-center flex-shrink-0">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--gold)]" />
                                    </div>
                                    Free updates forever
                                </li>
                            </ul>
                            <div className="mt-6">
                                <Button className="w-full h-11 font-bold bg-[var(--gold)] hover:bg-[var(--gold-hover)] text-[var(--gold-foreground)] shadow-xl shadow-[var(--gold)]/25 rounded-xl">
                                    Get Premium — $40
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </div>
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
                            Six focused tracks — from fundamentals to interview-ready.
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
                        <Link href="/learn">
                            <Button size="lg" className="h-12 px-8 font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 rounded-xl">
                                View All Courses
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                        </Link>
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
