import Link from "next/link";
import { PREPARE_STORIES_HREF } from "@/app/prepare/stories/href";
import type { CollectionSummary } from "@/lib/prep/collections";
import { PREPARE_NEW_HREF } from "@/lib/primary-navigation";
import { cn } from "@/lib/utils";

/** A volume: a thin spine on its left edge, a gold rule, the title, what it holds and where it goes. Restrained: one border, no shadow. */
const VOLUME =
    "relative flex h-full min-h-47 flex-col overflow-hidden rounded-l-md rounded-r-2xl border border-border bg-card py-5 pr-5 pl-7 transition-micro " +
    "before:absolute before:inset-y-0 before:left-0 before:w-2 before:border-r before:border-border before:bg-surface " +
    "hover:border-[var(--primary-text)] focus-visible:ring-[3px] focus-visible:ring-ring/50 max-md:min-h-40";

/** The first collection is the page's default, so its link carries no parameter; every other one names itself. */
const collectionHref = (id: string, index: number) => (index === 0 ? PREPARE_NEW_HREF : `${PREPARE_NEW_HREF}?collection=${encodeURIComponent(id)}`);

/**
 * Where to begin an answer, as a shelf of volumes (P8-PREP-UX-03): each question collection, and the Story Bank as a fourth,
 * marked as the reader's own. What each holds comes from the registry alone, so this makes no request and reads no catalog.
 * It shows no count of the reader's answers: the list that would give one is only the newest page.
 */
export function Library({ collections }: { collections: readonly Pick<CollectionSummary, "id" | "title" | "summary">[] }) {
    if (collections.length === 0) return null;
    return (
        <section aria-labelledby="library-heading" className="space-y-4">
            <div>
                <h2 id="library-heading" className="mt-0 mb-1 text-subsection text-foreground">
                    Library
                </h2>
                <p className="text-supporting text-muted-foreground">Three question collections and your own Story Bank.</p>
            </div>
            <ul className="-mx-4 m-0 flex list-none snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 xl:grid-cols-4">
                {collections.map(({ id, title, summary }, index) => (
                    <li key={id} className="max-md:w-[72%] max-md:shrink-0 max-md:snap-start">
                        <Link href={collectionHref(id, index)} prefetch={false} className={VOLUME}>
                            <span className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Collection {index + 1}</span>
                            <span aria-hidden className="my-3 h-0.5 w-7 bg-gold" />
                            <span className="text-xl leading-tight font-semibold text-foreground">{title}</span>
                            <span className="mt-2 mb-4 text-supporting text-muted-foreground">{summary}</span>
                            <Open />
                        </Link>
                    </li>
                ))}
                <li className="max-md:w-[72%] max-md:shrink-0 max-md:snap-start">
                    <Link href={PREPARE_STORIES_HREF} prefetch={false} className={cn(VOLUME, "bg-surface before:bg-primary/55")}>
                        <span className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Yours</span>
                        <span aria-hidden className="my-3 h-0.5 w-7 bg-gold" />
                        <span className="text-xl leading-tight font-semibold text-foreground">A story from your Story Bank</span>
                        <span className="mt-2 mb-4 text-supporting text-muted-foreground">Pick a saved story and begin with its text.</span>
                        <Open />
                    </Link>
                </li>
            </ul>
        </section>
    );
}

function Open() {
    return (
        <span aria-hidden className="mt-auto flex justify-end border-t border-border pt-4 text-supporting font-medium text-[var(--primary-text)]">
            Open →
        </span>
    );
}
