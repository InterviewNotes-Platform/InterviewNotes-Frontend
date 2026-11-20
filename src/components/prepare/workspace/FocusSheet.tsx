import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { answerHref } from "@/lib/prep/links";
import type { Answer } from "@/lib/prep/types";
import { PREPARE_NEW_HREF } from "@/lib/primary-navigation";
import { updatedOn } from "./labels";

/** What the workspace knows of the reader's most recent unfinished answer, read from the unfiltered list only. */
export type Focus = { answer: Answer | null; empty: boolean; partial: boolean };

const KICKER = "m-0 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase";

const STEPS = [
    ["Choose a question", "from a collection, or write your own."],
    ["Write your answer.", "It saves as you go."],
    ["Mark it Ready", "when you would be happy to say it out loud."],
] as const;

interface Props {
    /** Undefined until the first unfiltered list has been read. */
    focus: Focus | undefined;
    /** Where the where-line of a company answer comes from; null for any other answer. */
    where: string | null;
    /** The first-read state (loading, sign-in, failure), shown here because there is nothing to pick up yet. */
    children?: ReactNode;
}

/**
 * The Desk's one next action (P8-PREP-UX-02): the latest unfinished answer with a Continue link, or, when there is none,
 * how to begin. It only presents what the list already returned; it makes no request of its own.
 */
export function FocusSheet({ focus, where, children }: Props) {
    const answer = focus?.answer ?? null;
    const first = focus !== undefined && focus.empty;
    const done = focus !== undefined && !focus.empty && answer === null;
    const heading = first ? "Write your first answer" : done ? (focus.partial ? "Nothing recent to pick up" : "Everything you started is Ready") : "Pick up where you left off";
    const updated = answer ? updatedOn(answer.updated_at) : null;
    return (
        <section aria-labelledby="focus-heading" className="rounded-2xl border border-border bg-card p-6 md:p-9">
            <div aria-hidden className="mb-5 h-0.5 w-8 bg-gold" />
            <p className={KICKER}>{first ? "Start here" : "Your workspace"}</p>
            <h2 id="focus-heading" className="mt-2 mb-0 text-subsection text-foreground">
                {heading}
            </h2>

            {answer && (
                <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-supporting text-muted-foreground">
                        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground">{answer.status === "draft" ? "Draft" : "In progress"}</span>
                        {updated && <time dateTime={answer.updated_at}>Updated {updated}</time>}
                    </div>
                    {where && <p className="text-supporting text-muted-foreground">{where}</p>}
                    <p className="line-clamp-5 max-w-[40ch] text-pretty text-xl leading-snug font-semibold text-foreground md:text-2xl">{answer.question_snapshot}</p>
                </div>
            )}

            {first && (
                <ol className="mt-4 grid max-w-[56ch] list-none gap-3 p-0">
                    {STEPS.map(([lead, rest], index) => (
                        <li key={lead} className="grid grid-cols-[1.75rem_1fr] gap-2 text-body text-muted-foreground">
                            <span aria-hidden className="pt-0.5 text-supporting font-semibold text-[var(--primary-text)]">
                                {index + 1}
                            </span>
                            <span>
                                <b className="font-semibold text-foreground">{lead}</b> {rest}
                            </span>
                        </li>
                    ))}
                </ol>
            )}

            {done && (
                <p className="mt-4 max-w-[56ch] text-body text-muted-foreground">
                    {focus.partial ? "Your newest answers are all marked Ready. Pick another question, or open an answer from the list." : "Pick another question, or open an answer from the list to keep improving it."}
                </p>
            )}

            {children && <div className="mt-4 space-y-3">{children}</div>}

            <div className="mt-6 flex flex-wrap items-center gap-3">
                {answer && (
                    <Button asChild size="lg">
                        <Link href={answerHref(answer.id)} prefetch={false} aria-label={`Continue writing: ${answer.question_snapshot}`}>
                            Continue writing
                        </Link>
                    </Button>
                )}
                <Button asChild size="lg" variant={answer ? "outline" : "default"}>
                    <Link href={PREPARE_NEW_HREF} prefetch={false}>
                        Answer a question
                    </Link>
                </Button>
            </div>
        </section>
    );
}
