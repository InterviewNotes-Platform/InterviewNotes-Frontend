"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/layout/BrandMark";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { PageContainer } from "@/components/layout/PageContainer";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { useAuth } from "@/hooks/use-auth";
import { activeArea, PREFETCH_PRIMARY, PREMIUM_HREF, PRIMARY_NAV } from "@/lib/primary-navigation";
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
                <div className="flex min-w-0 items-center gap-6">
                    <Link href="/" className="shrink-0 whitespace-nowrap text-lg font-bold">
                        <BrandMark />
                    </Link>
                    <nav aria-label="Primary" className="hidden md:block">
                        <ul className="flex items-center">
                            {PRIMARY_NAV.map(({ area, label, href }) => (
                                <li key={label}>
                                    <Button
                                        asChild
                                        variant="ghost"
                                        className="h-9 text-sm font-medium text-foreground/70 hover:bg-muted/50 hover:text-foreground aria-[current=page]:bg-muted/50 aria-[current=page]:text-foreground"
                                    >
                                        <Link href={href} prefetch={PREFETCH_PRIMARY} aria-current={area && area === active ? "page" : undefined}>
                                            {label}
                                        </Link>
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>
                <div className="hidden shrink-0 items-center gap-2 md:flex">
                    <Button asChild variant="outline" className="h-8 border-gold/50 text-sm font-semibold text-premium hover:bg-gold/10 hover:text-premium">
                        <Link href={PREMIUM_HREF}>Premium</Link>
                    </Button>
                    <ModeToggle />
                    <AccountMenu user={user} loading={loading} onSignOut={handleSignOut} />
                </div>
                <MobileMenu active={active} user={user} loading={loading} onSignOut={handleSignOut} />
            </PageContainer>
        </header>
    );
}
