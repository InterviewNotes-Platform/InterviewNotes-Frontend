import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PrepResult } from "@/lib/prep/types";
import { PREPARE_DATA_HREF } from "./href";

/** After this long a pending request also says the wait is longer than usual (a cold start, P7-D-010). */
export const SLOW_NOTICE_MS = 4000;
export const SLOW_NOTICE = "This is taking longer than usual, which can happen after a period of inactivity. Please keep this page open.";

/** True once `active` has lasted `SLOW_NOTICE_MS`. */
export function useSlow(active: boolean): boolean {
    const [slow, setSlow] = useState(false);
    useEffect(() => {
        if (!active) return;
        const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS);
        return () => {
            clearTimeout(timer);
            setSlow(false);
        };
    }, [active]);
    return slow;
}

/** What went wrong, in words that say what is and is not known; `unauthenticated` is shown by `SessionEnded`. */
export function problem(result: Exclude<PrepResult<unknown>, { status: "ok" }>, doing: string): string {
    switch (result.status) {
        case "notFound":
            return `The preparation workspace is not available right now, so ${doing} did not run.`;
        case "invalid":
        case "conflict":
            return `The server did not accept ${doing}.`;
        case "unavailable":
            return result.cause === "malformed"
                ? `The preparation service sent a response we could not use for ${doing}.`
                : result.cause === "timeout"
                  ? `The server took too long to answer ${doing}.`
                  : `We could not reach the preparation service for ${doing}.`;
        default:
            return `${doing} did not finish.`;
    }
}

export function SessionEnded({ doing }: { doing: string }) {
    return (
        <div role="alert" className="space-y-3">
            <p className="text-body text-foreground">Your session has ended. Sign in again to {doing}.</p>
            <Button asChild variant="outline">
                <Link href={`/login?redirect=${encodeURIComponent(PREPARE_DATA_HREF)}`}>Sign in</Link>
            </Button>
        </div>
    );
}
