"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPrepClient } from "@/lib/prep/client";
import { answerHref } from "@/lib/prep/links";
import type { Answer, PrepResult } from "@/lib/prep/types";
import { PREPARE_HREF, PREPARE_NEW_HREF } from "@/lib/primary-navigation";
import { createClient } from "@/lib/supabase/client";

/** After this long the loading state also says the wait is longer than usual (a cold start, P7-D-010). */
export const SLOW_NOTICE_MS = 4000;

/** The API's largest page; more answers are read with `offset`, never by asking for a bigger page. */
const PAGE = 100;
const SEARCH_MAX = 200;

type State =
    | { phase: "loading" }
    | { phase: "ready"; answers: Answer[]; total: number }
    | { phase: "signin" }
    | { phase: "failed"; message: string };

type Filter = { q: string; tags: string[] };

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
    const [typed, setTyped] = useState("");
    const [filter, setFilter] = useState<Filter>({ q: "", tags: [] });
    const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");
    const [paged, setPaged] = useState(false);
    const latest = useRef(filter);
    const countRef = useRef<HTMLParagraphElement>(null);
    const focusCount = useRef(false);
    const client = useMemo(
        () => (apiUrl ? createPrepClient({ baseUrl: apiUrl, getAccessToken, fetch: fetchImpl }) : null),
        [apiUrl, getAccessToken, fetchImpl]
    );

    useEffect(() => {
        if (!client) return;
        let current = true;
        const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS);
        client.listAnswers({ q: filter.q, tag: filter.tags, limit: PAGE }).then((result) => {
            if (!current) return;
            clearTimeout(timer);
            setSlow(false);
            setState(settle(result));
        });
        return () => {
            current = false;
            clearTimeout(timer);
        };
    }, [client, attempt, filter]);

    useEffect(() => {
        latest.current = filter;
        if (focusCount.current) countRef.current?.focus();
        focusCount.current = false;
    });

    const retry = useCallback(() => {
        setState({ phase: "loading" });
        setAttempt((n) => n + 1);
    }, []);

    function apply(next: Filter) {
        setFilter(next);
        setMore("idle");
        setPaged(false);
        setState({ phase: "loading" });
    }

    function search(event: FormEvent) {
        event.preventDefault();
        apply({ ...filter, q: typed.trim() });
    }

    const filtered = filter.q !== "" || filter.tags.length > 0;
    const clear = () => {
        setTyped("");
        apply({ q: "", tags: [] });
    };
    const addTag = (tag: string) => !filter.tags.includes(tag) && apply({ ...filter, tags: [...filter.tags, tag] });

    /** The next page of the same search. A page that arrives after the search changed is dropped. */
    async function showMore() {
        if (!client || state.phase !== "ready" || more === "loading") return;
        const asked = filter;
        setMore("loading");
        const result = await client.listAnswers({ q: asked.q, tag: asked.tags, limit: PAGE, offset: state.answers.length });
        if (latest.current !== asked) return;
        if (result.status === "ok") {
            const { items, total } = result.data;
            const answers = [...state.answers, ...items.filter(({ id }) => !state.answers.some((have) => have.id === id))];
            focusCount.current = answers.length >= total;
            setState({ phase: "ready", answers, total });
            setPaged(true);
            setMore("idle");
        } else if (result.status === "unauthenticated") {
            setState({ phase: "signin" });
            setMore("idle");
        } else {
            setMore("failed");
        }
    }

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

            <form role="search" onSubmit={search} className="flex flex-wrap items-end gap-3">
                <div className="grid min-w-64 flex-1 gap-1.5">
                    <Label htmlFor="answer-search">Search answers</Label>
                    <Input id="answer-search" type="search" value={typed} maxLength={SEARCH_MAX} disabled={!client} onChange={(event) => setTyped(event.target.value)} />
                </div>
                <Button type="submit" size="lg" disabled={!client}>
                    Search
                </Button>
                {filtered && (
                    <Button type="button" variant="outline" size="lg" onClick={clear}>
                        Clear search and filters
                    </Button>
                )}
            </form>

            {filter.tags.length > 0 && (
                <ul aria-label="Tag filters" className="flex flex-wrap gap-2">
                    {filter.tags.map((tag) => (
                        <li key={tag}>
                            <Button type="button" variant="secondary" size="sm" aria-label={`Remove filter ${tag}`} onClick={() => apply({ ...filter, tags: filter.tags.filter((other) => other !== tag) })}>
                                {tag} ✕
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

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

            {state.phase === "ready" && filtered && state.answers.length === 0 ? (
                <div role="status" className="space-y-3">
                    <p className="text-body text-foreground">No answers match your search or filters.</p>
                    <Button variant="outline" onClick={clear}>
                        Clear search and filters
                    </Button>
                </div>
            ) : (
                (state.phase === "loading" || state.phase === "ready") && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <Section title="In progress" loading={state.phase === "loading"} answers={inProgress} onTag={addTag} empty={partial ? "No recent answers in progress." : "No answers in progress."} />
                        <Section title="Ready" loading={state.phase === "loading"} answers={ready} onTag={addTag} empty={partial ? "No recent answers marked ready." : "No answers marked ready."} />
                    </div>
                )
            )}
            {state.phase === "ready" && state.answers.length > 0 && (partial || filtered || paged) && (
                <div className="space-y-3">
                    <p ref={countRef} tabIndex={-1} role="status" className="text-supporting text-muted-foreground">
                        {countText(state.answers.length, state.total, filtered)}
                    </p>
                    {more === "failed" && (
                        <p role="alert" className="text-body text-foreground">
                            We could not load more answers. Nothing on this page was lost; try again.
                        </p>
                    )}
                    {partial && (
                        <Button type="button" variant="outline" aria-disabled={more === "loading" || undefined} onClick={() => void showMore()}>
                            {more === "loading" ? "Loading more…" : "Show more answers"}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}

function countText(shown: number, total: number, filtered: boolean): string {
    if (shown < total) return `Showing ${shown} of ${total} answers${filtered ? " that match" : ""}.`;
    const noun = total === 1 ? "answer" : "answers";
    return filtered ? `${total} ${noun} ${total === 1 ? "matches" : "match"}.` : `${total} ${noun}.`;
}

function Section({ title, loading, answers, empty, onTag }: { title: string; loading: boolean; answers: Answer[]; empty: string; onTag: (tag: string) => void }) {
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
                        {answers.map(({ id, question_snapshot, tags }) => (
                            <li key={id} className="space-y-1">
                                <Link href={answerHref(id)} prefetch={false} className="line-clamp-2 block underline-offset-4 hover:underline">
                                    {question_snapshot}
                                </Link>
                                {tags.length > 0 && (
                                    <ul aria-label={`Tags on ${question_snapshot}`} className="flex flex-wrap gap-2">
                                        {tags.map((tag) => (
                                            <li key={tag}>
                                                <Button type="button" variant="outline" size="sm" aria-label={`Filter by tag ${tag}`} onClick={() => onTag(tag)}>
                                                    {tag}
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
