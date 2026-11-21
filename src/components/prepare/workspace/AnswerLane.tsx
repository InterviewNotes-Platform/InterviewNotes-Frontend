import Link from "next/link";
import { Button } from "@/components/ui/button";
import { answerHref } from "@/lib/prep/links";
import type { Answer } from "@/lib/prep/types";
import { updatedOn, whereOf, type CollectionLabels } from "./labels";

interface Props {
    title: string;
    loading: boolean;
    answers: Answer[];
    labels: CollectionLabels;
    empty: string;
    onTag: (tag: string) => void;
}

/** One status lane of the answers panel. A row is the question as a link, then its collection, status, date and tags. */
export function AnswerLane({ title, loading, answers, labels, empty, onTag }: Props) {
    return (
        <section>
            <h3 className="mt-0 mb-3 text-supporting font-semibold text-foreground">{title}</h3>
            {loading ? (
                <div aria-hidden className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            ) : answers.length === 0 ? (
                <p className="text-supporting text-muted-foreground">{empty}</p>
            ) : (
                <ul className="m-0 list-none space-y-4 p-0 text-body text-foreground">
                    {answers.map((answer) => {
                        const { id, question_snapshot, tags, status, updated_at } = answer;
                        const where = whereOf(answer, labels);
                        const updated = updatedOn(updated_at);
                        return (
                            <li key={id} className="space-y-1.5 border-t border-border pt-4 first:border-t-0 first:pt-0">
                                <Link href={answerHref(id)} prefetch={false} className="line-clamp-3 block text-[0.9375rem] leading-snug underline-offset-4 hover:underline">
                                    {question_snapshot}
                                </Link>
                                {where && <p className="text-supporting text-muted-foreground">{where}</p>}
                                {(status === "draft" || updated) && (
                                    <div className="flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground">
                                        {status === "draft" && <span className="rounded-full border border-border px-2 py-px font-medium text-foreground">Draft</span>}
                                        {updated && <time dateTime={updated_at}>Updated {updated}</time>}
                                    </div>
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
            )}
        </section>
    );
}
