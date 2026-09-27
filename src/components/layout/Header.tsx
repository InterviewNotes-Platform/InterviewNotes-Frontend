"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu, X, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { CourseIcon } from "@/components/course-icon";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

export function Header() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const { user, loading } = useAuth();
    const router = useRouter();

    const handleSignOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/");
        router.refresh();
    };

    const closeOnEscape = (event: React.KeyboardEvent) => {
        if (!mobileMenuOpen || event.key !== "Escape") return;
        setMobileMenuOpen(false);
        menuButtonRef.current?.focus();
    };

    // Derive initials from name or email
    const initials = user
        ? (user.user_metadata?.full_name as string | undefined)
            ?.split(" ")
            .map((n: string) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() ?? user.email?.[0].toUpperCase() ?? "?"
        : "?";

    const courseItems = [
        { title: "ML System Design", href: "/learn/ml-system-design", icon: "BarChart2" },
        { title: "ML Platform Design", href: "/learn/ml-platform-design", icon: "Cpu" },
        { title: "LLM Platform Design", href: "/learn/llm-platform-design", icon: "Zap" },
        { title: "Gen AI Foundations", href: "/learn/gen-ai-foundations", icon: "BookOpen" },
        { title: "Gen AI Native Design", href: "/learn/gen-ai-native-design", icon: "BrainCircuit" },
    ];

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border bg-background" onKeyDown={closeOnEscape}>
            <div className="w-full max-w-[1400px] mx-auto flex h-16 items-center justify-between px-6 md:px-8">

                {/* Left Section: Logo & Nav */}
                <div className="flex items-center gap-6">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2 flex-shrink-0 group">
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold">
                                <span className="text-[var(--primary)]">Interview</span><span className="text-[var(--gold)]">Notes</span>
                            </span>
                        </div>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="text-foreground/70 hover:text-foreground hover:bg-muted/50 font-medium gap-1 text-sm h-9 transition-all">
                                    Courses <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-72 bg-popover border-border p-2">
                                {courseItems.map((item) => (
                                    <DropdownMenuItem key={item.title} asChild>
                                        <Link
                                            href={item.href}
                                            className="flex items-center gap-3 cursor-pointer py-2"
                                        >
                                            <CourseIcon name={item.icon} className="h-4 w-4 text-primary" />
                                            <span className="font-medium">{item.title}</span>
                                        </Link>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button asChild variant="ghost" className="text-foreground/70 hover:text-foreground hover:bg-muted/50 font-medium text-sm h-9 transition-all">
                            <Link href="/#access">Access</Link>
                        </Button>
                        <Button asChild variant="ghost" className="text-foreground/70 hover:text-foreground hover:bg-muted/50 font-medium text-sm h-9 transition-all">
                            <Link href="/#faq">FAQ</Link>
                        </Button>
                    </nav>
                </div>

                {/* Right Section: Actions */}
                <div className="hidden md:flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        {!loading && user ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="relative h-9 w-9 rounded-full" aria-label="Account menu">
                                        <Avatar className="h-9 w-9 border border-border">
                                            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                                                {initials}
                                            </AvatarFallback>
                                        </Avatar>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-56 bg-popover border-border" align="end">
                                    <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">
                                        {user.email}
                                    </div>
                                    <DropdownMenuSeparator className="bg-border" />
                                    <DropdownMenuItem
                                        className="text-red-500 focus:text-red-500 cursor-pointer"
                                        onClick={handleSignOut}
                                    >
                                        Log out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div className="flex items-center gap-2">
                                <ModeToggle />
                                <Button asChild className="bg-foreground text-background hover:bg-foreground/90 h-8 text-sm">
                                    <Link href="/login">Sign In</Link>
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Mobile Menu Button */}
                <Button
                    ref={menuButtonRef}
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    aria-label="Menu"
                    aria-expanded={mobileMenuOpen}
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                    {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </Button>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div className="md:hidden border-t border-border bg-background">
                    <nav className="container mx-auto px-6 py-4 space-y-4">
                        <div className="font-semibold text-sm text-muted-foreground px-2 mb-2">Courses</div>
                        {courseItems.map((item) => (
                            <Link
                                key={item.title}
                                href={item.href}
                                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                <CourseIcon name={item.icon} className="h-5 w-5 text-primary" />
                                <div className="font-medium text-foreground">{item.title}</div>
                            </Link>
                        ))}

                        <div className="pt-4 border-t border-border space-y-3 px-2">
                            <Button asChild variant="ghost" className="w-full justify-start text-foreground">
                                <Link href="/#access" onClick={() => setMobileMenuOpen(false)}>Access</Link>
                            </Button>
                            <Button asChild variant="ghost" className="w-full justify-start text-foreground">
                                <Link href="/#faq" onClick={() => setMobileMenuOpen(false)}>FAQ</Link>
                            </Button>
                            <Button asChild className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm">
                                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>Login</Link>
                            </Button>
                        </div>
                    </nav>
                </div>
            )}
        </header>
    );
}
