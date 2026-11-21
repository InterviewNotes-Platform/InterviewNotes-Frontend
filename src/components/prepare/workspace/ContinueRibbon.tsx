import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { answerHref } from "@/lib/prep/links";
import type { Answer } from "@/lib/prep/types";
import { PREPARE_NEW_HREF } from "@/lib/primary-navigation";
import { statusLabel, updatedOn } from "./labels";

/** What the workspace knows of the reader's most recent unfinished answer, read from the unfiltered list only. */
export type Focus = { answer: Answer | null; empty: boolean; partial: boolean };

const KICKER = "m-0 text-xs font-semibold tracking-[0.12em] text-[var(--primary-text)] uppercase";

interface Props {
    /** Undefined until the first unfiltered list has been read. */
    focus: Focus | undefined;
    /** Where the where-line of a company answer comes from; null for any other answer. */
    where: string | null;
    /** The first-read state (loading, sign-in, failure), shown here because there is nothing to pick up yet. */
    children?: ReactNode;
}

/**
 * The Shelf's one line above the library (P8-PREP-UX-03): the latest unfinished answer with a Continue link, or, when there
 * is none, one honest line about where to begin. It only presents what the list already returned and makes no request.
 */
export function ContinueRibbon({ focus, where, children }: Props) {
    const answer = focus?.answer ?? null;
    const first = focus !== undefined && focus.empty;
    const done = focus !== undefined && !focus.empty && answer === null;
    const updated = answer ? updatedOn(answer.updated_at) : null;

    if (answer) {
        return (
            <section aria-labelledby="ribbon-heading" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card py-3.5 pr-3.5 pl-4 md:pl-5">
                <h2 id="ribbon-heading" className={KICKER}>
                    Continue
                </h2>
                <div className="col-start-1 min-w-0">
                    <p className="line-clamp-2 text-body font-medium text-foreground md:truncate">{answer.question_snapshot}</p>
                    <p className="text-supporting text-muted-foreground">
                        {[where, statusLabel(answer.status), updated && `Updated ${updated}`].filter(Boolean).join(" · ")}
                    </p>
                </div>
                <Button asChild size="lg" className="col-start-2 row-span-2 row-start-1">
                    <Link href={answerHref(answer.id)} prefetch={false} aria-label={`Continue writing: ${answer.question_snapshot}`}>
                        Continue writing
                    </Link>
                </Button>
            </section>
        );
    }

    return (
        <section aria-labelledby="ribbon-heading" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-border bg-card px-4 py-4 md:px-5">
            <div className="min-w-0 space-y-1">
                <h2 id="ribbon-heading" className={KICKER}>
                    {first ? "Start here" : "Your workspace"}
                </h2>
                <p className="text-body text-foreground">
                    {focus === undefined
                        ? "Your most recent unfinished answer appears here."
                        : first
                          ? "Open a collection below to choose your first question, or write your own."
                          : done
                            ? focus.partial
                              ? "Your newest answers are all marked Ready. Pick another question, or open an answer from the list."
                              : "Everything you started is Ready. Pick another question, or open an answer to keep improving it."
                            : "Open a collection below to choose a question."}
                </p>
                {children && <div className="space-y-3">{children}</div>}
            </div>
            <Button asChild size="lg" variant="outline">
                <Link href={PREPARE_NEW_HREF} prefetch={false}>
                    Answer a question
                </Link>
            </Button>
        </section>
    );
}
