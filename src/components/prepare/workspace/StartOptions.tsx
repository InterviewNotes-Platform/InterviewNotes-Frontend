import Link from "next/link";
import { PREPARE_STORIES_HREF } from "@/app/prepare/stories/href";
import type { CollectionSummary } from "@/lib/prep/collections";
import { PREPARE_NEW_HREF } from "@/lib/primary-navigation";

const TILE =
    "flex h-full min-h-11 flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-micro hover:border-[var(--primary-text)] focus-visible:ring-[3px] focus-visible:ring-ring/50 md:p-5";

/** The first collection is the page's default, so its link carries no parameter; every other one names itself. */
const collectionHref = (id: string, index: number) => (index === 0 ? PREPARE_NEW_HREF : `${PREPARE_NEW_HREF}?collection=${encodeURIComponent(id)}`);

/**
 * Where to begin an answer: each question collection, and the Story Bank. Counts come from the registry alone, so this
 * section makes no request and reads no catalog.
 */
export function StartOptions({ collections }: { collections: readonly Pick<CollectionSummary, "id" | "title" | "summary">[] }) {
    if (collections.length === 0) return null;
    return (
        <section aria-labelledby="start-heading">
            <h2 id="start-heading" className="mt-0 mb-3 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Choose where to start
            </h2>
            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
                {collections.map(({ id, title, summary }, index) => (
                    <li key={id}>
                        <Link href={collectionHref(id, index)} prefetch={false} className={TILE}>
                            <span className="text-body font-semibold text-foreground">{title}</span>
                            <span className="text-supporting text-muted-foreground">{summary}</span>
                        </Link>
                    </li>
                ))}
                <li>
                    <Link href={PREPARE_STORIES_HREF} prefetch={false} className={TILE}>
                        <span className="text-body font-semibold text-foreground">A story from your Story Bank</span>
                        <span className="text-supporting text-muted-foreground">Pick a saved story and begin with its text.</span>
                    </Link>
                </li>
            </ul>
        </section>
    );
}
