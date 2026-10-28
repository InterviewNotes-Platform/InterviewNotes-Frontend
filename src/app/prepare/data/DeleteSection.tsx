"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { inertPage } from "@/lib/inertPage";
import type { PrepClient } from "@/lib/prep/client";
import type { DeleteAllSummary } from "@/lib/prep/types";
import { problem, SessionEnded, SLOW_NOTICE, useSlow } from "./messages";

type Attempt = { phase: "idle" } | { phase: "pending" } | { phase: "failed"; message: string } | { phase: "signin" };
type Outcome = { kind: "cancelled"; unconfirmed: boolean } | { kind: "deleted"; summary: DeleteAllSummary["deleted"] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function outcomeText(outcome: Outcome): string {
    if (outcome.kind === "cancelled") {
        return outcome.unconfirmed
            ? "The dialog was closed. We could not confirm whether the earlier deletion finished, so check your workspace."
            : "Deletion cancelled. Nothing was deleted.";
    }
    const { answers, stories, links, preference } = outcome.summary;
    if (answers + stories + links === 0 && !preference) return "The server confirmed there was nothing left to delete.";
    const parts = [plural(answers, "answer", "answers"), plural(stories, "story", "stories"), plural(links, "link", "links")];
    return `The server confirmed the deletion: ${parts.join(", ")}${preference ? " and your target level" : ""} deleted.`;
}

/** Delete-all behind a confirmation. Success is shown only from the API's own count, never from the click. */
export function DeleteSection({ client, onDeleted }: { client: PrepClient | null; onDeleted: () => void }) {
    const [open, setOpen] = useState(false);
    const [attempt, setAttempt] = useState<Attempt>({ phase: "idle" });
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    // Set when an attempt ended with no answer: the deletion may have happened. Only a confirmed answer clears it.
    const [unconfirmed, setUnconfirmed] = useState(false);
    const releasePage = useRef<() => void>(undefined);
    const cancel = useRef<HTMLButtonElement>(null);
    const pending = attempt.phase === "pending";
    const slow = useSlow(pending);

    // The page behind the dialog is inert while it is open, including its live regions (as the diagram dialog).
    function changeOpen(next: boolean) {
        if (!next && pending) return;
        releasePage.current?.();
        releasePage.current = next ? inertPage() : undefined;
        if (next) {
            setAttempt({ phase: "idle" });
            setOutcome(null);
        } else {
            setOutcome({ kind: "cancelled", unconfirmed });
        }
        setOpen(next);
    }
    useEffect(() => () => releasePage.current?.(), []);

    async function confirm() {
        if (!client || pending) return;
        setAttempt({ phase: "pending" });
        const result = await client.deleteAll();
        if (result.status === "ok") {
            releasePage.current?.();
            releasePage.current = undefined;
            setAttempt({ phase: "idle" });
            setUnconfirmed(false);
            setOutcome({ kind: "deleted", summary: result.data.deleted });
            setOpen(false);
            onDeleted();
        } else if (result.status === "unauthenticated") {
            setAttempt({ phase: "signin" });
        } else {
            // Delete-all is idempotent (contract §5.7), so asking again is safe whatever happened to an earlier attempt.
            const unknown = unconfirmed || result.status === "unavailable";
            setUnconfirmed(unknown);
            const tail = unknown ? "We cannot tell whether a deletion finished, so nothing is shown as deleted. It is safe to try again." : "Nothing was deleted.";
            setAttempt({ phase: "failed", message: `${problem(result, "the deletion")} ${tail}` });
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-subsection">Delete all my data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-body text-muted-foreground">
                    Permanently delete every answer, story, link and your target level. This cannot be undone, so export a copy first if you want one.
                </p>
                <Dialog.Root open={open} onOpenChange={changeOpen}>
                    <Dialog.Trigger asChild>
                        <Button type="button" variant="destructive" disabled={!client}>
                            Delete all my data…
                        </Button>
                    </Dialog.Trigger>
                    <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
                        <Dialog.Content
                            role="alertdialog"
                            onOpenAutoFocus={(event) => {
                                event.preventDefault();
                                cancel.current?.focus();
                            }}
                            onInteractOutside={(event) => pending && event.preventDefault()}
                            className="bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-lg border p-6 shadow-lg"
                        >
                            <Dialog.Title className="text-subsection text-foreground">Delete all your preparation data?</Dialog.Title>
                            <Dialog.Description className="text-body text-muted-foreground">
                                Every answer, story, link and your target level will be permanently deleted. This cannot be undone.
                            </Dialog.Description>
                            {pending && (
                                <p role="status" className="text-supporting text-muted-foreground">
                                    Deleting your data… {slow && SLOW_NOTICE}
                                </p>
                            )}
                            {attempt.phase === "failed" && (
                                <p role="alert" className="text-body text-foreground">
                                    {attempt.message}
                                </p>
                            )}
                            {attempt.phase === "signin" && <SessionEnded doing="delete your data" />}
                            <div className="flex flex-wrap justify-end gap-3">
                                <Button ref={cancel} type="button" variant="outline" aria-disabled={pending || undefined} onClick={() => changeOpen(false)}>
                                    Cancel
                                </Button>
                                <Button type="button" variant="destructive" aria-disabled={pending || undefined} onClick={() => void confirm()}>
                                    {attempt.phase === "failed" ? "Try deleting again" : pending ? "Deleting…" : "Delete everything"}
                                </Button>
                            </div>
                        </Dialog.Content>
                    </Dialog.Portal>
                </Dialog.Root>
                <div role="status" aria-live="polite" className="text-supporting text-muted-foreground">
                    {outcome && outcomeText(outcome)}
                </div>
            </CardContent>
        </Card>
    );
}
