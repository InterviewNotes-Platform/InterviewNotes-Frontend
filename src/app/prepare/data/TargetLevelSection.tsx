"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SaveStatus, type SaveState } from "@/components/ui/save-status";
import type { PrepClient } from "@/lib/prep/client";
import { asTargetLevel, levelLabel, TARGET_LEVELS } from "@/lib/prep/levels";
import type { Preference, TargetLevel } from "@/lib/prep/types";
import { problem, SessionEnded, SLOW_NOTICE, useSlow } from "./messages";

type Load = { phase: "loading" } | { phase: "ready"; saved: Preference } | { phase: "failed"; message: string } | { phase: "signin" };
type Save = { state: SaveState; message?: string; signin?: boolean };

const SELECT =
    "border-input h-11 w-full max-w-xs rounded-md border bg-transparent px-3 text-base shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm dark:bg-input/30";

const choiceOf = (preference: Preference): TargetLevel | "" => asTargetLevel(preference.target_level) ?? "";
const describe = (choice: TargetLevel | "") => (choice === "" ? "no target level" : levelLabel(choice));

/** The one saved target level (contract §5.4). The question picker reads the same value as its starting level. */
export function TargetLevelSection({ client }: { client: PrepClient | null }) {
    const [load, setLoad] = useState<Load>(client ? { phase: "loading" } : { phase: "failed", message: "The preparation service is not configured for this environment." });
    const [attempt, setAttempt] = useState(0);
    const [draft, setDraft] = useState<TargetLevel | "">("");
    const [save, setSave] = useState<Save>({ state: "idle" });
    const slow = useSlow(load.phase === "loading" || save.state === "saving");

    useEffect(() => {
        if (!client) return;
        let current = true;
        client.getPreference().then((result) => {
            if (!current) return;
            if (result.status === "ok") {
                setLoad({ phase: "ready", saved: result.data });
                setDraft(choiceOf(result.data));
            } else {
                setLoad(result.status === "unauthenticated" ? { phase: "signin" } : { phase: "failed", message: problem(result, "loading your target level") });
            }
        });
        return () => {
            current = false;
        };
    }, [client, attempt]);

    const saved = load.phase === "ready" ? choiceOf(load.saved) : "";
    const dirty = load.phase === "ready" && draft !== saved;
    const saving = save.state === "saving";
    // "Saved" is shown only for a result the API confirmed; an edit after it is unsaved again.
    const shown: Save = save.state === "saving" || save.state === "error" ? save : dirty ? { state: "unsaved" } : save;

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!client || load.phase !== "ready" || saving || !dirty) return;
        setSave({ state: "saving" });
        const result = await client.updatePreference({ target_level: draft === "" ? null : draft, version: load.saved.version });
        if (result.status === "ok") {
            setLoad({ phase: "ready", saved: result.data });
            setSave({ state: "saved", message: `Saved: ${describe(choiceOf(result.data))}.` });
        } else if (result.status === "conflict" || (result.status === "unavailable" && result.cause !== "malformed")) {
            await reread(result.status === "conflict");
        } else if (result.status === "unauthenticated") {
            setSave({ state: "error", signin: true });
        } else {
            setSave({ state: "error", message: `${problem(result, "saving")} Your choice was not saved.` });
        }
    }

    /** After a version conflict or a write with an unknown outcome the API is read again; what it says decides. */
    async function reread(conflict: boolean) {
        const latest = await client!.getPreference();
        if (latest.status !== "ok") {
            setSave({ state: "error", message: "We could not confirm whether your choice was saved. Try Save again." });
            return;
        }
        setLoad({ phase: "ready", saved: latest.data });
        if (choiceOf(latest.data) === draft) {
            setSave({ state: "saved", message: `Saved: ${describe(draft)}.` });
        } else {
            setSave({
                state: "error",
                message: conflict
                    ? `Your target level was changed elsewhere and is now ${describe(choiceOf(latest.data))}. Your choice is kept here: Save to replace it.`
                    : "Your choice was not saved. Try Save again.",
            });
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-subsection">Target level</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {load.phase === "loading" && (
                    <p role="status" className="text-body text-muted-foreground">
                        Loading your target level…{slow && ` ${SLOW_NOTICE}`}
                    </p>
                )}
                {load.phase === "signin" && <SessionEnded doing="change your target level" />}
                {load.phase === "failed" && (
                    <div role="alert" className="space-y-3">
                        <p className="text-body text-foreground">{load.message}</p>
                        {client && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setLoad({ phase: "loading" });
                                    setAttempt((n) => n + 1);
                                }}
                            >
                                Try again
                            </Button>
                        )}
                    </div>
                )}
                {load.phase === "ready" && (
                    <form onSubmit={submit} className="space-y-4" noValidate>
                        <Field label="Target level" description="The level you are preparing for. The question picker starts on it; you can still choose another there.">
                            <select
                                value={draft}
                                disabled={saving}
                                onChange={(event) => {
                                    if (saving) return;
                                    setDraft(asTargetLevel(event.target.value) ?? "");
                                    setSave({ state: "idle" });
                                }}
                                className={SELECT}
                            >
                                <option value="">No target level</option>
                                {TARGET_LEVELS.map(({ value, label }) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <div className="flex flex-wrap items-center gap-4">
                            <Button type="submit" aria-disabled={!dirty || saving || undefined} className="aria-disabled:pointer-events-none aria-disabled:opacity-50">
                                Save target level
                            </Button>
                            <SaveStatus status={shown.state} message={shown.state === "saving" && slow ? `Saving… ${SLOW_NOTICE}` : shown.message} />
                        </div>
                        {save.signin && <SessionEnded doing="save your target level" />}
                    </form>
                )}
            </CardContent>
        </Card>
    );
}
