import Link from "next/link";
import type { ReactNode } from "react";
import { PREPARE_DATA_HREF } from "@/app/prepare/data/href";
import { PREPARE_STORIES_HREF } from "@/app/prepare/stories/href";
import { PageContainer } from "@/components/layout/PageContainer";
import { PREPARE_HREF } from "@/lib/primary-navigation";
import { cn } from "@/lib/utils";
import "./prepare-frame.css";

export type PrepareSection = "answers" | "stories" | "data";

const SECTIONS: readonly { id: PrepareSection; label: string; href: string }[] = [
    { id: "answers", label: "Your answers", href: PREPARE_HREF },
    { id: "stories", label: "Story Bank", href: PREPARE_STORIES_HREF },
    { id: "data", label: "Your data", href: PREPARE_DATA_HREF },
];

/**
 * The shared frame of the Prepare workspace pages: Prepare's own warm scope (`[data-prepare]`, not the reader's), the page's
 * `main`, and a section nav to routes that already exist. It adds no behavior of its own.
 */
export function PrepareFrame({ section, children }: { section: PrepareSection; children: ReactNode }) {
    return (
        <div data-prepare className="min-h-[calc(100vh-4rem)]">
            <PageContainer as="main" className="py-8 md:py-12">
                <nav aria-label="Preparation sections" className="mb-8 border-b border-border">
                    <ul className="-mb-px flex flex-wrap gap-x-6">
                        {SECTIONS.map(({ id, label, href }) => (
                            <li key={id}>
                                <Link
                                    href={href}
                                    prefetch={false}
                                    aria-current={section === id ? "page" : undefined}
                                    className={cn(
                                        "inline-flex min-h-11 items-center border-b-2 text-body font-medium underline-offset-4 hover:text-foreground",
                                        section === id ? "border-[var(--primary-text)] text-foreground" : "border-transparent text-muted-foreground"
                                    )}
                                >
                                    {label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
                {children}
            </PageContainer>
        </div>
    );
}
