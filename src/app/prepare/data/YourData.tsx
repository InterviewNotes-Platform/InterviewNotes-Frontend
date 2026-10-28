"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createPrepClient, type PrepClient } from "@/lib/prep/client";
import { PREPARE_HREF } from "@/lib/primary-navigation";
import { createClient } from "@/lib/supabase/client";
import { DeleteSection } from "./DeleteSection";
import { ExportSection, type downloadFile } from "./ExportSection";
import { TargetLevelSection } from "./TargetLevelSection";

interface Props {
    /** The API origin the browser calls; null when the environment has none. */
    apiUrl: string | null;
    /** Tests supply these; the page uses the browser's Supabase session, `fetch` and a real download. */
    getAccessToken?: () => Promise<string | null>;
    fetch?: typeof fetch;
    saveFile?: typeof downloadFile;
}

async function sessionToken(): Promise<string | null> {
    const { data } = await createClient().auth.getSession();
    return data.session?.access_token ?? null;
}

export function YourData({ apiUrl, getAccessToken = sessionToken, fetch: fetchImpl, saveFile }: Props) {
    const client: PrepClient | null = useMemo(
        () => (apiUrl ? createPrepClient({ baseUrl: apiUrl, getAccessToken, fetch: fetchImpl }) : null),
        [apiUrl, getAccessToken, fetchImpl]
    );
    // After a delete-all the target level section is mounted again, so it shows what the API now holds.
    const [epoch, setEpoch] = useState(0);

    return (
        <div className="space-y-8">
            <header className="space-y-3">
                <Link href={PREPARE_HREF} prefetch={false} className="text-supporting text-muted-foreground underline underline-offset-4 hover:text-foreground">
                    Back to your workspace
                </Link>
                <h1 className="text-section text-foreground">Your data</h1>
                <p className="max-w-reading text-body text-muted-foreground">Your preparation belongs to you: set your target level, take a copy, or delete it all.</p>
            </header>
            {!apiUrl && (
                <p role="alert" className="text-body text-foreground">
                    The preparation service is not configured for this environment.
                </p>
            )}
            <div className="grid gap-4">
                <TargetLevelSection key={epoch} client={client} />
                <ExportSection client={client} saveFile={saveFile} />
                <DeleteSection client={client} onDeleted={() => setEpoch((n) => n + 1)} />
            </div>
        </div>
    );
}
