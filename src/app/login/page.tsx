"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthCard, GoogleIcon } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { authCallbackUrl } from "@/lib/auth-redirect";
import { PRIVACY_HREF } from "@/lib/privacy";

// What the page says for each `?error=` it knows; nothing from the URL or the provider is ever shown.
const ERROR_TEXT = new Map([
    ["auth_failed", "Sign-in failed. Please try again."],
    ["auth_config_missing", "Sign-in is not available right now. Please try again later."],
    ["start_failed", "We could not start sign-in. Please try again."],
]);

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setError(params.get("error"));
    }, []);

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const supabase = createClient();
            const redirect = new URLSearchParams(window.location.search).get("redirect");
            const { error: startError } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: authCallbackUrl(window.location.origin, redirect),
                },
            });
            if (startError) throw startError;
            // Browser will redirect — no need to setIsLoading(false)
        } catch {
            setError("start_failed");
            setIsLoading(false);
        }
    };

    const message = (error && ERROR_TEXT.get(error)) || null;

    return (
        <AuthCard title="Welcome Back" description="Sign in to continue your learning journey">
            {message && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-300 text-center bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">
                    {message}
                </p>
            )}

            <Button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                aria-busy={isLoading || undefined}
                className="w-full h-11 bg-foreground text-background hover:bg-foreground/90 font-semibold"
            >
                <GoogleIcon />
                {isLoading ? "Redirecting..." : "Continue with Google"}
            </Button>

            <p className="text-center text-xs text-muted-foreground pt-2">
                Don&apos;t have an account? Google sign-in creates one automatically.
            </p>

            <p className="text-center text-xs text-muted-foreground">
                By signing in you agree to our <span>Terms of Service</span> and{" "}
                <Link href={PRIVACY_HREF} className="underline hover:text-foreground">Privacy Policy</Link>
            </p>
        </AuthCard>
    );
}
