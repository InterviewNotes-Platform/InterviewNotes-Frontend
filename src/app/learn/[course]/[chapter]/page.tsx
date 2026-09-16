
import { notFound } from "next/navigation";
import { getCourse, getChapter } from "@/lib/data";
import { getChapterContent } from "@/lib/content";
import { CourseSidebar } from "@/components/layout/CourseSidebar";
import { ScrollableMain } from "@/components/layout/ScrollableMain";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    ChevronLeft, ChevronRight, Clock, Sparkles,
    Lock, Book, Zap, Target, Brain, Code, Box, Server, Layout, Shield
} from "lucide-react";
import Link from "next/link";
import { StreakCalendar } from "@/components/StreakCalendar";
import { TableOfContents } from "@/components/TableOfContents";
import { ChapterInteractions } from "@/components/chapter/ChapterInteractions";

// Regular Markdown & Custom Components
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import { visit } from 'unist-util-visit';
import { ArticleHeader } from "@/components/mdx/ArticleHeader";
import { Tip } from "@/components/mdx/Tip";
import { Accordion, AccordionItem } from "@/components/mdx/Accordion";
import { AccordionWrapper } from "@/components/mdx/AccordionWrapper";
import { AccordionItemWrapper } from "@/components/mdx/AccordionItemWrapper";
import { PatternCard } from "@/components/mdx/PatternCard";
import { SolutionCard } from "@/components/mdx/SolutionCard";
import { Annotation } from "@/components/mdx/Annotation";
import { ContentImage } from "@/components/mdx/Image";
import { Mermaid } from "@/components/mdx/Mermaid";


interface ChapterPageProps {
    params: Promise<{ course: string; chapter: string }>;
}

function RemarkDirectivePlugin() {
    return (tree: any) => {
        // Process all directives
        visit(tree, (node) => {
            if (
                node.type === 'containerDirective' ||
                node.type === 'leafDirective' ||
                node.type === 'textDirective'
            ) {
                const data = node.data || (node.data = {});
                const tagName = node.name;

                data.hName = tagName;
                data.hProperties = { ...node.attributes, ...data.hProperties };
            }
        });
    };
}

/**
 * Returns the diagram source when a <pre> wraps a single ```mermaid fence,
 * or null for any other code block.
 */
function mermaidSource(node: any): string | null {
    const child = node?.children?.[0];
    if (child?.tagName !== "code") return null;

    const className = child.properties?.className;
    const classes: string[] = Array.isArray(className)
        ? className
        : typeof className === "string"
            ? className.split(" ")
            : [];
    if (!classes.includes("language-mermaid")) return null;

    const text = child.children
        ?.filter((n: any) => n.type === "text")
        .map((n: any) => n.value)
        .join("");

    return text?.trim() ? text : null;
}

export default async function ChapterPage({ params }: ChapterPageProps) {
    const { course: courseSlug, chapter: chapterSlug } = await params;
    const course = getCourse(courseSlug);
    const chapter = course ? getChapter(courseSlug, chapterSlug) : undefined;

    if (!course || !chapter) {
        notFound();
    }

    const { content: rawContent, data, status } = await getChapterContent(courseSlug, chapterSlug);

    // The API is the authority on whether this chapter exists.
    if (status === "notFound") {
        notFound();
    }

    // Strip the first H1 from markdown — ArticleHeader already renders the title
    const content = rawContent.replace(/^#(?!#)\s+.+$/m, "").trimStart();
    const chapterIndex = course.chapters.findIndex((ch) => ch.slug === chapterSlug);
    const prevChapter = chapterIndex > 0 ? course.chapters[chapterIndex - 1] : null;
    const nextChapter = chapterIndex < course.chapters.length - 1 ? course.chapters[chapterIndex + 1] : null;

    // The gate lives in the API, not here: a body only arrives if the caller is
    // allowed to read it. `status` tells us which prompt to show.
    const needsSignIn = status === "unauthenticated";
    const needsSubscription = status === "unentitled";
    const isLocked = needsSignIn || needsSubscription;

    // Extract headings for "On This Page"
    const headings = content.match(/^(##|###)\s+(.+)$/gm)?.map((h) => {
        const level = h.startsWith("###") ? 3 : 2;
        const text = h.replace(/^(##|###)\s+/, "");
        const id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
        return { id, text, level };
    }) || [];

    // Helper to map icon names to components
    const getIcon = (name?: string) => {
        switch (name) {
            case "lock": return <Lock className="h-3.5 w-3.5" />;
            case "book": return <Book className="h-3.5 w-3.5" />;
            case "zap": return <Zap className="h-3.5 w-3.5" />;
            case "target": return <Target className="h-3.5 w-3.5" />;
            case "brain": return <Brain className="h-3.5 w-3.5" />;
            case "code": return <Code className="h-3.5 w-3.5" />;
            case "box": return <Box className="h-3.5 w-3.5" />;
            case "server": return <Server className="h-3.5 w-3.5" />;
            case "layout": return <Layout className="h-3.5 w-3.5" />;
            case "shield": return <Shield className="h-3.5 w-3.5" />;
            case "sparkles": return <Sparkles className="h-3.5 w-3.5" />;
            default: return undefined;
        }
    };

    // Prepare tags for ArticleHeader
    const headerTags = data.tags?.map((tag: any) => ({
        label: tag.label,
        icon: getIcon(tag.icon)
    })) || [];

    // Prepare companies for ArticleHeader
    const headerCompanies = data.companies?.map((company: any) => ({
        name: company.name,
        fallback: company.fallback,
        imageSrc: company.imageSrc
    })) || [];

    const components = {
        // Typography
        h1: ({ node, ...props }: any) => <h1 className="text-3xl font-bold mt-8 mb-4 text-foreground" {...props} />,
        h2: ({ node, ...props }: any) => <h2 className="text-2xl font-bold mt-8 mb-3 text-foreground border-b border-border pb-2" {...props} />,
        h3: ({ node, ...props }: any) => <h3 className="text-xl font-semibold mt-6 mb-2 text-foreground" {...props} />,
        h4: ({ node, ...props }: any) => <h4 className="text-lg font-semibold mt-4 mb-2 text-foreground" {...props} />,
        p: ({ node, ...props }: any) => <p className="mb-4 leading-7 text-foreground/90" {...props} />,
        ul: ({ node, ...props }: any) => <ul className="mb-4 ml-6 list-disc space-y-1.5 text-foreground/90" {...props} />,
        ol: ({ node, ...props }: any) => <ol className="mb-4 ml-6 list-decimal space-y-1.5 text-foreground/90" {...props} />,
        li: ({ node, ...props }: any) => <li className="leading-7" {...props} />,
        a: ({ node, ...props }: any) => <a className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors" {...props} />,
        blockquote: ({ node, ...props }: any) => <blockquote className="border-l-4 border-primary/40 pl-4 italic text-muted-foreground my-4" {...props} />,
        hr: ({ node, ...props }: any) => <hr className="my-8 border-border" {...props} />,
        // Code
        code: ({ node, inline, className, children, ...props }: any) => {
            const isInline = !className;
            return isInline
                ? <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground" {...props}>{children}</code>
                : <code className={className} {...props}>{children}</code>;
        },
        // A ```mermaid fence renders as a diagram, not as code. Intercepted at
        // `pre` rather than `code` because <Mermaid /> emits a <div>, which is
        // invalid inside <pre> and would break hydration.
        pre: ({ node, children, ...props }: any) => {
            const chart = mermaidSource(node);
            if (chart !== null) {
                return <Mermaid chart={chart} />;
            }
            return (
                <pre className="bg-muted rounded-lg p-4 overflow-x-auto my-4 text-sm font-mono" {...props}>
                    {children}
                </pre>
            );
        },
        // Tables
        table: ({ node, ...props }: any) => <div className="overflow-x-auto my-6"><table className="w-full border-collapse text-sm" {...props} /></div>,
        thead: ({ node, ...props }: any) => <thead className="bg-muted/60" {...props} />,
        th: ({ node, ...props }: any) => <th className="border border-border px-4 py-2 text-left font-semibold text-foreground" {...props} />,
        td: ({ node, ...props }: any) => <td className="border border-border px-4 py-2 text-foreground/90" {...props} />,
        // Custom directives — must match the directive names exactly (lowercase)
        tip: ({ node, type, title, children, ...props }: any) => <Tip type={type} title={title}>{children}</Tip>,
        solutioncard: ({ node, type, title, children, ...props }: any) => <SolutionCard type={type} title={title}>{children}</SolutionCard>,
        patterncard: ({ node, title, description, href, tags, summary }: any) => <PatternCard title={title} description={description} href={href} tags={tags} summary={summary} />,
        annotation: ({ node, children, ...props }: any) => <Annotation {...props}>{children}</Annotation>,
        accordion: ({ node, children, ...props }: any) => <Accordion {...props}>{children}</Accordion>,
        accordionitem: ({ node, children, ...props }: any) => <AccordionItem {...props}>{children}</AccordionItem>,
        accordionwrapper: ({ node, children, ...props }: any) => <AccordionWrapper {...props}>{children}</AccordionWrapper>,
        accordionitemwrapper: ({ node, children, ...props }: any) => <AccordionItemWrapper {...props}>{children}</AccordionItemWrapper>,
        contentimage: ({ node, src, alt, ...props }: any) => <ContentImage src={src} alt={alt} {...props} />,
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] bg-background overflow-hidden">
            {/* Sidebar */}
            <div className="border-r border-border h-full hidden lg:block w-64">
                <CourseSidebar course={course} currentChapterSlug={chapterSlug} />
            </div>

            {/* Main Content */}
            <ScrollableMain className="flex-1 h-full overflow-y-auto">
                <div className="max-w-3xl mx-auto px-6 py-8">
                    {/* Article Header */}
                    <ArticleHeader
                        category={chapter.section}
                        title={data.title || chapter.title}
                        tags={headerTags}
                        author={data.author || "InterviewNotes"}
                        publishedDate={data.publishedDate}
                        difficulty={data.difficulty}
                        companies={headerCompanies}
                    />

                    <div className="mb-6 flex items-center justify-between rounded-lg border border-border bg-card/40 px-4 py-3">
                        <p className="text-sm text-muted-foreground">
                            Want to sketch your design first? Open the whiteboard.
                        </p>
                        <Button asChild size="sm">
                            <Link href={`/learn/${course.slug}/${chapter.slug}/try`}>
                                Try here
                            </Link>
                        </Button>
                    </div>

                    {/* Content */}
                    <div className="markdown-content">
                        {isLocked ? (
                            <div className="py-12 text-center border border-border p-6">
                                <Lock className="h-6 w-6 mx-auto mb-3 text-foreground" />
                                <h3 className="font-semibold mb-2">Premium Content</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    {needsSignIn
                                        ? "Sign in to read this chapter."
                                        : "Subscribe to unlock this chapter."}
                                </p>
                                {needsSignIn ? (
                                    <Button asChild className="bg-foreground text-background hover:bg-foreground/90 h-8 text-sm">
                                        <Link href={`/login?redirect=/learn/${course.slug}/${chapter.slug}`}>
                                            Sign in
                                        </Link>
                                    </Button>
                                ) : (
                                    <Button className="bg-foreground text-background hover:bg-foreground/90 h-8 text-sm">
                                        Upgrade
                                    </Button>
                                )}
                            </div>
                        ) : content.trim() === "" ? (
                            <div className="py-12 text-center">
                                <p className="text-muted-foreground">Coming Soon</p>
                            </div>
                        ) : (
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkDirective, RemarkDirectivePlugin]}
                                components={components}
                            >
                                {content}
                            </ReactMarkdown>
                        )}
                    </div>

                    {/* Chapter interactions (star, mark complete, notes) */}
                    <div className="mt-12 pt-8 border-t border-border">
                        <ChapterInteractions
                            courseId={course.id}
                            chapterId={chapter.id}
                            courseSlug={course.slug}
                            nextChapterSlug={nextChapter?.slug}
                            nextChapterTitle={nextChapter?.title}
                        />
                    </div>

                    {/* Footer / Navigation */}
                    <div className="pt-4 border-t border-border">
                        <div className="flex justify-between items-center text-sm">
                            {prevChapter ? (
                                <Link href={`/learn/${course.slug}/${prevChapter.slug}`} className="text-muted-foreground hover:text-foreground">
                                    ← {prevChapter.title}
                                </Link>
                            ) : <div></div>}

                            {nextChapter ? (
                                <Link href={`/learn/${course.slug}/${nextChapter.slug}`} className="text-muted-foreground hover:text-foreground">
                                    {nextChapter.title} →
                                </Link>
                            ) : <div></div>}
                        </div>
                    </div>
                </div>
            </ScrollableMain>

            {/* Right Sidebar - TOC - Simple */}
            <div className="border-l border-border w-48 hidden xl:block p-4">
                <TableOfContents headings={headings} />
            </div>
        </div>
    );
}
