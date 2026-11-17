"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthCard, GoogleIcon } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { authCallbackUrl } from "@/lib/auth-redirect";
import { PRIVACY_HREF } from "@/lib/privacy";

export default function SignupPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        setFailed(false);
        try {
            const supabase = createClient();
            const redirect = new URLSearchParams(window.location.search).get("redirect");
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: authCallbackUrl(window.location.origin, redirect),
                },
            });
            if (error) throw error;
        } catch {
            setFailed(true);
            setIsLoading(false);
        }
    };

    return (
        <AuthCard title="Create Account" description="Start your journey to mastering tech interviews">
            {failed && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-300 text-center bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">
                    We could not start sign-up. Please try again.
                </p>
            )}

            <Button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                aria-busy={isLoading || undefined}
                className="w-full h-11 bg-foreground text-background hover:bg-foreground/90 font-semibold"
            >
                <GoogleIcon />
                {isLoading ? "Redirecting..." : "Sign up with Google"}
            </Button>

            <p className="text-center text-xs text-muted-foreground pt-2">
                Already have an account?{" "}
                <Link href="/login" className="text-primary hover:underline font-medium">
                    Sign in
                </Link>
            </p>

            <p className="text-center text-xs text-muted-foreground">
                By creating an account you agree to our <span>Terms of Service</span> and{" "}
                <Link href={PRIVACY_HREF} className="underline hover:text-foreground">Privacy Policy</Link>
            </p>
        </AuthCard>
    );
}
