import type { Metadata } from "next";
import Link from "next/link";
import { StatusPage } from "@/components/layout/StatusPage";
import { Button } from "@/components/ui/button";
import { TRACKS_INDEX_HREF } from "@/lib/primary-navigation";

export const metadata: Metadata = {
   title: "Page not found | InterviewNotes",
   robots: { index: false, follow: false },
};

// Next sends the 404 status itself; this only changes what the visitor sees.
export default function NotFound() {
   return (
      <StatusPage
         code="404"
         title="We couldn't find that page"
         actions={
            <>
               <Button asChild className="bg-foreground text-background hover:bg-foreground/90">
                  <Link href="/">Go to the homepage</Link>
               </Button>
               <Button asChild variant="outline">
                  <Link href={TRACKS_INDEX_HREF}>Browse Tracks</Link>
               </Button>
            </>
         }
      >
         The address may be mistyped, or the page may have moved or no longer be available.
      </StatusPage>
   );
}
