"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { answerHref } from "@/lib/prep/links";
import type { Answer, AnswerStatus } from "@/lib/prep/types";
import { cn } from "@/lib/utils";
import { groupOf, shelfOf, statusLabel, updatedOn, type CollectionLabels } from "./labels";

type StatusFilter = "all" | AnswerStatus;

const TABS: readonly (readonly [StatusFilter, string])[] = [
    ["all", "All"],
    ["draft", "Draft"],
    ["in_progress", "In progress"],
    ["ready", "Ready"],
];

interface Props {
    answers: Answer[];
    loading: boolean;
    labels: CollectionLabels;
    /** The collection titles in registry order: the shelves are listed in this order, and the reader's own questions last. */
    order: readonly string[];
    /** The title of the collection that has no groups, for the answers whose Lesson has no label. */
    general: string;
    /** Only the newest page was read, so an empty status proves nothing about older answers. */
    partial: boolean;
    onTag: (tag: string) => void;
}

/**
 * The reader's answers shelved by collection (P8-PREP-UX-03). Each row is the question as a link, then its group, its status in
 * words, its date and its tags. The status tabs only narrow the answers already loaded: they ask the server for nothing.
 */
export function ShelvedAnswers({ answers, loading, labels, order, general, partial, onTag }: Props) {
    const [status, setStatus] = useState<StatusFilter>("all");
    const heading = useId();
    if (loading) return <div aria-hidden className="h-5 w-2/3 animate-pulse rounded bg-muted" />;
    if (answers.length === 0) return <p className="text-supporting text-muted-foreground">{partial ? "No recent answers." : "No answers yet."}</p>;

    const shown = status === "all" ? answers : answers.filter((answer) => answer.status === status);
    const names = [...order, "Your own questions"];
    const shelves = new Map<string, Answer[]>();
    for (const answer of shown) {
        const name = shelfOf(answer, labels, general);
        shelves.set(name, [...(shelves.get(name) ?? []), answer]);
    }
    const listed = [...names.filter((name) => shelves.has(name)), ...[...shelves.keys()].filter((name) => !names.includes(name))];

    return (
        <div className="space-y-6">
            <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-x-5">
                {TABS.map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={status === value}
                        onClick={() => setStatus(value)}
                        className={cn(
                            "inline-flex min-h-11 items-center border-b-2 text-supporting transition-micro focus-visible:ring-[3px] focus-visible:ring-ring/50",
                            status === value ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {shown.length === 0 ? (
                <p role="status" className="text-supporting text-muted-foreground">
                    {partial ? `None of your newest answers are ${statusLabel(status as AnswerStatus).toLowerCase()}.` : `No answers are ${statusLabel(status as AnswerStatus).toLowerCase()}.`}
                </p>
            ) : (
                <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
                    {listed.map((name, shelfIndex) => (
                        <section key={name} aria-labelledby={`${heading}-${shelfIndex}`}>
                            <h3 id={`${heading}-${shelfIndex}`} className="mt-0 mb-1 flex justify-between gap-3 border-b border-foreground pb-2 text-supporting font-semibold text-muted-foreground">
                                <span>{name}</span>
                                <span>{shelves.get(name)?.length}</span>
                            </h3>
                            <ul className="m-0 list-none p-0">
                                {(shelves.get(name) ?? []).map((answer) => {
                                    const { id, question_snapshot, tags, updated_at } = answer;
                                    const group = groupOf(answer, labels);
                                    const updated = updatedOn(updated_at);
                                    return (
                                        <li key={id} className="space-y-1.5 border-b border-border py-3">
                                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
                                                <Link href={answerHref(id)} prefetch={false} className="line-clamp-3 block text-[0.9375rem] leading-snug underline-offset-4 hover:underline">
                                                    {question_snapshot}
                                                </Link>
                                                <span className="rounded-full border border-border px-2.5 py-px text-xs font-medium text-foreground">{statusLabel(answer.status)}</span>
                                            </div>
                                            {(group || updated) && (
                                                <p className="text-xs text-muted-foreground">
                                                    {group}
                                                    {group && updated && " · "}
                                                    {updated && <time dateTime={updated_at}>Updated {updated}</time>}
                                                </p>
                                            )}
                                            {tags.length > 0 && (
                                                <ul aria-label={`Tags on ${question_snapshot}`} className="m-0 flex list-none flex-wrap gap-2 p-0">
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
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
