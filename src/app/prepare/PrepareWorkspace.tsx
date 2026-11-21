"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContinueRibbon, type Focus } from "@/components/prepare/workspace/ContinueRibbon";
import { Library } from "@/components/prepare/workspace/Library";
import { ShelvedAnswers } from "@/components/prepare/workspace/ShelvedAnswers";
import { whereOf, type CollectionLabels } from "@/components/prepare/workspace/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CollectionSummary } from "@/lib/prep/collections";
import { createPrepClient } from "@/lib/prep/client";
import type { Answer, PrepResult } from "@/lib/prep/types";
import { PREPARE_HREF } from "@/lib/primary-navigation";
import { createClient } from "@/lib/supabase/client";
import { useSessionGeneration } from "@/hooks/use-session-owner";
import { Continuity } from "./Continuity";
import type { ItemTitles } from "./itemTitles";

/** After this long the loading state also says the wait is longer than usual (a cold start, P7-D-010). */
export const SLOW_NOTICE_MS = 4000;

export type { CollectionLabels };

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
    /** Keyed by a company Lesson's `content_id`; an answer of any other Lesson shows no collection or group. */
    labels?: CollectionLabels;
    /** Each collection's title and counts for the start section, from the registry; none means the section is not shown. */
    collections?: readonly Pick<CollectionSummary, "id" | "title" | "summary">[];
    /** Public Lesson and Problem titles for the Continue card and bookmarks; null when the catalog could not be read in full. */
    titles?: ItemTitles | null;
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

/**
 * The workspace of whoever is signed in now. A change of session (signing out, signing in, another user) starts it again from
 * nothing, so no answer, question or Continue link of the last session is read again, and the new session's data is fetched.
 */
export function PrepareWorkspace(props: Props) {
    return <Workspace key={useSessionGeneration()} {...props} />;
}

function Workspace({ apiUrl, labels = {}, collections = [], titles = null, getAccessToken = sessionToken, fetch: fetchImpl }: Props) {
    const [state, setState] = useState<State>(apiUrl ? { phase: "loading" } : { phase: "failed", message: "The preparation service is not configured for this environment." });
    const [slow, setSlow] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [typed, setTyped] = useState("");
    const [filter, setFilter] = useState<Filter>({ q: "", tags: [] });
    const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");
    // What Continue offers comes from the unfiltered list only, so searching the answers never changes it.
    const [focus, setFocus] = useState<Focus | undefined>(undefined);
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
            if (result.status === "ok" && filter.q === "" && filter.tags.length === 0) {
                const { items, total } = result.data;
                setFocus({ answer: items.find(({ status }) => status !== "ready") ?? null, empty: total === 0, partial: total > items.length });
            } else if (result.status === "unauthenticated" || result.status === "notFound") {
                // The session ended or the workspace is no longer this reader's to open: what was read before is not shown again.
                setFocus(undefined);
            }
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
            setFocus(undefined);
            setMore("idle");
        } else {
            setMore("failed");
        }
    }

    const answers = state.phase === "ready" ? state.answers : [];
    // Only the latest page is read, so an empty section proves nothing about older answers.
    const partial = state.phase === "ready" && state.total > state.answers.length;

    // The first read has no answers to pick up from yet, so its loading, sign-in and failure states sit in the focus sheet;
    // after that they belong to the list they describe. Only one of the two places is ever used.
    // The sheet shows what the list could show: when the session has ended there is nothing of it to offer.
    const snapshot = state.phase === "signin" ? undefined : focus;
    const initial = snapshot === undefined;
    const notice = (
        <>
            {state.phase === "ready" && snapshot === undefined && (
                <p className="text-body text-muted-foreground">Clear the search to see your most recent unfinished answer.</p>
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
        </>
    );
    const pickUp = snapshot?.answer ?? null;

    return (
        <div className="space-y-10">
            <header className="flex max-w-2xl flex-col items-start gap-3">
                <p className="m-0 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Behavioral interview prep</p>
                <h1 className="m-0 text-title text-balance text-foreground">Prepare</h1>
                <p className="text-body text-pretty text-muted-foreground">Choose a question, write your answer, and pick up where you left off.</p>
            </header>

            <ContinueRibbon focus={snapshot} where={pickUp ? whereOf(pickUp, labels) : null}>
                {initial && notice}
            </ContinueRibbon>

            <Library collections={collections} />

            <section aria-labelledby="answers-heading" className="space-y-5">
                <div>
                    <h2 id="answers-heading" className="mt-0 mb-1 text-subsection text-foreground">
                        Your answers
                    </h2>
                    <p className="text-supporting text-muted-foreground">Shelved by collection.</p>
                </div>

                <form role="search" onSubmit={search} className="flex max-w-2xl flex-wrap items-end gap-3">
                    <div className="grid min-w-56 flex-1 gap-1.5">
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
                    <ul aria-label="Tag filters" className="m-0 flex list-none flex-wrap gap-2 p-0">
                        {filter.tags.map((tag) => (
                            <li key={tag}>
                                <Button type="button" variant="secondary" size="sm" aria-label={`Remove filter ${tag}`} onClick={() => apply({ ...filter, tags: filter.tags.filter((other) => other !== tag) })}>
                                    {tag} ✕
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}

                {!initial && notice}

                {state.phase === "ready" && filtered && state.answers.length === 0 ? (
                    <div role="status" className="space-y-3">
                        <p className="text-body text-foreground">No answers match your search or filters.</p>
                        <Button variant="outline" onClick={clear}>
                            Clear search and filters
                        </Button>
                    </div>
                ) : (
                    (state.phase === "loading" || state.phase === "ready") && (
                        <ShelvedAnswers
                            // A new search or tag set starts the status tabs again, so a tab never hides the results of a new search.
                            key={`${filter.q}|${filter.tags.join(",")}`}
                            answers={answers}
                            loading={state.phase === "loading"}
                            labels={labels}
                            order={collections.map(({ title }) => title)}
                            general={collections.find(({ id }) => id === "behavioral")?.title ?? "General Behavioral"}
                            partial={partial}
                            onTag={addTag}
                        />
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
            </section>

            {apiUrl && client && <Continuity apiUrl={apiUrl} client={client} titles={titles} />}
        </div>
    );
}

function countText(shown: number, total: number, filtered: boolean): string {
    if (shown < total) return `Showing ${shown} of ${total} answers${filtered ? " that match" : ""}.`;
    const noun = total === 1 ? "answer" : "answers";
    return filtered ? `${total} ${noun} ${total === 1 ? "matches" : "match"}.` : `${total} ${noun}.`;
}
