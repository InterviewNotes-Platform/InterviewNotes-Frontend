"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** The signed-in user's id, null when signed out, undefined until the session is known. */
export type SessionOwner = string | null | undefined;

/** Follows the session from the browser client's auth events only, so it adds no request of its own. */
export function useSessionOwner(): SessionOwner {
    const [owner, setOwner] = useState<SessionOwner>(undefined);
    useEffect(() => {
        try {
            const { data } = createClient().auth.onAuthStateChange((_event, session) => setOwner(session?.user.id ?? null));
            return () => data.subscription.unsubscribe();
        } catch {
            // No auth client (as in tests): the session stays unknown and nothing is ever reset.
        }
    }, []);
    return owner;
}

/**
 * Counts changes of session: it stays at 0 until the session is first known, then goes up by one each time the user signs out,
 * signs in or is another user. A token refresh or a repeated sign-in event for the same user changes nothing. Used as a `key`,
 * so a screen that shows one user's data starts again from nothing for the next, in the render that sees the change.
 */
export function useSessionGeneration(): number {
    const owner = useSessionOwner();
    const [seen, setSeen] = useState<{ owner: SessionOwner; generation: number }>({ owner: undefined, generation: 0 });
    if (owner !== undefined && owner !== seen.owner) setSeen({ owner, generation: seen.owner === undefined ? seen.generation : seen.generation + 1 });
    return seen.generation;
}
