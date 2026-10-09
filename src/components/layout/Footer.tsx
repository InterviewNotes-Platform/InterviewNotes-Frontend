import Link from "next/link";
import { BrandMark } from "@/components/layout/BrandMark";

export function Footer() {
    return (
        <footer className="border-t border-border/40 bg-gradient-to-b from-background to-primary/[0.03]">
            <div className="container mx-auto px-6 md:px-8 py-14">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    {/* Brand */}
                    <div className="md:col-span-1">
                        <Link href="/" className="flex items-center gap-2 mb-4">
                            <span className="text-lg font-bold">
                                <BrandMark />
                            </span>
                        </Link>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Ace your tech interviews — from System Design and ML to LLD and beyond.
                        </p>
                    </div>

                    {/* Learning */}
                    <div>
                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Learning Paths</h3>
                        <ul className="space-y-2.5 text-sm text-muted-foreground">
                            <li>
                                <Link href="/learn/gen-ai-native-design" className="hover:text-[var(--gold)] transition-colors">
                                    Gen AI Native Design
                                </Link>
                            </li>
                            <li>
                                <Link href="/learn/ml-system-design" className="hover:text-[var(--gold)] transition-colors">
                                    ML System Design
                                </Link>
                            </li>
                            <li>
                                <Link href="/learn/ml-platform-design" className="hover:text-[var(--gold)] transition-colors">
                                    ML Platform Design
                                </Link>
                            </li>
                            <li>
                                <Link href="/learn" className="hover:text-[var(--gold)] transition-colors">
                                    All courses
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-border/30 flex flex-col md:flex-row items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                        © {new Date().getFullYear()} InterviewNotes. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
}
