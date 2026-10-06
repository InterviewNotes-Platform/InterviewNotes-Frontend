"use client";

import Link from "next/link";
import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ui/mode-toggle";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { PREFETCH_PRIMARY, PRIMARY_NAV, type NavArea } from "@/lib/primary-navigation";
import { cn } from "@/lib/utils";

interface MobileMenuProps {
    active: NavArea | null;
    user: User | null;
    loading: boolean;
    onSignOut: () => void;
}

// Radix skips links when choosing initial focus, which would land on the theme toggle at the bottom.
function focusFirstDestination(event: Event) {
    event.preventDefault();
    (event.target as HTMLElement).querySelector<HTMLElement>("nav a")?.focus();
}

const accountRow = "flex min-h-11 w-full items-center text-body text-foreground transition-micro hover:text-muted-foreground";

export function MobileMenu({ active, user, loading, onSignOut }: MobileMenuProps) {
    const [open, setOpen] = useState(false);
    const close = () => setOpen(false);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menu" className="-mr-3 size-11 hover:bg-secondary md:hidden">
                    <Menu className="size-6" />
                </Button>
            </SheetTrigger>
            <SheetContent
                className="gap-0 data-[state=closed]:duration-150 data-[state=open]:duration-200"
                onOpenAutoFocus={focusFirstDestination}
            >
                <SheetHeader className="h-16 justify-center border-b px-6 py-0">
                    <SheetTitle className="text-supporting font-medium text-muted-foreground">Menu</SheetTitle>
                    <SheetDescription className="sr-only">Primary navigation, account and theme</SheetDescription>
                </SheetHeader>
                <nav aria-label="Primary" className="px-6 py-4">
                    <ul>
                        {PRIMARY_NAV.map(({ area, label, href }) => (
                            <li key={area}>
                                <Link
                                    href={href}
                                    prefetch={PREFETCH_PRIMARY}
                                    onClick={close}
                                    aria-current={area === active ? "page" : undefined}
                                    className={cn(
                                        "flex min-h-12 items-center border-l-2 border-transparent pl-4 text-subsection text-muted-foreground transition-micro hover:text-foreground",
                                        "aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
                                    )}
                                >
                                    {label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
                <div className="mt-auto border-t px-6 py-3">
                    {loading ? null : user ? (
                        <>
                            <p className="truncate py-2 text-supporting text-muted-foreground">{user.email}</p>
                            <Link href="/learn" onClick={close} className={accountRow}>Courses</Link>
                            <button
                                type="button"
                                onClick={() => { close(); onSignOut(); }}
                                className={cn(accountRow, "text-destructive hover:text-destructive/80")}
                            >
                                Log out
                            </button>
                        </>
                    ) : (
                        <Link href="/login" onClick={close} className={accountRow}>Sign in</Link>
                    )}
                </div>
                <div className="flex items-center justify-between border-t px-6 py-3">
                    <span className="text-supporting text-muted-foreground">Theme</span>
                    <ModeToggle className="-mr-2 size-11" />
                </div>
            </SheetContent>
        </Sheet>
    );
}
