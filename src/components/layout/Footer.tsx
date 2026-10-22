import Link from "next/link";
import { BrandMark } from "@/components/layout/BrandMark";
import { PRIMARY_NAV } from "@/lib/primary-navigation";

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
                            Prepare for ML and AI engineering interviews: ML system design, LLM platform design and GenAI.
                        </p>
                    </div>

                    {/* Explore: the same four destinations as the header */}
                    <div>
                        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Explore</h3>
                        <ul className="space-y-2.5 text-sm text-muted-foreground">
                            {PRIMARY_NAV.map(({ label, href }) => (
                                <li key={href}>
                                    <Link href={href} prefetch={false} className="hover:text-[var(--gold)] transition-colors">
                                        {label}
                                    </Link>
                                </li>
                            ))}
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
