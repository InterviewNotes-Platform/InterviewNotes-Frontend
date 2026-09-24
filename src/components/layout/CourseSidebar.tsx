"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
// import { ScrollArea } from "@/components/ui/scroll-area"; // Removed to fix scrolling issue
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Course, getGroupedChapters, Chapter } from "@/lib/courses";
import { Search, Lock, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { CourseIcon } from "@/components/course-icon";

interface CourseSidebarProps {
    course: Course;
    currentChapterSlug?: string;
}

export function CourseSidebar({ course, currentChapterSlug }: CourseSidebarProps) {
    const pathname = usePathname();
    const groupedChapters = getGroupedChapters(course);
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
        // Expand all sections by default
        const initial: Record<string, boolean> = {};
        Object.keys(groupedChapters).forEach((section) => {
            initial[section] = true;
        });
        return initial;
    });
    const [completedChapters, setCompletedChapters] = useState<Set<string>>(new Set());
    const activeChapterRef = useRef<HTMLAnchorElement>(null);

    // Load completed chapters from localStorage
    useEffect(() => {
        const loadCompleted = () => {
            const completed = new Set<string>();
            course.chapters.forEach((chapter) => {
                const key = `completed_${course.id}_${chapter.id}`;
                if (localStorage.getItem(key) === 'true') {
                    completed.add(chapter.id);
                }
            });
            setCompletedChapters(completed);
        };

        loadCompleted();

        // Listen for completion updates
        const handleCompletion = (event: CustomEvent) => {
            if (event.detail.courseId === course.id) {
                loadCompleted();
            }
        };

        window.addEventListener('chapterCompleted', handleCompletion as EventListener);
        return () => window.removeEventListener('chapterCompleted', handleCompletion as EventListener);
    }, [course]);

    // Scroll active chapter into view without resetting sidebar scroll position
    useEffect(() => {
        activeChapterRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }, [currentChapterSlug]);

    // Calculate progress from completed chapters
    const completedCount = completedChapters.size;
    const totalCount = course.chapters.length;
    const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    const toggleSection = (section: string) => {
        setExpandedSections((prev) => ({
            ...prev,
            [section]: !prev[section],
        }));
    };

    const toggleCompletion = (chapterId: string, event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const key = `completed_${course.id}_${chapterId}`;
        const isCompleted = completedChapters.has(chapterId);
        const newState = !isCompleted;

        localStorage.setItem(key, String(newState));

        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('chapterCompleted', {
            detail: { courseId: course.id, chapterId, completed: newState }
        }));

        // Update local state immediately
        const newCompleted = new Set(completedChapters);
        if (newState) {
            newCompleted.add(chapterId);
        } else {
            newCompleted.delete(chapterId);
        }
        setCompletedChapters(newCompleted);
    };

    const filteredGroupedChapters = Object.entries(groupedChapters).reduce(
        (acc, [section, chapters]) => {
            const filtered = chapters.filter((ch) =>
                ch.title.toLowerCase().includes(searchQuery.toLowerCase())
            );
            if (filtered.length > 0) {
                acc[section] = filtered;
            }
            return acc;
        },
        {} as Record<string, Chapter[]>
    );

    return (
        <aside className="w-72 border-r border-border bg-background flex flex-col h-full">
            {/* Course Header */}
            <div className="p-5 border-b border-border bg-background">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                        <CourseIcon name={course.icon} className="h-8 w-8 text-primary flex-shrink-0" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-foreground text-base leading-tight mb-1">{course.title}</h2>
                        <p className="text-xs text-muted-foreground font-medium">
                            {completedCount} of {totalCount} completed
                        </p>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Progress value={progressPercent} className="h-2 bg-muted/60" indicatorClassName="bg-gold transition-all duration-500" />
                    <div className="flex justify-between text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        <span>Progress</span>
                        <span>{Math.round(progressPercent)}%</span>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-border bg-background">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search chapters..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 bg-background border-border text-sm"
                    />
                </div>
            </div>

            {/* Chapter List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
                <div className="p-3 space-y-5">
                    {Object.entries(filteredGroupedChapters).map(([section, chapters]) => (
                        <div key={section} className="space-y-2">
                            {/* Section Header */}
                            <button
                                onClick={() => toggleSection(section)}
                                className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-foreground/70 uppercase tracking-wide hover:text-foreground transition-colors group rounded-md hover:bg-muted/50"
                            >
                                <span className="line-clamp-1 text-left">{section}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded-md text-muted-foreground">
                                        {chapters.length}
                                    </span>
                                    {expandedSections[section] ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    )}
                                </div>
                            </button>

                            {/* Chapter Items */}
                            {expandedSections[section] && (
                                <div className="space-y-0.5 ml-2 pl-2 border-l border-border/50">
                                    {chapters.map((chapter) => {
                                        const isActive = currentChapterSlug === chapter.slug;
                                        const isCompleted = completedChapters.has(chapter.id);

                                        return (
                                            <Link
                                                key={chapter.id}
                                                ref={isActive ? activeChapterRef : undefined}
                                                href={`/learn/${course.slug}/${chapter.slug}`}
                                                className={cn(
                                                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group relative -ml-[2px]",
                                                    isActive
                                                        ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
                                                        : "text-foreground/70 hover:text-foreground hover:bg-muted/50"
                                                )}
                                            >
                                                {/* Status Icon / Checkbox */}
                                                <button
                                                    onClick={(e) => toggleCompletion(chapter.id, e)}
                                                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full cursor-pointer hover:scale-110 transition-transform"
                                                    aria-label={isCompleted ? "Mark as incomplete" : "Mark as complete"}
                                                >
                                                    {isCompleted ? (
                                                        <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                                            <CheckCircle2 className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                                                        </div>
                                                    ) : chapter.isPremium ? (
                                                        <Lock className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <div className={cn(
                                                            "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors bg-background",
                                                            isActive
                                                                ? "border-primary"
                                                                : "border-muted-foreground/40 group-hover:border-muted-foreground/60 hover:border-primary"
                                                        )}>
                                                        </div>
                                                    )}
                                                </button>

                                                {/* Title */}
                                                <span className="flex-1 leading-snug break-words text-sm">
                                                    {chapter.title}
                                                </span>

                                                {/* Premium Badge */}
                                                {chapter.isPremium && !isCompleted && (
                                                    <div className="flex-shrink-0">
                                                        <div className="h-1.5 w-1.5 rounded-full bg-primary" title="Premium" />
                                                    </div>
                                                )}
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}
