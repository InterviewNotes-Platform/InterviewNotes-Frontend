"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { useSessionOwner, type SessionOwner } from "@/hooks/use-session-owner";
import { createPracticeClient, type PracticeClient } from "@/lib/practice-workspace/client";
import { createClient } from "@/lib/supabase/client";

/**
 * What a screen under the gate may use: a client bound to the signed-in user who opened it, and a signal that ends when that
 * session ends (sign-out, another user, unmount). Every request a screen makes carries the signal, so a reply that arrives
 * after the session changed is never applied to the next one (P9-T13, session isolation).
 */
export interface PracticeSession {
   client: PracticeClient;
   signal: AbortSignal;
   /** The user the session belongs to; null when signed out or when the caller injected a token provider without an identity (tests). */
   owner: string | null;
}

export const PracticeSessionContext = createContext<PracticeSession | null>(null);

export function usePracticeSession(): PracticeSession {
   const session = useContext(PracticeSessionContext);
   if (!session) throw new Error("usePracticeSession needs a PracticeGate above it");
   return session;
}

/**
 * Follows the signed-in user and counts changes of user: a screen keyed by `generation` starts again from nothing for the next user, in the
 * render that sees the change. A token refresh for the same user changes nothing. `owner` is undefined until the session is first known.
 */
export function useKeyedSession(given?: SessionOwner): { generation: number; owner: SessionOwner } {
   const followed = useSessionOwner();
   const owner = given !== undefined ? given : followed;
   const [seen, setSeen] = useState<{ owner: SessionOwner; generation: number }>({ owner: undefined, generation: 0 });
   if (owner !== undefined && owner !== seen.owner) setSeen({ owner, generation: seen.owner === undefined ? seen.generation : seen.generation + 1 });
   return seen;
}

/** The token of the session that opened the screen, and only of that session: another user's token is never sent for this user's work. */
function sessionTokenFor(owner: string | null): () => Promise<string | null> {
   return async () => {
      const { data } = await createClient().auth.getSession();
      if (!data.session || (owner !== null && data.session.user.id !== owner)) return null;
      return data.session.access_token ?? null;
   };
}

export interface BindingConfig {
   apiUrl: string | null;
   getAccessToken?: () => Promise<string | null>;
   fetch?: typeof fetch;
   owner: string | null;
}

/**
 * The life of one screen's requests: a controller that is aborted when the screen goes away. A store, so that StrictMode's cleanup-then-setup
 * of the same instance gets a fresh controller instead of a signal that stays aborted (a signal made once at render would).
 */
function createLifetime() {
   let controller = new AbortController();
   return {
      subscribe(notify: () => void) {
         if (controller.signal.aborted) {
            controller = new AbortController();
            notify();
         }
         return () => controller.abort();
      },
      get: () => controller,
   };
}

/**
 * A client and a signal for one signed-in user, with the signal ending when the screen using it does. Null when no API is set.
 */
export function useBoundPractice({ apiUrl, getAccessToken, fetch: fetchImpl, owner }: BindingConfig): PracticeSession | null {
   const tokenProvider = useMemo(() => getAccessToken ?? sessionTokenFor(owner), [getAccessToken, owner]);
   const client = useMemo(() => (apiUrl ? createPracticeClient({ baseUrl: apiUrl, getAccessToken: tokenProvider, fetch: fetchImpl }) : null), [apiUrl, tokenProvider, fetchImpl]);
   const [lifetime] = useState(createLifetime);
   const controller = useSyncExternalStore(lifetime.subscribe, lifetime.get, lifetime.get);
   return useMemo(() => (client ? { client, signal: controller.signal, owner } : null), [client, controller, owner]);
}
