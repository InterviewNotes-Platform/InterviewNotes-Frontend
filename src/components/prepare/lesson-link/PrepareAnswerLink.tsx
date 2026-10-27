"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { newAnswerHref } from "@/lib/prep/links";
import { createClient } from "@/lib/supabase/client";

const SignedIn = createContext(false);

/**
 * Whether the browser holds a Supabase session, read once for every "Prepare your answer" link in a Lesson. It starts
 * false, so the server-rendered Lesson and a signed-out reader's Lesson are the same markup. The session is only read,
 * never stored or sent: the links are ordinary links, and the reader keeps no state of its own (P7-T3 note on `P6-R-071`).
 */
export function PrepareLinkSession({ children }: { children: ReactNode }) {
   const [signedIn, setSignedIn] = useState(false);

   useEffect(() => {
      let unsubscribe: (() => void) | null = null;
      try {
         const supabase = createClient();
         supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)), () => setSignedIn(false));
         const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
         unsubscribe = () => data.subscription.unsubscribe();
      } catch {
         // No usable Supabase client: the reader stays signed out and no link is shown.
      }
      return () => unsubscribe?.();
   }, []);

   return <SignedIn.Provider value={signedIn}>{children}</SignedIn.Provider>;
}

interface Props {
   contentId: string;
   questionId: string;
   /** The question section's own heading, so each link has a name of its own. */
   heading: string;
}

/** Renders nothing for a signed-out reader. Never prefetched: opening the picker reads the catalog. */
export function PrepareAnswerLink({ contentId, questionId, heading }: Props) {
   if (!useContext(SignedIn)) return null;
   return (
      <p className="-mt-2 mb-5 text-supporting">
         <Link
            href={newAnswerHref({ content_id: contentId, question_id: questionId })}
            prefetch={false}
            aria-label={`Prepare your answer: ${heading}`}
            className="inline-flex min-h-11 items-center text-primary underline underline-offset-4 decoration-primary/40 transition-micro hover:decoration-primary"
         >
            Prepare your answer
         </Link>
      </p>
   );
}
