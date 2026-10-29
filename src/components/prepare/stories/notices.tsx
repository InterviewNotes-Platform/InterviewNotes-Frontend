import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { FieldIssue, PrepResult } from "@/lib/prep/types";
import { PREPARE_STORIES_HREF } from "@/app/prepare/stories/href";

export const NOT_CONFIGURED = "The preparation service is not configured for this environment.";

/** A record owned by someone else and one that does not exist look the same (contract §2.1), so the words claim neither. */
export const STORY_NOT_FOUND = "We could not find this story in your Story Bank. It may have been deleted, or the workspace is not available.";

const REASONS: Record<FieldIssue["reason"], string> = {
   required: "This is required.",
   too_long: "This is too long to save.",
   too_short: "This is too short to save.",
   invalid_format: "This is not in a form the server accepts.",
   invalid_value: "The server did not accept this text.",
   unknown_field: "The server did not accept this field.",
};

export function issueText(issues: FieldIssue[], field: string): string | undefined {
   const found = issues.find((issue) => issue.field === field);
   return found && REASONS[found.reason];
}

/** Why a read could not be shown, in words that say what is and is not known. */
export function readFailure(result: Exclude<PrepResult<unknown>, { status: "ok" }>): string {
   switch (result.status) {
      case "notFound":
         return "The Story Bank is not available right now.";
      case "unavailable":
         return result.cause === "timeout"
            ? "The server took too long to answer."
            : result.cause === "malformed"
              ? "The preparation service sent a response we could not use."
              : "We could not reach the preparation service.";
      default:
         return "The preparation service sent a response we could not use.";
   }
}

export function SignIn({ doing, to }: { doing: string; to: string }) {
   return (
      <div role="alert" className="space-y-3">
         <p className="text-body text-foreground">Your session has ended. Sign in again to {doing}.</p>
         <Button asChild variant="outline">
            <Link href={`/login?redirect=${encodeURIComponent(to)}`}>Sign in</Link>
         </Button>
      </div>
   );
}

export function BackLink({ children = "Back to your Story Bank", href = PREPARE_STORIES_HREF }: { children?: string; href?: string }) {
   return (
      <Link href={href} prefetch={false} className="inline-flex min-h-11 items-center text-supporting text-muted-foreground underline underline-offset-4 hover:text-foreground">
         {children}
      </Link>
   );
}
