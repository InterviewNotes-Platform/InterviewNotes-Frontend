"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AccountMenuProps {
    user: User | null;
    loading: boolean;
    onSignOut: () => void;
}

// Derive initials from name or email
function initialsOf(user: User) {
    return (user.user_metadata?.full_name as string | undefined)
        ?.split(" ")
        .map((n: string) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() ?? user.email?.[0].toUpperCase() ?? "?";
}

/** The slot has a fixed size, so resolving auth never moves the controls beside it. */
export function AccountMenu({ user, loading, onSignOut }: AccountMenuProps) {
    return (
        <div className="flex h-9 w-20 items-center justify-end">
            {loading ? null : user ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-full hover:bg-secondary" aria-label="Account menu">
                            <Avatar className="size-8 border">
                                <AvatarFallback className="bg-secondary text-supporting font-medium text-secondary-foreground">
                                    {initialsOf(user)}
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end">
                        <DropdownMenuLabel className="truncate text-supporting font-normal text-muted-foreground">
                            {user.email}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link href="/learn">Courses</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={onSignOut}>
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                <Link
                    href="/login"
                    className="inline-flex h-9 items-center rounded-md px-3 text-supporting font-medium text-muted-foreground transition-micro hover:text-foreground"
                >
                    Sign in
                </Link>
            )}
        </div>
    );
}
