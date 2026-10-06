"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { PageContainer } from "@/components/layout/PageContainer";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { useAuth } from "@/hooks/use-auth";
import { activeArea, PREFETCH_PRIMARY, PRIMARY_NAV } from "@/lib/primary-navigation";
import { createClient } from "@/lib/supabase/client";

// Legacy pages size themselves against this header (calc(100vh - 4rem), sticky top-16): keep h-16 + 1px border.
export function Header() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const active = activeArea(usePathname());

    const handleSignOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/");
        router.refresh();
    };

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border bg-background">
            <PageContainer className="flex h-16 items-center justify-between gap-6">
                <div className="flex min-w-0 items-center gap-6 lg:gap-8">
                    <Link href="/" className="shrink-0 whitespace-nowrap text-body font-semibold tracking-tight">
                        Interview<span className="text-primary">Notes</span>
                    </Link>
                    <nav aria-label="Primary" className="hidden md:block">
                        <ul className="flex items-center">
                            {PRIMARY_NAV.map(({ area, label, href }) => (
                                <li key={area}>
                                    <Link
                                        href={href}
                                        prefetch={PREFETCH_PRIMARY}
                                        aria-current={area === active ? "page" : undefined}
                                        className="relative flex h-16 items-center px-3 text-supporting font-medium text-muted-foreground transition-micro -outline-offset-2 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-transparent after:transition-micro hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:after:bg-foreground"
                                    >
                                        {label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>
                <div className="-mr-2 hidden items-center md:flex">
                    <AccountMenu user={user} loading={loading} onSignOut={handleSignOut} />
                    <ModeToggle />
                </div>
                <MobileMenu active={active} user={user} loading={loading} onSignOut={handleSignOut} />
            </PageContainer>
        </header>
    );
}
