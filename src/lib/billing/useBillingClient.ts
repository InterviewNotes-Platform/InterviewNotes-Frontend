"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { createBillingClient, type BillingClient } from "./client";

async function sessionToken(): Promise<string | null> {
   const { data } = await createClient().auth.getSession();
   return data.session?.access_token ?? null;
}

/** The browser's billing client, or the one a test supplies. Null when the build has no public API URL. */
export function useBillingClient(apiUrl: string | null, injected?: BillingClient): BillingClient | null {
   return useMemo(() => injected ?? (apiUrl ? createBillingClient({ baseUrl: apiUrl, getAccessToken: sessionToken }) : null), [apiUrl, injected]);
}
