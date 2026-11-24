import Link from "next/link";
import { Button } from "@/components/ui/button";

/** What a reader sees when practice is not available to them; never any backend detail, and no reason beyond that. */
export function PracticeUnavailable() {
   return (
      <div role="status" className="rounded-lg bg-surface px-6 py-12 text-center">
         <p className="mb-4 text-body text-muted-foreground last:mb-0">Practice is not available right now.</p>
         <Button asChild className="bg-foreground text-background hover:bg-foreground/90 h-8 text-sm">
            <Link href="/practice" prefetch={false}>
               Browse Problems
            </Link>
         </Button>
      </div>
   );
}
