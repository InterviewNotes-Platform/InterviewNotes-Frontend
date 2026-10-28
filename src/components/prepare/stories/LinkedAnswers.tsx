"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PrepClient } from "@/lib/prep/client";
import { answerHref } from "@/lib/prep/links";
import type { Answer, PrepResult } from "@/lib/prep/types";

type Entry = { phase: "loading" } | { phase: "ready"; answer: Answer } | { phase: "missing" } | { phase: "failed" };

const entryOf = (result: PrepResult<Answer>): Entry => (result.status === "ok" ? { phase: "ready", answer: result.data } : result.status === "notFound" ? { phase: "missing" } : { phase: "failed" });

/**
 * The answers a story is linked to, each read from the API. A link is a relationship, not a copy: the story's text is not
 * these answers' text, and editing either leaves the other alone. A link that cannot be read says so rather than vanishing.
 */
export function LinkedAnswers({ client, answerIds }: { client: PrepClient; answerIds: string[] }) {
   const [entries, setEntries] = useState<Record<string, Entry>>({});
   const key = answerIds.join(",");

   useEffect(() => {
      let current = true;
      for (const id of answerIds) {
         client.getAnswer(id).then((result) => {
            if (current) setEntries((was) => ({ ...was, [id]: entryOf(result) }));
         });
      }
      return () => {
         current = false;
      };
      // `key` stands for the ids, which are a new array on every render of the story.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [client, key]);

   if (answerIds.length === 0) return null;
   return (
      <section aria-labelledby="linked-answers" className="space-y-3">
         <h2 id="linked-answers" className="text-subsection text-foreground">
            Linked answers
         </h2>
         <p className="text-supporting text-muted-foreground">These answers were written with this story. Each keeps its own text; editing the story does not change them.</p>
         <ul className="space-y-2">
            {answerIds.map((id) => {
               const entry = entries[id] ?? { phase: "loading" };
               return (
                  <li key={id} className="text-body text-foreground">
                     {entry.phase === "ready" ? (
                        <Link href={answerHref(id)} prefetch={false} className="inline-flex min-h-11 items-center underline underline-offset-4">
                           {entry.answer.question_snapshot}
                        </Link>
                     ) : (
                        <span className="text-muted-foreground">
                           {entry.phase === "loading" ? "Loading an answer…" : entry.phase === "missing" ? "An answer linked here could not be found." : "We could not load an answer linked here."}
                        </span>
                     )}
                  </li>
               );
            })}
         </ul>
      </section>
   );
}
