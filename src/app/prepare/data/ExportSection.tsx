"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PrepClient } from "@/lib/prep/client";
import { problem, SessionEnded, SLOW_NOTICE, useSlow } from "./messages";

type Format = "json" | "markdown";
type State = { phase: "idle" } | { phase: "working"; format: Format } | { phase: "done"; message: string } | { phase: "failed"; message: string } | { phase: "signin" };

/** Hands a file to the browser's downloads. Tests replace it; nothing is stored or sent anywhere. */
export function downloadFile(name: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const LABEL: Record<Format, string> = { json: "JSON", markdown: "Markdown" };

export function ExportSection({ client, saveFile = downloadFile }: { client: PrepClient | null; saveFile?: typeof downloadFile }) {
    const [state, setState] = useState<State>({ phase: "idle" });
    const slow = useSlow(state.phase === "working");
    const working = state.phase === "working";

    async function run(format: Format) {
        if (!client || working) return;
        setState({ phase: "working", format });
        const result = format === "json" ? await client.exportJson() : await client.exportMarkdown();
        if (result.status !== "ok") {
            setState(result.status === "unauthenticated" ? { phase: "signin" } : { phase: "failed", message: `${problem(result, "your export")} Nothing was downloaded.` });
            return;
        }
        const name = `interviewnotes-prep-${new Date().toISOString().slice(0, 10)}.${format === "json" ? "json" : "md"}`;
        try {
            const { data } = result;
            saveFile(name, typeof data === "string" ? data : JSON.stringify(data, null, 2), format === "json" ? "application/json" : "text/markdown");
            const counts = typeof data === "string" ? "" : `: ${data.answers.length} answers and ${data.stories.length} stories`;
            setState({ phase: "done", message: `Your export arrived${counts}. Your browser is saving ${name}.` });
        } catch {
            setState({ phase: "failed", message: "Your export arrived, but the browser could not start the download. Try again." });
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-subsection">Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-body text-muted-foreground">
                    Download every answer, story, link and your target level. JSON can be read back by a program; Markdown is for reading.
                </p>
                <div className="flex flex-wrap gap-3">
                    {(Object.keys(LABEL) as Format[]).map((format) => (
                        <Button key={format} type="button" variant="outline" aria-disabled={working || !client || undefined} onClick={() => void run(format)}>
                            {working && state.format === format ? `Preparing ${LABEL[format]}…` : `Download ${LABEL[format]}`}
                        </Button>
                    ))}
                </div>
                <div role="status" aria-live="polite" className="text-supporting text-muted-foreground">
                    {working && `Preparing your export… ${slow ? SLOW_NOTICE : ""}`}
                    {state.phase === "done" && state.message}
                </div>
                {state.phase === "failed" && (
                    <p role="alert" className="text-body text-foreground">
                        {state.message}
                    </p>
                )}
                {state.phase === "signin" && <SessionEnded doing="export your data" />}
            </CardContent>
        </Card>
    );
}
