"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPrepClient } from "@/lib/prep/client";
import type { Answer, PrepResult } from "@/lib/prep/types";
import { PREPARE_HREF, PREPARE_NEW_HREF } from "@/lib/primary-navigation";
import { createClient } from "@/lib/supabase/client";

/** After this long the loading state also says the wait is longer than usual (a cold start, P7-D-010). */
export const SLOW_NOTICE_MS = 4000;

const FIRST_PAGE = 100;

type State =
    | { phase: "loading" }
    | { phase: "ready"; answers: Answer[]; total: number }
    | { phase: "signin" }
    | { phase: "failed"; message: string };

interface Props {
    /** The API origin the browser calls; null when the environment has none. */
    apiUrl: string | null;
    /** Tests supply these; the page uses the browser's Supabase session and `fetch`. */
    getAccessToken?: () => Promise<string | null>;
    fetch?: typeof fetch;
}

async function sessionToken(): Promise<string | null> {
    const { data } = await createClient().auth.getSession();
    return data.session?.access_token ?? null;
}

function settle(result: PrepResult<{ items: Answer[]; total: number }>): State {
    switch (result.status) {
        case "ok":
            return { phase: "ready", answers: result.data.items, total: result.data.total };
        case "unauthenticated":
            return { phase: "signin" };
        case "notFound":
            return { phase: "failed", message: "The preparation workspace is not available right now." };
        case "unavailable":
            return {
                phase: "failed",
                message: result.cause === "timeout" ? "The server took too long to answer." : "We could not reach the preparation service.",
            };
        default:
            return { phase: "failed", message: "The preparation service sent a response we could not use." };
    }
}

export function PrepareWorkspace({ apiUrl, getAccessToken = sessionToken, fetch: fetchImpl }: Props) {
    const [state, setState] = useState<State>(apiUrl ? { phase: "loading" } : { phase: "failed", message: "The preparation service is not configured for this environment." });
    const [slow, setSlow] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const client = useMemo(
        () => (apiUrl ? createPrepClient({ baseUrl: apiUrl, getAccessToken, fetch: fetchImpl }) : null),
        [apiUrl, getAccessToken, fetchImpl]
    );

    useEffect(() => {
        if (!client) return;
        let current = true;
        const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS);
        client.listAnswers({ limit: FIRST_PAGE }).then((result) => {
            if (!current) return;
            clearTimeout(timer);
            setSlow(false);
            setState(settle(result));
        });
        return () => {
            current = false;
            clearTimeout(timer);
        };
    }, [client, attempt]);

    const retry = useCallback(() => {
        setState({ phase: "loading" });
        setAttempt((n) => n + 1);
    }, []);

    const answers = state.phase === "ready" ? state.answers : [];
    const inProgress = answers.filter(({ status }) => status !== "ready");
    const ready = answers.filter(({ status }) => status === "ready");
    // Only the latest page is read, so an empty section proves nothing about older answers.
    const partial = state.phase === "ready" && state.total > state.answers.length;

    return (
        <div className="space-y-8">
            <header className="space-y-4">
                <h1 className="text-section text-foreground">Prepare your answers</h1>
                <div className="flex flex-wrap items-center gap-3">
                    <Button asChild size="lg">
                        <Link href={PREPARE_NEW_HREF} prefetch={false}>
                            Answer a question
                        </Link>
                    </Button>
                </div>
            </header>

            {state.phase === "loading" && (
                <p role="status" className="text-body text-muted-foreground">
                    Loading your workspace…
                    {slow && " This is taking longer than usual, which can happen after a period of inactivity. Please keep this page open."}
                </p>
            )}
            {state.phase === "signin" && (
                <div role="alert" className="space-y-3">
                    <p className="text-body text-foreground">Your session has ended. Sign in again to open your workspace.</p>
                    <Button asChild>
                        <Link href={`/login?redirect=${encodeURIComponent(PREPARE_HREF)}`}>Sign in</Link>
                    </Button>
                </div>
            )}
            {state.phase === "failed" && (
                <div role="alert" className="space-y-3">
                    <p className="text-body text-foreground">{state.message}</p>
                    {apiUrl && (
                        <Button variant="outline" onClick={retry}>
                            Try again
                        </Button>
                    )}
                </div>
            )}

            {(state.phase === "loading" || state.phase === "ready") && (
                <div className="grid gap-4 md:grid-cols-2">
                    <Section title="In progress" loading={state.phase === "loading"} answers={inProgress} empty={partial ? "No recent answers in progress." : "No answers in progress."} />
                    <Section title="Ready" loading={state.phase === "loading"} answers={ready} empty={partial ? "No recent answers marked ready." : "No answers marked ready."} />
                </div>
            )}
            {state.phase === "ready" && state.total > state.answers.length && (
                <p className="text-supporting text-muted-foreground">
                    Showing the latest {state.answers.length} of {state.total} answers; older ones are not listed here.
                </p>
            )}
        </div>
    );
}

function Section({ title, loading, answers, empty }: { title: string; loading: boolean; answers: Answer[]; empty: string }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-subsection">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div aria-hidden className="h-5 w-2/3 animate-pulse rounded bg-muted" />
                ) : answers.length === 0 ? (
                    <p className="text-supporting text-muted-foreground">{empty}</p>
                ) : (
                    <ul className="space-y-2 text-body text-foreground">
                        {answers.map(({ id, question_snapshot }) => (
                            <li key={id} className="line-clamp-2">
                                {question_snapshot}
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
