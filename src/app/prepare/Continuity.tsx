"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { itemStateAvailable } from "@/components/prepare/reader/itemStateAvailable";
import { catalogHref } from "@/lib/catalog/routes";
import type { PrepClient } from "@/lib/prep/client";
import type { ItemState, Page, PrepResult } from "@/lib/prep/types";
import type { ItemTitles } from "./itemTitles";

/** The contract's default page (§15.5). One page of Recent is enough to find the newest item that can be named. */
const RECENT_LIMIT = 50;
const BOOKMARK_PAGE = 20;

type Load =
    | { phase: "loading" }
    | { phase: "failed" }
    | { phase: "hidden" }
    /** `consumed` counts the API rows read so far, which may exceed the unique `items` when pages overlap. */
    | { phase: "ready"; items: ItemState[]; total: number; consumed: number };

type Row = { id: string; href: string; kind: "Lesson" | "Problem"; label: string };

interface Props {
    apiUrl: string;
    client: PrepClient;
    /** Public titles by item id, or null when the catalog could not be read in full. */
    titles: ItemTitles | null;
}

/** An item the catalog still names, with its route; null when the id has no route or the catalog no longer lists it (I-1). */
function nameOf({ content_id: id }: ItemState, titles: ItemTitles | null): Row | null {
    const href = catalogHref(id);
    const kind = id.startsWith("lesson.") ? "Lesson" : id.startsWith("problem.") ? "Problem" : null;
    if (!href || !kind) return null;
    if (!titles) return { id, href, kind, label: `${kind} (title unavailable)` };
    return titles[id] === undefined ? null : { id, href, kind, label: titles[id] };
}

/** A 401 or 404 on a list means the session or the gate went away: the sections hide rather than report an error. */
function settle(result: PrepResult<Page<ItemState>>): Load {
    if (result.status === "ok") return { phase: "ready", items: result.data.items, total: result.data.total, consumed: result.data.items.length };
    return result.status === "unauthenticated" || result.status === "notFound" ? { phase: "hidden" } : { phase: "failed" };
}

export function Continuity({ apiUrl, client, titles }: Props) {
    const [available, setAvailable] = useState(false);
    const [recent, setRecent] = useState<Load>({ phase: "loading" });
    const [bookmarks, setBookmarks] = useState<Load>({ phase: "loading" });
    const [moreState, setMoreState] = useState<"idle" | "loading" | "failed">("idle");
    const [recentTry, setRecentTry] = useState(0);
    const [bookmarkTry, setBookmarkTry] = useState(0);
    const generation = useRef(0);

    useEffect(() => {
        let live = true;
        void itemStateAvailable(apiUrl, client).then((on) => {
            if (live) setAvailable(on);
        });
        return () => {
            live = false;
        };
    }, [apiUrl, client]);

    useEffect(() => {
        if (!available) return;
        let live = true;
        void client.getRecent({ limit: RECENT_LIMIT }).then((result) => {
            if (live) setRecent(settle(result));
        });
        return () => {
            live = false;
        };
    }, [available, client, recentTry]);

    useEffect(() => {
        if (!available) return;
        let live = true;
        generation.current += 1;
        void client.getBookmarks({ limit: BOOKMARK_PAGE }).then((result) => {
            if (!live) return;
            setMoreState("idle");
            setBookmarks(settle(result));
        });
        return () => {
            live = false;
        };
    }, [available, client, bookmarkTry]);

    const retryRecent = useCallback(() => {
        setRecent({ phase: "loading" });
        setRecentTry((n) => n + 1);
    }, []);
    const retryBookmarks = useCallback(() => {
        setBookmarks({ phase: "loading" });
        setBookmarkTry((n) => n + 1);
    }, []);

    /** The next page, from the number of API rows already read; a row that arrives twice is kept once. */
    async function showMore() {
        if (bookmarks.phase !== "ready" || moreState === "loading") return;
        const asked = generation.current;
        const { items: held, consumed } = bookmarks;
        setMoreState("loading");
        const result = await client.getBookmarks({ limit: BOOKMARK_PAGE, offset: consumed });
        if (asked !== generation.current) return;
        if (result.status !== "ok") {
            const gone = result.status === "unauthenticated" || result.status === "notFound";
            if (gone) setBookmarks({ phase: "hidden" });
            setMoreState(gone ? "idle" : "failed");
            return;
        }
        const fresh = result.data.items.filter(({ content_id }) => !held.some((have) => have.content_id === content_id));
        setBookmarks({ phase: "ready", items: [...held, ...fresh], total: result.data.total, consumed: consumed + result.data.items.length });
        setMoreState("idle");
    }

    if (!available || (recent.phase === "hidden" && bookmarks.phase === "hidden")) return null;

    const next = recent.phase === "ready" ? recent.items.map((item) => nameOf(item, titles)).find((row) => row !== null) : undefined;
    const marked = bookmarks.phase === "ready" ? bookmarks.items.flatMap((item) => nameOf(item, titles) ?? []) : [];
    const more = bookmarks.phase === "ready" && bookmarks.consumed < bookmarks.total;

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {recent.phase !== "hidden" && (
                <Panel id="continue-heading" title="Continue">
                    {recent.phase === "loading" && <Pending />}
                    {recent.phase === "failed" && <Failure message="We could not load where you left off." label="Try again to load Continue" onRetry={retryRecent} />}
                    {recent.phase === "ready" &&
                        (next ? (
                            <RowLink row={next} />
                        ) : (
                            <p className="text-supporting text-muted-foreground">
                                {recent.items.length > 0 ? "No available recently opened Lessons or Problems." : "Nothing to continue yet. A Lesson or Problem you open will appear here."}
                            </p>
                        ))}
                </Panel>
            )}
            {bookmarks.phase !== "hidden" && (
                <Panel id="bookmarks-heading" title="Bookmarks">
                    {bookmarks.phase === "loading" && <Pending />}
                    {bookmarks.phase === "failed" && <Failure message="We could not load your bookmarks." label="Try again to load bookmarks" onRetry={retryBookmarks} />}
                    {bookmarks.phase === "ready" && marked.length === 0 && (
                        <p className="text-supporting text-muted-foreground">
                            {bookmarks.items.length === 0
                                ? "No bookmarks yet. Bookmark a Lesson or Problem while you read and it will appear here."
                                : more
                                  ? "None of the bookmarks loaded so far are available."
                                  : "No available bookmarked Lessons or Problems."}
                        </p>
                    )}
                    {marked.length > 0 && (
                        <ul className="space-y-3">
                            {marked.map((row) => (
                                <li key={row.id}>
                                    <RowLink row={row} />
                                </li>
                            ))}
                        </ul>
                    )}
                    {bookmarks.phase === "ready" && moreState === "failed" && (
                        <p role="alert" className="text-body text-foreground">
                            We could not load more bookmarks. Nothing on this page was lost; try again.
                        </p>
                    )}
                    {more && (
                        <Button type="button" variant="outline" aria-disabled={moreState === "loading" || undefined} onClick={() => void showMore()}>
                            {moreState === "loading" ? "Loading more…" : "Show more bookmarks"}
                        </Button>
                    )}
                </Panel>
            )}
        </div>
    );
}

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    return (
        <section aria-labelledby={id}>
            <Card className="h-full">
                <CardHeader>
                    <CardTitle className="text-subsection">
                        <h2 id={id}>{title}</h2>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">{children}</CardContent>
            </Card>
        </section>
    );
}

function Pending() {
    return (
        <p role="status" className="text-supporting text-muted-foreground">
            Loading…
        </p>
    );
}

function Failure({ message, label, onRetry }: { message: string; label: string; onRetry: () => void }) {
    return (
        <div role="alert" className="space-y-3">
            <p className="text-body text-foreground">{message}</p>
            <Button type="button" variant="outline" aria-label={label} onClick={onRetry}>
                Try again
            </Button>
        </div>
    );
}

function RowLink({ row }: { row: Row }) {
    return (
        <div className="space-y-1">
            <Link href={row.href} prefetch={false} className="line-clamp-2 block text-body text-foreground underline-offset-4 hover:underline">
                {row.label}
            </Link>
            <p className="text-supporting text-muted-foreground">{row.kind}</p>
        </div>
    );
}
