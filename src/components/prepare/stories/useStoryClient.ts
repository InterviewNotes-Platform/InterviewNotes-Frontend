"use client";

import { useMemo } from "react";
import { createPrepClient, type PrepClient } from "@/lib/prep/client";
import { createClient } from "@/lib/supabase/client";

/** Props every Story Bank screen takes. Tests supply the token reader and `fetch`; the pages use the browser's session. */
export interface StoryApiProps {
   /** The API origin the browser calls; null when the environment has none. */
   apiUrl: string | null;
   getAccessToken?: () => Promise<string | null>;
   fetch?: typeof fetch;
}

async function sessionToken(): Promise<string | null> {
   const { data } = await createClient().auth.getSession();
   return data.session?.access_token ?? null;
}

export function useStoryClient({ apiUrl, getAccessToken = sessionToken, fetch: fetchImpl }: StoryApiProps): PrepClient | null {
   return useMemo(() => (apiUrl ? createPrepClient({ baseUrl: apiUrl, getAccessToken, fetch: fetchImpl }) : null), [apiUrl, getAccessToken, fetchImpl]);
}
