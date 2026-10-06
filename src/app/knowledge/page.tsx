import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogStateNotice } from "@/app/_catalog/CatalogStateNotice";
import { PreviewMarker, withPreviewRobots } from "@/app/_catalog/PreviewMarker";
import { DiscoveryCard } from "@/components/catalog/DiscoveryCard";
import { PremiumMark } from "@/components/catalog/EntryRow";
import { CardTopics, KnowledgeCategories, TopicPager, TopicTags } from "@/components/catalog/KnowledgeBrowse";
import { PageContainer } from "@/components/layout/PageContainer";
import { categoryLabel, explorerHref, parseExplorerQuery, topicsOf } from "@/lib/catalog/knowledge";
import { linkableEntries } from "@/lib/catalog/routes";
import { loadTopics } from "@/lib/catalog/topics";

// The topic list comes from the catalog at request time and is never built or cached statically.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
   return withPreviewRobots({
      title: "Knowledge | InterviewNotes",
      description: "Reusable explanations of the concepts, technologies and patterns behind ML systems, each linked to the Lessons and Problems that use it.",
   });
}

interface PageProps {
   searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function NoTopics({ browsing }: { browsing: boolean }) {
   return (
      <div role="status" className="rounded-lg bg-surface px-6 py-12 text-center">
         <p className="m-0 text-body text-muted-foreground">
            {browsing ? "No topics match this selection." : "No Knowledge is published yet. Please check back soon."}
         </p>
      </div>
   );
}

// Topics are public metadata and never gated, so this route sends no session and makes one list read per page of topics.
export default async function KnowledgeExplorerPage({ searchParams }: PageProps) {
   const query = parseExplorerQuery(await searchParams);
   const result = await loadTopics(query);
   if (result.status === "notFound") notFound();

   const topics = result.status === "ok" ? linkableEntries(result.data.items) : [];
   const narrowed = Boolean(query.group || query.tag);

   return (
      <>
         <PreviewMarker />
         <PageContainer as="main" className="py-12 md:py-20">
            <header className="max-w-2xl">
               <h1 className="m-0 text-title text-balance">Knowledge, ready when you need it.</h1>
               <p className="mt-4 mb-0 text-body text-pretty text-muted-foreground">
                  Concepts, technologies, patterns and quick references for ML interviews and system design. Each topic gives you the short version
                  first, goes deeper when you want it, and links to the Lessons and Problems that use it.
               </p>
            </header>
            <div className="mt-10 md:mt-14">
               <KnowledgeCategories current={query.group} />
            </div>
            <section aria-labelledby="topics-heading" className="mt-12 md:mt-16">
               <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <h2 id="topics-heading" className="m-0 text-section">
                     {query.group?.label ?? "All topics"}
                  </h2>
                  {narrowed ? (
                     <Link href={explorerHref()} prefetch={false} className="text-supporting text-primary underline underline-offset-4">
                        Show all topics
                     </Link>
                  ) : null}
               </div>
               {result.status === "ok" ? <TopicTags tags={topicsOf(result.data.items)} query={query} /> : null}
               <div className="mt-8">
                  {result.status !== "ok" ? (
                     <CatalogStateNotice state={result.status} />
                  ) : topics.length === 0 ? (
                     <NoTopics browsing={narrowed || query.cursor !== null} />
                  ) : (
                     <ul role="list" className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
                        {topics.map(({ entry, href }) => {
                           const label = categoryLabel(entry.category);
                           const premium = entry.access === "premium";
                           return (
                              <li key={entry.id}>
                                 <DiscoveryCard
                                    title={entry.title}
                                    summary={entry.summary}
                                    href={href}
                                    cue="Read topic"
                                    meta={entry.tags.length > 0 ? <CardTopics tags={entry.tags} /> : undefined}
                                    eyebrow={
                                       <>
                                          {label ? <span>{label}</span> : null}
                                          {premium ? <PremiumMark /> : null}
                                       </>
                                    }
                                 />
                              </li>
                           );
                        })}
                     </ul>
                  )}
               </div>
               {result.status === "ok" ? <TopicPager query={query} next={result.data.next_cursor} /> : null}
            </section>
         </PageContainer>
      </>
   );
}
